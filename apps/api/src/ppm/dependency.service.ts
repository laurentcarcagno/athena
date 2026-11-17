import { z } from 'zod';
import type { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import { addWorkingDays, workingDaysBetween, type WorkCalendar } from '../core/work-calendar';
import type { ScheduleService } from '../planning/schedule.service';

export const DependencyInput = z.object({ from: z.string().trim().min(1).max(60), to: z.string().trim().min(1).max(60), lagDays: z.number().int().min(-365).max(365).default(0) });
export const PropagateInput = z.object({ ticket: z.string().trim().min(1).max(60), shiftDays: z.number().int().min(-365).max(365) });

export interface DependencyLink {
  id: string; from: { key: string; project: string }; to: { key: string; project: string }; lagDays: number;
  /** Marge en jours ouvrés entre la fin du prédécesseur (plus le décalage) et le début du successeur ; nulle sans dates. Négative : la contrainte est violée. */
  slackDays: number | null; critical: boolean;
}
export interface DependencyGraph {
  projects: string[];
  links: DependencyLink[];
  /** Matrice projet prédécesseur × projet successeur : nombre de liens. */
  matrix: Array<{ from: string; to: string; count: number; critical: number }>;
}
export interface Impact { key: string; project: string; shiftDays: number; newStart: string | null; newEnd: string | null }

type Dated = { start: string | null; end: string | null };

/**
 * Dépendances entre projets (lot 22, B36, étude PPM § 2.8) : un ticket d'un projet précède un ticket d'un autre, avec un décalage en jours ouvrés. Le
 * lien n'existe que si l'auteur voit les deux tickets. La propagation d'un retard est un calcul en lecture seule : le planning de chaque projet n'est jamais modifié.
 */
export class DependencyService {
  constructor(private readonly db: Db, private readonly schedule: Pick<ScheduleService, 'get'>, private readonly calendar: Pick<CalendarService, 'load'>) {}

  async add(organizationId: string, input: z.infer<typeof DependencyInput>, actor: Actor): Promise<DependencyLink> {
    const id = await this.db.tx(organizationId, async (c) => {
      const find = async (key: string) => {
        // la clé d'un ticket commence par celle de son projet ; les anciennes clés (alias) sont résolues par le projet
        const r = (await c.query('select a.id, a.key, a.project_id, p.key as project from project p join artifact a on a.id = resolve_artifact(p.id, $1) where p.key = $2', [key, key.split('-')[0]])).rows[0];
        if (!r) throw notFound(`Ticket ${key}`);
        return r as { id: string; key: string; project_id: string; project: string };
      };
      const [from, to] = [await find(input.from), await find(input.to)];
      if (from.project_id === to.project_id) throw validation(['les deux tickets sont dans le même projet : utilisez le lien « précède » du projet']);
      const edges = (await c.query('select from_artifact_id f, to_artifact_id t from project_dependency')).rows as Array<{ f: string; t: string }>;
      // cycle : le successeur mène-t-il déjà au prédécesseur ?
      const next = new Map<string, string[]>();
      for (const e of edges) next.set(e.f, [...(next.get(e.f) ?? []), e.t]);
      const seen = new Set<string>();
      const stack = [to.id];
      while (stack.length) { const n = stack.pop()!; if (n === from.id) throw conflict(`Ce lien créerait un cycle entre ${from.key} et ${to.key}.`); if (seen.has(n)) continue; seen.add(n); stack.push(...(next.get(n) ?? [])); }
      const row = (await c.query(
        `insert into project_dependency (organization_id, from_artifact_id, to_artifact_id, from_project_id, to_project_id, lag_days, created_by) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (from_artifact_id, to_artifact_id) do update set lag_days = excluded.lag_days returning id`,
        [organizationId, from.id, to.id, from.project_id, to.project_id, input.lagDays, actor.id])).rows[0];
      await audit(c, organizationId, actor, 'dependency.add', `project:${from.project}`, { from: from.key, to: to.key, lagDays: input.lagDays });
      return row.id as string;
    });
    return (await this.links(organizationId, actor, { id })).at(0)!;
  }

  async remove(organizationId: string, id: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const r = await c.query('delete from project_dependency where id = $1 returning from_artifact_id', [id]);
      if (r.rowCount === 0) throw notFound('Dépendance');
      await audit(c, organizationId, actor, 'dependency.remove', 'dependency', { id });
    });
  }

  private async datesOf(organizationId: string, projects: Iterable<string>, actor: Actor): Promise<Map<string, Dated>> {
    const out = new Map<string, Dated>();
    for (const p of new Set(projects)) {
      const view = await this.schedule.get(organizationId, p, actor.roles).catch(() => null);
      for (const t of view?.tasks ?? []) out.set(t.key, { start: t.plannedStart ?? t.plannedEnd ?? null, end: t.plannedEnd ?? null });
    }
    return out;
  }

  /** Liens visibles du lecteur (ou un seul), avec leur marge calculée sur les plannings. */
  private async links(organizationId: string, actor: Actor, filter: { id?: string; projects?: string[] } = {}): Promise<DependencyLink[]> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query(
      `select d.id, fa.key fkey, fp.key fproject, ta.key tkey, tp.key tproject, d.lag_days from project_dependency d
         join artifact fa on fa.id = d.from_artifact_id join project fp on fp.id = d.from_project_id join artifact ta on ta.id = d.to_artifact_id join project tp on tp.id = d.to_project_id
        where ($1::uuid is null or d.id = $1) and ($2::text[] is null or fp.key = any($2) or tp.key = any($2)) order by fp.key, fa.key, ta.key`, [filter.id ?? null, filter.projects ?? null])).rows);
    const [dates, cal] = [await this.datesOf(organizationId, rows.flatMap((r) => [r.fproject, r.tproject]), actor), await this.calendar.load(organizationId)];
    return rows.map((r): DependencyLink => {
      const slack = this.slack(cal, dates.get(r.fkey), dates.get(r.tkey), r.lag_days);
      return { id: r.id, from: { key: r.fkey, project: r.fproject }, to: { key: r.tkey, project: r.tproject }, lagDays: r.lag_days, slackDays: slack, critical: slack !== null && slack <= 0 };
    });
  }

  private slack(cal: WorkCalendar, pred: Dated | undefined, succ: Dated | undefined, lag: number): number | null {
    if (!pred?.end || !succ?.start) return null;
    return workingDaysBetween(cal, addWorkingDays(cal, pred.end, lag), succ.start) - 1; // le successeur démarre au plus tôt le jour ouvré qui suit
  }

  /** Graphe et matrice des dépendances des projets d'un portefeuille (les liens dont une extrémité est dans le portefeuille). */
  async graph(organizationId: string, portfolioKey: string, actor: Actor): Promise<DependencyGraph> {
    const keys = await this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      return (await c.query('select p.key from portfolio_project x join project p on p.id = x.project_id where x.portfolio_id = $1 order by p.key', [f.id])).rows.map((r) => r.key as string);
    });
    const links = await this.links(organizationId, actor, { projects: keys });
    const m = new Map<string, { from: string; to: string; count: number; critical: number }>();
    for (const l of links) {
      const k = `${l.from.project}>${l.to.project}`;
      const e = m.get(k) ?? { from: l.from.project, to: l.to.project, count: 0, critical: 0 };
      e.count += 1; e.critical += l.critical ? 1 : 0; m.set(k, e);
    }
    return { projects: [...new Set([...keys, ...links.flatMap((l) => [l.from.project, l.to.project])])].sort(), links, matrix: [...m.values()] };
  }

  /**
   * Propagation en lecture : si `ticket` glisse de `shiftDays` jours ouvrés, quels tickets des autres projets sont touchés, et de combien ? Un successeur ne bouge
   * que si sa marge est consommée ; sa propre fin glisse alors du même nombre de jours et se propage à son tour. Rien n'est écrit.
   */
  async propagate(organizationId: string, input: z.infer<typeof PropagateInput>, actor: Actor): Promise<{ origin: string; shiftDays: number; impacts: Impact[] }> {
    const deps = await this.db.tx(organizationId, async (c) => {
      if (!(await c.query('select 1 from project p where p.key = $2 and resolve_artifact(p.id, $1) is not null', [input.ticket, input.ticket.split('-')[0]])).rows[0]) throw notFound(`Ticket ${input.ticket}`);
      return (await c.query(
        `select fa.key fkey, fp.key fproject, ta.key tkey, tp.key tproject, d.lag_days from project_dependency d join artifact fa on fa.id = d.from_artifact_id
           join project fp on fp.id = d.from_project_id join artifact ta on ta.id = d.to_artifact_id join project tp on tp.id = d.to_project_id`)).rows;
    });
    const [dates, cal] = [await this.datesOf(organizationId, deps.flatMap((r) => [r.fproject, r.tproject]), actor), await this.calendar.load(organizationId)];
    // Deux passes : les positions respectant les liens sans glissement (les violations déjà présentes sont absorbées), puis avec le glissement ; l'impact est la différence.
    const forward = (shift: number): Map<string, Dated> => {
      const pos = new Map<string, Dated>([...dates].map(([k, v]) => [k, { ...v }]));
      const origin = pos.get(input.ticket);
      if (origin?.end) { origin.end = addWorkingDays(cal, origin.end, shift); if (origin.start) origin.start = addWorkingDays(cal, origin.start, shift); }
      const queue = [...new Set([input.ticket, ...deps.map((d) => d.fkey as string)])]; // toutes les contraintes sont appliquées, y compris celles déjà violées
      for (let guard = 0; queue.length && guard < 5000; guard++) {
        const key = queue.shift()!;
        const pred = pos.get(key);
        if (!pred?.end) continue;
        for (const d of deps.filter((x) => x.fkey === key)) {
          const succ = pos.get(d.tkey);
          if (!succ?.start) continue;
          const earliest = addWorkingDays(cal, addWorkingDays(cal, pred.end, d.lag_days), 1);
          if (earliest <= succ.start) continue;
          const delta = workingDaysBetween(cal, succ.start, earliest);
          succ.start = earliest;
          if (succ.end) succ.end = addWorkingDays(cal, succ.end, delta);
          queue.push(d.tkey);
        }
      }
      return pos;
    };
    const [base, moved] = [forward(0), forward(input.shiftDays)];
    const project = new Map(deps.flatMap((d) => [[d.fkey, d.fproject], [d.tkey, d.tproject]] as Array<[string, string]>));
    const impacts: Impact[] = [];
    for (const [key, m] of moved) {
      const b = base.get(key);
      if (key === input.ticket || !m.start || !b?.start || m.start <= b.start) continue;
      impacts.push({ key, project: project.get(key) ?? '', shiftDays: workingDaysBetween(cal, b.start, m.start), newStart: m.start, newEnd: m.end });
    }
    return { origin: input.ticket, shiftDays: input.shiftDays, impacts: impacts.sort((a, b) => b.shiftDays - a.shiftDays || a.key.localeCompare(b.key)) };
  }
}
