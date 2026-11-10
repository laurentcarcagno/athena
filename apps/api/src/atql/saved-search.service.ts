import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { AtqlError, parse } from './parser';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  /** Périmètre de projets ; vide : toute l'organisation. */
  projects: string[];
}

const PROJECT = /^[A-Z][A-Z0-9]{1,9}$/;

/** Recherches enregistrées de la recherche globale (T-0118) : personnelles, hors projet. */
export class SavedSearchService {
  constructor(private readonly db: Db) {}

  async list(organizationId: string, actor: Actor): Promise<SavedSearch[]> {
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select id, name, query, projects from saved_search where owner = $1 order by name', [actor.id])).rows.map((r) => ({
        id: r.id as string, name: r.name as string, query: r.query as string, projects: r.projects as string[],
      })),
    );
  }

  async create(organizationId: string, input: { name: string; query: string; projects?: string[] }, actor: Actor): Promise<SavedSearch> {
    try {
      parse(input.query); // une recherche enregistrée doit être une requête valide
    } catch (error) {
      if (error instanceof AtqlError) throw validation([error.message]);
      throw error;
    }
    const projects = [...new Set(input.projects ?? [])];
    if (projects.length > 50 || projects.some((p) => !PROJECT.test(p))) throw validation(['projects : clés de projet invalides']);
    return this.db.tx(organizationId, async (c) => {
      try {
        const id = (
          await c.query('insert into saved_search (organization_id, owner, name, query, projects) values ($1,$2,$3,$4,$5) returning id', [organizationId, actor.id, input.name, input.query, projects])
        ).rows[0].id as string;
        return { id, name: input.name, query: input.query, projects };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw conflict(`Une recherche « ${input.name} » existe déjà.`);
        throw error;
      }
    });
  }

  /** Seul son propriétaire supprime une recherche ; celle d'un autre est introuvable pour lui. */
  async remove(organizationId: string, id: string, actor: Actor): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Recherche');
    await this.db.tx(organizationId, async (c) => {
      const removed = await c.query('delete from saved_search where id = $1 and owner = $2', [id, actor.id]);
      if (removed.rowCount === 0) throw notFound('Recherche');
    });
  }
}
