import { Db, type Actor } from '../core/db';
import { notFound } from '../core/errors';
import type { PhaseRecord, TemplateUpgradeService } from '../core/template-upgrade.service';
import type { ScheduleService } from '../planning/schedule.service';
import type { LifecycleCategory } from './lifecycle';
import type { LifecycleService } from './lifecycle.service';

export interface RoadmapPhase {
  key: string; name: string; review: string; offTemplate: boolean; current: boolean;
  plannedStart: string | null; plannedEnd: string | null; reviewPlannedOn: string | null; reviewHeldOn: string | null;
  decision: PhaseRecord['decision'];
  /** Phase sans aucune date prévue : chevron grisé « non daté ». */
  undated: boolean;
  /** Revue tenue après sa date prévue. */
  heldLate: boolean;
}
export interface RoadmapProject {
  key: string; name: string; lifecycle: { key: string; name: string; category: LifecycleCategory };
  plannedStart: string | null; plannedEnd: string | null;
  /** Fin du planning détaillé (fin la plus tardive des tâches planifiées). Marque d'alerte si elle dépasse `plannedEnd`. */
  calculatedEnd: string | null;
  /** Baseline la plus récente, sa fin la plus tardive et l'écart de la fin planifiée en jours ouvrés (le même chiffre que le Gantt du projet). */
  baseline: { name: string; end: string; gapDays: number | null } | null;
  phases: RoadmapPhase[];
  releases: Array<{ name: string; startsOn: string; endsOn: string; state: 'planned' | 'released' }>;
  /** Projet sans aucune date : couloir « non planifié » en fin de liste. */
  unscheduled: boolean;
}
export interface PortfolioRoadmap {
  portfolio: { key: string; name: string };
  projects: RoadmapProject[];
  /** Projets clos, annulés ou archivés exclus (sauf `includeClosed`). */
  hiddenByState: number;
}

const CLOSED: LifecycleCategory[] = ['closed', 'cancelled', 'archived'];

/**
 * Roadmap consolidée d'un portefeuille (lot 19, B27) : pour chaque projet visible, ses dates, ses phases et revues, ses versions et sa
 * baseline. Les tâches ne remontent jamais au portefeuille. Lecture seule.
 */
export class RoadmapService {
  constructor(
    private readonly db: Db, private readonly templates: Pick<TemplateUpgradeService, 'status'>, private readonly schedule: Pick<ScheduleService, 'get' | 'baselines'>,
    private readonly lifecycle: Pick<LifecycleService, 'config'>,
  ) {}

  async roadmap(organizationId: string, portfolioKey: string, actor: Actor, options: { includeClosed?: boolean } = {}): Promise<PortfolioRoadmap> {
    const base = await this.db.tx(organizationId, async (c) => {
      const portfolio = (await c.query('select id, key, name from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!portfolio) throw notFound(`Portefeuille ${portfolioKey}`);
      const rows = (await c.query(
        `select p.id, p.key, p.name, p.lifecycle_state, to_char(m.planned_start, 'YYYY-MM-DD') planned_start, to_char(m.planned_end, 'YYYY-MM-DD') planned_end
           from portfolio_project x join project p on p.id = x.project_id left join project_meta m on m.project_id = p.id
          where x.portfolio_id = $1 order by x.position, p.key`, [portfolio.id])).rows;
      const releases = (await c.query(
        `select p.key project, r.name, to_char(r.starts_on, 'YYYY-MM-DD') starts_on, to_char(r.ends_on, 'YYYY-MM-DD') ends_on, r.state
           from release r join project p on p.id = r.project_id where p.id = any($1::uuid[]) order by r.starts_on, r.name`, [rows.map((r) => r.id)])).rows;
      return { portfolio, rows, releases };
    });
    const states = new Map((await this.lifecycle.config(organizationId)).states.map((s) => [s.key, s]));
    const all = await Promise.all(base.rows.map(async (p): Promise<RoadmapProject> => {
      const st = states.get(p.lifecycle_state);
      const tpl = await this.templates.status(organizationId, p.key).catch(() => null);
      const phases: RoadmapPhase[] = (tpl?.phases ?? []).map((ph) => ({
        key: ph.key, name: ph.name, review: ph.review, offTemplate: ph.offTemplate, current: ph.key === tpl?.phase,
        plannedStart: ph.record.plannedStart, plannedEnd: ph.record.plannedEnd, reviewPlannedOn: ph.record.reviewPlannedOn, reviewHeldOn: ph.record.reviewHeldOn,
        decision: ph.record.decision, undated: !ph.record.plannedStart && !ph.record.plannedEnd && !ph.record.reviewPlannedOn,
        heldLate: ph.record.reviewHeldOn !== null && ph.record.reviewPlannedOn !== null && ph.record.reviewHeldOn > ph.record.reviewPlannedOn,
      }));
      const choices = await this.schedule.baselines(organizationId, p.key).catch(() => []);
      const view = await this.schedule.get(organizationId, p.key, actor.roles, choices[0]?.name).catch(() => null);
      const ends = (view?.tasks ?? []).filter((t) => t.plannedEnd);
      const last = ends.reduce<(typeof ends)[number] | null>((a, t) => (a === null || t.plannedEnd! > a.plannedEnd! ? t : a), null);
      const baselineEnd = (view?.tasks ?? []).reduce<string | null>((a, t) => (t.baselineEnd && (a === null || t.baselineEnd > a) ? t.baselineEnd : a), null);
      const releases = base.releases.filter((r) => r.project === p.key).map((r) => ({ name: r.name as string, startsOn: r.starts_on as string, endsOn: r.ends_on as string, state: r.state as 'planned' | 'released' }));
      const plannedStart = p.planned_start as string | null;
      const plannedEnd = p.planned_end as string | null;
      return {
        key: p.key, name: p.name, lifecycle: { key: st?.key ?? p.lifecycle_state, name: st?.name ?? p.lifecycle_state, category: st?.category ?? 'active' },
        plannedStart, plannedEnd, calculatedEnd: last?.plannedEnd ?? null,
        baseline: view?.baseline && baselineEnd ? { name: view.baseline.name, end: baselineEnd, gapDays: last?.variance ?? null } : null,
        phases, releases,
        unscheduled: !plannedStart && !plannedEnd && last === null && phases.every((ph) => ph.undated) && releases.length === 0,
      };
    }));
    const projects = (options.includeClosed ? all : all.filter((p) => !CLOSED.includes(p.lifecycle.category)))
      .sort((a, b) => Number(a.unscheduled) - Number(b.unscheduled));
    return { portfolio: { key: base.portfolio.key, name: base.portfolio.name }, projects, hiddenByState: all.length - projects.length };
  }
}
