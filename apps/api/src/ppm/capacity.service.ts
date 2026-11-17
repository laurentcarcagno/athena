import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import type { CalendarService } from '../core/calendar.service';
import { forbidden, notFound, validation } from '../core/errors';
import { allocationMinutes, capacityMinutes, loadLevel, periodsBetween, type Granularity, type LoadLevel, type Period } from './capacity';
import type { PpmSettingsService } from './settings.service';

export interface CapacityCell { period: string; capacityMinutes: number; loadMinutes: number; level: LoadLevel; projects: Array<{ project: string; minutes: number }> }
export interface PersonCapacity { subject: string; name: string; teams: string[]; cells: CapacityCell[] }
export interface TeamCapacity {
  team: string; name: string;
  cells: Array<{ period: string; capacityMinutes: number; nominativeMinutes: number; genericMinutes: number; freeMinutes: number; level: LoadLevel }>;
  /** Besoins génériques par rôle (« 0,5 ETP de thermicien ») : minutes par période. */
  needs: Array<{ roleLabel: string; minutes: number[] }>;
}
export interface Bottleneck { team: string; name: string; period: string; saturationPercent: number; projects: Array<{ project: string; minutes: number }> }
export interface CapacityView { granularity: Granularity; overloadPercent: number; workdayMinutes: number; periods: Period[]; people: PersonCapacity[]; teams: TeamCapacity[]; bottlenecks: Bottleneck[] }

const MAX_PERIODS = 60;
const SEES_ALL = ['athena-admin', 'athena-pmo', 'athena-director'];

/**
 * Capacité par personne et par équipe (lot 21, B35) : capacité = jours ouvrés × journée × disponibilité − absences ; charge = allocations nominatives ;
 * besoin générique d'une équipe = allocations par rôle. Calculée à la lecture, sous l'identité du lecteur : un manager ne voit que les membres de ses
 * équipes, le PMO et la direction tous, une personne elle-même.
 */
export class CapacityService {
  constructor(private readonly db: Db, private readonly calendar: Pick<CalendarService, 'load'>, private readonly settings: Pick<PpmSettingsService, 'get'>) {}

  async view(organizationId: string, actor: Actor, input: { from: string; to: string; granularity?: Granularity; team?: string }): Promise<CapacityView> {
    const granularity = input.granularity ?? 'month';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.to < input.from) throw validation(['from et to : deux dates AAAA-MM-JJ, to après from']);
    const periods = periodsBetween(input.from, input.to, granularity);
    if (periods.length > MAX_PERIODS) throw validation([`l’horizon dépasse ${MAX_PERIODS} périodes : réduisez-le ou passez en mois`]);
    const [cal, cfg] = [await this.calendar.load(organizationId), await this.settings.get(organizationId)];
    const first = periods[0]!.from;
    const last = periods[periods.length - 1]!.to;

    const data = await this.db.tx(organizationId, async (c) => {
      const teams = await this.visibleTeams(c, actor, input.team);
      const members = (await c.query(
        `select m.subject, t.key team, coalesce(u.display_name, u.username, m.subject) name from team_member m join team t on t.id = m.team_id
           left join user_account u on u.organization_id = m.organization_id and u.subject = m.subject where m.team_id = any($1::uuid[]) order by lower(coalesce(u.display_name, m.subject))`, [teams.map((t) => t.id)])).rows as Array<{ subject: string; team: string; name: string }>;
      // Une personne seule (sans équipe visible) voit sa propre ligne.
      const subjects = [...new Set(members.map((m) => m.subject))];
      const own = !SEES_ALL.some((r) => actor.roles.includes(r)) && teams.length === 0 && !input.team ? [actor.id] : [];
      const all = [...new Set([...subjects, ...own])];
      const avail = (await c.query(`select subject, to_char(from_day,'YYYY-MM-DD') f, to_char(to_day,'YYYY-MM-DD') t, ratio::float r, workday_minutes w from person_availability where subject = any($1::text[]) and from_day <= $3 and (to_day is null or to_day >= $2) order by from_day, created_at`, [all, first, last])).rows;
      const abs = (await c.query(`select subject, to_char(from_day,'YYYY-MM-DD') f, to_char(to_day,'YYYY-MM-DD') t, half_day h from absence where subject = any($1::text[]) and from_day <= $3 and to_day >= $2`, [all, first, last])).rows;
      const alloc = (await c.query(
        `select a.subject, t.key team, a.role_label, p.key project, to_char(a.from_day,'YYYY-MM-DD') f, to_char(a.to_day,'YYYY-MM-DD') e, a.fte::float fte
           from allocation a join project p on p.id = a.project_id left join team t on t.id = a.team_id
          where (a.subject = any($1::text[]) or a.team_id = any($4::uuid[])) and a.from_day <= $3 and (a.to_day is null or a.to_day >= $2)`, [all, first, last, teams.map((t) => t.id)])).rows;
      const names = (await c.query('select subject, coalesce(display_name, username, subject) name from user_account where subject = any($1::text[])', [all])).rows;
      return { teams, members, all, avail, abs, alloc, names };
    });

    const nameOf = new Map(data.names.map((n) => [n.subject as string, n.name as string]));
    const minutesOf = (a: { f: string; e: string | null; fte: number }, p: Period, workday: number) => allocationMinutes(cal, p, workday, { from: a.f, to: a.e, fte: a.fte });

