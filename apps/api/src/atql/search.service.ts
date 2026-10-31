import { Db } from '../core/db';
import { validation } from '../core/errors';
import { compile } from './compile';
import { AtqlError } from './parser';

export interface SearchHit {
  key: string;
  tracker: string;
  status: string;
  values: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

export interface SearchResult {
  total: number;
  hits: SearchHit[];
}

export class SearchService {
  constructor(private readonly db: Db) {}

  /** Exécute une requête ATQL dans le périmètre (RLS) de l'organisation et du projet. */
  async search(
    organizationId: string, projectKey: string, query: string, currentUser: string, limit = 50, offset = 0,
  ): Promise<SearchResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw validation(['limit : entre 1 et 200']);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw validation(['offset invalide']);
    let compiled;
    try {
      compiled = compile(query, { currentUser }, [projectKey]);
    } catch (error) {
      if (error instanceof AtqlError) throw validation([error.message]);
      throw error;
    }
    const from = `from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id
                  join project p on p.id = a.project_id where p.key = $1 and ${compiled.where}`;
    return this.db.tx(organizationId, async (c) => {
      // Coût borné : délai maximal par requête dans cette transaction.
      await c.query("set local statement_timeout = '5s'");
      const total = Number((await c.query(`select count(*) n ${from}`, compiled.params.slice(0, compiled.whereParamCount))).rows[0].n);
      const rows = (
        await c.query(
          `select a.key, t.key as tracker, s.key as status, a."values" as values, a.version, a.updated_at
           ${from} order by ${compiled.orderBy} limit ${limit} offset ${offset}`,
          compiled.params,
        )
      ).rows;
      return {
        total,
        hits: rows.map((r) => ({
          key: r.key, tracker: r.tracker, status: r.status, values: r.values, version: r.version, updatedAt: r.updated_at.toISOString(),
        })),
      };
    });
  }
}
