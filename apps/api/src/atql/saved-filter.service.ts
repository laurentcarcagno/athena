import { Db, type Actor } from '../core/db';
import { conflict, forbidden, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import { AtqlError, parse } from './parser';

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  owner: string;
  shared: boolean;
}

export class SavedFilterService {
  constructor(private readonly db: Db) {}

  async create(organizationId: string, projectKey: string, input: { name: string; query: string; shared?: boolean }, actor: Actor): Promise<SavedFilter> {
    try {
      parse(input.query); // un filtre enregistré doit être une requête valide
    } catch (error) {
      if (error instanceof AtqlError) throw validation([error.message]);
      throw error;
    }
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      try {
        const row = (
          await c.query(
            'insert into saved_filter (organization_id, project_id, name, query, owner, shared) values ($1,$2,$3,$4,$5,$6) returning id',
            [organizationId, project.id, input.name, input.query, actor.id, input.shared ?? false],
          )
        ).rows[0];
        await audit(c, organizationId, actor, 'filter.create', `project:${projectKey}`, { name: input.name });
        return { id: row.id, name: input.name, query: input.query, owner: actor.id, shared: input.shared ?? false };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw conflict(`Un filtre « ${input.name} » existe déjà.`);
        throw error;
      }
    });
  }

  /** Filtres personnels et filtres partagés du projet. */
  async list(organizationId: string, projectKey: string, actor: Actor): Promise<SavedFilter[]> {
    return this.db.tx(organizationId, async (c) => {
      const rows = (
        await c.query(
          `select f.id, f.name, f.query, f.owner, f.shared from saved_filter f join project p on p.id = f.project_id
           where p.key = $1 and (f.owner = $2 or f.shared) order by f.name, f.id`,
          [projectKey, actor.id],
        )
      ).rows;
      return rows as SavedFilter[];
    });
  }

  async remove(organizationId: string, projectKey: string, id: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const row = (
        await c.query('select f.owner from saved_filter f join project p on p.id = f.project_id where p.key = $1 and f.id::text = $2', [projectKey, id])
      ).rows[0];
      if (!row) throw notFound('Filtre');
      if (row.owner !== actor.id && !actor.roles.includes('athena-admin')) throw forbidden('Seul le propriétaire ou un administrateur peut supprimer ce filtre.');
      await c.query('delete from saved_filter where id::text = $1', [id]);
      await audit(c, organizationId, actor, 'filter.delete', `project:${projectKey}`, { id });
    });
  }
}
