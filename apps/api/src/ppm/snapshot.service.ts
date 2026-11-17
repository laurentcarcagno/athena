import type { Health } from '../agile/kpi.service';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import type { HealthRow, HealthService } from './health.service';

export type SnapshotKind = 'weekly' | 'monthly' | 'review' | 'manual';
export interface SnapshotView { id: string; kind: SnapshotKind; period: string | null; label: string; takenAt: string; takenBy: string; projects: number }
/** Valeurs figées pour un projet (sous-ensemble de la ligne de santé : aucun nom de personne, aucune note). */
export interface SnapshotMetrics {
  key: string; name: string; lifecycle: string; health: Health; computedHealth: Health; overridden: boolean; declaredHealth: Health | null; gap: boolean;
  phase: string | null; plannedEnd: string | null; nextReview: string | null; progress: number; open: number; late: number; blocked: number; maxRisk: number | null;
}
export interface SnapshotDetail extends SnapshotView {
  lines: SnapshotMetrics[];
  /** Totaux recalculés à la lecture sur les lignes que le lecteur voit : jamais stockés. */
  totals: { projects: number; byHealth: Record<Health, number>; late: number; blocked: number; open: number; progress: number };
}
export interface SnapshotChange {
  key: string; name: string; change: 'added' | 'removed' | 'changed' | 'same';
  health: { from: Health | null; to: Health | null }; phase: { from: string | null; to: string | null }; plannedEnd: { from: string | null; to: string | null };
  late: { from: number | null; to: number | null }; progress: { from: number | null; to: number | null };
}

const pick = (r: HealthRow): SnapshotMetrics => ({
  key: r.key, name: r.name, lifecycle: r.lifecycle.key, health: r.health, computedHealth: r.computedHealth, overridden: r.overridden, declaredHealth: r.declaredHealth, gap: r.gap,
  phase: r.phase, plannedEnd: r.plannedEnd, nextReview: r.nextReview, progress: r.progress, open: r.open, late: r.late, blocked: r.blocked, maxRisk: r.maxRisk,
});

export const totalsOf = (lines: readonly SnapshotMetrics[]): SnapshotDetail['totals'] => {
  const byHealth: Record<Health, number> = { ok: 0, attention: 0, critical: 0 };
  for (const l of lines) byHealth[l.health] += 1;
  const sum = (f: (l: SnapshotMetrics) => number) => lines.reduce((s, l) => s + f(l), 0);
  return { projects: lines.length, byHealth, late: sum((l) => l.late), blocked: sum((l) => l.blocked), open: sum((l) => l.open), progress: lines.length ? Math.round(sum((l) => l.progress) / lines.length) : 0 };
};

/** Comparaison de deux jeux de lignes, par projet. */
export function compareLines(a: readonly SnapshotMetrics[], b: readonly SnapshotMetrics[]): SnapshotChange[] {
  const from = new Map(a.map((l) => [l.key, l]));
  const to = new Map(b.map((l) => [l.key, l]));
  return [...new Set([...from.keys(), ...to.keys()])].sort().map((key) => {
    const x = from.get(key); const y = to.get(key);
    const change: SnapshotChange['change'] = !x ? 'added' : !y ? 'removed' : (x.health !== y.health || x.phase !== y.phase || x.plannedEnd !== y.plannedEnd || x.late !== y.late || x.progress !== y.progress) ? 'changed' : 'same';
    return {
      key, name: (y ?? x)!.name, change,
      health: { from: x?.health ?? null, to: y?.health ?? null }, phase: { from: x?.phase ?? null, to: y?.phase ?? null }, plannedEnd: { from: x?.plannedEnd ?? null, to: y?.plannedEnd ?? null },
      late: { from: x?.late ?? null, to: y?.late ?? null }, progress: { from: x?.progress ?? null, to: y?.progress ?? null },
    };
  });
}

