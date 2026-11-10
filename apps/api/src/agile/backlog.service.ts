import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

export interface BacklogItem {
  key: string;
  tracker: string;
  title: string;
  status: string;
  statusName: string;
  category: string;
  points: number | null;
  assignee: string | null;
  version: number;
}

/** Pas entre deux rangs : la réécriture d'un rang laisse de la place pour la suivante. */
const STEP = 1024;

/**
 * Backlog d'un projet (ADR-0003, T-0115) : tickets non terminés des trackers de type Tâche, hors sprint en cours ou planifié,
 * dans l'ordre du rang (`backlog_rank`), puis par création pour les tickets jamais classés. Ordre stable : clé de départage `id`.
 */
export class BacklogService {
  constructor(private readonly db: Db) {}

  /** `roles` : rôles du lecteur ; un titre ou un responsable à lecture restreinte est masqué. */
  async list(organizationId: string, projectKey: string, roles: string[]): Promise<BacklogItem[]> {
    return this.db.tx(organizationId, async (c) => {
      await this.project(c, projectKey);
      return this.items(c, projectKey, roles);
    });
  }

  /**
   * Place `key` juste après `after` (`null` : en tête). Les rangs du backlog sont réécrits de `STEP` en `STEP` dans le
   * nouvel ordre, seulement là où ils changent.
   */
  async rank(organizationId: string, projectKey: string, key: string, after: string | null, actor: Actor): Promise<BacklogItem[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const rows = await this.ordered(c, projectKey);
      const moving = rows.find((r) => r.key === key);
      if (!moving) throw notFound(`Ticket ${key} dans le backlog`);
      if (after === key) throw validation(['un ticket ne peut pas suivre lui-même']);
      const rest = rows.filter((r) => r.key !== key);
      const at = after === null ? 0 : rest.findIndex((r) => r.key === after) + 1;
      if (after !== null && at === 0) throw notFound(`Ticket ${after} dans le backlog`);
      rest.splice(at, 0, moving);
      for (const [i, r] of rest.entries()) {
        const rank = (i + 1) * STEP;
        if (r.rank === rank) continue;
        await c.query(
          `insert into backlog_rank (artifact_id, organization_id, project_id, rank) values ($1,$2,$3,$4)
           on conflict (artifact_id) do update set rank = excluded.rank, updated_at = now()`,
          [r.id, organizationId, project, rank],
        );
      }
      await audit(c, organizationId, actor, 'backlog.rank', `project:${projectKey}`, { key, after });
      return this.items(c, projectKey, actor.roles);
    });
  }

  private async ordered(c: PoolClient, projectKey: string) {
    return (await c.query(
      `select a.id, a.key, a.version, a."values" as values, t.id as tracker_id, t.key as tracker, s.key as status, s.name as status_name, s.category, r.rank
       from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id join project p on p.id = a.project_id
       left join backlog_rank r on r.artifact_id = a.id
       where p.key = $1 and t.type_key = 'task' and s.category <> 'done'
         and not exists (select 1 from sprint_item i join sprint sp on sp.id = i.sprint_id where i.artifact_id = a.id and sp.state <> 'closed')
       order by r.rank nulls last, a.created_at, a.id`,
      [projectKey],
    )).rows as Array<{ id: string; key: string; version: number; values: Record<string, unknown>; tracker_id: string; tracker: string; status: string; status_name: string; category: string; rank: number | null }>;
  }

  private async items(c: PoolClient, projectKey: string, roles: string[]): Promise<BacklogItem[]> {
    const rows = await this.ordered(c, projectKey);
    const ids = [...new Set(rows.map((r) => r.tracker_id))];
    const fields = new Map<string, Record<string, { key: string; readRoles: string[] | null }>>();
    for (const f of (await c.query(
      `select tracker_id, semantic_role, key, read_roles from field_definition where tracker_id = any($1::uuid[]) and semantic_role = any($2)`,
      [ids, ['title', 'assignee', 'estimate']],
    )).rows) {
      const byRole = fields.get(f.tracker_id) ?? {};
      byRole[f.semantic_role as string] = { key: f.key, readRoles: f.read_roles ?? null };
      fields.set(f.tracker_id, byRole);
    }
    const canRead = (restricted: string[] | null) => !restricted || roles.includes('athena-admin') || restricted.some((x) => roles.includes(x));
    const value = (r: (typeof rows)[number], role: string): unknown => {
      const f = fields.get(r.tracker_id)?.[role];
      return f && canRead(f.readRoles) ? r.values[f.key] : undefined;
    };
    return rows.map((r) => {
      const title = value(r, 'title');
      const points = value(r, 'estimate');
      const assignee = value(r, 'assignee');
      return {
        key: r.key, tracker: r.tracker, status: r.status, statusName: r.status_name, category: r.category, version: r.version,
        title: title === undefined || title === null ? r.key : String(title),
        points: typeof points === 'number' ? points : null,
        assignee: assignee === undefined || assignee === null || assignee === '' ? null : String(assignee),
      };
    });
  }

  private async project(c: PoolClient, key: string): Promise<string> {
    const row = (await c.query('select id from project where key = $1', [key])).rows[0];
    if (!row) throw notFound(`Projet ${key}`);
    return row.id as string;
  }
}
