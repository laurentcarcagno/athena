import { ARTIFACT_FILE, formatKey, isCanonicalKey, isLegacyKey, parseKey } from '../core/key';
import type { Pool, PoolClient } from 'pg';
import { parse } from 'yaml';
import { Db } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import type { ConfidentialFields } from '../secrets/confidential';
import { GitLabClient, type CommitAction } from './gitlab-client';
import { artifactPath, repositoryName, serializeArtifact } from './serialize';

export interface RebuildResult {
  trackers: number;
  artifacts: number;
}

interface TrackerFile {
  key: string;
  name: string;
  schemaVersion?: number;
  layout?: unknown;
  type?: string;
  fields: Array<{ key: string; label: string; type: string; config: unknown; required: boolean; isContent?: boolean; semanticRole: string | null; readRoles?: string[] | null; writeRoles?: string[] | null }>;
  statuses: Array<{ key: string; name: string; category: string; color?: string | null }>;
  transitions: Array<{ name: string; from: string | null; to: string; conditions: unknown; validators: unknown; postActions: unknown }>;
}
interface ArtifactFile {
  key: string;
  tracker: string;
  status: string;
  version: number;
  aliases?: string[];
  /** Marquage de contrôle export et indicateur de valeurs absentes (voir `valuesForGit`). */
  exportControl?: string;
  masked?: boolean;
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
    const artifactPaths = paths.filter((p) => ARTIFACT_FILE.test(p)).sort();
    // Un fichier illisible (YAML corrompu, alias non résolu) arrête la reconstruction en nommant le fichier : jamais d'exception brute de l'analyseur.
    const read = async <T>(p: string): Promise<T> => {
      try { return parse(await this.gitlab.fileContent(repo, p, this.ref)) as T; } catch (error) { throw validation([`Fichier d'historique illisible : ${p} (${(error as Error).message.split('\n')[0]})`]); }
    };
    const trackerFiles = await Promise.all(trackerPaths.map((p) => read<TrackerFile>(p)));
    const artifactFiles = await Promise.all(artifactPaths.map((p) => read<ArtifactFile>(p)));

    return db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const existing = Number((await c.query('select count(*) n from tracker where project_id = $1', [project.id])).rows[0].n);
      if (existing > 0) throw conflict(`Le projet ${projectKey} n'est pas vide : reconstruction refusée.`);

