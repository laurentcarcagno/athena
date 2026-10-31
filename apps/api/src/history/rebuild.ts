import type { Pool, PoolClient } from 'pg';
import { parse } from 'yaml';
import { Db } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import type { ConfidentialFields } from '../secrets/confidential';
import { GitLabClient } from './gitlab-client';
import { repositoryName } from './serialize';

export interface RebuildResult {
  trackers: number;
  artifacts: number;
}

interface TrackerFile {
  key: string;
  name: string;
  schemaVersion?: number;
  fields: Array<{ key: string; label: string; type: string; config: unknown; required: boolean; semanticRole: string | null }>;
  statuses: Array<{ key: string; name: string; category: string }>;
  transitions: Array<{ name: string; from: string | null; to: string; conditions: unknown; validators: unknown; postActions: unknown }>;
}
interface ArtifactFile {
  key: string;
  tracker: string;
  status: string;
  version: number;
  values: Record<string, unknown>;
}

/**
 * Reconstruit les trackers et artefacts d'un projet depuis le dépôt d'historique (plan § 4.4).
 * Le projet doit exister et être vide. Les identifiants internes sont régénérés ; clés, numéros, statuts,
 * valeurs et versions sont repris tels quels. L'historique des révisions reste dans Git (non rejoué en base).
 */
export class RebuildService {
  constructor(
    private readonly pool: Pool,
    private readonly gitlab: GitLabClient,
    private readonly namespace: string,
    private readonly confidential?: ConfidentialFields,
    private readonly ref = 'main',
  ) {}

  async rebuild(organizationId: string, projectKey: string, sourceOrgKey: string, actorId: string): Promise<RebuildResult> {
    const db = new Db(this.pool);
    const repo = await this.gitlab.ensureRepository(this.namespace, repositoryName(sourceOrgKey, projectKey));
    const paths = await this.gitlab.tree(repo, this.ref);
    const trackerPaths = paths.filter((p) => /^trackers\/[A-Z0-9]+\/tracker\.yaml$/.test(p)).sort();
    const artifactPaths = paths.filter((p) => /^trackers\/[A-Z0-9]+\/artifacts\/[A-Z0-9]+-\d+\.yaml$/.test(p)).sort();
    const trackerFiles = await Promise.all(trackerPaths.map(async (p) => parse(await this.gitlab.fileContent(repo, p, this.ref)) as TrackerFile));
    const artifactFiles = await Promise.all(artifactPaths.map(async (p) => parse(await this.gitlab.fileContent(repo, p, this.ref)) as ArtifactFile));

    return db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const existing = Number((await c.query('select count(*) n from tracker where project_id = $1', [project.id])).rows[0].n);
      if (existing > 0) throw conflict(`Le projet ${projectKey} n'est pas vide : reconstruction refusée.`);

      const trackerIds = new Map<string, { id: string; statusIds: Map<string, string> }>();
      for (const t of trackerFiles) {
        const id = (
          await c.query('insert into tracker (organization_id, project_id, key, name, schema_version) values ($1,$2,$3,$4,$5) returning id', [organizationId, project.id, t.key, t.name, t.schemaVersion ?? 1])
        ).rows[0].id as string;
        let position = 0;
        for (const f of t.fields) {
          await c.query(
            'insert into field_definition (organization_id, tracker_id, key, label, type, config, required, position, semantic_role) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [organizationId, id, f.key, f.label, f.type, JSON.stringify(f.config ?? {}), f.required, position++, f.semanticRole],
          );
        }
        const statusIds = new Map<string, string>();
        position = 0;
        for (const s of t.statuses) {
          const row = await c.query('insert into status (organization_id, tracker_id, key, name, category, position) values ($1,$2,$3,$4,$5,$6) returning id', [organizationId, id, s.key, s.name, s.category, position++]);
          statusIds.set(s.key, row.rows[0].id);
        }
        for (const x of t.transitions) {
          await c.query(
            'insert into transition (organization_id, tracker_id, name, from_status_id, to_status_id, conditions, validators, post_actions) values ($1,$2,$3,$4,$5,$6,$7,$8)',
            [organizationId, id, x.name, x.from ? statusIds.get(x.from) : null, statusIds.get(x.to), JSON.stringify(x.conditions ?? []), JSON.stringify(x.validators ?? []), JSON.stringify(x.postActions ?? [])],
          );
        }
        trackerIds.set(t.key, { id, statusIds });
      }

      const last = new Map<string, number>();
      for (const a of artifactFiles) {
        const tracker = trackerIds.get(a.tracker);
        const status = tracker?.statusIds.get(a.status);
        const number = Number(/-(\d+)$/.exec(a.key)?.[1]);
        if (!tracker || !status || !Number.isInteger(number)) throw validation([`artefact ${a.key} incohérent (tracker ou statut inconnu)`]);
        const values = this.confidential ? await this.confidential.reveal(sourceOrgKey, a.values) : a.values;
        await insertArtifact(c, organizationId, project.id, tracker.id, status, number, a, values, actorId);
        last.set(tracker.id, Math.max(last.get(tracker.id) ?? 0, number));
      }
      for (const [trackerId, max] of last) {
        await c.query('insert into tracker_sequence (tracker_id, organization_id, last_number) values ($1,$2,$3) on conflict (tracker_id) do update set last_number = excluded.last_number', [trackerId, organizationId, max]);
      }
      return { trackers: trackerFiles.length, artifacts: artifactFiles.length };
    });
  }
}

async function insertArtifact(c: PoolClient, org: string, project: string, tracker: string, status: string, number: number, a: ArtifactFile, values: Record<string, unknown>, actor: string) {
  await c.query(
    `insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", version, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [org, project, tracker, number, a.key, status, JSON.stringify(values), a.version, actor],
  );
}
