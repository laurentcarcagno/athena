import type { Health } from '../agile/kpi.service';
import { Db, type Actor } from '../core/db';
import { LifecycleService } from './lifecycle.service';
import type { LifecycleCategory } from './lifecycle';
import type { PortfolioProject, PortfolioService, PortfolioView } from './portfolio.service';

export interface HealthRow {
  key: string; name: string;
  lifecycle: { key: string; name: string; category: LifecycleCategory };
  /** Santé affichée : la santé forcée par le PMO si elle existe, sinon la santé calculée. */
  health: Health; computedHealth: Health; overridden: boolean;
  /** Pire niveau de la dernière météo du chef de projet, nul sans météo. */
  declaredHealth: Health | null; declaredAt: string | null;
  /** Vrai si la santé déclarée diffère de la santé calculée. */
  gap: boolean;
  reasons: string[]; note: string;
  plannedStart: string | null; plannedEnd: string | null; sponsor: string | null;
  phase: string | null; nextReview: string | null;
  progress: number; open: number; late: number; blocked: number; dueSoon: number;
  /** Criticité (probabilité × impact) du risque ouvert le plus grave, nulle sans risque noté. */
  maxRisk: number | null;
}
export interface HealthFilter { categories?: LifecycleCategory[]; phase?: string; health?: Health; sponsor?: string; includeClosed?: boolean }
export interface PortfolioHealth {
  portfolio: PortfolioView;
  rows: HealthRow[];
  totals: { projects: number; byHealth: Record<Health, number>; gaps: number; late: number; blocked: number; open: number; progress: number };
  /** Projets exclus par le filtre d'état (clos, annulés, archivés) quand `includeClosed` est faux. */
  hiddenByState: number;
}

const ORDER: Record<Health, number> = { critical: 0, attention: 1, ok: 2 };
const LEVEL_HEALTH: Record<string, Health> = { ok: 'ok', attention: 'attention', critical: 'critical' };
const CLOSED: LifecycleCategory[] = ['closed', 'cancelled', 'archived'];

/**
 * Tableau de santé d'un portefeuille (lot 18, B18) : pour chaque projet visible du lecteur, la santé calculée, la santé déclarée par le chef
 * de projet, la santé forcée par le PMO et l'écart entre elles, avec dates, phase, prochaine revue et risque maximal. Les projets que le
 * lecteur ne voit pas ne figurent nulle part : ni ligne, ni total, ni compteur.
 */
export class HealthService {
  constructor(private readonly db: Db, private readonly portfolios: Pick<PortfolioService, 'summary'>, private readonly lifecycle: Pick<LifecycleService, 'config'>) {}

