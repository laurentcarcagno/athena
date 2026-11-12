import { ARTIFACT_FILE } from '../core/key';
import type { Pool } from 'pg';
import { Db, type Actor } from '../core/db';
import { DomainError, conflict, notFound, validation } from '../core/errors';
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

/** Exigences d'une source documentaire entre deux baselines (empreintes figées à la création de chacune). */
export interface DocDiff {
  source: string;
  /** SHA du dépôt documentaire à chaque baseline (nul si la source n'existait pas encore). */
  from: string | null;
  to: string | null;
  added: Array<{ uid: string; title: string }>;
  modified: Array<{ uid: string; title: string }>;
  removed: Array<{ uid: string; title: string }>;
}

export interface BaselineDiff {
  created: string[];
  modified: string[];
  deleted: string[];
  trackers: string[];
  /** Exigences documentaires ajoutées, modifiées, supprimées, par source (sources inchangées omises). */
  docs: DocDiff[];
}

/** Dates planifiées d'un ticket au moment d'une baseline (début nul pour un jalon). */
export interface ScheduleSnapshotRow { key: string; start: string | null; end: string }
export type ScheduleSnapshot = (organizationId: string, projectKey: string) => Promise<ScheduleSnapshotRow[]>;

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
    private readonly schedule?: ScheduleSnapshot,
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
      const docs = (await c.query('select id, name, git_sha, repo_path, ref from doc_source where project_id = $1 order by name', [project.id])).rows;
      const nodes = (await c.query(
        `select s.name as source, d.uid, d.title, d.content_hash from doc_node d join doc_source s on s.id = d.source_id where s.project_id = $1 and not d.synthetic`, [project.id])).rows;
      return { projectId: project.id as string, orgKey, pending, docs, nodes };
    });
    if (context.pending > 0) {
      throw conflict(`Synchronisation de l'historique en retard (${context.pending} événement(s) en attente) : baseline refusée.`);
    }
    // Écart silencieux : une source documentaire dont le dépôt a avancé depuis son indexation donnerait une baseline qui fige des
    // documents périmés sans le dire. La baseline est refusée tant que l'index n'a pas rattrapé le dépôt.
    const stale: string[] = [];
    for (const d of context.docs) {
      if (!d.repo_path) continue;
      const docRepo = await this.gitlab.findRepository(d.repo_path as string);
      if (docRepo === null) { stale.push(`${d.name} : dépôt ${d.repo_path} introuvable`); continue; }
      const head = await this.gitlab.branchHead(docRepo, (d.ref as string | null) ?? 'main');
      if (head !== d.git_sha) stale.push(`${d.name} : indexé à ${String(d.git_sha ?? 'aucun').slice(0, 8)}, dépôt à ${head.slice(0, 8)}`);
    }
    if (stale.length) throw new DomainError('Index documentaire en retard sur le dépôt : ré-indexez les sources avant de créer la baseline.', 'conflict', stale);
    const planned = this.schedule ? await this.schedule(organizationId, projectKey) : [];
    const repo = await this.gitlab.ensureRepository(this.namespace, repositoryName(context.orgKey, projectKey));
    const sha = await this.gitlab.branchHead(repo, this.branch);
    const tag = `baseline/${name}`;
    const docShas = Object.fromEntries(context.docs.map((d) => [d.name as string, (d.git_sha as string | null) ?? null]));
    await this.db.tx(organizationId, async (c) => {
      const exists = await c.query('select 1 from baseline where project_id = $1 and name = $2', [context.projectId, name]);
      if (exists.rowCount) throw conflict(`La baseline « ${name} » existe déjà.`);
      const baseline = (await c.query(
        'insert into baseline (organization_id, project_id, name, git_tag, git_sha, doc_shas, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [organizationId, context.projectId, name, tag, sha, JSON.stringify(docShas), actor.id],
      )).rows[0].id as string;
      // Empreinte de chaque exigence indexée au moment de la baseline : c'est ce qui permet de comparer deux baselines.
      if (context.nodes.length) {
        await c.query(
          `insert into baseline_doc_node (baseline_id, organization_id, source_name, uid, title, content_hash)
           select $1, $2, s, u, t, h from unnest($3::text[], $4::text[], $5::text[], $6::text[]) as x(s, u, t, h)`,
          [baseline, organizationId, context.nodes.map((n) => n.source), context.nodes.map((n) => n.uid), context.nodes.map((n) => n.title), context.nodes.map((n) => n.content_hash)],
        );
      }
      if (planned.length) {
        await c.query(
          `insert into baseline_schedule (baseline_id, organization_id, artifact_key, planned_start, planned_end)
           select $1, $2, k, s, e from unnest($3::text[], $4::date[], $5::date[]) as x(k, s, e)`,
          [baseline, organizationId, planned.map((p) => p.key), planned.map((p) => p.start), planned.map((p) => p.end)],
        );
      }
      await audit(c, organizationId, actor, 'baseline.create', `baseline:${projectKey}/${name}`, { sha, docShas, requirements: context.nodes.length, scheduled: planned.length });
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

  /** Exigences documentaires ajoutées, modifiées et supprimées entre deux baselines, par source (sans GitLab : empreintes figées en base). */
  async docDiff(organizationId: string, projectKey: string, from: string, to: string): Promise<DocDiff[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const load = async (name: string) => {
        const b = (await c.query('select id, doc_shas from baseline where project_id = $1 and name = $2', [project.id, name])).rows[0];
        if (!b) throw notFound(`Baseline ${name}`);
        const nodes = (await c.query('select source_name, uid, title, content_hash from baseline_doc_node where baseline_id = $1', [b.id])).rows;
        return { shas: (b.doc_shas ?? {}) as Record<string, string | null>, nodes };
      };
      const a = await load(from);
      const b = await load(to);
      const sources = [...new Set([...Object.keys(a.shas), ...Object.keys(b.shas), ...a.nodes.map((n) => n.source_name as string), ...b.nodes.map((n) => n.source_name as string)])].sort();
      const out: DocDiff[] = [];
      for (const source of sources) {
        const before = new Map(a.nodes.filter((n) => n.source_name === source).map((n) => [n.uid as string, n]));
        const after = new Map(b.nodes.filter((n) => n.source_name === source).map((n) => [n.uid as string, n]));
        const view = (n: { uid: string; title: string }) => ({ uid: n.uid, title: n.title });
        const diff: DocDiff = {
          source, from: a.shas[source] ?? null, to: b.shas[source] ?? null,
          added: [...after.values()].filter((n) => !before.has(n.uid as string)).map(view).sort((x, y) => x.uid.localeCompare(y.uid, 'en', { numeric: true })),
          modified: [...after.values()].filter((n) => before.has(n.uid as string) && before.get(n.uid as string)!.content_hash !== n.content_hash).map(view).sort((x, y) => x.uid.localeCompare(y.uid, 'en', { numeric: true })),
          removed: [...before.values()].filter((n) => !after.has(n.uid as string)).map(view).sort((x, y) => x.uid.localeCompare(y.uid, 'en', { numeric: true })),
        };
        if (diff.added.length || diff.modified.length || diff.removed.length || diff.from !== diff.to) out.push(diff);
      }
      return out;
    });
  }

  /** Export CSV d'une comparaison (artefacts, trackers, exigences documentaires), à marquer avec la mention de l'instance par l'appelant. */
  async diffCsv(organizationId: string, projectKey: string, from: string, to: string): Promise<{ filename: string; csv: string }> {
    const d = await this.diff(organizationId, projectKey, from, to);
    const cell = (v: string) => { const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
    const rows: string[][] = [['kind', 'change', 'key', 'title']];
    for (const k of d.created) rows.push(['item', 'added', k, '']);
    for (const k of d.modified) rows.push(['item', 'modified', k, '']);
    for (const k of d.deleted) rows.push(['item', 'removed', k, '']);
    for (const k of d.trackers) rows.push(['tracker', 'modified', k, '']);
    for (const doc of d.docs) {
      if (doc.from !== doc.to) rows.push(['document-source', 'sha', doc.source, `${doc.from ?? ''} -> ${doc.to ?? ''}`]);
      for (const [change, list] of [['added', doc.added], ['modified', doc.modified], ['removed', doc.removed]] as const) for (const n of list) rows.push(['requirement', change, `${doc.source}:${n.uid}`, n.title]);
    }
    return { filename: `baselines-${projectKey}-${from}-${to}.csv`, csv: `\uFEFF${rows.map((r) => r.map(cell).join(',')).join('\n')}\n` };
  }

  /** Compare deux baselines : artefacts créés, modifiés, supprimés, trackers dont la définition a changé, exigences documentaires. */
  async diff(organizationId: string, projectKey: string, from: string, to: string): Promise<BaselineDiff> {
    const known = await this.list(organizationId, projectKey);
    const a = known.find((b) => b.name === from);
    const b = known.find((x) => x.name === to);
    if (!a) throw notFound(`Baseline ${from}`);
    if (!b) throw notFound(`Baseline ${to}`);
    const orgKey = await this.db.tx(organizationId, async (c) => (await c.query('select key from organization')).rows[0].key as string);
    const repo = await this.gitlab.ensureRepository(this.namespace, repositoryName(orgKey, projectKey));
    const { diffs } = await this.gitlab.compare(repo, a.gitTag, b.gitTag);
    const result: BaselineDiff = { created: [], modified: [], deleted: [], trackers: [], docs: await this.docDiff(organizationId, projectKey, from, to) };
    for (const d of diffs) {
      const artifact = ARTIFACT_FILE.exec(d.new_path);
      if (artifact) (d.new_file ? result.created : d.deleted_file ? result.deleted : result.modified).push(artifact[1]!);
      const tracker = /^trackers\/([A-Z0-9]+)\/tracker\.yaml$/.exec(d.new_path);
      if (tracker) result.trackers.push(tracker[1]!);
    }
    for (const list of [result.created, result.modified, result.deleted, result.trackers]) list.sort();
    return result;
  }
}
