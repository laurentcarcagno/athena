import { Db } from './db';
import { notFound } from './errors';

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
}