  async health(organizationId: string, portfolioKey: string, actor: Actor, filter: HealthFilter = {}): Promise<PortfolioHealth> {
    const summary = await this.portfolios.summary(organizationId, portfolioKey, actor);
    const cfg = await this.lifecycle.config(organizationId);
    const keys = summary.projects.map((p) => p.key);
    const extra = await this.db.tx(organizationId, async (c) => {
      const rows = (await c.query(
        `select p.key, p.lifecycle_state, p.current_phase,
                to_char(m.planned_start, 'YYYY-MM-DD') planned_start, to_char(m.planned_end, 'YYYY-MM-DD') planned_end,
                coalesce(su.display_name, su.username, m.sponsor_subject) sponsor,
                to_char(ph.review_planned_on, 'YYYY-MM-DD') next_review,
                n.schedule, n.scope, n.risk, n.resources, n.cost, n.written_at
           from project p
           left join project_meta m on m.project_id = p.id
           left join user_account su on su.organization_id = m.organization_id and su.subject = m.sponsor_subject
           left join project_phase ph on ph.project_id = p.id and ph.phase = p.current_phase
           left join lateral (select * from project_status_note x where x.project_id = p.id order by x.written_at desc, x.id desc limit 1) n on true
          where p.key = any($1::text[])`, [keys])).rows;
      const risks = (await c.query(
        `select p.key, max(prob.v * imp.v) as m
           from artifact a join project p on p.id = a.project_id join status s on s.id = a.status_id
           join lateral (select (a."values" ->> f.key)::numeric v from field_definition f
                          where f.tracker_id = a.tracker_id and f.semantic_role = 'probability' and jsonb_typeof(a."values" -> f.key) = 'number'
                            and (f.read_roles is null or f.read_roles && $2::text[])) prob on true
           join lateral (select (a."values" ->> f.key)::numeric v from field_definition f
                          where f.tracker_id = a.tracker_id and f.semantic_role = 'impact' and jsonb_typeof(a."values" -> f.key) = 'number'
                            and (f.read_roles is null or f.read_roles && $2::text[])) imp on true
          where p.key = any($1::text[]) and s.category <> 'done' group by p.key`, [keys, actor.roles])).rows;
      return { byKey: new Map(rows.map((r) => [r.key as string, r])), risk: new Map(risks.map((r) => [r.key as string, Number(r.m)])) };
    });

    const states = new Map(cfg.states.map((s) => [s.key, s]));
    const all = summary.projects.map((p: PortfolioProject): HealthRow => {
      const e = extra.byKey.get(p.key);
      const st = states.get(e?.lifecycle_state ?? 'in_progress');
      const declared = e?.schedule ? LEVEL_HEALTH[[e.schedule, e.scope, e.risk, e.resources, e.cost].filter(Boolean).reduce((w: string, l: string) => (['ok', 'attention', 'critical'].indexOf(l) > ['ok', 'attention', 'critical'].indexOf(w) ? l : w), 'ok')]! : null;
      return {
        key: p.key, name: p.name,
        lifecycle: { key: st?.key ?? e?.lifecycle_state ?? 'in_progress', name: st?.name ?? e?.lifecycle_state ?? 'in_progress', category: st?.category ?? 'active' },
        health: p.health, computedHealth: p.computedHealth, overridden: p.overridden,
        declaredHealth: declared, declaredAt: e?.written_at ? new Date(e.written_at).toISOString() : null, gap: declared !== null && declared !== p.computedHealth,
        reasons: p.reasons, note: p.note,
        plannedStart: e?.planned_start ?? null, plannedEnd: e?.planned_end ?? null, sponsor: e?.sponsor ?? null,
        phase: e?.current_phase ?? null, nextReview: e?.next_review ?? null,
        progress: p.progress, open: p.open, late: p.late, blocked: p.blocked, dueSoon: p.dueSoon,
        maxRisk: extra.risk.get(p.key) ?? null,
      };
    });

    const visibleByState = filter.includeClosed ? all : all.filter((r) => !CLOSED.includes(r.lifecycle.category));
    const rows = visibleByState
      .filter((r) => !filter.categories?.length || filter.categories.includes(r.lifecycle.category))
      .filter((r) => !filter.phase || r.phase === filter.phase)
      .filter((r) => !filter.health || r.health === filter.health)
      .filter((r) => !filter.sponsor || r.sponsor === filter.sponsor)
      .sort((a, b) => ORDER[a.health] - ORDER[b.health] || (b.maxRisk ?? -1) - (a.maxRisk ?? -1) || b.late - a.late || a.key.localeCompare(b.key));

    const byHealth: Record<Health, number> = { ok: 0, attention: 0, critical: 0 };
    for (const r of rows) byHealth[r.health] += 1;
    const sum = (f: (r: HealthRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    return {
      portfolio: summary.portfolio, rows,
      totals: { projects: rows.length, byHealth, gaps: rows.filter((r) => r.gap).length, late: sum((r) => r.late), blocked: sum((r) => r.blocked), open: sum((r) => r.open), progress: rows.length ? Math.round(sum((r) => r.progress) / rows.length) : 0 },
      hiddenByState: all.length - visibleByState.length,
    };
  }
}
