import type { Pool, PoolClient } from 'pg';
import { Db } from '../core/db';
import type { Snapshot } from '../core/artifact.service';
import { GitLabClient } from './gitlab-client';
import type { ConfidentialFields } from '../secrets/confidential';
import type { ExportMarker } from '../core/export-marking';
import { artifactPath, repositoryName, serializeArtifact, serializeTracker, trackerPath, valuesForGit, type TrackerYaml } from './serialize';

export interface SyncResult {
  committed: number;
  failed: number;
}

interface PendingEvent {
  id: string;
  type: string;
  payload: { eventId?: string; key?: string; version?: number; actor?: string };
  snapshot: Snapshot | null;
  revision_id: string | null;
  project_key: string | null;
  display_name: string | null;
  email: string | null;
  confidential_fields: string[];
  history_mode: string;
  tracker_key: string | null;
  current_key: string | null;
  aliases: string[];
  export_control: string | null;
}

const FALLBACK_AUTHOR = { name: 'Athena', email: 'athena@localhost' };

/**
 * Worker d'historique : transforme les événements d'artefact en commits GitLab.
 * L'auteur du commit est l'utilisateur réel (profil Keycloak) ; le committer est le compte de service du jeton.
 */
export class HistorySync {
  private readonly repositories = new Map<string, number>();

  constructor(
    private readonly pool: Pool,
    private readonly gitlab: GitLabClient,
    private readonly namespace: string,
    private readonly branch = 'main',
    private readonly confidential?: ConfidentialFields,
    private readonly marker?: ExportMarker,
  ) {}

  /** Traite les événements en attente de toutes les organisations, dans l'ordre. */
  async runOnce(batchSize = 50): Promise<SyncResult> {
    const total: SyncResult = { committed: 0, failed: 0 };
    const organizations = (await this.pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
    for (const { id } of organizations) {
      const result = await this.syncOrganization(id, batchSize);
      total.committed += result.committed;
      total.failed += result.failed;
    }
    return total;
  }

  private async syncOrganization(organizationId: string, batchSize: number): Promise<SyncResult> {
    const result: SyncResult = { committed: 0, failed: 0 };
    const db = new Db(this.pool);
    const orgKey = await db.tx(organizationId, async (c) => (await c.query('select key from organization')).rows[0].key as string);

    for (;;) {
      const events = await db.tx(organizationId, (c) => this.pending(c, batchSize));
      if (events.length === 0) return result;
      for (const event of events) {
        try {
          const sha = await this.commitEvent(organizationId, orgKey, event);
          await db.tx(organizationId, async (c) => {
            if (event.revision_id && sha) {
              await c.query('update artifact_revision set git_sha = $1 where id = $2', [sha, event.revision_id]);
            }
            await c.query('update outbox_event set history_synced_at = now() where id = $1', [event.id]);
          });
          if (sha) result.committed += 1;
        } catch (error) {
          // L'ordre doit être préservé : on s'arrête à la première erreur et on réessaiera.
          result.failed += 1;
          console.error(`history-sync: échec événement ${event.id} : ${(error as Error).message.slice(0, 200)}`);
          return result;
        }
      }
    }
  }

  private async pending(c: PoolClient, limit: number): Promise<PendingEvent[]> {
    const rows = await c.query(
      `select o.id, o.type, o.payload, r.id as revision_id, r.snapshot,
              coalesce(p.key, o.payload->>'project') as project_key, u.display_name, u.email,
              coalesce(tk.history_mode, (select t2.history_mode from tracker t2 join project p2 on p2.id = t2.project_id where p2.key = o.payload->>'project' and t2.key = o.payload->>'key'), 'direct') as history_mode,
              coalesce(tk.key, o.payload->>'key') as tracker_key,
              coalesce((select array_agg(f.key) from field_definition f
                        where f.tracker_id = a.tracker_id and f.config->>'confidential' = 'true'), '{}') as confidential_fields,
              a.key as current_key, a.export_control,
              coalesce((select array_agg(al.alias order by al.alias) from artifact_key_alias al where al.artifact_id = a.id), '{}') as aliases
       from outbox_event o
       left join artifact_revision r on r.event_id = nullif(o.payload->>'eventId','')::uuid
       left join artifact a on a.id = r.artifact_id
       left join project p on p.id = a.project_id
       left join user_account u on u.subject = coalesce(r.actor, o.payload->>'actor')
       left join tracker tk on tk.id = a.tracker_id
       where o.history_synced_at is null
       order by o.created_at, o.id
       limit $1`,
      [limit],
    );
    return rows.rows as PendingEvent[];
  }

  /** Retourne le SHA du commit, ou null si l'événement n'a pas de représentation Git (encore). */
  private async commitEvent(organizationId: string, orgKey: string, event: PendingEvent): Promise<string | null> {
    if ((event.type === 'tracker.created' || event.type === 'tracker.updated') && event.project_key) return this.commitTracker(organizationId, orgKey, event);
    if (!event.type.startsWith('artifact.') || !event.snapshot || !event.project_key) return null;
    const projectId = await this.repository(orgKey, event.project_key);
    // Un événement antérieur à la migration des clés porte l'ancienne clé : le fichier suit toujours la clé courante.
    const snapshot = { ...event.snapshot, key: event.current_key ?? event.snapshot.key };
    const path = artifactPath(snapshot);
    const stored = await valuesForGit(this.confidential, orgKey, event.snapshot.values, event.confidential_fields, event.export_control);
    // Fichier généré par Athena : la mention de protection de l'instance en tête et en pied (commentaires YAML, sans effet sur la lecture).
    const generated = serializeArtifact({ ...snapshot, values: stored.values }, event.aliases ?? [], { exportControl: event.export_control, masked: stored.masked });
    const content = this.marker ? this.marker.yaml(generated) : generated;
    const branch = await this.writeBranch(projectId, event);
    const exists = await this.gitlab.fileExists(projectId, path, branch);
    const summary = summarize(event);
    const sha = await this.gitlab.commit(projectId, {
      branch,
      message:
        `${snapshot.key}: ${summary}\n\n` +
        `Athena-Event-Id: ${event.payload.eventId ?? event.id}\n` +
        `Athena-Actor: ${event.payload.actor ?? 'inconnu'}\n` +
        `Athena-Version: ${event.snapshot.version}`,
      authorName: event.display_name ?? FALLBACK_AUTHOR.name,
      authorEmail: event.email ?? FALLBACK_AUTHOR.email,
      actions: [{ action: exists ? 'update' : 'create', file_path: path, content }],
    });
    await this.ensureReview(projectId, event, branch);
    return sha;
  }

  private async commitTracker(organizationId: string, orgKey: string, event: PendingEvent): Promise<string> {
    const trackerKey = String((event.payload as Record<string, unknown>)['key']);
    const def = await new Db(this.pool).tx(organizationId, (c) => loadTrackerYaml(c, event.project_key!, trackerKey));
    const projectId = await this.repository(orgKey, event.project_key!);
    const path = trackerPath(trackerKey);
    const branch = await this.writeBranch(projectId, event);
    const exists = await this.gitlab.fileExists(projectId, path, branch);
    const sha = await this.gitlab.commit(projectId, {
      branch,
      message: `tracker ${trackerKey}: ${event.type === 'tracker.created' ? 'création' : `configuration (${String((event.payload as Record<string, unknown>)['change'] ?? 'mise à jour')})`}

Athena-Event-Id: ${event.id}
Athena-Actor: ${event.payload.actor ?? 'inconnu'}`,
      authorName: event.display_name ?? FALLBACK_AUTHOR.name,
      authorEmail: event.email ?? FALLBACK_AUTHOR.email,
      actions: [{ action: exists ? 'update' : 'create', file_path: path, content: this.marker ? this.marker.yaml(serializeTracker(def)) : serializeTracker(def) }],
    });
    await this.ensureReview(projectId, event, branch);
    return sha;
  }

  /** Branche cible : la branche principale, ou la branche de revue du tracker en mode « merge request ». */
  private async writeBranch(projectId: number, event: PendingEvent): Promise<string> {
    if (event.history_mode !== 'merge_request' || !event.tracker_key) return this.branch;
    const branch = reviewBranch(event.tracker_key);
    if (!(await this.gitlab.branchExists(projectId, branch))) await this.gitlab.createBranch(projectId, branch, this.branch);
    return branch;
  }

  /** Garantit qu'une merge request est ouverte pour la branche de revue (une seule, mise à jour par les commits suivants). */
  private async ensureReview(projectId: number, event: PendingEvent, branch: string): Promise<void> {
    if (branch === this.branch) return;
    if (await this.gitlab.openMergeRequest(projectId, branch, this.branch)) return;
    await this.gitlab.createMergeRequest(projectId, {
      source: branch, target: this.branch, title: `Revue des modifications du tracker ${event.tracker_key}`,
      description: 'Modifications Athena soumises à revue (mode merge request). Fusionner pour les intégrer à la branche principale.',
    });
  }

  private async repository(orgKey: string, projectKey: string): Promise<number> {
    const name = repositoryName(orgKey, projectKey);
    let id = this.repositories.get(name);
    if (id === undefined) {
      id = await this.gitlab.ensureRepository(this.namespace, name);
      this.repositories.set(name, id);
    }
    return id;
  }
}

export const reviewBranch = (trackerKey: string): string => `athena/review/${trackerKey}`;

function summarize(event: PendingEvent): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'artifact.created':
      return 'création';
    case 'artifact.transitioned':
      return `statut ${String(payload['from'])} → ${String(payload['to'])}`;
    case 'artifact.updated':
      return `mise à jour (${Object.keys((payload['changes'] as Record<string, unknown>) ?? {}).join(', ')})`;
    default:
      return event.type;
  }
}

