import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { notFound } from '../core/errors';
import { audit } from '../core/tracker.service';

export const ObjectiveInput = z.object({ key: z.string().regex(/^[a-z][a-z0-9_-]{1,29}$/), name: z.string().trim().min(1).max(200) });
export const ObjectiveLinkInput = z.object({ project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), weight: z.number().positive().max(1000).default(1) });

export interface ObjectiveFlow {
  objectives: Array<{ key: string; name: string }>;
  /** Projets du portefeuille rattachés à au moins un objectif (les projets que l'appelant ne voit pas n'apparaissent pas). */
  projects: string[];
  links: Array<{ objective: string; project: string; weight: number }>;
  /** Projets du portefeuille sans objectif. */
  unlinked: string[];
}

/** Objectifs stratégiques (lot 25, B41) : liste d'objectifs de l'organisation, rattachement pondéré des projets, flux objectifs → projets d'un portefeuille. */
export class ObjectiveService {
  constructor(private readonly db: Db) {}

  async upsert(organizationId: string, input: z.infer<typeof ObjectiveInput>, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into strategic_objective (organization_id, key, name, created_by) values ($1,$2,$3,$4) on conflict (organization_id, key) do update set name = excluded.name', [organizationId, input.key, input.name, actor.id]);
      await audit(c, organizationId, actor, 'objective.upsert', `objective:${input.key}`, { name: input.name });
    });
  }

  async link(organizationId: string, objectiveKey: string, input: z.infer<typeof ObjectiveLinkInput>, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const o = (await c.query('select id from strategic_objective where key = $1', [objectiveKey])).rows[0];
      if (!o) throw notFound(`Objectif ${objectiveKey}`);
      const p = (await c.query('select id from project where key = $1', [input.project])).rows[0];
      if (!p) throw notFound(`Projet ${input.project}`);
      await c.query(
        'insert into objective_project (objective_id, organization_id, project_id, weight, linked_by) values ($1,$2,$3,$4,$5) on conflict (objective_id, project_id) do update set weight = excluded.weight, linked_by = excluded.linked_by, linked_at = now()',
        [o.id, organizationId, p.id, input.weight, actor.id]);
      await audit(c, organizationId, actor, 'objective.link', `objective:${objectiveKey}`, { project: input.project, weight: input.weight });
    });
  }

  async flow(organizationId: string, portfolioKey: string): Promise<ObjectiveFlow> {
    return this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      const members = (await c.query('select p.id, p.key from portfolio_project x join project p on p.id = x.project_id where x.portfolio_id = $1 order by p.key', [f.id])).rows as Array<{ id: string; key: string }>;
      const rows = (await c.query(
        `select o.key objective, o.name, p.key project, l.weight::float weight from objective_project l join strategic_objective o on o.id = l.objective_id join project p on p.id = l.project_id
          where l.project_id = any($1::uuid[]) order by o.key, p.key`, [members.map((m) => m.id)])).rows as Array<{ objective: string; name: string; project: string; weight: number }>;
      const linked = new Set(rows.map((r) => r.project));
      return {
        objectives: [...new Map(rows.map((r) => [r.objective, { key: r.objective, name: r.name }])).values()],
        projects: members.map((m) => m.key).filter((k) => linked.has(k)),
        links: rows.map((r) => ({ objective: r.objective, project: r.project, weight: r.weight })),
        unlinked: members.map((m) => m.key).filter((k) => !linked.has(k)),
      };
    });
  }
}
