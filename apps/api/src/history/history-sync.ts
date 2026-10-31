import type { Pool, PoolClient } from 'pg';
import { Db } from '../core/db';
import type { Snapshot } from '../core/artifact.service';
import { GitLabClient } from './gitlab-client';
import type { ConfidentialFields } from '../secrets/confidential';
import { artifactPath, repositoryName, serializeArtifact } from './serialize';

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
          const sha = await this.commitEvent(orgKey, event);
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
              p.key as project_key, u.display_name, u.email,
              coalesce((select array_agg(f.key) from field_definition f
                        where f.tracker_id = a.tracker_id and f.config->>'confidential' = 'true'), '{}') as confidential_fields
       from outbox_event o
       left join artifact_revision r on r.event_id = nullif(o.payload->>'eventId','')::uuid
       left join artifact a on a.id = r.artifact_id
       left join project p on p.id = a.project_id
       left join user_account u on u.subject = r.actor
       where o.history_synced_at is null
       order by o.created_at, o.id
       limit $1`,
      [limit],
    );
    return rows.rows as PendingEvent[];
  }

  /** Retourne le SHA du commit, ou null si l'événement n'a pas de représentation Git (encore). */
  private async commitEvent(orgKey: string, event: PendingEvent): Promise<string | null> {
    if (!event.type.startsWith('artifact.') || !event.snapshot || !event.project_key) return null;
    const projectId = await this.repository(orgKey, event.project_key);
    const path = artifactPath(event.snapshot);
    const protectedValues = this.confidential
      ? await this.confidential.protect(orgKey, event.snapshot.values, event.confidential_fields)
      : event.snapshot.values;
    const content = serializeArtifact({ ...event.snapshot, values: protectedValues });
    const exists = await this.gitlab.fileExists(projectId, path, this.branch);
    const summary = summarize(event);
    return this.gitlab.commit(projectId, {
      branch: this.branch,
      message:
        `${event.snapshot.key}: ${summary}\n\n` +
        `Athena-Event-Id: ${event.payload.eventId ?? event.id}\n` +
        `Athena-Actor: ${event.payload.actor ?? 'inconnu'}\n` +
        `Athena-Version: ${event.snapshot.version}`,
      authorName: event.display_name ?? FALLBACK_AUTHOR.name,
      authorEmail: event.email ?? FALLBACK_AUTHOR.email,
      actions: [{ action: exists ? 'update' : 'create', file_path: path, content }],
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
