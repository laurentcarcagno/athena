import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), 'date invalide');

/** Mise à jour partielle : `null` vide un champ. `planned_end` ne précède jamais `planned_start`. */
export const ProjectMetaInput = z.object({
  plannedStart: Day.nullable(),
  plannedEnd: Day.nullable(),
  sponsorSubject: z.string().trim().min(1).max(200).nullable(),
  description: z.string().max(2000),
  capacityGranularity: z.enum(['week', 'month']).nullable(),
}).partial();
export type ProjectMetaPatch = z.infer<typeof ProjectMetaInput>;

export interface ProjectMeta {
  plannedStart: string | null; plannedEnd: string | null; sponsorSubject: string | null; sponsorName: string | null;
  description: string; capacityGranularity: 'week' | 'month' | null; updatedAt: string | null;
}

const EMPTY: ProjectMeta = { plannedStart: null, plannedEnd: null, sponsorSubject: null, sponsorName: null, description: '', capacityGranularity: null, updatedAt: null };

/** Méta du projet (dates de référence, sponsor, description). Le droit d'écriture est vérifié par l'appelant (`requireManager`). */
export class ProjectMetaService {
  constructor(private readonly db: Db) {}

  async get(organizationId: string, projectKey: string): Promise<ProjectMeta> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      return this.read(c, project.id);
    });
  }

  async patch(organizationId: string, projectKey: string, patch: ProjectMetaPatch, actor: Actor): Promise<ProjectMeta> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const next = { ...(await this.read(c, project.id)), ...patch };
      if (next.plannedStart && next.plannedEnd && next.plannedEnd < next.plannedStart) throw validation(['plannedEnd : la fin prévue ne peut pas précéder le début prévu']);
      if (patch.sponsorSubject) {
        const known = (await c.query('select 1 from user_account where subject = $1', [patch.sponsorSubject])).rows[0];
        if (!known) throw validation(['sponsorSubject : compte inconnu']);
      }
      await c.query(
        `insert into project_meta (organization_id, project_id, planned_start, planned_end, sponsor_subject, description, capacity_granularity, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (project_id) do update set planned_start = excluded.planned_start, planned_end = excluded.planned_end, sponsor_subject = excluded.sponsor_subject,
           description = excluded.description, capacity_granularity = excluded.capacity_granularity, updated_by = excluded.updated_by, updated_at = now()`,
        [organizationId, project.id, next.plannedStart, next.plannedEnd, next.sponsorSubject, next.description, next.capacityGranularity, actor.id]);
      await audit(c, organizationId, actor, 'project.update', `project:${projectKey}`, patch);
      return this.read(c, project.id);
    });
  }

  private async read(c: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }, projectId: string): Promise<ProjectMeta> {
    const r = (await c.query(
      `select to_char(m.planned_start, 'YYYY-MM-DD') planned_start, to_char(m.planned_end, 'YYYY-MM-DD') planned_end, m.sponsor_subject, u.display_name sponsor_name,
              m.description, m.capacity_granularity, m.updated_at
         from project_meta m left join user_account u on u.subject = m.sponsor_subject and u.organization_id = m.organization_id
        where m.project_id = $1`, [projectId])).rows[0];
    if (!r) return { ...EMPTY };
    return {
      plannedStart: r.planned_start, plannedEnd: r.planned_end, sponsorSubject: r.sponsor_subject, sponsorName: r.sponsor_name ?? null,
      description: r.description, capacityGranularity: r.capacity_granularity, updatedAt: new Date(r.updated_at).toISOString(),
    };
  }
}