      const trackerIds = new Map<string, { id: string; statusIds: Map<string, string> }>();
      for (const t of trackerFiles) {
        const id = (
          await c.query('insert into tracker (organization_id, project_id, key, name, schema_version, layout, type_key) values ($1,$2,$3,$4,$5,$6,$7) returning id', [organizationId, project.id, t.key, t.name, t.schemaVersion ?? 1, t.layout ? JSON.stringify(t.layout) : null, t.type ?? null])
        ).rows[0].id as string;
        let position = 0;
        for (const f of t.fields) {
          await c.query(
            'insert into field_definition (organization_id, tracker_id, key, label, type, config, required, position, semantic_role, read_roles, write_roles, is_content) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [organizationId, id, f.key, f.label, f.type, JSON.stringify(f.config ?? {}), f.required, position++, f.semanticRole, f.readRoles ?? null, f.writeRoles ?? null, f.isContent ?? true],
          );
        }
        const statusIds = new Map<string, string>();
        position = 0;
        for (const s of t.statuses) {
          const row = await c.query('insert into status (organization_id, tracker_id, key, name, category, position, color) values ($1,$2,$3,$4,$5,$6,$7) returning id', [organizationId, id, s.key, s.name, s.category, position++, s.color ?? null]);
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
        // Item sous contrôle export dont Git ne garde pas les valeurs (instance sans OpenBao) : non reconstructible depuis Git, la sauvegarde de la base en reste la source.
        if (a.masked) continue;
        const tracker = trackerIds.get(a.tracker);
        const status = tracker?.statusIds.get(a.status);
        const number = Number(/-(\d+)$/.exec(a.key)?.[1]);
        if (!tracker || !status || !Number.isInteger(number)) throw validation([`ticket ${a.key} incohérent (tracker ou statut inconnu)`]);
        const values = this.confidential ? await this.confidential.reveal(sourceOrgKey, a.values) : a.values;
        // Fichier ancien format (REQ-42) ou venant d'un autre projet : clé recalculée, ancienne clé conservée en alias.
        const parsed = parseKey(a.key);
        const key = isCanonicalKey(a.key) && parsed?.project === projectKey ? a.key : formatKey(projectKey, a.tracker, number);
        const aliases = new Set((a.aliases ?? []).filter((x) => isLegacyKey(x)));
        if (key !== a.key && isLegacyKey(a.key)) aliases.add(a.key);
        const id = await insertArtifact(c, organizationId, project.id, tracker.id, status, number, { ...a, key }, values, actorId);
        if (a.exportControl) await c.query('update artifact set export_control = $2 where id = $1', [id, a.exportControl]);
        for (const alias of aliases) {
          await c.query('insert into artifact_key_alias (organization_id, artifact_id, project_id, alias) values ($1,$2,$3,$4) on conflict do nothing', [organizationId, id, project.id, alias]);
        }
        last.set(tracker.id, Math.max(last.get(tracker.id) ?? 0, number));
      }
      for (const [trackerId, max] of last) {
        await c.query('insert into tracker_sequence (tracker_id, organization_id, last_number) values ($1,$2,$3) on conflict (tracker_id) do update set last_number = excluded.last_number', [trackerId, organizationId, max]);
      }
      return { trackers: trackerFiles.length, artifacts: artifactFiles.length };
    });
  }

  /**
   * Migration des clés (ADR-0002 § 2) : renomme dans l'historique les fichiers `REQ-42.yaml` en `SAT1-REQ-0042.yaml`
   * en un seul commit, YAML mis à jour (clé canonique, `aliases`). Idempotent : sans fichier à déplacer, aucun commit.
   * Si le fichier canonique existe déjà (événement synchronisé entre-temps), l'ancien fichier est simplement supprimé.
   */
  async migrateKeys(organizationId: string, projectKey: string, orgKey: string): Promise<{ moved: number; removed: number; commit: string | null }> {
    const repo = await this.gitlab.ensureRepository(this.namespace, repositoryName(orgKey, projectKey));
    const rows = (await new Db(this.pool).tx(organizationId, (c) =>
      c.query(
        `select a.key, t.key as tracker, al.alias from artifact_key_alias al join artifact a on a.id = al.artifact_id
         join tracker t on t.id = a.tracker_id join project p on p.id = a.project_id where p.key = $1 order by a.key, al.alias`,
        [projectKey],
      ))).rows as Array<{ key: string; tracker: string; alias: string }>;
    const present = new Set(await this.gitlab.tree(repo, this.ref));
    const actions: CommitAction[] = [];
    let moved = 0;
    let removed = 0;
    for (const r of rows) {
      const oldPath = artifactPath({ key: r.alias, tracker: r.tracker });
      if (!present.has(oldPath)) continue;
      const newPath = artifactPath({ key: r.key, tracker: r.tracker });
      if (present.has(newPath)) {
        actions.push({ action: 'delete', file_path: oldPath });
        removed += 1;
        continue;
      }
      const file = parse(await this.gitlab.fileContent(repo, oldPath, this.ref)) as Record<string, unknown>;
      const aliases = rows.filter((x) => x.key === r.key).map((x) => x.alias);
      const content = serializeArtifact({ key: r.key, tracker: String(file['tracker']), status: String(file['status']), version: Number(file['version']), values: (file['values'] ?? {}) as Record<string, unknown> }, aliases);
      actions.push({ action: 'move', file_path: newPath, previous_path: oldPath, content });
      moved += 1;
    }
    if (actions.length === 0) return { moved: 0, removed: 0, commit: null };
    const commit = await this.gitlab.commit(repo, {
      branch: this.ref,
      message: `chore(history): migration des clés d'item (${moved} fichier(s) renommé(s))

Athena-Event-Id: key-migration-${projectKey}`,
      authorName: 'Athena', authorEmail: 'athena@localhost', actions,
    });
    return { moved, removed, commit };
  }
}

async function insertArtifact(c: PoolClient, org: string, project: string, tracker: string, status: string, number: number, a: ArtifactFile, values: Record<string, unknown>, actor: string): Promise<string> {
  const row = await c.query(
    `insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", version, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [org, project, tracker, number, a.key, status, JSON.stringify(values), a.version, actor],
  );
  return row.rows[0].id as string;
}
