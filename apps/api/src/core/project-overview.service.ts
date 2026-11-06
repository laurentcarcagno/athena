import { Db } from './db';
import { notFound } from './errors';
import { builtinTrackerTypes } from './tracker-types';

/** Onglets d'un projet, dans l'ordre fixe de la spécification (ADR-0002 § 3). */
export const PROJECT_MODULES = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'] as const;
export type ProjectModule = (typeof PROJECT_MODULES)[number];

/**
 * Modules actifs d'un projet. Vue d'ensemble, Trackers, Planification, Activité et Membres existent toujours (on y crée
 * boards, sprints et acteurs). Les autres s'activent quand leurs données existent : types de liens, source documentaire, dépôt de code.
 * L'ordre renvoyé est toujours l'ordre fixe : un module inactif disparaît sans décaler les autres.
 */
export class ProjectOverviewService {
  constructor(private readonly db: Db) {}

  async modules(organizationId: string, projectKey: string): Promise<{ modules: ProjectModule[] }> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const has = async (table: string): Promise<boolean> =>
        ((await c.query(`select 1 from ${table} where project_id = $1 limit 1`, [project.id])).rowCount ?? 0) > 0;
      const active = new Set<ProjectModule>(['overview', 'trackers', 'planning', 'activity', 'members']);
      if (await has('link_type')) active.add('traceability');
      if (await has('doc_source')) active.add('documents');
      if (await has('code_repo')) active.add('code');
      return { modules: PROJECT_MODULES.filter((m) => active.has(m)) };
    });
  }

  /**
   * Carte des trackers du projet : par tracker, compteurs par statut, éléments assignés à `username` (hors terminés)
   * et dernière activité. La catégorie vient du type du tracker (« other » sans type).
   */
  async overview(organizationId: string, projectKey: string, username: string): Promise<ProjectOverview> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const categories = new Map(builtinTrackerTypes().map((t) => [t.key, t.category as string]));
      for (const r of (await c.query('select key, category from tracker_type')).rows) categories.set(r.key as string, r.category as string);
      const trackers = (await c.query('select id, key, name, type_key from tracker where project_id = $1 order by key', [project.id])).rows;
      const out: TrackerOverview[] = [];
      for (const t of trackers) {
        const statuses = (await c.query(
          `select s.key, s.name, s.category, count(a.id)::int as n from status s left join artifact a on a.status_id = s.id
           where s.tracker_id = $1 group by s.id order by s.position`, [t.id])).rows;
        const assignee = (await c.query("select key from field_definition where tracker_id = $1 and semantic_role = 'assignee'", [t.id])).rows[0]?.key as string | undefined;
        const mine = assignee
          ? Number((await c.query(
            `select count(*) n from artifact a join status s on s.id = a.status_id
             where a.tracker_id = $1 and s.category <> 'done' and a."values" ->> $2::text = $3`, [t.id, assignee, username])).rows[0].n)
          : 0;
        const last = (await c.query('select max(updated_at) at from artifact where tracker_id = $1', [t.id])).rows[0].at as Date | null;
        out.push({
          key: t.key, name: t.name, typeKey: t.type_key ?? null, category: (t.type_key && categories.get(t.type_key)) || 'other',
          artifacts: statuses.reduce((n, s) => n + (s.n as number), 0), mine, lastActivity: last ? last.toISOString() : null,
          statuses: statuses.map((s) => ({ key: s.key, name: s.name, category: s.category, count: s.n })),
        });
      }
      return { trackers: out };
    });
  }
}

export interface TrackerOverview {
  key: string; name: string; typeKey: string | null; category: string; artifacts: number; mine: number; lastActivity: string | null;
  statuses: Array<{ key: string; name: string; category: string; count: number }>;
}
export interface ProjectOverview { trackers: TrackerOverview[] }
