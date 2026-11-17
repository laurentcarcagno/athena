import type { KpiService } from '../agile/kpi.service';
import { Db, type Actor } from '../core/db';
import { notFound } from '../core/errors';
import type { FinanceService } from './finance.service';

export type EvQuadrant = 'on_track' | 'late_under_budget' | 'early_over_budget' | 'late_over_budget' | 'unknown';
export interface EarnedValueRow {
  project: string; name: string;
  /** BAC (budget à terminaison), PV (valeur planifiée), EV (valeur acquise), AC (coût réel). */
  bac: number; pv: number; ev: number; ac: number;
  /** Indice de performance des coûts (EV ÷ AC) et des délais (EV ÷ PV) ; nuls quand le dénominateur est nul. */
  cpi: number | null; spi: number | null; quadrant: EvQuadrant;
}

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Quadrant de lecture : CPI ≥ 1 sous le budget, SPI ≥ 1 dans les temps. */
export function quadrantOf(cpi: number | null, spi: number | null): EvQuadrant {
  if (cpi === null || spi === null) return 'unknown';
  if (cpi >= 1 && spi >= 1) return 'on_track';
  if (cpi >= 1) return 'late_under_budget';
  if (spi >= 1) return 'early_over_budget';
  return 'late_over_budget';
}

/**
 * Valeur acquise (lot 25, B41) : pour chaque projet d'exécution du portefeuille, BAC = budget, PV = BAC × part du temps écoulé entre les dates de référence du projet,
 * EV = BAC × avancement, AC = réel. Lecture réservée à ceux qui lisent les finances ; un projet masqué n'a pas de ligne.
 */
export class EarnedValueService {
  constructor(private readonly db: Db, private readonly finance: Pick<FinanceService, 'project'>, private readonly kpis: Pick<KpiService, 'kpis'>) {}

  async portfolio(organizationId: string, portfolioKey: string, actor: Actor, now: Date = new Date()): Promise<EarnedValueRow[]> {
    const rows = await this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      return (await c.query(
        `select p.key, p.name, to_char(m.planned_start, 'YYYY-MM-DD') ps, to_char(m.planned_end, 'YYYY-MM-DD') pe from portfolio_project x join project p on p.id = x.project_id left join project_meta m on m.project_id = p.id
          where x.portfolio_id = $1 and x.kind = 'delivery' order by p.key`, [f.id])).rows as Array<{ key: string; name: string; ps: string | null; pe: string | null }>;
    });
    const out: EarnedValueRow[] = [];
    for (const p of rows) {
      const fin = await this.finance.project(organizationId, p.key, actor, now);
      const progress = (await this.kpis.kpis(organizationId, p.key, actor)).progress.percent / 100;
      const bac = fin.totals.budget;
      let planned = 0;
      if (p.ps && p.pe && p.pe > p.ps) planned = Math.min(1, Math.max(0, (now.getTime() - Date.parse(`${p.ps}T00:00:00Z`)) / (Date.parse(`${p.pe}T00:00:00Z`) - Date.parse(`${p.ps}T00:00:00Z`))));
      else if (p.pe && now.getTime() >= Date.parse(`${p.pe}T00:00:00Z`) + DAY) planned = 1;
      const [pv, ev, ac] = [bac * planned, bac * progress, fin.totals.actual];
      const cpi = ac > 0 ? r2(ev / ac) : null;
      const spi = pv > 0 ? r2(ev / pv) : null;
      out.push({ project: p.key, name: p.name, bac: r2(bac), pv: r2(pv), ev: r2(ev), ac: r2(ac), cpi, spi, quadrant: quadrantOf(cpi, spi) });
    }
    return out;
  }
}
