import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ArtifactService } from '../core/artifact.service';
import type { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit, outbox } from '../core/tracker.service';
import { addWorkingDays, alignToWorkingDay, listWorkingDays, workingDaysBetween } from '../core/work-calendar';
import { computeSchedule, type PlanLink, type PlanTask, type PlannedTask, type Schedule } from './schedule-engine';

export interface ScheduleTask extends PlannedTask {
  tracker: string;
  /** Version du ticket (pour une modification concurrente sûre). */
  version: number;
  /** Statut du ticket (Board et Liste du planning). */
  status: { key: string; name: string; category: string; color: string | null };
  assignee: string | null;
  /** Dates planifiées figées par la baseline comparée (nulles sans baseline, ou si le ticket n'y était pas). */
  baselineStart: string | null;
  baselineEnd: string | null;
  /** Écart de la fin planifiée à la fin de la baseline, en jours ouvrés (positif : en retard). */
  variance: number | null;
}
export interface ScheduleView extends Omit<Schedule, 'tasks'> {
  tasks: ScheduleTask[];
  links: Array<{ id: string; from: string; to: string; lag: number }>;
  /** Baseline comparée (nom et date de création), si demandée. */
  baseline: { name: string; createdAt: string } | null;
}
export interface BaselineChoice { name: string; createdAt: string; tasks: number }
export interface ApplyResult { moved: number; keys: string[]; batch: string | null }
/** Modification d'une tâche : exactement un de ces trois champs. */
export interface TaskChange { start?: string; due?: string; duration?: number }

interface Loaded {
  tasks: PlanTask[];
  links: PlanLink[];
  meta: Map<string, { tracker: string; version: number; status: ScheduleTask['status']; assignee: string | null; startKey: string; dueKey: string; titleHidden: boolean }>;
}

/**
 * Planning d'un projet (T-0161) : lit les tickets des trackers qui portent les rôles `start_date` et `due_date`, les liens
 * « précède » (ordonnés) et la hiérarchie, calcule avec le calendrier de l'organisation, et peut appliquer le résultat.
 */
export class ScheduleService {
  constructor(private readonly db: Db, private readonly artifacts: ArtifactService, private readonly calendar: CalendarService) {}

  /** Planning calculé ; un titre à lecture restreinte est remplacé par la clé. */
  async get(organizationId: string, projectKey: string, roles: string[], baselineName?: string): Promise<ScheduleView> {
    const cal = await this.calendar.load(organizationId);
    return this.db.tx(organizationId, async (c) => {
      const loaded = await this.load(c, projectKey, roles);
      const schedule = computeSchedule(loaded.tasks, loaded.links, cal);
      let baseline: ScheduleView['baseline'] = null;
      const frozen = new Map<string, { start: string | null; end: string }>();
      if (baselineName !== undefined) {
        const row = (await c.query(
          'select b.id, b.name, b.created_at from baseline b join project p on p.id = b.project_id where p.key = $1 and b.name = $2', [projectKey, baselineName])).rows[0];
        if (!row) throw notFound(`Baseline ${baselineName}`);
        baseline = { name: row.name as string, createdAt: (row.created_at as Date).toISOString() };
        for (const r of (await c.query("select artifact_key, to_char(planned_start, 'YYYY-MM-DD') s, to_char(planned_end, 'YYYY-MM-DD') e from baseline_schedule where baseline_id = $1", [row.id])).rows) {
          frozen.set(r.artifact_key as string, { start: (r.s as string | null) ?? null, end: r.e as string });
        }
      }
      return {
        ...schedule,
        baseline,
        tasks: schedule.tasks.map((t) => {
          const old = frozen.get(t.key);
          return {
            ...t, tracker: loaded.meta.get(t.key)!.tracker, version: loaded.meta.get(t.key)!.version,
            status: loaded.meta.get(t.key)!.status, assignee: loaded.meta.get(t.key)!.assignee,
            baselineStart: old?.start ?? null, baselineEnd: old?.end ?? null,
            variance: old && t.plannedEnd ? workingDaysBetween(cal, old.end, t.plannedEnd) : null,
          };
        }),
        links: loaded.links.map((l) => ({ id: l.id!, from: l.from, to: l.to, lag: l.lag })),
      };
    });
  }

  /** Dates planifiées de tous les tickets planifiés, pour les figer dans une baseline. */
  async snapshot(organizationId: string, projectKey: string): Promise<Array<{ key: string; start: string | null; end: string }>> {
    const view = await this.get(organizationId, projectKey, ['athena-admin']);
    return view.tasks.filter((t) => t.scheduled && t.plannedEnd).map((t) => ({ key: t.key, start: t.milestone ? null : t.plannedStart, end: t.plannedEnd! }));
  }