async function loadTrackerYaml(c: PoolClient, projectKey: string, trackerKey: string): Promise<TrackerYaml> {
  const t = (
    await c.query('select t.id, t.key, t.name, t.schema_version, t.layout, t.type_key from tracker t join project p on p.id = t.project_id where p.key = $1 and t.key = $2', [projectKey, trackerKey])
  ).rows[0];
  const fields = (await c.query('select * from field_definition where tracker_id = $1 order by position', [t.id])).rows;
  const statuses = (await c.query('select * from status where tracker_id = $1 order by position', [t.id])).rows;
  const keyOf = new Map<string, string>(statuses.map((s) => [s.id as string, s.key as string]));
  const transitions = (await c.query('select * from transition where tracker_id = $1 order by name, id', [t.id])).rows;
  return {
    key: t.key, name: t.name, schemaVersion: t.schema_version, ...(t.layout ? { layout: t.layout } : {}), ...(t.type_key ? { type: t.type_key } : {}),
    fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, config: f.config, required: f.required, ...(f.is_content === false ? { isContent: false } : {}), semanticRole: f.semantic_role, readRoles: f.read_roles ?? null, writeRoles: f.write_roles ?? null })),
    statuses: statuses.map((s) => ({ key: s.key, name: s.name, category: s.category })),
    transitions: transitions.map((x) => ({
      name: x.name, from: x.from_status_id ? keyOf.get(x.from_status_id) ?? null : null, to: keyOf.get(x.to_status_id)!,
      conditions: x.conditions, validators: x.validators, postActions: x.post_actions,
    })),
  };
}
