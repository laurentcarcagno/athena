// Ce service ne doit importer AUCUN service d'écriture du plan officiel : il ne reçoit que des fonctions de lecture (voir `scenario.architecture.test.ts`).
import { z } from 'zod';
import type { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import { allocationMinutes, periodsBetween, type Granularity } from './capacity';
import type { CapacityView } from './capacity.service';
import type { Impact } from './dependency.service';
import type { ProjectFinance } from './finance.service';
import type { PpmSettingsService } from './settings.service';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ChangeInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shift_ticket'), ticket: z.string().trim().min(1).max(60), shiftDays: z.number().int().min(-365).max(365) }),
  z.object({ kind: z.literal('allocate'), team: z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/), project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), from: Day, to: Day, fte: z.number().gt(0).max(20) }),
  z.object({ kind: z.literal('budget_delta'), project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), amount: z.number().finite().min(-1e9).max(1e9) }),
]);
export const ScenarioInput = z.object({ name: z.string().trim().min(1).max(100), changes: z.array(ChangeInput).min(1).max(30) });
export type ScenarioChange = z.infer<typeof ChangeInput>;

/** Fonctions de lecture du plan officiel, injectées : un scénario n'écrit jamais dans le plan. */
export interface ReadOnlyPlan {
  propagate(organizationId: string, input: { ticket: string; shiftDays: number }, actor: Actor): Promise<{ impacts: Impact[] }>;
  capacity(organizationId: string, actor: Actor, input: { from: string; to: string; granularity: Granularity; team: string }): Promise<CapacityView>;
  finance(organizationId: string, project: string, actor: Actor): Promise<ProjectFinance>;
}

export interface ScenarioResult {
  shifts: Array<{ ticket: string; shiftDays: number; impacts: Impact[] }>;
  capacity: Array<{ team: string; project: string; periods: Array<{ period: string; capacityMinutes: number; before: number; after: number; beforeLevel: number; afterLevel: number }> }>;
  budget: Array<{ project: string; budget: number; eacBefore: number; varianceBefore: number; varianceAfter: number; amount: number }>;
}
export interface ScenarioView { id: string; name: string; author: string; createdAt: string; changes: ScenarioChange[] }

/**
 * Scénarios « et si » (lot 25, B41) : un scénario vit dans ses tables et **calcule en mémoire** à partir du plan officiel, lu par des fonctions de lecture : propagation d'un retard,
 * effet d'une allocation sur la charge d'une équipe, effet d'un changement de budget. Aucune écriture dans les projets, les allocations ou le budget.
 */
export class ScenarioService {
  constructor(private readonly db: Db, private readonly plan: ReadOnlyPlan, private readonly calendar: Pick<CalendarService, 'load'>, private readonly settings: Pick<PpmSettingsService, 'get'>) {}