/** Période d'un instantané périodique : « 2026-W47 » (semaine ISO) ou « 2026-11 ». */
export function periodOf(kind: 'weekly' | 'monthly', at: Date): string {
  if (kind === 'monthly') return at.toISOString().slice(0, 7);
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}

/**
 * Instantanés de portefeuille (lot 20, B32) : figent la santé de chaque projet visible de la personne qui les prend ; la lecture ne rend que les
 * lignes que le lecteur voit (politique restrictive sur la ligne), et recalcule les totaux sur elles.
 */
export class SnapshotService {
  constructor(private readonly db: Db, private readonly health: Pick<HealthService, 'health'>) {}

  private async portfolio(c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, key: string) {
    const p = (await c.query('select id, key from portfolio where key = $1', [key])).rows[0];
    if (!p) throw notFound(`Portefeuille ${key}`);
    return p as { id: string; key: string };
  }

  /** Prend un instantané. Un instantané périodique est unique par portefeuille et période : le rejouer renvoie l'existant (`created: false`). */
  async take(organizationId: string, portfolioKey: string, input: { kind: SnapshotKind; label?: string; at?: Date }, actor: Actor): Promise<SnapshotView & { created: boolean }> {
    const at = input.at ?? new Date();
    const period = input.kind === 'weekly' || input.kind === 'monthly' ? periodOf(input.kind, at) : null;
    const rows = (await this.health.health(organizationId, portfolioKey, actor, { includeClosed: true })).rows;
    const out = await this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      if (period) {
        const existing = (await c.query('select id from portfolio_snapshot where portfolio_id = $1 and kind = $2 and period = $3', [p.id, input.kind, period])).rows[0];
        if (existing) return { id: existing.id as string, created: false };
      }
      const s = (await c.query(
        `insert into portfolio_snapshot (organization_id, portfolio_id, taken_at, kind, period, label, taken_by) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [organizationId, p.id, at.toISOString(), input.kind, period, (input.label ?? '').trim(), actor.id])).rows[0];
      for (const r of rows) {
        await c.query(
          'insert into portfolio_snapshot_line (snapshot_id, organization_id, project_id, metrics) select $1, $2, id, $4::jsonb from project where key = $3',
          [s.id, organizationId, r.key, JSON.stringify(pick(r))]);
      }
      await audit(c, organizationId, actor, 'portfolio.snapshot', `portfolio:${portfolioKey}`, { kind: input.kind, period, projects: rows.length });
      return { id: s.id as string, created: true };
    }, { system: true });
    return { ...(await this.view(organizationId, out.id)), created: out.created };
  }

  private async view(organizationId: string, id: string): Promise<SnapshotView> {
    return this.db.tx(organizationId, async (c) => {
      const r = (await c.query(
        `select s.id, s.kind, s.period, s.label, s.taken_at, coalesce(u.display_name, s.taken_by) taken_by,
                (select count(*)::int from portfolio_snapshot_line l where l.snapshot_id = s.id) projects
           from portfolio_snapshot s left join user_account u on u.organization_id = s.organization_id and u.subject = s.taken_by where s.id = $1`, [id])).rows[0];
      if (!r) throw notFound('Instantané');
      return { id: r.id, kind: r.kind, period: r.period, label: r.label, takenAt: new Date(r.taken_at).toISOString(), takenBy: r.taken_by, projects: r.projects };
    });
  }

  /** Instantanés du portefeuille, du plus récent au plus ancien ; le nombre de projets est celui des lignes visibles du lecteur. */
  async list(organizationId: string, portfolioKey: string, limit = 50): Promise<SnapshotView[]> {
    const ids = await this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      return (await c.query('select id from portfolio_snapshot where portfolio_id = $1 order by taken_at desc, id desc limit $2', [p.id, Math.min(Math.max(limit, 1), 200)])).rows.map((r) => r.id as string);
    });
    return Promise.all(ids.map((id) => this.view(organizationId, id)));
  }

  async get(organizationId: string, portfolioKey: string, id: string): Promise<SnapshotDetail> {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Instantané');
    const lines = await this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      const own = (await c.query('select 1 from portfolio_snapshot where id = $1 and portfolio_id = $2', [id, p.id])).rows[0];
      if (!own) throw notFound('Instantané');
      return (await c.query('select metrics from portfolio_snapshot_line where snapshot_id = $1', [id])).rows.map((r) => r.metrics as SnapshotMetrics);
    });
    const sorted = lines.sort((a, b) => a.key.localeCompare(b.key));
    return { ...(await this.view(organizationId, id)), projects: sorted.length, lines: sorted, totals: totalsOf(sorted) };
  }

  async compare(organizationId: string, portfolioKey: string, a: string, b: string): Promise<{ from: SnapshotView; to: SnapshotView; changes: SnapshotChange[] }> {
    if (a === b) throw validation(['choisissez deux instantanés différents']);
    const [x, y] = await Promise.all([this.get(organizationId, portfolioKey, a), this.get(organizationId, portfolioKey, b)]);
    const [from, to] = x.takenAt <= y.takenAt ? [x, y] : [y, x];
    return { from: { ...from, projects: from.lines.length }, to: { ...to, projects: to.lines.length }, changes: compareLines(from.lines, to.lines) };
  }

  /** Dernier instantané avant `before` (défaut : maintenant), pour la flèche de tendance et les mini-courbes. */
  async previous(organizationId: string, portfolioKey: string, before = new Date()): Promise<SnapshotDetail | null> {
    const id = await this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      return (await c.query('select id from portfolio_snapshot where portfolio_id = $1 and taken_at < $2 order by taken_at desc limit 1', [p.id, before.toISOString()])).rows[0]?.id as string | undefined;
    });
    return id ? this.get(organizationId, portfolioKey, id) : null;
  }

  /** Série des `n` derniers instantanés par projet (retards, avancement), du plus ancien au plus récent : mini-courbes. */
  async series(organizationId: string, portfolioKey: string, n = 6): Promise<Record<string, Array<{ at: string; late: number; progress: number; health: Health }>>> {
    const out: Record<string, Array<{ at: string; late: number; progress: number; health: Health }>> = {};
    const list = (await this.list(organizationId, portfolioKey, n)).reverse();
    for (const s of list) for (const l of (await this.get(organizationId, portfolioKey, s.id)).lines) (out[l.key] ??= []).push({ at: s.takenAt, late: l.late, progress: l.progress, health: l.health });
    return out;
  }

  /**
   * Purge : supprime les instantanés périodiques et manuels plus vieux que `snapshotWeeklyRetentionWeeks`, et les instantanés de revue plus vieux que
   * `snapshotReviewRetentionMonths` (nul : jamais). Un instantané qui porte une revue de portefeuille est conservé. Retourne le nombre supprimé.
   */
  async purge(organizationId: string, retention: { weeks: number; reviewMonths: number | null }, actor: Actor, now = new Date()): Promise<number> {
    return this.db.tx(organizationId, async (c) => {
      const weekly = new Date(now.getTime() - retention.weeks * 7 * 86_400_000).toISOString();
      const review = retention.reviewMonths === null ? null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - retention.reviewMonths, now.getUTCDate())).toISOString();
      const r = await c.query(
        `delete from portfolio_snapshot s where not exists (select 1 from portfolio_review v where v.snapshot_id = s.id)
           and ((s.kind <> 'review' and s.taken_at < $1) or (s.kind = 'review' and $2::timestamptz is not null and s.taken_at < $2))`, [weekly, review]);
      const n = r.rowCount ?? 0;
      if (n > 0) await audit(c, organizationId, actor, 'portfolio.snapshot.purge', 'portfolio:*', { deleted: n });
      return n;
    }, { system: true });
  }
}

