import { ARTIFACT_FILE } from '../core/key';
import type { Pool } from 'pg';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import { GitLabClient } from './gitlab-client';
import { repositoryName } from './serialize';

export interface BaselineView {
  name: string;
  gitTag: string;
  gitSha: string;
  docShas: Record<string, string | null>;
  createdBy: string;
  createdAt: string;
}

export interface BaselineDiff {
  created: string[];
  modified: string[];
  deleted: string[];
  trackers: string[];
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;

/**
 * Baselines : un tag Git de l'historique (`baseline/<nom>`) fige l'état de tous les trackers d'un projet,
 * couplé aux SHA des sources documentaires StrictDoc au même instant (plan § 4.3 et § 16.3).
 */
export class BaselineService {
  constructor(
    private readonly pool: Pool,
    private readonly gitlab: GitLabClient,
    private readonly namespace: string,
    private readonly branch = 'main',
  ) {}

  private get db(): Db {
    return new Db(this.pool);
  }

  async create(organizationId: string, projectKey: string, name: string, actor: Actor): Promise<BaselineView> {
    if (!NAME.test(name)) throw validation(['nom de baseline invalide (lettres, chiffres, point, tiret, tiret bas)']);
    const context = await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const orgKey = (await c.query('select key from organization')).rows[0].key as string;
      const pending = Number((await c.query('select count(*) n from outbox_event where history_synced_at is null')).rows[0].n);
      const docs = (await c.query('select name, git_sha from doc_source where project_id = $1', [project.id])).rows;
      return { projectId: project.id as string, orgKey, pending, docs };
    });
    if (context.pending > 0) {
      throw conflict(`Synchronisation de l'historique en retard (${context.pending} événement(s) en attente) : baseline refusée.`);
    }
    const repo = await this.gitlab.ensureRepository(this.namespace, repositoryName(context.orgKey, projectKey));
    const sha = await this.gitlab.branchHead(repo, this.branch);
    const tag = `baseline/${name}`;
    const docShas = Object.fromEntries(context.docs.map((d) => [d.name as string, (d.git_sha as string | null) ?? null]));
    await this.db.tx(organizationId, async (c) => {
      const exists = await c.query('select 1 from baseline where project_id = $1 and name = $2', [context.projectId, name]);
      if (exists.rowCount) throw conflict(`La baseline « ${name} » existe déjà.`);
      await c.query(
        'insert into baseline (organization_id, project_id, name, git_tag, git_sha, doc_shas, created_by) values ($1,$2,$3,$4,$5,$6,$7)',
        [organizationId, context.projectId, name, tag, sha, JSON.stringify(docShas), actor.id],
      );
      await audit(c, organizationId, actor, 'baseline.create', `baseline:${projectKey}/${name}`, { sha, docShas });
    });
    await this.gitlab.createTag(repo, tag, sha, `Baseline ${name}\n\nAthena-Actor: ${actor.id}`);
    return { name, gitTag: tag, gitSha: sha, docShas, createdBy: actor.id, createdAt: new Date().toISOString() };
  }

  async list(organizationId: string, projectKey: string): Promise<BaselineView[]> {
    return this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select b.name, b.git_tag, b.git_sha, b.doc_shas, b.created_by, b.created_at from baseline b
           join project p on p.id = b.project_id where p.key = $1 order by b.created_at desc`,
          [projectKey],
        )
      ).rows.map((r) => ({ name: r.name, gitTag: r.git_tag, gitSha: r.git_sha, docShas: r.doc_shas, createdBy: r.created_by, createdAt: r.created_at.toISOString() })),
    );
  }

  /** Compare deux baselines : artefacts créés, modifiés, supprimés et trackers dont la définition a changé. */
  async diff(organizationId: string, projectKey: string, from: string, to: string): Promise<BaselineDiff> {
    const known = await this.list(organizationId, projectKey);
    const a = known.find((b) => b.name === from);
    const b = known.find((x) => x.name === to);
    if (!a) throw notFound(`Baseline ${from}`);
    if (!b) throw notFound(`Baseline ${to}`);
    const orgKey = await this.db.tx(organizationId, async (c) => (await c.query('select key from organization')).rows[0].key as string);
    const repo = await this.gitlab.ensureRepository(this.namespace, repositoryName(orgKey, projectKey));
    const { diffs } = await this.gitlab.compare(repo, a.gitTag, b.gitTag);
    const result: BaselineDiff = { created: [], modified: [], deleted: [], trackers: [] };
    for (const d of diffs) {
      const artifact = ARTIFACT_FILE.exec(d.new_path);
      if (artifact) (d.new_file ? result.created : d.deleted_file ? result.deleted : result.modified).push(artifact[1]!);
      const tracker = /^trackers\/([A-Z0-9]+)\/tracker\.yaml$/.exec(d.new_path);
      if (tracker) result.trackers.push(tracker[1]!);
    }
    for (const list of Object.values(result)) list.sort();
    return result;
  }
}
