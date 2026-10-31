import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

export interface VelocityPoint {
  sprint: string;
  committed: number;
  completed: number;
}
export interface Velocity {
  sprints: VelocityPoint[];
  average: number;
  /** Moyenne des points terminés sur les trois derniers sprints clos (prévision du prochain sprint). */
  forecast: number;
}
export interface FlowDay {
  date: string;
  todo: number;
  in_progress: number;
  done: number;
}
export interface ReleaseView {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  state: string;
  items: number;
  doneItems: number;
  totalPoints: number;
  donePoints: number;
  progress: number;
}
export interface Dashboard {
  byCategory: { todo: number; in_progress: number; done: number };
  byTracker: Array<{ tracker: string; total: number; open: number }>;
  distribution: Array<{ value: string; count: number }> | null;
  recent: Array<{ key: string; type: string; at: string }>;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;

/** Indicateurs de pilotage : vélocité, flux cumulé, roadmap par releases, tableau de bord (plan § 9.3). */
export class ReportService {
  constructor(private readonly db: Db) {}

  async velocity(organizationId: string, projectKey: string, last = 10): Promise<Velocity> {
    const rows = await this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select s.name, s.committed_points, s.completed_points from sprint s join project p on p.id = s.project_id
           where p.key = $1 and s.state = 'closed' and s.completed_points is not null order by s.closed_at desc limit $2`,
          [projectKey, Math.min(Math.max(last, 1), 50)],
        )
      ).rows,
    );
    const sprints = rows.reverse().map((r) => ({ sprint: r.name as string, committed: Number(r.committed_points ?? 0), completed: Number(r.completed_points) }));
    const mean = (list: VelocityPoint[]) => (list.length ? round(list.reduce((n, s) => n + s.completed, 0) / list.length) : 0);
    return { sprints, average: mean(sprints), forecast: mean(sprints.slice(-3)) };
  }

  /** Flux cumulé : nombre d'artefacts par catégorie de statut à la fin de chaque jour, reconstitué des révisions. */
  async cumulativeFlow(organizationId: string, projectKey: string, days = 30, today: Date = new Date()): Promise<FlowDay[]> {
    if (!Number.isInteger(days) || days < 1 || days > 180) throw validation(['days : entre 1 et 180']);
    return this.db.tx(organizationId, async (c) => {
      const revisions = (
        await c.query(
          `select r.artifact_id, r.created_at, r.snapshot ->> 'status' as status, a.tracker_id
           from artifact_revision r join artifact a on a.id = r.artifact_id join project p on p.id = a.project_id
           where p.key = $1 and r.snapshot is not null order by r.created_at, r.version`,
          [projectKey],
        )
      ).rows;
      const categories = new Map<string, string>();
      for (const s of (await c.query('select s.tracker_id, s.key, s.category from status s join tracker t on t.id = s.tracker_id join project p on p.id = t.project_id where p.key = $1', [projectKey])).rows) {
        categories.set(`${s.tracker_id}:${s.key}`, s.category);
      }
      const end = new Date(`${day(today)}T00:00:00Z`);
      const result: FlowDay[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(end.getTime() - i * 86_400_000);
        const limit = date.getTime() + 86_400_000;
        const latest = new Map<string, string>();
        for (const r of revisions) if (r.created_at.getTime() < limit) latest.set(r.artifact_id, categories.get(`${r.tracker_id}:${r.status}`) ?? 'todo');
        const counts = { todo: 0, in_progress: 0, done: 0 };
        for (const category of latest.values()) counts[category as keyof typeof counts] += 1;
        result.push({ date: day(date), ...counts });
      }
      return result;
    });
  }

  async createRelease(organizationId: string, projectKey: string, input: { name: string; startsOn: string; endsOn: string }, actor: Actor): Promise<string> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const id = (await c.query('insert into release (organization_id, project_id, name, starts_on, ends_on) values ($1,$2,$3,$4,$5) returning id', [organizationId, project, input.name, input.startsOn, input.endsOn])).rows[0].id as string;
      await audit(c, organizationId, actor, 'release.create', `release:${projectKey}/${input.name}`);
      return id;
    });
  }

  async assign(organizationId: string, projectKey: string, releaseId: string, artifactKey: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const release = (await c.query('select state from release where id = $1', [releaseId])).rows[0];
      if (!release) throw notFound('Release');
      if (release.state === 'released') throw conflict('Release publiée : ajout impossible.');
      const artifact = (await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.key = $2', [projectKey, artifactKey])).rows[0];
      if (!artifact) throw notFound(`Artefact ${artifactKey}`);
      await c.query('insert into release_item (release_id, artifact_id, organization_id) values ($1,$2,$3) on conflict do nothing', [releaseId, artifact.id, organizationId]);
      await audit(c, organizationId, actor, 'release.assign', `release:${releaseId}`, { artifact: artifactKey });
    });
  }

  async publish(organizationId: string, releaseId: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query("update release set state = 'released' where id = $1 and state = 'planned'", [releaseId]);
      if (result.rowCount === 0) throw conflict('Release inconnue ou déjà publiée.');
      await audit(c, organizationId, actor, 'release.publish', `release:${releaseId}`);
    });
  }

  /** Roadmap : releases triées par date, avec avancement en éléments et en points. */
  async roadmap(organizationId: string, projectKey: string): Promise<ReleaseView[]> {
    return this.db.tx(organizationId, async (c) => {
      const rows = (
        await c.query(
          `select r.id, r.name, r.starts_on::text as starts, r.ends_on::text as ends, r.state,
                  count(i.artifact_id)::int as items,
                  count(i.artifact_id) filter (where s.category = 'done')::int as done_items,
                  coalesce(sum(est.points), 0) as total_points,
                  coalesce(sum(est.points) filter (where s.category = 'done'), 0) as done_points
           from release r join project p on p.id = r.project_id
           left join release_item i on i.release_id = r.id
           left join artifact a on a.id = i.artifact_id
           left join status s on s.id = a.status_id
           left join lateral (
             select case when jsonb_typeof(a."values" -> f.key) = 'number' then (a."values" ->> f.key)::numeric end as points
             from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'estimate'
           ) est on true
           where p.key = $1 group by r.id order by r.starts_on, r.name`,
          [projectKey],
        )
      ).rows;
      return rows.map((r) => ({
        id: r.id, name: r.name, startsOn: r.starts, endsOn: r.ends, state: r.state, items: r.items, doneItems: r.done_items,
        totalPoints: Number(r.total_points), donePoints: Number(r.done_points),
        progress: r.items === 0 ? 0 : round(Number(r.total_points) > 0 ? Number(r.done_points) / Number(r.total_points) : r.done_items / r.items),
      }));
    });
  }

  /** Tableau de bord : répartition par catégorie et par tracker, distribution d'un champ, activité récente. */
  async dashboard(organizationId: string, projectKey: string, distributionField?: string): Promise<Dashboard> {
    if (distributionField !== undefined && !/^[a-z][a-z0-9_]{0,39}$/.test(distributionField)) throw validation(['champ de répartition invalide']);
    return this.db.tx(organizationId, async (c) => {
      const byCategory = { todo: 0, in_progress: 0, done: 0 };
      const trackers = (
        await c.query(
          `select t.key as tracker, s.category, count(*)::int as n from artifact a join project p on p.id = a.project_id
           join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id where p.key = $1 group by t.key, s.category`,
          [projectKey],
        )
      ).rows;
      const perTracker = new Map<string, { total: number; open: number }>();
      for (const r of trackers) {
        byCategory[r.category as keyof typeof byCategory] += r.n;
        const entry = perTracker.get(r.tracker) ?? { total: 0, open: 0 };
        entry.total += r.n;
        if (r.category !== 'done') entry.open += r.n;
        perTracker.set(r.tracker, entry);
      }
      const distribution = distributionField
        ? (
            await c.query(
              `select a."values" ->> $2::text as value, count(*)::int as n from artifact a join project p on p.id = a.project_id
               where p.key = $1 and a."values" ? $2::text group by 1 order by n desc, 1 limit 20`,
              [projectKey, distributionField],
            )
          ).rows.map((r) => ({ value: r.value as string, count: r.n as number }))
        : null;
      const recent = (
        await c.query(
          `select a.key, r.created_at from artifact_revision r join artifact a on a.id = r.artifact_id join project p on p.id = a.project_id
           where p.key = $1 order by r.created_at desc, r.version desc limit 10`,
          [projectKey],
        )
      ).rows.map((r) => ({ key: r.key as string, type: 'revision', at: (r.created_at as Date).toISOString() }));
      return {
        byCategory,
        byTracker: [...perTracker.entries()].map(([tracker, v]) => ({ tracker, ...v })).sort((a, b) => a.tracker.localeCompare(b.tracker)),
        distribution,
        recent,
      };
    });
  }

  private async project(c: PoolClient, key: string): Promise<string> {
    const row = (await c.query('select id from project where key = $1', [key])).rows[0];
    if (!row) throw notFound(`Projet ${key}`);
    return row.id as string;
  }
}
