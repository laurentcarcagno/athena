import { Db } from '../core/db';
import { notFound } from '../core/errors';
import type { SearchService } from '../atql/search.service';
import type { ReportService } from './report.service';
import type { SprintService } from './sprint.service';

/** Requêtes ATQL des indicateurs : les mêmes que celles qu'ouvrent les liens des widgets, pour que les chiffres concordent. */
export const KPI_QUERIES = {
  open: 'category != done',
  late: 'late()',
  blocked: 'blocked()',
  dueSoon: 'category != done AND dueDate >= daysFromNow(0) AND dueDate <= daysFromNow(7)',
} as const;

export type Health = 'ok' | 'attention' | 'critical';
export interface ProjectKpis {
  project: { key: string; name: string; createdAt: string; members: number; managers: string[] };
  progress: { total: number; done: number; inProgress: number; todo: number; percent: number };
  late: number;
  blocked: number;
  dueSoon: number;
  open: number;
  workload: Array<{ assignee: string; count: number }>;
  velocity: { average: number; forecast: number; sprints: number };
  sprint: { id: string; name: string; endsOn: string | null; items: number; doneItems: number; totalPoints: number; donePoints: number; percent: number; daysLeft: number | null } | null;
  health: { state: Health; reasons: string[] };
}

/** Vert, orangé ou rouge selon les bloquants et la part de tickets ouverts en retard. */
export function healthOf(open: number, late: number, blocked: number): { state: Health; reasons: string[] } {
  const reasons: string[] = [];
  if (blocked > 0) reasons.push('blocked');
  if (late > 0) reasons.push('late');
  const share = open === 0 ? 0 : late / open;
  const state: Health = blocked >= 3 || share >= 0.25 ? 'critical' : reasons.length > 0 ? 'attention' : 'ok';
  return { state, reasons };
}

/** Agrégats de pilotage d'un projet (ADR-0007, T-0174) : un appel pour les widgets Informations, Avancement, Indicateurs, Santé et Sprint. */
export class KpiService {
  constructor(private readonly db: Db, private readonly search: SearchService, private readonly reports: ReportService, private readonly sprints: SprintService) {}

  async kpis(organizationId: string, projectKey: string, actor: { id: string; roles: string[] }, today: Date = new Date()): Promise<ProjectKpis> {
    const count = async (q: string) => (await this.search.search(organizationId, projectKey, q, actor.id, 1, 0, actor.roles)).total;
    const [open, late, blocked, dueSoon, dash, velocity, meta, workload, sprint] = await Promise.all([
      count(KPI_QUERIES.open), count(KPI_QUERIES.late), count(KPI_QUERIES.blocked), count(KPI_QUERIES.dueSoon),
      this.reports.dashboard(organizationId, projectKey),
      this.reports.velocity(organizationId, projectKey, 10),
      this.db.tx(organizationId, async (c) => (await c.query(
        `select p.name, p.created_at, (select count(*)::int from project_member m where m.project_id = p.id) as members,
                coalesce((select array_agg(m.subject order by m.subject) from project_member m where m.project_id = p.id and m.role = 'manager'), '{}') as managers
         from project p where p.key = $1`, [projectKey])).rows[0]),
      this.db.tx(organizationId, async (c) => (await c.query(
        `select v as assignee, count(*)::int as n from (
           select a."values" ->> f.key as v from artifact a join project p on p.id = a.project_id join status st on st.id = a.status_id
             join field_definition f on f.tracker_id = a.tracker_id and f.semantic_role = 'assignee'
           where p.key = $1 and st.category <> 'done') x
         where coalesce(v, '') <> '' group by v order by n desc, v limit 5`, [projectKey])).rows as Array<{ assignee: string; n: number }>),
      this.sprints.list(organizationId, projectKey).then((list) => list.find((x) => x.state === 'active')).catch(() => undefined),
    ]);
    if (!meta) throw notFound(`Projet ${projectKey}`);
    const total = dash.byCategory.todo + dash.byCategory.in_progress + dash.byCategory.done;
    const names = workload.map((w) => ({ assignee: w.assignee, count: w.n }));
    let sprintView: ProjectKpis['sprint'] = null;
    if (sprint) {
      const view = await this.sprints.get(organizationId, sprint.id);
      const ends = sprint.endsOn ? new Date(sprint.endsOn) : null;
      const doneItems = view.items.filter((i) => i.done).length;
      sprintView = {
        id: sprint.id, name: sprint.name, endsOn: sprint.endsOn, items: view.items.length, doneItems, totalPoints: view.totalPoints, donePoints: view.donePoints,
        percent: view.totalPoints > 0 ? Math.round((100 * view.donePoints) / view.totalPoints) : view.items.length === 0 ? 0 : Math.round((100 * doneItems) / view.items.length),
        daysLeft: ends ? Math.ceil((ends.getTime() - today.getTime()) / 86_400_000) : null,
      };
    }
    return {
      project: { key: projectKey, name: meta.name as string, createdAt: (meta.created_at as Date).toISOString(), members: meta.members as number, managers: meta.managers as string[] },
      progress: { total, done: dash.byCategory.done, inProgress: dash.byCategory.in_progress, todo: dash.byCategory.todo, percent: total === 0 ? 0 : Math.round((100 * dash.byCategory.done) / total) },
      late, blocked, dueSoon, open, workload: names,
      velocity: { average: velocity.average, forecast: velocity.forecast, sprints: velocity.sprints.length },
      sprint: sprintView,
      health: healthOf(open, late, blocked),
    };
  }
}
