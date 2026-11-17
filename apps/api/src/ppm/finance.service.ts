import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { forbidden, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

export const FINANCE_WRITERS = ['athena-admin', 'athena-finance'];
export const FINANCE_READERS = ['athena-admin', 'athena-finance', 'athena-pmo', 'athena-director'];
const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const Money = z.number().finite().min(-1e11).max(1e11);
const Key = z.string().regex(/^[a-z][a-z0-9_-]{1,29}$/);
const Project = z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/);

export const CategoryInput = z.object({ key: Key, name: z.string().trim().min(1).max(100), kind: z.enum(['internal', 'external', 'license', 'hardware', 'service']) });
export const BudgetInput = z.object({ project: Project, category: Key, phase: z.string().max(80).optional(), kind: z.enum(['initial', 'amendment', 'arbitration']), amount: Money, reason: z.string().max(500).default('') });
export const CommitmentInput = z.object({ project: Project, category: Key, amount: Money.refine((n) => n >= 0, 'montant positif'), reference: z.string().max(100).default(''), committedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const ActualInput = z.object({ project: Project, category: Key, period: Period, amount: Money });
export const ForecastInput = z.object({ project: Project, category: Key, period: Period, amount: Money.refine((n) => n >= 0, 'montant positif') });
export const RateInput = z.object({ subject: z.string().trim().min(1).max(200).optional(), roleLabel: z.string().trim().min(1).max(100).optional(), hourlyRate: z.number().min(0).max(100000), validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export interface FinanceLine { category: string; budget: number; committed: number; actual: number; forecast: number; eac: number; variance: number }
export interface ProjectFinance {
  project: string; lines: FinanceLine[]; totals: Omit<FinanceLine, 'category'>;
  /** Alertes de dépassement : `exceeded` (réel au-delà du budget), `overrun` (estimation à terminaison au-delà du budget). */
  alerts: Array<{ kind: 'exceeded' | 'overrun'; category: string | null; excess: number }>;
  /** Courbe en S : cumul par mois du budget (lissé sur les mois), du réel et de l'estimation à terminaison. */
  curve: Array<{ period: string; actualCumulative: number; forecastCumulative: number }>;
}
export interface ImportReport { batchId: string; fileName: string; rows: number; imported: number; rejected: Array<{ line: number; reason: string }>; alreadyImported: boolean }

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Finances d'un projet (lot 23, B37) : budget en ajout seul (initial, avenants, arbitrages), engagements, réels, prévisions, estimation à terminaison (EAC = réel +
 * prévisions des mois à venir) et alertes de dépassement. Lecture : finance, administrateur, PMO, direction ; écriture : finance et administrateur. Les taux des
 * ressources et le coût du temps passé ne sont lisibles que de la finance et de l'administrateur.
 */
export class FinanceService {
  constructor(private readonly db: Db) {}

  private requireWriter(actor: Actor): void { if (!FINANCE_WRITERS.some((r) => actor.roles.includes(r))) throw forbidden('Réservé à la finance et à l’administrateur.'); }
  private requireReader(actor: Actor): void { if (!FINANCE_READERS.some((r) => actor.roles.includes(r))) throw forbidden('Les données financières sont réservées à la finance, à l’administrateur, au PMO et à la direction.'); }

  async categories(organizationId: string, actor: Actor): Promise<Array<z.infer<typeof CategoryInput>>> {
    this.requireReader(actor);
    return this.db.tx(organizationId, async (c) => (await c.query('select key, name, kind from expense_category order by name')).rows);
  }

  async upsertCategory(organizationId: string, input: z.infer<typeof CategoryInput>, actor: Actor): Promise<void> {
    this.requireWriter(actor);
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into expense_category (organization_id, key, name, kind) values ($1,$2,$3,$4) on conflict (organization_id, key) do update set name = excluded.name, kind = excluded.kind', [organizationId, input.key, input.name, input.kind]);
      await audit(c, organizationId, actor, 'finance.category', `category:${input.key}`, { name: input.name, kind: input.kind });
    });
  }

  private async projectId(c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, key: string): Promise<string> {
    const p = (await c.query('select id from project where key = $1', [key])).rows[0];
    if (!p) throw notFound(`Projet ${key}`);
    return p.id as string;
  }

  async addBudget(organizationId: string, input: z.input<typeof BudgetInput>, actor: Actor): Promise<void> {
    this.requireWriter(actor);
    if (input.kind === 'initial' && input.amount < 0) throw validation(['amount : le budget initial est positif']);
    await this.db.tx(organizationId, async (c) => {
      const id = await this.projectId(c, input.project);
      await c.query('insert into budget_line (organization_id, project_id, category, phase, kind, amount, reason, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)', [organizationId, id, input.category, input.phase ?? null, input.kind, input.amount, input.reason ?? '', actor.id]);
      await audit(c, organizationId, actor, 'finance.budget', `project:${input.project}`, { category: input.category, kind: input.kind, amount: input.amount });
    });
  }

  async addCommitment(organizationId: string, input: z.input<typeof CommitmentInput>, actor: Actor): Promise<void> {
    this.requireWriter(actor);
    await this.db.tx(organizationId, async (c) => {
      const id = await this.projectId(c, input.project);
      await c.query('insert into commitment (organization_id, project_id, category, amount, reference, committed_on, created_by) values ($1,$2,$3,$4,$5,$6,$7)', [organizationId, id, input.category, input.amount, input.reference ?? '', input.committedOn, actor.id]);
      await audit(c, organizationId, actor, 'finance.commitment', `project:${input.project}`, { category: input.category, amount: input.amount });
    });
  }

  async addActual(organizationId: string, input: z.infer<typeof ActualInput>, actor: Actor): Promise<void> {
    this.requireWriter(actor);
    await this.db.tx(organizationId, async (c) => {
      const id = await this.projectId(c, input.project);
      await c.query("insert into actual_cost (organization_id, project_id, category, period, amount, source, created_by) values ($1,$2,$3,$4,$5,'manual',$6)", [organizationId, id, input.category, input.period, input.amount, actor.id]);
      await audit(c, organizationId, actor, 'finance.actual', `project:${input.project}`, { category: input.category, period: input.period, amount: input.amount });
    });
  }

  async setForecast(organizationId: string, input: z.infer<typeof ForecastInput>, actor: Actor): Promise<void> {
    this.requireWriter(actor);
    await this.db.tx(organizationId, async (c) => {
      const id = await this.projectId(c, input.project);
      await c.query('insert into forecast (organization_id, project_id, category, period, amount, updated_by) values ($1,$2,$3,$4,$5,$6) on conflict (project_id, category, period) do update set amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now()', [organizationId, id, input.category, input.period, input.amount, actor.id]);
      await audit(c, organizationId, actor, 'finance.forecast', `project:${input.project}`, { category: input.category, period: input.period, amount: input.amount });
    });
  }

  /** Budget, engagé, réel, prévisions et estimation à terminaison d'un projet, par catégorie ; `now` (mois courant) sépare le réel du reste à dépenser. */
  async project(organizationId: string, projectKey: string, actor: Actor, now: Date = new Date()): Promise<ProjectFinance> {
    this.requireReader(actor);
    const month = now.toISOString().slice(0, 7);
    return this.db.tx(organizationId, async (c) => {
      const id = await this.projectId(c, projectKey);
      const sum = async (sql: string) => new Map((await c.query(sql, [id])).rows.map((r) => [r.category as string, num(r.s)]));
      const [budget, committed, actual, forecast] = [
        await sum('select category, sum(amount) s from budget_line where project_id = $1 group by category'), await sum('select category, sum(amount) s from commitment where project_id = $1 group by category'),
        await sum('select category, sum(amount) s from actual_cost where project_id = $1 group by category'), await sum(`select category, sum(amount) s from forecast where project_id = $1 and period >= '${month}' group by category`),
      ];
      const cats = [...new Set([...budget.keys(), ...committed.keys(), ...actual.keys(), ...forecast.keys()])].sort();
      const lines: FinanceLine[] = cats.map((category) => {
        const [b, a, f] = [budget.get(category) ?? 0, actual.get(category) ?? 0, forecast.get(category) ?? 0];
        return { category, budget: round(b), committed: round(committed.get(category) ?? 0), actual: round(a), forecast: round(f), eac: round(a + f), variance: round(b - (a + f)) };
      });
      const total = (f: (l: FinanceLine) => number) => round(lines.reduce((n, l) => n + f(l), 0));
      const totals = { budget: total((l) => l.budget), committed: total((l) => l.committed), actual: total((l) => l.actual), forecast: total((l) => l.forecast), eac: total((l) => l.eac), variance: total((l) => l.variance) };
      const alerts: ProjectFinance['alerts'] = [];
      for (const l of lines) {
        if (l.budget > 0 && l.actual > l.budget) alerts.push({ kind: 'exceeded', category: l.category, excess: round(l.actual - l.budget) });
        else if (l.budget > 0 && l.eac > l.budget) alerts.push({ kind: 'overrun', category: l.category, excess: round(l.eac - l.budget) });
      }
      const acts = (await c.query('select period, sum(amount) s from actual_cost where project_id = $1 group by period', [id])).rows;
      const fcs = (await c.query('select period, sum(amount) s from forecast where project_id = $1 and period >= $2 group by period', [id, month])).rows;
      const periods = [...new Set([...acts.map((r) => r.period as string), ...fcs.map((r) => r.period as string)])].sort();
      let [a, f] = [0, 0];
      const curve = periods.map((period) => {
        a += num(acts.find((r) => r.period === period)?.s);
        f = a + fcs.filter((r) => r.period <= period).reduce((n, r) => n + num(r.s), 0);
        return { period, actualCumulative: round(a), forecastCumulative: round(f) };
      });
      return { project: projectKey, lines, totals, alerts, curve };
    });
  }

  /**
   * Import des réels (CSV `projet;catégorie;période;montant`, séparateur `;` ou `,`, en-tête facultatif). Idempotent : un fichier déjà importé (même empreinte) n'est
   * pas réimporté. Les lignes invalides sont rejetées une à une avec leur numéro et leur motif ; les autres sont enregistrées.
   */
  async importActuals(organizationId: string, fileName: string, content: string, actor: Actor): Promise<ImportReport> {
    this.requireWriter(actor);
    const sha = createHash('sha256').update(content).digest('hex');
    return this.db.tx(organizationId, async (c) => {
      const existing = (await c.query('select id, file_name, rows_total, rows_imported, rows_rejected from import_batch where sha256 = $1', [sha])).rows[0];
      if (existing) return { batchId: existing.id, fileName: existing.file_name, rows: existing.rows_total, imported: existing.rows_imported, rejected: [], alreadyImported: true };
      const cats = new Set((await c.query('select key from expense_category')).rows.map((r) => r.key as string));
      const projects = new Map((await c.query('select key, id from project')).rows.map((r) => [r.key as string, r.id as string]));
      const lines = content.replace(/^﻿/, '').split(/\r?\n/).map((l, i) => ({ l, n: i + 1 })).filter((x) => x.l.trim() !== '');
      const header = /^projet$/i.test((lines[0]?.l.split(/[;,]/)[0] ?? '').trim());
      const rejected: ImportReport['rejected'] = [];
      const ok: Array<{ project: string; category: string; period: string; amount: number }> = [];
      for (const { l, n } of lines) {
        // séparateur « ; » (virgule décimale permise) ou, à défaut, « , »
        const cells = l.split(l.includes(';') ? ';' : ',').map((s) => s.trim());
        if (header && n === lines[0]!.n) continue;
        if (cells.length !== 4) { rejected.push({ line: n, reason: 'quatre colonnes attendues : projet, catégorie, période, montant' }); continue; }
        const [project, category, period, amountText] = cells as [string, string, string, string];
        const amount = Number(amountText.replace(/\s/g, '').replace(',', '.'));
        if (!projects.has(project)) rejected.push({ line: n, reason: `projet inconnu ou invisible : ${project}` });
        else if (!cats.has(category)) rejected.push({ line: n, reason: `catégorie inconnue : ${category}` });
        else if (!Period.safeParse(period).success) rejected.push({ line: n, reason: `période invalide (AAAA-MM) : ${period}` });
        else if (!Number.isFinite(amount) || amountText === '') rejected.push({ line: n, reason: `montant invalide : ${amountText}` });
        else ok.push({ project, category, period, amount });
      }
      const batch = (await c.query('insert into import_batch (organization_id, file_name, sha256, rows_total, rows_imported, rows_rejected, imported_by) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [organizationId, fileName.slice(0, 200), sha, lines.length - (header ? 1 : 0), ok.length, rejected.length, actor.id])).rows[0];
      for (const r of ok) await c.query("insert into actual_cost (organization_id, project_id, category, period, amount, source, import_batch_id, created_by) values ($1,$2,$3,$4,$5,'import',$6,$7)", [organizationId, projects.get(r.project), r.category, r.period, r.amount, batch.id, actor.id]);
      await audit(c, organizationId, actor, 'finance.import', 'finance', { file: fileName, imported: ok.length, rejected: rejected.length });
      return { batchId: batch.id, fileName, rows: ok.length + rejected.length, imported: ok.length, rejected, alreadyImported: false };
    });
  }

  async addRate(organizationId: string, input: z.infer<typeof RateInput>, actor: Actor): Promise<void> {
    this.requireWriter(actor);
    if ((input.subject === undefined) === (input.roleLabel === undefined)) throw validation(['taux : une personne ou un profil, pas les deux']);
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into resource_rate (organization_id, subject, role_label, hourly_rate, valid_from, created_by) values ($1,$2,$3,$4,$5,$6)', [organizationId, input.subject ?? null, input.roleLabel ?? null, input.hourlyRate, input.validFrom, actor.id]);
      await audit(c, organizationId, actor, 'finance.rate', 'finance', { subject: input.subject ?? null, role: input.roleLabel ?? null });
    });
  }

  /** Taux en vigueur (finance et administrateur seulement). */
  async rates(organizationId: string, actor: Actor): Promise<Array<{ subject: string | null; roleLabel: string | null; hourlyRate: number; validFrom: string }>> {
    this.requireWriter(actor);
    return this.db.tx(organizationId, async (c) => (await c.query("select subject, role_label, hourly_rate::float r, to_char(valid_from, 'YYYY-MM-DD') f from resource_rate order by valid_from desc")).rows.map((r) => ({ subject: r.subject, roleLabel: r.role_label, hourlyRate: r.r, validFrom: r.f })));
  }

  /** Coût du temps passé d'un projet : minutes du worklog × taux personnel en vigueur le jour saisi (sans taux : non valorisé, compté à part). Finance et administrateur seulement. */
  async timeCost(organizationId: string, projectKey: string, actor: Actor): Promise<{ cost: number; minutes: number; unpricedMinutes: number }> {
    this.requireWriter(actor);
    return this.db.tx(organizationId, async (c) => {
      const id = await this.projectId(c, projectKey);
      const r = (await c.query(
        `select coalesce(sum(w.minutes * coalesce((select hourly_rate from resource_rate x where x.subject = w.subject and x.valid_from <= w.work_day order by x.valid_from desc limit 1), 0)) / 60.0, 0)::float cost,
                coalesce(sum(w.minutes), 0)::int minutes,
                coalesce(sum(w.minutes) filter (where not exists (select 1 from resource_rate x where x.subject = w.subject and x.valid_from <= w.work_day)), 0)::int unpriced
           from worklog w where w.project_id = $1`, [id])).rows[0];
      return { cost: round(r.cost), minutes: r.minutes, unpricedMinutes: r.unpriced };
    });
  }
}