  /** Baselines qui ont figé un planning, de la plus récente à la plus ancienne. */
  async baselines(organizationId: string, projectKey: string): Promise<BaselineChoice[]> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select b.name, b.created_at, (select count(*) from baseline_schedule s where s.baseline_id = b.id) as n
       from baseline b join project p on p.id = b.project_id where p.key = $1 order by b.created_at desc`, [projectKey])).rows
      .filter((r) => Number(r.n) > 0).map((r) => ({ name: r.name as string, createdAt: (r.created_at as Date).toISOString(), tasks: Number(r.n) })));
  }

  /**
   * Écrit les dates calculées dans les tickets qui bougent, en une transaction et sous un identifiant de lot : l'historique
   * les enregistre en un seul commit « replanification ». Un événement `schedule.changed` annonce le résultat.
   */
  async apply(organizationId: string, projectKey: string, actor: Actor, batch: string = randomUUID()): Promise<ApplyResult> {
    const cal = await this.calendar.load(organizationId);
    const { schedule, meta } = await this.db.tx(organizationId, async (c) => {
      const loaded = await this.load(c, projectKey, ['athena-admin']);
      return { schedule: computeSchedule(loaded.tasks, loaded.links, cal), meta: loaded.meta };
    });
    const moving = schedule.tasks.filter((t) => t.moved);
    if (moving.length === 0) return { moved: 0, keys: [], batch: null };
    const patches = moving.map((t) => {
      const m = meta.get(t.key)!;
      return { key: t.key, patch: { ...(t.milestone || t.plannedStart === null ? {} : { [m.startKey]: t.plannedStart }), [m.dueKey]: t.plannedEnd } };
    });
    let keys: string[] = [];
    await this.artifacts.updateMany(organizationId, projectKey, patches, actor, batch, async (c, changed) => {
      keys = changed;
      if (changed.length === 0) return;
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0].id as string;
      await outbox(c, organizationId, 'project', project, 'schedule.changed', { project: projectKey, moved: changed.length, keys: changed, actor: actor.id, batch });
      await audit(c, organizationId, actor, 'schedule.apply', `project:${projectKey}`, { moved: changed.length, batch });
    });
    return { moved: keys.length, keys, batch: keys.length > 0 ? batch : null };
  }

  /**
   * Modifie une tâche (début, fin ou durée en jours ouvrés) puis replanifie ses successeurs, sous un même lot : un seul commit
   * d'historique. Une tâche parente n'est pas modifiable (ses dates viennent de ses enfants). Rend les tickets déplacés, y compris celui-ci.
   */
  async edit(organizationId: string, projectKey: string, key: string, change: TaskChange, actor: Actor): Promise<ApplyResult> {
    const given = [change.start, change.due, change.duration].filter((x) => x !== undefined).length;
    if (given !== 1) throw validation(['indiquer exactement un de : début, fin, durée']);
    const cal = await this.calendar.load(organizationId);
    const { schedule, meta } = await this.db.tx(organizationId, async (c) => {
      const loaded = await this.load(c, projectKey, ['athena-admin']);
      return { schedule: computeSchedule(loaded.tasks, loaded.links, cal), meta: loaded.meta };
    });
    const task = schedule.tasks.find((t) => t.key === key);
    const m = meta.get(key);
    if (!task || !m) throw notFound(`Tâche ${key} du planning`);
    if (task.summary) throw validation([`${key} est une tâche parente : ses dates sont calculées depuis ses enfants`]);
    const first = task.plannedStart;
    const last = task.plannedEnd;
    const count = first && last ? Math.max(1, listWorkingDays(cal, first, last).length) : 1;
    let patch: Record<string, string>;
    if (task.milestone) {
      if (change.due === undefined) throw validation([`${key} est un jalon : seule sa date peut changer`]);
      patch = { [m.dueKey]: alignToWorkingDay(cal, change.due) };
    } else if (change.start !== undefined) {
      const start = alignToWorkingDay(cal, change.start);
      patch = { [m.startKey]: start, [m.dueKey]: addWorkingDays(cal, start, count - 1) };
    } else if (change.duration !== undefined) {
      if (!Number.isInteger(change.duration) || change.duration < 1 || change.duration > 2000) throw validation(['la durée est un nombre entier de jours ouvrés, de 1 à 2000']);
      const start = first ?? alignToWorkingDay(cal, change.due ?? last ?? '');
      patch = { [m.startKey]: start, [m.dueKey]: addWorkingDays(cal, start, change.duration - 1) };
    } else {
      const due = alignToWorkingDay(cal, change.due!);
      if (first && due < first) throw validation(['la fin ne peut pas précéder le début']);
      patch = { ...(first ? { [m.startKey]: first } : { [m.startKey]: due }), [m.dueKey]: due };
    }
    const batch = randomUUID();
    const own = await this.artifacts.updateMany(organizationId, projectKey, [{ key, patch }], actor, batch);
    const rest = await this.apply(organizationId, projectKey, actor, batch);
    const keys = [...own, ...rest.keys];
    return { moved: keys.length, keys, batch: keys.length > 0 ? batch : null };
  }

  /** Change le décalage d'un lien « précède » (jours ouvrés, négatif : chevauchement) puis replanifie les successeurs sous un même lot. */
  async setLag(organizationId: string, projectKey: string, linkId: string, lagDays: number, actor: Actor): Promise<ApplyResult> {
    if (!Number.isInteger(lagDays) || lagDays < -365 || lagDays > 365) throw validation(['le décalage est un nombre entier de jours ouvrés, de -365 à 365']);
    await this.db.tx(organizationId, async (c) => {
      const row = (await c.query(
        `select l.id, l.lag_days, f.key as from_key, t.key as to_key from artifact_link l
         join link_type ty on ty.id = l.link_type_id and ty.ordered
         join artifact f on f.id = l.from_artifact_id join artifact t on t.id = l.to_artifact_id join project p on p.id = f.project_id
         where l.id::text = $1 and p.key = $2 for update of l`, [linkId, projectKey])).rows[0];
      if (!row) throw notFound('Lien de planification');
      if (row.lag_days === lagDays) return;
      await c.query('update artifact_link set lag_days = $2 where id = $1', [row.id, lagDays]);
      await outbox(c, organizationId, 'artifact', row.id as string, 'link.updated', { from: row.from_key, to: row.to_key, type: 'precedes', lagDays, actor: actor.id });
      await audit(c, organizationId, actor, 'link.lag', `artifact:${row.from_key}`, { to: row.to_key, from: row.lag_days, lagDays });
    });
    return this.apply(organizationId, projectKey, actor);
  }

  private async load(c: PoolClient, projectKey: string, roles: string[]): Promise<Loaded> {
    const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
    if (!project) throw notFound(`Projet ${projectKey}`);
    const canRead = (restricted: string[] | null) => !restricted || roles.includes('athena-admin') || restricted.some((x) => roles.includes(x));

    // Trackers de planification : ceux qui portent à la fois un début et une échéance.
    const fieldRows = (await c.query(
      `select f.tracker_id, t.key as tracker, f.semantic_role, f.key, f.read_roles
       from field_definition f join tracker t on t.id = f.tracker_id
       where t.project_id = $1 and f.semantic_role in ('title','assignee','start_date','due_date','progress','remaining')`,
      [project.id],
    )).rows;
    type Roles = Record<string, { key: string; readRoles: string[] | null }>;
    const byTracker = new Map<string, { tracker: string; roles: Roles }>();
    for (const f of fieldRows) {
      const entry = byTracker.get(f.tracker_id) ?? { tracker: f.tracker as string, roles: {} as Roles };
      entry.roles[f.semantic_role as string] = { key: f.key as string, readRoles: (f.read_roles as string[] | null) ?? null };
      byTracker.set(f.tracker_id as string, entry);
    }
    const planning = [...byTracker.entries()].filter(([, e]) => e.roles['start_date'] && e.roles['due_date']);
    if (planning.length === 0) return { tasks: [], links: [], meta: new Map() };

    const rows = (await c.query(
      `select a.id, a.key, a.version, a.tracker_id, a."values" as values, s.key as status_key, s.name as status_name, s.category as status_category, s.color as status_color
       from artifact a join status s on s.id = a.status_id where a.tracker_id = any($1::uuid[]) order by a.number, a.key`,
      [planning.map(([id]) => id)],
    )).rows;
    const idToKey = new Map<string, string>(rows.map((r) => [r.id as string, r.key as string]));
    const links = (await c.query(
      `select l.id, l.from_artifact_id as a, l.to_artifact_id as b, l.lag_days, t.ordered, t.hierarchical
       from artifact_link l join link_type t on t.id = l.link_type_id
       where (t.ordered or t.hierarchical) and l.from_artifact_id = any($1::uuid[]) and l.to_artifact_id = any($1::uuid[])
       order by l.created_at, l.id`,
      [[...idToKey.keys()]],
    )).rows;

    const parentOf = new Map<string, string>();
    const plan: PlanLink[] = [];
    for (const l of links) {
      const from = idToKey.get(l.a as string)!;
      const to = idToKey.get(l.b as string)!;
      if (l.hierarchical === true && !parentOf.has(from)) parentOf.set(from, to);
      if (l.ordered === true) plan.push({ id: l.id as string, from, to, lag: l.lag_days as number });
    }

    const meta: Loaded['meta'] = new Map();
    const tasks = rows.map((r): PlanTask => {
      const entry = byTracker.get(r.tracker_id as string)!;
      const v = r.values as Record<string, unknown>;
      const field = (role: string) => (entry.roles[role] && canRead(entry.roles[role]!.readRoles) ? v[entry.roles[role]!.key] : undefined);
      const date = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
      const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
      const title = field('title');
      const who = field('assignee');
      meta.set(r.key as string, { tracker: entry.tracker, version: r.version as number,
        status: { key: r.status_key as string, name: r.status_name as string, category: r.status_category as string, color: (r.status_color as string | null) ?? null },
        assignee: typeof who === 'string' && who ? who : null, startKey: entry.roles['start_date']!.key, dueKey: entry.roles['due_date']!.key, titleHidden: title === undefined });
      return {
        key: r.key as string, title: typeof title === 'string' && title ? title : (r.key as string),
        start: date(field('start_date')), end: date(field('due_date')), progress: num(field('progress')), remaining: num(field('remaining')),
        parent: parentOf.get(r.key as string) ?? null,
      };
    });
    return { tasks, links: plan, meta };
  }
}
