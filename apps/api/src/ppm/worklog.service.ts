import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { forbidden, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import type { CalendarService } from '../core/calendar.service';
import { allocationMinutes, periodsBetween, type Granularity } from './capacity';
import type { PpmSettingsService } from './settings.service';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), 'date invalide');
export const WorklogInput = z.object({ day: Day, minutes: z.number().int().min(1).max(1440), comment: z.string().trim().max(500).default('') });
export type WorklogData = z.infer<typeof WorklogInput>;

export interface WorklogView { id: string; ticket: string; subject: string; person: string; day: string; minutes: number; comment: string }
export interface PlannedVsConsumed { granularity: Granularity; periods: Array<{ key: string; plannedMinutes: number; consumedMinutes: number }>; byPerson: Array<{ subject: string; name: string; consumedMinutes: number }> }

/**
 * Temps passé (lot 22, B36) : une durée par personne, ticket et jour. On saisit pour soi (l'administrateur peut corriger pour un autre) ; on retire les siennes.
 * La visibilité suit celle du ticket (politique de la table). Le « consommé » d'un projet est la somme de ces lignes ; le « planifié » vient des allocations.
 */
export class WorklogService {
  constructor(private readonly db: Db, private readonly calendar: Pick<CalendarService, 'load'>, private readonly settings: Pick<PpmSettingsService, 'get'>) {}

  async add(organizationId: string, projectKey: string, ticket: string, input: WorklogData, actor: Actor, onBehalf?: string): Promise<WorklogView> {
    if (onBehalf && onBehalf !== actor.id && !actor.roles.includes('athena-admin')) throw forbidden('Vous ne saisissez du temps que pour vous-même.');
    const subject = onBehalf ?? actor.id;
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const a = (await c.query('select id, key from artifact where id = resolve_artifact($1, $2)', [project.id, ticket])).rows[0];
      if (!a) throw notFound(`Ticket ${ticket}`);
      const row = (await c.query('insert into worklog (organization_id, artifact_id, project_id, subject, work_day, minutes, comment) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [organizationId, a.id, project.id, subject, input.day, input.minutes, input.comment])).rows[0];
      await audit(c, organizationId, actor, 'worklog.add', `project:${projectKey}`, { ticket: a.key, day: input.day, minutes: input.minutes });
      return { id: row.id, ticket: a.key, subject, person: subject, day: input.day, minutes: input.minutes, comment: input.comment };
    });
  }

  /** Temps passé sur un ticket, du plus récent au plus ancien. */
  async forTicket(organizationId: string, projectKey: string, ticket: string): Promise<{ rows: WorklogView[]; totalMinutes: number }> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const a = (await c.query('select id, key from artifact where id = resolve_artifact($1, $2)', [project.id, ticket])).rows[0];
      if (!a) throw notFound(`Ticket ${ticket}`);
      const rows = (await c.query(
        `select w.id, w.subject, coalesce(u.display_name, u.username, w.subject) person, to_char(w.work_day, 'YYYY-MM-DD') as day, w.minutes, w.comment
           from worklog w left join user_account u on u.organization_id = w.organization_id and u.subject = w.subject where w.artifact_id = $1 order by w.work_day desc, w.created_at desc`, [a.id])).rows
        .map((r) => ({ id: r.id, ticket: a.key as string, subject: r.subject, person: r.person, day: r.day, minutes: r.minutes, comment: r.comment }));
      return { rows, totalMinutes: rows.reduce((n, r) => n + r.minutes, 0) };
    });
  }

  async remove(organizationId: string, id: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const r = (await c.query('select subject from worklog where id = $1', [id])).rows[0];
      if (!r) throw notFound('Temps passé');
      if (r.subject !== actor.id && !actor.roles.includes('athena-admin')) throw forbidden('Vous ne retirez que votre propre temps passé.');
      await c.query('delete from worklog where id = $1', [id]);
      await audit(c, organizationId, actor, 'worklog.remove', 'worklog', { id });
    });
  }

  /** Planifié (allocations du projet, en minutes) contre consommé (temps passé), par période, et le consommé par personne. */
  async plannedVsConsumed(organizationId: string, projectKey: string, input: { from: string; to: string; granularity?: Granularity }): Promise<PlannedVsConsumed> {
    const granularity = input.granularity ?? 'month';
    if (input.to < input.from) throw validation(['to : la fin précède le début']);
    const periods = periodsBetween(input.from, input.to, granularity);
    if (periods.length > 60) throw validation(['l’horizon dépasse 60 périodes']);
    const [cal, cfg] = [await this.calendar.load(organizationId), await this.settings.get(organizationId)];
    const { consumed, allocations } = await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const rows = (await c.query(
        `select to_char(w.work_day, 'YYYY-MM-DD') as day, w.subject, coalesce(u.display_name, u.username, w.subject) name, w.minutes
           from worklog w left join user_account u on u.organization_id = w.organization_id and u.subject = w.subject
          where w.project_id = $1 and w.work_day between $2 and $3`, [project.id, periods[0]!.from, periods[periods.length - 1]!.to])).rows as Array<{ day: string; subject: string; name: string; minutes: number }>;
      const allocs = (await c.query(`select to_char(from_day, 'YYYY-MM-DD') f, to_char(to_day, 'YYYY-MM-DD') e, fte::float fte from allocation where project_id = $1`, [project.id])).rows as Array<{ f: string; e: string | null; fte: number }>;
      return { consumed: rows, allocations: allocs };
    });
    const people = new Map<string, { name: string; minutes: number }>();
    for (const r of consumed) people.set(r.subject, { name: r.name, minutes: (people.get(r.subject)?.minutes ?? 0) + r.minutes });
    return {
      granularity,
      periods: periods.map((p) => ({ key: p.key, plannedMinutes: allocations.reduce((n, a) => n + allocationMinutes(cal, p, cfg.workdayMinutes, { from: a.f, to: a.e, fte: a.fte }), 0), consumedMinutes: consumed.filter((r) => r.day >= p.from && r.day <= p.to).reduce((n, r) => n + r.minutes, 0) })),
      byPerson: [...people].map(([subject, v]) => ({ subject, name: v.name, consumedMinutes: v.minutes })).sort((a, b) => b.consumedMinutes - a.consumedMinutes),
    };
  }
}
