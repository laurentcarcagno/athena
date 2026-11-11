import { Db } from '../core/db';
import { validation } from '../core/errors';
import { compile } from './compile';
import { AtqlError } from './parser';

export interface SearchHit {
  key: string;
  /** Projet du ticket (T-0118 : la recherche globale mêle les projets). */
  project: string;
  tracker: string;
  /** Titre (champ de rôle `title`), ou la clé si ce champ est absent ou à lecture restreinte. */
  title: string;
  status: string;
  statusName: string;
  /** Teinte nommée du statut (T-0138), nulle : celle de la catégorie. */
  statusColor: string | null;
  category: string;
  values: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

/** Au-delà de ce nombre de résultats, le total est plafonné. */
export const COUNT_CAP = 10_000;

export interface SearchResult {
  total: number;
  /** Vrai si le total a été plafonné à COUNT_CAP (il y a au moins ce nombre de résultats). */
  totalCapped: boolean;
  hits: SearchHit[];
}

export class SearchService {
  constructor(private readonly db: Db) {}

  /** Exécute une requête ATQL dans le périmètre (RLS) de l'organisation et du projet. */
  async search(
    organizationId: string, projectKey: string, query: string, currentUser: string, limit = 50, offset = 0, roles?: string[],
  ): Promise<SearchResult> {
    return this.run(organizationId, [projectKey], query, currentUser, limit, offset, roles);
  }

  /**
   * Recherche d'organisation (T-0118) : la même ATQL sur tous les projets, ou sur `projects` s'il est donné.
   * Les listes d'ayants droit (RLS de `Db.tx`) écartent les projets et trackers non autorisés : leurs tickets n'apparaissent jamais,
   * même nommés dans le filtre ou dans la requête.
   */
  async searchOrganization(
    organizationId: string, query: string, currentUser: string,
    options: { projects?: string[]; limit?: number; offset?: number; roles?: string[] } = {},
  ): Promise<SearchResult> {
    const projects = options.projects?.length ? options.projects : null;
    if (projects && (projects.length > 50 || projects.some((p) => !/^[A-Z][A-Z0-9]{1,9}$/.test(p)))) throw validation(['project : clés de projet invalides']);
    return this.run(organizationId, projects, query, currentUser, options.limit ?? 50, options.offset ?? 0, options.roles);
  }

  /** `projects` : périmètre explicite, ou `null` pour toute l'organisation. */
  private async run(
    organizationId: string, projects: string[] | null, query: string, currentUser: string, limit: number, offset: number, roles?: string[],
  ): Promise<SearchResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw validation(['limit : entre 1 et 200']);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw validation(['offset invalide']);
    // Champs à lecture restreinte : retirés des résultats et interdits dans les filtres et tris du lecteur.
    // Clé `PROJET/TRACKER` : une clé de tracker n'est unique que dans son projet.
    const restricted = new Map<string, Set<string>>();
    const forbidden = new Set<string>();
    if (roles) {
      const rows = await this.db.tx(organizationId, async (c) =>
        (
          await c.query(
            `select p.key as project, t.key as tracker, f.key, f.read_roles from field_definition f join tracker t on t.id = f.tracker_id
             join project p on p.id = t.project_id where ($1::text[] is null or p.key = any($1::text[])) and f.read_roles is not null`,
            [projects],
          )
        ).rows,
      );
      for (const r of rows) {
        const allowed = roles.includes('athena-admin') || (r.read_roles as string[]).some((x) => roles.includes(x));
        if (allowed) continue;
        forbidden.add(r.key);
        const scope = `${r.project}/${r.tracker}`;
        restricted.set(scope, (restricted.get(scope) ?? new Set<string>()).add(r.key));
      }
    }
    let compiled;
    try {
      compiled = compile(query, { currentUser, forbiddenFields: forbidden }, [projects]);
    } catch (error) {
      if (error instanceof AtqlError) throw validation([error.message]);
      throw error;
    }
    const from = `from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id
                  join project p on p.id = a.project_id where ($1::text[] is null or p.key = any($1::text[])) and ${compiled.where}`;
    return this.db.tx(organizationId, async (c) => {
      // Coût borné : délai maximal par requête dans cette transaction.
      await c.query("set local statement_timeout = '5s'");
      // Comptage borné : au-delà de COUNT_CAP résultats, le total est plafonné (totalCapped) pour garder un coût constant.
      const counted = Number((await c.query(`select count(*) n from (select 1 ${from} limit ${COUNT_CAP + 1}) c`, compiled.params.slice(0, compiled.whereParamCount))).rows[0].n);
      const totalCapped = counted > COUNT_CAP;
      const total = totalCapped ? COUNT_CAP : counted;
      const rows = (
        await c.query(
          `select a.key, p.key as project, t.key as tracker, s.key as status, s.name as status_name, s.color as status_color, s.category, a."values" as values, a.version, a.updated_at,
                  (select f.key from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'title') as title_field
           ${from} order by ${compiled.orderBy} limit ${limit} offset ${offset}`,
          compiled.params,
        )
      ).rows;
      return {
        total,
        totalCapped,
        hits: rows.map((r) => {
          const hidden = restricted.get(`${r.project}/${r.tracker}`);
          const values = hidden ? Object.fromEntries(Object.entries(r.values as Record<string, unknown>).filter(([k]) => !hidden.has(k))) : (r.values as Record<string, unknown>);
          const title = r.title_field && values[r.title_field] != null ? String(values[r.title_field]) : (r.key as string);
          return {
            key: r.key, project: r.project, tracker: r.tracker, title, status: r.status, statusName: r.status_name, statusColor: (r.status_color as string | null) ?? null, category: r.category,
            values, version: r.version, updatedAt: r.updated_at.toISOString(),
          };
        }),
      };
    });
  }
}
