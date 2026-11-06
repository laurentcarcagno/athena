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
  /** Tracker de la vue (absent : filtre de projet). */
  trackerKey: string | null;
  view: string;
  columns: string[] | null;
  isDefault: boolean;
}

export interface SavedFilterInput {
  name: string;
  query: string;
  shared?: boolean;
  trackerKey?: string;
  view?: string;
  columns?: string[];
  isDefault?: boolean;
}

const MANAGER_ROLES = ['athena-admin', 'athena-pm'];
const COLUMNS = 'f.id, f.name, f.query, f.owner, f.shared, f.tracker_key, f.view, f.columns, f.is_default';
const toFilter = (r: Record<string, unknown>): SavedFilter => ({
  id: r['id'] as string, name: r['name'] as string, query: r['query'] as string, owner: r['owner'] as string, shared: r['shared'] as boolean,
  trackerKey: (r['tracker_key'] as string | null) ?? null, view: r['view'] as string, columns: (r['columns'] as string[] | null) ?? null, isDefault: r['is_default'] as boolean,
});

export class SavedFilterService {
  constructor(private readonly db: Db) {}

  async create(organizationId: string, projectKey: string, input: SavedFilterInput, actor: Actor): Promise<SavedFilter> {
    try {
      parse(input.query); // un filtre enregistré doit être une requête valide
    } catch (error) {
      if (error instanceof AtqlError) throw validation([error.message]);
      throw error;
    }
    if (input.isDefault && !(input.shared && input.trackerKey)) throw validation(['une vue par défaut est partagée et rattachée à un tracker']);
    if (input.isDefault && !actor.roles.some((r) => MANAGER_ROLES.includes(r))) throw forbidden('Seuls les chefs de projet et les administrateurs choisissent la vue par défaut.');
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      if (input.trackerKey && !(await c.query('select 1 from tracker where project_id = $1 and key = $2', [project.id, input.trackerKey])).rowCount) throw notFound(`Tracker ${input.trackerKey}`);
      try {
        if (input.isDefault) await c.query('update saved_filter set is_default = false where project_id = $1 and tracker_key = $2 and is_default', [project.id, input.trackerKey]);
        const row = (
          await c.query(
            `insert into saved_filter (organization_id, project_id, name, query, owner, shared, tracker_key, view, columns, is_default)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
            [organizationId, project.id, input.name, input.query, actor.id, input.shared ?? false, input.trackerKey ?? null, input.view ?? 'tableau', input.columns ? JSON.stringify(input.columns) : null, input.isDefault ?? false],
          )
        ).rows[0];
        await audit(c, organizationId, actor, 'filter.create', `project:${projectKey}`, { name: input.name, tracker: input.trackerKey ?? null });
        return { id: row.id, name: input.name, query: input.query, owner: actor.id, shared: input.shared ?? false, trackerKey: input.trackerKey ?? null, view: input.view ?? 'tableau', columns: input.columns ?? null, isDefault: input.isDefault ?? false };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw conflict(`Un filtre « ${input.name} » existe déjà.`);
        throw error;
      }
    });
  }

  /**
   * Filtres personnels et partagés. Sans `trackerKey`, les filtres de projet (page Recherche) ; avec, les vues de ce tracker,
   * la vue par défaut en premier.
   */
  async list(organizationId: string, projectKey: string, actor: Actor, trackerKey?: string): Promise<SavedFilter[]> {
    return this.db.tx(organizationId, async (c) => {
      const rows = (
        await c.query(
          `select ${COLUMNS} from saved_filter f join project p on p.id = f.project_id
           where p.key = $1 and (f.owner = $2 or f.shared) and f.tracker_key is not distinct from $3::text
           order by f.is_default desc, f.name, f.id`,
          [projectKey, actor.id, trackerKey ?? null],
        )
      ).rows;
      return rows.map(toFilter);
    });
  }

  /** Définit ou retire la vue par défaut d'un tracker (chefs de projet et administrateurs) ; une seule par tracker. */
  async setDefault(organizationId: string, projectKey: string, id: string, isDefault: boolean, actor: Actor): Promise<void> {
    if (!actor.roles.some((r) => MANAGER_ROLES.includes(r))) throw forbidden('Seuls les chefs de projet et les administrateurs choisissent la vue par défaut.');
    await this.db.tx(organizationId, async (c) => {
      const row = (await c.query('select f.project_id, f.tracker_key, f.shared from saved_filter f join project p on p.id = f.project_id where p.key = $1 and f.id::text = $2', [projectKey, id])).rows[0];
      if (!row) throw notFound('Filtre');
      if (isDefault && !(row.tracker_key && row.shared)) throw validation(['une vue par défaut est partagée et rattachée à un tracker']);
      if (isDefault) await c.query('update saved_filter set is_default = false where project_id = $1 and tracker_key = $2 and is_default', [row.project_id, row.tracker_key]);
      await c.query('update saved_filter set is_default = $2 where id::text = $1', [id, isDefault]);
      await audit(c, organizationId, actor, 'filter.default', `project:${projectKey}`, { id, isDefault });
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