  async create(organizationId: string, portfolioKey: string, input: z.infer<typeof ScenarioInput>, actor: Actor): Promise<ScenarioView> {
    const id = await this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      const base = (await c.query('select id from portfolio_snapshot where portfolio_id = $1 order by taken_at desc limit 1', [f.id])).rows[0]?.id ?? null;
      const s = (await c.query('insert into scenario (organization_id, portfolio_id, name, base_snapshot_id, author) values ($1,$2,$3,$4,$5) returning id', [organizationId, f.id, input.name, base, actor.id])).rows[0];
      for (const ch of input.changes) await c.query('insert into scenario_change (organization_id, scenario_id, kind, target, payload) values ($1,$2,$3,$4,$5)',
        [organizationId, s.id, ch.kind, ch.kind === 'shift_ticket' ? ch.ticket : ch.kind === 'allocate' ? ch.team : ch.project, JSON.stringify(ch)]);
      await audit(c, organizationId, actor, 'scenario.create', `portfolio:${portfolioKey}`, { name: input.name, changes: input.changes.length });
      return s.id as string;
    });
    return (await this.get(organizationId, portfolioKey, id))!;
  }

  async list(organizationId: string, portfolioKey: string): Promise<Array<Omit<ScenarioView, 'changes'> & { changeCount: number }>> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select s.id, s.name, coalesce(u.display_name, s.author) author, s.created_at, (select count(*)::int from scenario_change x where x.scenario_id = s.id) n
         from scenario s join portfolio f on f.id = s.portfolio_id left join user_account u on u.organization_id = s.organization_id and u.subject = s.author where f.key = $1 order by s.created_at desc`, [portfolioKey]))
      .rows.map((r) => ({ id: r.id, name: r.name, author: r.author, createdAt: new Date(r.created_at).toISOString(), changeCount: r.n })));
  }

  async get(organizationId: string, portfolioKey: string, id: string): Promise<ScenarioView | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    return this.db.tx(organizationId, async (c) => {
      const s = (await c.query(
        `select s.id, s.name, coalesce(u.display_name, s.author) author, s.created_at from scenario s join portfolio f on f.id = s.portfolio_id
           left join user_account u on u.organization_id = s.organization_id and u.subject = s.author where s.id = $1 and f.key = $2`, [id, portfolioKey])).rows[0];
      if (!s) return null;
      const changes = (await c.query('select payload from scenario_change where scenario_id = $1 order by id', [id])).rows.map((r) => r.payload as ScenarioChange);
      return { id: s.id, name: s.name, author: s.author, createdAt: new Date(s.created_at).toISOString(), changes };
    });
  }

  /** Calcule les effets des changements sur le plan officiel, sans rien écrire. */
  async evaluate(organizationId: string, portfolioKey: string, id: string, actor: Actor): Promise<{ scenario: ScenarioView; result: ScenarioResult }> {
    const scenario = await this.get(organizationId, portfolioKey, id);
    if (!scenario) throw notFound('Scénario');
    const [cal, cfg] = [await this.calendar.load(organizationId), await this.settings.get(organizationId)];
    const result: ScenarioResult = { shifts: [], capacity: [], budget: [] };
    for (const ch of scenario.changes) {
      if (ch.kind === 'shift_ticket') {
        result.shifts.push({ ticket: ch.ticket, shiftDays: ch.shiftDays, impacts: (await this.plan.propagate(organizationId, { ticket: ch.ticket, shiftDays: ch.shiftDays }, actor)).impacts });
      } else if (ch.kind === 'allocate') {
        if (ch.to < ch.from) throw validation(['allocate : la fin précède le début']);
        const view = await this.plan.capacity(organizationId, actor, { from: ch.from, to: ch.to, granularity: 'month', team: ch.team });
        const team = view.teams[0];
        const periods = periodsBetween(ch.from, ch.to, 'month');
        result.capacity.push({
          team: ch.team, project: ch.project,
          periods: periods.map((p, i) => {
            const cell = team?.cells[i];
            const capacity = cell?.capacityMinutes ?? 0;
            const before = (cell?.nominativeMinutes ?? 0) + (cell?.genericMinutes ?? 0);
            const extra = allocationMinutes(cal, p, cfg.workdayMinutes, { from: ch.from, to: ch.to, fte: ch.fte });
            const rate = (n: number) => (capacity > 0 ? Math.round((n / capacity) * 100) : n > 0 ? 999 : 0);
            return { period: p.key, capacityMinutes: capacity, before, after: before + extra, beforeLevel: rate(before), afterLevel: rate(before + extra) };
          }),
        });
      } else {
        const f = await this.plan.finance(organizationId, ch.project, actor);
        result.budget.push({ project: ch.project, budget: f.totals.budget, eacBefore: f.totals.eac, varianceBefore: f.totals.variance, varianceAfter: Math.round((f.totals.variance + ch.amount) * 100) / 100, amount: ch.amount });
      }
    }
    return { scenario, result };
  }
}