    const people: PersonCapacity[] = data.all.map((subject) => {
      const av = data.avail.filter((r) => r.subject === subject).map((r) => ({ from: r.f as string, to: r.t as string | null, ratio: r.r as number, workdayMinutes: r.w as number | null }));
      const ab = data.abs.filter((r) => r.subject === subject).map((r) => ({ from: r.f as string, to: r.t as string, halfDay: r.h as boolean }));
      const mine = data.alloc.filter((r) => r.subject === subject);
      return {
        subject, name: nameOf.get(subject) ?? subject, teams: data.members.filter((m) => m.subject === subject).map((m) => m.team),
        cells: periods.map((p) => {
          const capacity = capacityMinutes(cal, p, cfg.workdayMinutes, av, ab);
          const byProject = new Map<string, number>();
          for (const a of mine) byProject.set(a.project, (byProject.get(a.project) ?? 0) + minutesOf(a, p, av.find((x) => x.from <= p.to && (x.to === null || x.to >= p.from))?.workdayMinutes ?? cfg.workdayMinutes));
          const projects = [...byProject].filter(([, m]) => m > 0).map(([project, minutes]) => ({ project, minutes })).sort((x, y) => y.minutes - x.minutes);
          const load = projects.reduce((n, x) => n + x.minutes, 0);
          return { period: p.key, capacityMinutes: capacity, loadMinutes: load, level: loadLevel(load, capacity, cfg.overloadPercent), projects };
        }),
      };
    });

    const teams: TeamCapacity[] = data.teams.map((t) => {
      const ids = new Set(data.members.filter((m) => m.team === t.key).map((m) => m.subject));
      const mine = people.filter((p) => ids.has(p.subject));
      const roles = [...new Set(data.alloc.filter((a) => a.team === t.key).map((a) => a.role_label as string))];
      const generic = (p: Period, role?: string) => data.alloc.filter((a) => a.team === t.key && (role === undefined || a.role_label === role)).reduce((n, a) => n + minutesOf(a, p, cfg.workdayMinutes), 0);
      return {
        team: t.key, name: t.name,
        cells: periods.map((p, i) => {
          const capacity = mine.reduce((n, x) => n + x.cells[i]!.capacityMinutes, 0);
          const nominative = mine.reduce((n, x) => n + x.cells[i]!.loadMinutes, 0);
          const gen = generic(p);
          return { period: p.key, capacityMinutes: capacity, nominativeMinutes: nominative, genericMinutes: gen, freeMinutes: capacity - nominative - gen, level: loadLevel(nominative + gen, capacity, cfg.overloadPercent) };
        }),
        needs: roles.map((roleLabel) => ({ roleLabel, minutes: periods.map((p) => generic(p, roleLabel)) })),
      };
    });

    const bottlenecks: Bottleneck[] = [];
    for (const t of teams) {
      t.cells.forEach((cell, i) => {
        const load = cell.nominativeMinutes + cell.genericMinutes;
        if (load === 0 || (cell.capacityMinutes > 0 && load / cell.capacityMinutes <= 1)) return;
        const byProject = new Map<string, number>();
        for (const m of data.members.filter((x) => x.team === t.team)) for (const pr of people.find((p) => p.subject === m.subject)!.cells[i]!.projects) byProject.set(pr.project, (byProject.get(pr.project) ?? 0) + pr.minutes);
        for (const a of data.alloc.filter((x) => x.team === t.team)) byProject.set(a.project, (byProject.get(a.project) ?? 0) + minutesOf(a, periods[i]!, cfg.workdayMinutes));
        bottlenecks.push({ team: t.team, name: t.name, period: cell.period, saturationPercent: cell.capacityMinutes > 0 ? Math.round((load / cell.capacityMinutes) * 100) : 999, projects: [...byProject].map(([project, minutes]) => ({ project, minutes })).sort((a, b) => b.minutes - a.minutes) });
      });
    }
    bottlenecks.sort((a, b) => b.saturationPercent - a.saturationPercent || a.team.localeCompare(b.team) || a.period.localeCompare(b.period));
    return { granularity, overloadPercent: cfg.overloadPercent, workdayMinutes: cfg.workdayMinutes, periods, people, teams, bottlenecks };
  }

  /** Équipes que le lecteur voit : toutes pour l'administrateur, le PMO et la direction ; celles qu'il dirige pour un manager. Une équipe demandée mais non visible : refusée. */
  private async visibleTeams(c: PoolClient, actor: Actor, key?: string): Promise<Array<{ id: string; key: string; name: string }>> {
    const all = SEES_ALL.some((r) => actor.roles.includes(r));
    const rows = (await c.query(
      `select t.id, t.key, t.name from team t where ($1::boolean or exists (select 1 from team_member m where m.team_id = t.id and m.subject = $2 and m.role = 'manager')) and ($3::text is null or t.key = $3) order by t.name`,
      [all, actor.id, key ?? null])).rows;
    if (key && rows.length === 0) {
      if (!(await c.query('select 1 from team where key = $1', [key])).rows[0]) throw notFound(`Équipe ${key}`);
      throw forbidden(`Vous ne dirigez pas l’équipe ${key}.`);
    }
    return rows;
  }
}

