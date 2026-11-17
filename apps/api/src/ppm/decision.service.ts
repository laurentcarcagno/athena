import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { conflict, forbidden, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import type { FinanceService } from './finance.service';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), 'date invalide');
export const DECISION_KINDS = ['continue', 'suspend', 'stop', 'close', 'change'] as const;
export const DecisionInput = z.object({
  project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), kind: z.enum(DECISION_KINDS), rationale: z.string().trim().min(1).max(2000), conditions: z.string().max(2000).default(''),
  owner: z.string().trim().min(1).max(200).optional(), dueOn: Day.optional(), reviewId: z.string().uuid().optional(),
  costDelta: z.number().finite().min(-1e9).max(1e9).optional(), scheduleDeltaDays: z.number().int().min(-3650).max(3650).optional(), budgetCategory: z.string().regex(/^[a-z][a-z0-9_-]{1,29}$/).optional(),
});
export type DecisionData = z.input<typeof DecisionInput>;

/** Transition du cycle de vie que la décision propose (jamais appliquée par la décision elle-même). */
const PROPOSED: Record<string, string | null> = { continue: null, suspend: 'on_hold', stop: 'cancelled', close: 'completed', change: null };

export interface DecisionView {
  id: string; project: string; kind: (typeof DECISION_KINDS)[number]; rationale: string; conditions: string; owner: string | null; dueOn: string | null; reviewId: string | null;
  costDelta: number | null; scheduleDeltaDays: number | null; budgetCategory: string | null; appliedAt: string | null; decidedBy: string; decidedAt: string;
  /** État du cycle de vie proposé au chef du projet ; la décision ne le change pas. */
  proposedState: string | null;
}

/**
 * Décisions de portefeuille (lot 24, B38) : poursuivre, suspendre, arrêter, clôturer, changement chiffré. Enregistrées par le PMO et l'administrateur, lues par la
 * direction. Suspendre, arrêter ou clôturer **propose** une transition du cycle de vie, sans l'appliquer. Un changement chiffré s'applique, par un acte explicite de la
 * finance ou de l'administrateur, en avenant de budget.
 */
export class DecisionService {
  constructor(private readonly db: Db, private readonly finance: Pick<FinanceService, 'addBudget'>) {}

  private view(r: any): DecisionView {
    return {
      id: r.id, project: r.project, kind: r.kind, rationale: r.rationale, conditions: r.conditions, owner: r.owner, dueOn: r.due, reviewId: r.review_id,
      costDelta: r.cost_delta === null ? null : Number(r.cost_delta), scheduleDeltaDays: r.schedule_delta_days, budgetCategory: r.budget_category,
      appliedAt: r.applied_at ? new Date(r.applied_at).toISOString() : null, decidedBy: r.decided_by, decidedAt: new Date(r.decided_at).toISOString(), proposedState: PROPOSED[r.kind] ?? null,
    };
  }
  private static readonly SELECT = `select d.id, p.key project, d.kind, d.rationale, d.conditions, d.owner, to_char(d.due_on, 'YYYY-MM-DD') due, d.review_id, d.cost_delta, d.schedule_delta_days, d.budget_category,
      d.applied_at, coalesce(u.display_name, d.decided_by) decided_by, d.decided_at
    from portfolio_decision d join project p on p.id = d.project_id left join user_account u on u.organization_id = d.organization_id and u.subject = d.decided_by`;

  async create(organizationId: string, portfolioKey: string, input: DecisionData, actor: Actor): Promise<DecisionView> {
    const i = DecisionInput.parse(input);
    if (i.kind === 'change' && i.costDelta !== undefined && !i.budgetCategory) throw validation(['budgetCategory : obligatoire pour un changement chiffré en coût']);
    const id = await this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      const p = (await c.query('select p.id from portfolio_project x join project p on p.id = x.project_id where x.portfolio_id = $1 and p.key = $2', [f.id, i.project])).rows[0];
      if (!p) throw notFound(`Projet ${i.project} dans le portefeuille`);
      const row = (await c.query(
        `insert into portfolio_decision (organization_id, portfolio_id, review_id, project_id, kind, rationale, conditions, owner, due_on, cost_delta, schedule_delta_days, budget_category, decided_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [organizationId, f.id, i.reviewId ?? null, p.id, i.kind, i.rationale, i.conditions, i.owner ?? null, i.dueOn ?? null, i.costDelta ?? null, i.scheduleDeltaDays ?? null, i.budgetCategory ?? null, actor.id])).rows[0];
      await audit(c, organizationId, actor, 'portfolio.decision', `portfolio:${portfolioKey}`, { project: i.project, kind: i.kind, proposed: PROPOSED[i.kind] ?? null });
      return row.id as string;
    });
    return (await this.get(organizationId, id))!;
  }

  private async get(organizationId: string, id: string): Promise<DecisionView | null> {
    return this.db.tx(organizationId, async (c) => { const r = (await c.query(`${DecisionService.SELECT} where d.id = $1`, [id])).rows[0]; return r ? this.view(r) : null; });
  }

  /** Journal des décisions du portefeuille (projets visibles du lecteur), du plus récent au plus ancien. */
  async list(organizationId: string, portfolioKey: string, filter: { project?: string; kind?: string } = {}): Promise<DecisionView[]> {
    return this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      return (await c.query(`${DecisionService.SELECT} where d.portfolio_id = $1 and ($2::text is null or p.key = $2) and ($3::text is null or d.kind = $3) order by d.decided_at desc, d.id`, [f.id, filter.project ?? null, filter.kind ?? null])).rows.map((r) => this.view(r));
    });
  }

  /** Applique un changement chiffré : avenant de budget dans la catégorie indiquée (droits de la finance). Une seule fois. */
  async apply(organizationId: string, portfolioKey: string, id: string, actor: Actor): Promise<DecisionView> {
    const d = (await this.list(organizationId, portfolioKey)).find((x) => x.id === id);
    if (!d) throw notFound('Décision');
    if (d.kind !== 'change' || d.costDelta === null || !d.budgetCategory) throw validation(['seul un changement chiffré en coût s’applique']);
    if (d.appliedAt) throw conflict('Cette décision est déjà appliquée.');
    if (!actor.roles.includes('athena-admin') && !actor.roles.includes('athena-finance')) throw forbidden('L’application d’un avenant est réservée à la finance et à l’administrateur.');
    await this.finance.addBudget(organizationId, { project: d.project, category: d.budgetCategory, kind: 'amendment', amount: d.costDelta, reason: `Décision de portefeuille : ${d.rationale}`.slice(0, 500) }, actor);
    await this.db.tx(organizationId, async (c) => {
      await c.query('update portfolio_decision set applied_at = now() where id = $1', [id]);
      await audit(c, organizationId, actor, 'portfolio.decision.apply', `portfolio:${portfolioKey}`, { id, amount: d.costDelta });
    });
    return (await this.get(organizationId, id))!;
  }
}
