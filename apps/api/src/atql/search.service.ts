import { Db } from '../core/db';
import { validation } from '../core/errors';
import { compile } from './compile';
import { AtqlError } from './parser';

export interface SearchHit {
  key: string;
  tracker: string;
  status: string;
  statusName: string;
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
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw validation(['limit : entre 1 et 200']);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw validation(['offset invalide']);
    // Champs à lecture restreinte : retirés des résultats et interdits dans les filtres et tris du lecteur.
    const restricted = new Map<string, Map<string, string[]>>();
    const forbidden = new Set<string>();
    if (roles) {
      const rows = await this.db.tx(organizationId, async (c) =>
        (
          await c.query(
            `select t.key as tracker, f.key, f.read_roles from field_definition f join tracker t on t.id = f.tracker_id
             join project p on p.id = t.project_id where p.key = $1 and f.read_roles is not null`,
            [projectKey],
          )
        ).rows,
      );
      for (const r of rows) {
        const allowed = roles.includes('athena-admin') || (r.read_roles as string[]).some((x) => roles.includes(x));
        if (allowed) continue;
        forbidden.add(r.key);
        const perTracker = restricted.get(r.tracker) ?? new Map<string, string[]>();
        perTracker.set(r.key, r.read_roles);
        restricted.set(r.tracker, perTracker);
      }
    }
    let compiled;
    try {
      compiled = compile(query, { currentUser, forbiddenFields: forbidden }, [projectKey]);
    } catch (error) {
      if (error instanceof AtqlError) throw validation([error.message]);
      throw error;
    }
    const from = `from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id
                  join project p on p.id = a.project_id where p.key = $1 and ${compiled.where}`;
    return this.db.tx(organizationId, async (c) => {
      // Coût borné : délai maximal par requête dans cette transaction.
      await c.query("set local statement_timeout = '5s'");
      // Comptage borné : au-delà de COUNT_CAP résultats, le total est plafonné (totalCapped) pour garder un coût constant.
      const counted = Number((await c.query(`select count(*) n from (select 1 ${from} limit ${COUNT_CAP + 1}) c`, compiled.params.slice(0, compiled.whereParamCount))).rows[0].n);
      const totalCapped = counted > COUNT_CAP;
      const total = totalCapped ? COUNT_CAP : counted;
      const rows = (
        await c.query(
          `select a.key, t.key as tracker, s.key as status, s.name as status_name, s.category, a."values" as values, a.version, a.updated_at
           ${from} order by ${compiled.orderBy} limit ${limit} offset ${offset}`,
          compiled.params,
        )
      ).rows;
      return {
        total,
        totalCapped,
        hits: rows.map((r) => ({
          key: r.key, tracker: r.tracker, status: r.status, statusName: r.status_name, category: r.category,
          values: restricted.has(r.tracker) ? Object.fromEntries(Object.entries(r.values as Record<string, unknown>).filter(([k]) => !restricted.get(r.tracker)!.has(k))) : r.values,
          version: r.version, updatedAt: r.updated_at.toISOString(),
        })),
      };
    });
  }
}
