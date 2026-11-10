import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit, outbox } from '../core/tracker.service';

export interface SprintView {
  id: string;
  name: string;
  goal: string;
  state: 'planned' | 'active' | 'closed';
  startsOn: string | null;
  endsOn: string | null;
  items: Array<{ key: string; status: string; done: boolean; points: number }>;
  totalPoints: number;
  donePoints: number;
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export class SprintService {
  constructor(private readonly db: Db) {}

  async list(organizationId: string, projectKey: string): Promise<Array<{ id: string; name: string; goal: string; state: string; startsOn: string | null; endsOn: string | null }>> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      return (await c.query(`select id, name, goal, state, to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on from sprint where project_id = $1 order by created_at desc`, [project])).rows
        .map((r) => ({ id: r.id, name: r.name, goal: r.goal, state: r.state, startsOn: r.starts_on, endsOn: r.ends_on }));
    });
  }

  async create(
    organizationId: string, projectKey: string, input: { name: string; goal?: string; startsOn: string; endsOn: string }, actor: Actor,
  ): Promise<string> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const id = (
        await c.query(
          'insert into sprint (organization_id, project_id, name, goal, starts_on, ends_on) values ($1,$2,$3,$4,$5,$6) returning id',
          [organizationId, project, input.name, input.goal ?? '', input.startsOn, input.endsOn],
        )
      ).rows[0].id as string;
      await audit(c, organizationId, actor, 'sprint.create', `sprint:${id}`);
      return id;
    });
  }

  /** Sprint non clos d'un ticket (au plus un : voir `addItem`), ou `null`. */
  async ofItem(organizationId: string, projectKey: string, artifactKey: string): Promise<{ id: string; name: string; state: string } | null> {
    return this.db.tx(organizationId, async (c) => {
      const artifact = (
        await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [projectKey, artifactKey])
      ).rows[0];
      if (!artifact) throw notFound(`Artefact ${artifactKey}`);
      const row = (
        await c.query(`select s.id, s.name, s.state from sprint_item i join sprint s on s.id = i.sprint_id where i.artifact_id = $1 and s.state <> 'closed' order by s.created_at desc limit 1`, [artifact.id])
      ).rows[0];
      return row ? { id: row.id as string, name: row.name as string, state: row.state as string } : null;
    });
  }

  async addItem(organizationId: string, sprintId: string, artifactKey: string, projectKey: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const sprint = await this.sprint(c, sprintId);
      if (sprint.state === 'closed') throw conflict('Sprint terminé : ajout impossible.');
      const artifact = (
        await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [projectKey, artifactKey])
      ).rows[0];
      if (!artifact) throw notFound(`Artefact ${artifactKey}`);
      const other = (
        await c.query(
          `select s.name from sprint_item i join sprint s on s.id = i.sprint_id where i.artifact_id = $1 and s.state <> 'closed' and s.id <> $2`,
          [artifact.id, sprintId],
        )
      ).rows[0];
      if (other) throw conflict(`${artifactKey} est déjà dans le sprint « ${other.name} ».`);
      await c.query('insert into sprint_item (sprint_id, artifact_id, organization_id) values ($1,$2,$3) on conflict do nothing', [sprintId, artifact.id, organizationId]);
      await audit(c, organizationId, actor, 'sprint.add_item', `sprint:${sprintId}`, { artifact: artifactKey });
    });
  }

  async start(organizationId: string, sprintId: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const sprint = await this.sprint(c, sprintId);
      if (sprint.state !== 'planned') throw conflict('Seul un sprint planifié peut démarrer.');
      const count = Number((await c.query('select count(*) n from sprint_item where sprint_id = $1', [sprintId])).rows[0].n);
      if (count === 0) throw validation(['sprint vide']);
      const committed = (await this.items(c, sprintId)).reduce((n, i) => n + i.points, 0);
      await c.query("update sprint set state = 'active', started_at = now(), committed_points = $2 where id = $1", [sprintId, committed]);
      await outbox(c, organizationId, 'sprint', sprintId, 'sprint.started', { name: sprint.name, items: count });
      await audit(c, organizationId, actor, 'sprint.start', `sprint:${sprintId}`);
    });
  }

  /** Clôture : les éléments non terminés sortent du sprint et retournent au backlog. */
  async close(organizationId: string, sprintId: string, actor: Actor): Promise<{ completed: number; returned: string[] }> {
    return this.db.tx(organizationId, async (c) => {
      const sprint = await this.sprint(c, sprintId);
      if (sprint.state !== 'active') throw conflict('Seul un sprint actif peut être clos.');
      const items = (await this.items(c, sprintId));
      const returned = items.filter((i) => !i.done).map((i) => i.key);
      if (returned.length) {
        await c.query(
          `delete from sprint_item where sprint_id = $1 and artifact_id in (select a.id from artifact a where a.key = any($2))`,
          [sprintId, returned],
        );
      }
      const completed = items.filter((i) => i.done).reduce((n, i) => n + i.points, 0);
      await c.query("update sprint set state = 'closed', closed_at = now(), completed_points = $2 where id = $1", [sprintId, completed]);
      await outbox(c, organizationId, 'sprint', sprintId, 'sprint.completed', { name: sprint.name, completed: items.length - returned.length, returned });
      await audit(c, organizationId, actor, 'sprint.close', `sprint:${sprintId}`);
      return { completed: items.length - returned.length, returned };
    });
  }

  async get(organizationId: string, sprintId: string): Promise<SprintView> {
    return this.db.tx(organizationId, async (c) => {
      const sprint = await this.sprint(c, sprintId);
      const items = await this.items(c, sprintId);
      return {
        id: sprint.id, name: sprint.name, goal: sprint.goal, state: sprint.state,
        startsOn: sprint.starts ?? null, endsOn: sprint.ends ?? null,
        items, totalPoints: items.reduce((n, i) => n + i.points, 0), donePoints: items.filter((i) => i.done).reduce((n, i) => n + i.points, 0),
      };
    });
  }

  /** Burndown reconstitué depuis les révisions : reste à faire en fin de chaque jour du sprint. */
  async burndown(organizationId: string, sprintId: string, today: Date = new Date()): Promise<BurndownPoint[]> {
    return this.db.tx(organizationId, async (c) => {
      const sprint = await this.sprint(c, sprintId);
      if (!sprint.starts || !sprint.ends) return [];
      const rows = (
        await c.query(
          `select a.key, a.tracker_id, r.created_at, r.snapshot ->> 'status' as status, (r.snapshot -> 'values') as values
           from sprint_item i join artifact a on a.id = i.artifact_id join artifact_revision r on r.artifact_id = a.id
           where i.sprint_id = $1 order by r.created_at`,
          [sprintId],
        )
      ).rows;
      const meta = await this.statusMeta(c, sprintId);
      const start = new Date(`${sprint.starts}T00:00:00Z`);
      const end = new Date(`${sprint.ends}T00:00:00Z`);
      const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
      const total = [...meta.points.values()].reduce((n, p) => n + p, 0);
      const points: BurndownPoint[] = [];
      for (let i = 0; i <= days; i++) {
        const current = new Date(start.getTime() + i * 86_400_000);
        if (current.getTime() > today.getTime() + 86_400_000) break;
        const endOfDay = current.getTime() + 86_400_000;
        const state = new Map<string, string>();
        for (const r of rows) if (r.created_at.getTime() < endOfDay) state.set(r.key, r.status);
        let remaining = 0;
        for (const [key, pts] of meta.points) {
          const done = meta.doneStatuses.get(key)?.has(state.get(key) ?? '') ?? false;
          if (!done) remaining += pts;
        }
        points.push({ date: day(current), remaining, ideal: Math.round((total * (1 - i / Math.max(days, 1))) * 100) / 100 });
      }
      return points;
    });
  }

  private async items(c: PoolClient, sprintId: string) {
    const rows = (
      await c.query(
        `select a.key, s.key as status, s.category, a."values" as values,
                (select f.key from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'estimate') as estimate_field
         from sprint_item i join artifact a on a.id = i.artifact_id join status s on s.id = a.status_id
         where i.sprint_id = $1 order by a.created_at, a.id`,
        [sprintId],
      )
    ).rows;
    return rows.map((r) => ({
      key: r.key as string, status: r.status as string, done: r.category === 'done',
      points: Number(r.estimate_field ? r.values[r.estimate_field] ?? 0 : 0) || 0,
    }));
  }

  private async statusMeta(c: PoolClient, sprintId: string) {
    const rows = (
      await c.query(
        `select a.key, a."values" as values, a.tracker_id,
                (select f.key from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'estimate') as estimate_field,
                (select array_agg(s.key) from status s where s.tracker_id = a.tracker_id and s.category = 'done') as done_statuses
         from sprint_item i join artifact a on a.id = i.artifact_id where i.sprint_id = $1`,
        [sprintId],
      )
    ).rows;
    const points = new Map<string, number>();
    const doneStatuses = new Map<string, Set<string>>();
    for (const r of rows) {
      points.set(r.key, Number(r.estimate_field ? r.values[r.estimate_field] ?? 0 : 0) || 0);
      doneStatuses.set(r.key, new Set(r.done_statuses ?? []));
    }
    return { points, doneStatuses };
  }

  private async project(c: PoolClient, key: string): Promise<string> {
    const row = (await c.query('select id from project where key = $1', [key])).rows[0];
    if (!row) throw notFound(`Projet ${key}`);
    return row.id as string;
  }

  private async sprint(c: PoolClient, id: string) {
    const row = (await c.query('select *, starts_on::text as starts, ends_on::text as ends from sprint where id = $1', [id])).rows[0];
    if (!row) throw notFound('Sprint');
    return row;
  }
}
