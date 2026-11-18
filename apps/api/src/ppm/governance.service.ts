import { Db, type Actor } from '../core/db';
import { notFound } from '../core/errors';
import type { TemplateUpgradeService } from '../core/template-upgrade.service';

export interface GateRow {
  project: string; name: string; phase: string; phaseName: string; review: string; reviewPlannedOn: string | null; reviewHeldOn: string | null;
  decision: string | null; canAdvance: boolean; criteria: { total: number; met: number; manualPending: number; automaticRemaining: number };
}
export interface RiskCell { probability: number; impact: number; count: number }
export interface RiskEntry { key: string; project: string; probability: number; impact: number; criticality: number }
export interface RiskMatrix { cells: RiskCell[]; top: RiskEntry[]; total: number }
export interface ActionSummary { project: string; open: number; late: number; closed: number }
export interface ActionEntry { key: string; project: string; due: string; assignee: string | null }
export interface ActionTracking { projects: ActionSummary[]; overdue: ActionEntry[] }
export interface MilestonePoint { at: string; planned: string }
export interface MilestoneSeries { phase: string; field: 'planned_end' | 'review_planned_on'; points: MilestonePoint[] }

/**
 * Gouvernance d'un portefeuille (lot 20, B34) : passage des gates, matrice des risques, suivi des actions et tendance des jalons. Tout est lu sous
 * l'identité du lecteur : un projet ou un tracker masqué n'ajoute ni ligne, ni case, ni compteur.
 */
export class GovernanceService {
  constructor(private readonly db: Db, private readonly templates: Pick<TemplateUpgradeService, 'status'>) {}

