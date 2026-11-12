import { z } from 'zod';
import { Db, type Actor } from './db';
import { validation } from './errors';
import { audit } from './tracker.service';
import { DEFAULT_WORK_DAYS, type WorkCalendar } from './work-calendar';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d, 'date inexistante');
export const CalendarInput = z.object({
  /** Jours ISO travaillés : 1 = lundi … 7 = dimanche. */
  workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  holidays: z.array(z.object({ day: Day, label: z.string().trim().min(1).max(100) }).strict()).max(500),
}).strict();
export type CalendarInput = z.infer<typeof CalendarInput>;
export interface CalendarView { workDays: number[]; holidays: Array<{ day: string; label: string }> }

/** Calendrier de l'organisation (semaine ouvrée, jours fériés) : lu par toutes les personnes, modifié par l'administration. */
export class CalendarService {
  constructor(private readonly db: Db) {}

  async get(organizationId: string): Promise<CalendarView> {
    return this.db.tx(organizationId, async (c) => {
      const week = (await c.query('select work_days from organization_calendar')).rows[0];
      const days = (await c.query("select to_char(day, 'YYYY-MM-DD') as day, label from calendar_holiday order by day")).rows;
      return { workDays: ((week?.work_days as number[] | undefined) ?? [...DEFAULT_WORK_DAYS]).slice().sort((a, b) => a - b), holidays: days.map((r) => ({ day: r.day as string, label: r.label as string })) };
    });
  }

  /** Calendrier prêt pour les calculs de dates. */
  async load(organizationId: string): Promise<WorkCalendar> {
    const v = await this.get(organizationId);
    return { workDays: new Set(v.workDays), holidays: new Set(v.holidays.map((h) => h.day)) };
  }

  async put(organizationId: string, input: CalendarInput, actor: Actor): Promise<CalendarView> {
    const workDays = [...new Set(input.workDays)].sort((a, b) => a - b);
    const seen = new Set<string>();
    const dup = input.holidays.find((h) => (seen.has(h.day) ? true : (seen.add(h.day), false)));
    if (dup) throw validation([`Jour férié en double : ${dup.day}.`]);
    await this.db.tx(organizationId, async (c) => {
      await c.query(
        `insert into organization_calendar (organization_id, work_days) values ($1, $2)
         on conflict (organization_id) do update set work_days = excluded.work_days, updated_at = now()`,
        [organizationId, workDays],
      );
      await c.query('delete from calendar_holiday');
      for (const h of input.holidays) await c.query('insert into calendar_holiday (organization_id, day, label) values ($1,$2,$3)', [organizationId, h.day, h.label]);
      await audit(c, organizationId, actor, 'calendar.update', 'calendar', { workDays, holidays: input.holidays.length });
    });
    return this.get(organizationId);
  }
}
