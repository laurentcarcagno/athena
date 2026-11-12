import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ArtifactService } from '../core/artifact.service';
import type { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit, outbox } from '../core/tracker.service';
import { addWorkingDays, alignToWorkingDay, listWorkingDays } from '../core/work-calendar';
import { computeSchedule, type PlanLink, type PlanTask, type PlannedTask, type Schedule } from './schedule-engine';

export interface ScheduleTask extends PlannedTask {
  tracker: string;
  /** Version du ticket (pour une modification concurrente sûre). */
  version: number;
}
export interface ScheduleView extends Omit<Schedule, 'tasks'> {
  tasks: ScheduleTask[];
  links: Array<{ id: string; from: string; to: string; lag: number }>;
}
export interface ApplyResult { moved: number; keys: string[]; batch: string | null }
/** Modification d'une tâche : exactement un de ces trois champs. */
export interface TaskChange { start?: string; due?: string; duration?: number }

interface Loaded {
  tasks: PlanTask[];
  links: PlanLink[];
  meta: Map<string, { tracker: string; version: number; startKey: string; dueKey: string; titleHidden: boolean }>;
}

/**
 * Planning d'un projet (T-0161) : lit les tickets des trackers qui portent les rôles `start_date` et `due_date`, les liens
 * « précède » (ordonnés) et la hiérarchie, calcule avec le calendrier de l'organisation, et peut appliquer le résultat.
 */
export class ScheduleService {
  constructor(private readonly db: Db, private readonly artifacts: ArtifactService, private readonly calendar: CalendarService) {}

  /** Planning calculé ; un titre à lecture restreinte est remplacé par la clé. */
  async get(organizationId: string, projectKey: string, roles: string[]): Promise<ScheduleView> {
    const cal = await this.calendar.load(organizationId);
    return this.db.tx(organizationId, async (c) => {
      const loaded = await this.load(c, projectKey, roles);
      const schedule = computeSchedule(loaded.tasks, loaded.links, cal);
      return {
        ...schedule,
        tasks: schedule.tasks.map((t) => ({ ...t, tracker: loaded.meta.get(t.key)!.tracker, version: loaded.meta.get(t.key)!.version })),
        links: loaded.links.map((l) => ({ id: l.id!, from: l.from, to: l.to, lag: l.lag })),
      };
    });
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

  private async load(c: PoolClient, projectKey: string, roles: string[]): Promise<Loaded> {
    const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
    if (!project) throw notFound(`Projet ${projectKey}`);
    const canRead = (restricted: string[] | null) => !restricted || roles.includes('athena-admin') || restricted.some((x) => roles.includes(x));

    // Trackers de planification : ceux qui portent à la fois un début et une échéance.
    const fieldRows = (await c.query(
      `select f.tracker_id, t.key as tracker, f.semantic_role, f.key, f.read_roles
       from field_definition f join tracker t on t.id = f.tracker_id
       where t.project_id = $1 and f.semantic_role in ('title','start_date','due_date','progress','remaining')`,
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
      'select id, key, version, tracker_id, "values" as values from artifact where tracker_id = any($1::uuid[]) order by number, key',
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
      meta.set(r.key as string, { tracker: entry.tracker, version: r.version as number, startKey: entry.roles['start_date']!.key, dueKey: entry.roles['due_date']!.key, titleHidden: title === undefined });
      return {
        key: r.key as string, title: typeof title === 'string' && title ? title : (r.key as string),
        start: date(field('start_date')), end: date(field('due_date')), progress: num(field('progress')), remaining: num(field('remaining')),
        parent: parentOf.get(r.key as string) ?? null,
      };
    });
    return { tasks, links: plan, meta };
  }
}