  /** Projets du portefeuille ; les projets de pilotage n'y entrent que pour les risques et les actions transverses (`includePilot`). */
  private async projects(organizationId: string, portfolioKey: string, includePilot = false): Promise<Array<{ id: string; key: string; name: string }>> {
    return this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      return (await c.query(
        `select p.id, p.key, p.name from portfolio_project x join project p on p.id = x.project_id
          where x.portfolio_id = $1 and (x.kind = 'delivery' or $2::boolean) and p.lifecycle_state not in ('completed', 'cancelled', 'rejected', 'archived') order by p.key`, [f.id, includePilot])).rows;
    });
  }

  /** Tableau de passage : pour chaque projet à gabarit, la gate en cours, sa revue et l'état de ses critères. */
  async gates(organizationId: string, portfolioKey: string): Promise<GateRow[]> {
    const rows: GateRow[] = [];
    for (const p of await this.projects(organizationId, portfolioKey)) {
      const st = await this.templates.status(organizationId, p.key).catch(() => null);
      const check = st?.phaseCheck;
      if (!st || !check) continue;
      const rec = check.record;
      const manual = check.criteria.filter((c) => c.manual && !c.met).length;
      rows.push({
        project: p.key, name: p.name, phase: check.key, phaseName: check.name, review: check.review, reviewPlannedOn: rec.reviewPlannedOn, reviewHeldOn: rec.reviewHeldOn, decision: rec.decision,
        canAdvance: check.canAdvance, criteria: { total: check.criteria.length, met: check.criteria.filter((c) => c.met).length, manualPending: manual, automaticRemaining: check.criteria.filter((c) => !c.manual && !c.met).reduce((n, c) => n + c.remaining, 0) },
      });
    }
    return rows.sort((a, b) => (a.reviewPlannedOn ?? '9999').localeCompare(b.reviewPlannedOn ?? '9999') || a.project.localeCompare(b.project));
  }

  /** Matrice probabilité × impact des risques ouverts (rôles sémantiques ; champs à lecture restreinte exclus), et les dix plus critiques. */
  async riskMatrix(organizationId: string, portfolioKey: string, actor: Actor): Promise<RiskMatrix> {
    return this.matrixOf(organizationId, (await this.projects(organizationId, portfolioKey, true)).map((p) => p.key), actor);
  }

  /** Matrice d'un seul projet (carte « Risques consolidés » d'un tableau de bord de projet) ; 404 si le projet n'est pas visible. */
  async projectRiskMatrix(organizationId: string, projectKey: string, actor: Actor): Promise<RiskMatrix> {
    if (!(await this.db.tx(organizationId, async (c) => (await c.query('select 1 from project where key = $1', [projectKey])).rows[0]))) throw notFound(`Projet ${projectKey}`);
    return this.matrixOf(organizationId, [projectKey], actor);
  }

  private async matrixOf(organizationId: string, keys: string[], actor: Actor): Promise<RiskMatrix> {
    const risks = await this.db.tx(organizationId, async (c) => (await c.query(
      `select a.key, p.key project, prob.v::int probability, imp.v::int impact
         from artifact a join project p on p.id = a.project_id join status s on s.id = a.status_id
         join lateral (select (a."values" ->> f.key)::numeric v from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'probability'
                         and jsonb_typeof(a."values" -> f.key) = 'number' and (f.read_roles is null or f.read_roles && $2::text[])) prob on true
         join lateral (select (a."values" ->> f.key)::numeric v from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'impact'
                         and jsonb_typeof(a."values" -> f.key) = 'number' and (f.read_roles is null or f.read_roles && $2::text[])) imp on true
        where p.key = any($1::text[]) and s.category <> 'done' and prob.v between 1 and 5 and imp.v between 1 and 5`, [keys, actor.roles])).rows as Array<{ key: string; project: string; probability: number; impact: number }>);
    const grid = new Map<string, number>();
    for (const r of risks) grid.set(`${r.probability}-${r.impact}`, (grid.get(`${r.probability}-${r.impact}`) ?? 0) + 1);
    const cells: RiskCell[] = [];
    for (let probability = 1; probability <= 5; probability++) for (let impact = 1; impact <= 5; impact++) cells.push({ probability, impact, count: grid.get(`${probability}-${impact}`) ?? 0 });
    const top = risks.map((r) => ({ ...r, criticality: r.probability * r.impact })).sort((a, b) => b.criticality - a.criticality || a.key.localeCompare(b.key)).slice(0, 10);
    return { cells, top, total: risks.length };
  }

  /** Suivi des actions (tickets de type « action ») : ouvertes, en retard (échéance dépassée), closes par projet, et la liste des retards. */
  async actions(organizationId: string, portfolioKey: string, today = new Date()): Promise<ActionTracking> {
    const keys = (await this.projects(organizationId, portfolioKey, true)).map((p) => p.key);
    const day = today.toISOString().slice(0, 10);
    return this.db.tx(organizationId, async (c) => {
      const rows = (await c.query(
        `select p.key project, a.key, s.category,
                (select a."values" ->> f.key from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'due_date') due,
                (select u.display_name from field_definition f join user_account u on u.subject = a."values" ->> f.key and u.organization_id = a.organization_id
                  where f.tracker_id = a.tracker_id and f.semantic_role = 'assignee') assignee
           from artifact a join tracker t on t.id = a.tracker_id join project p on p.id = a.project_id join status s on s.id = a.status_id
          where p.key = any($1::text[]) and t.type_key = 'action'`, [keys])).rows as Array<{ project: string; key: string; category: string; due: string | null; assignee: string | null }>;
      const by = new Map<string, ActionSummary>();
      const overdue: ActionEntry[] = [];
      for (const r of rows) {
        const s = by.get(r.project) ?? { project: r.project, open: 0, late: 0, closed: 0 };
        if (r.category === 'done') s.closed += 1;
        else {
          s.open += 1;
          if (r.due && /^\d{4}-\d{2}-\d{2}/.test(r.due) && r.due.slice(0, 10) < day) { s.late += 1; overdue.push({ key: r.key, project: r.project, due: r.due.slice(0, 10), assignee: r.assignee }); }
        }
        by.set(r.project, s);
      }
      return { projects: [...by.values()].sort((a, b) => b.late - a.late || a.project.localeCompare(b.project)), overdue: overdue.sort((a, b) => a.due.localeCompare(b.due)) };
    });
  }

  /** Courbe de tendance des jalons (MTA) d'un projet : pour chaque date prévue modifiée, la date du relevé et la nouvelle date prévue. */
  async milestoneTrend(organizationId: string, projectKey: string): Promise<MilestoneSeries[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const rows = (await c.query(
        `select phase, field, to_char(changed_at, 'YYYY-MM-DD') at, to_char(new_value, 'YYYY-MM-DD') planned
           from project_phase_history where project_id = $1 and new_value is not null order by changed_at, id`, [project.id])).rows as Array<{ phase: string; field: 'planned_end' | 'review_planned_on'; at: string; planned: string }>;
      const series = new Map<string, MilestoneSeries>();
      for (const r of rows) {
        const k = `${r.phase}/${r.field}`;
        const s = series.get(k) ?? { phase: r.phase, field: r.field, points: [] };
        s.points.push({ at: r.at, planned: r.planned });
        series.set(k, s);
      }
      return [...series.values()];
    });
  }
}
