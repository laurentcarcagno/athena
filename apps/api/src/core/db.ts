import type { Pool, PoolClient } from 'pg';
import { currentSubject } from './request-context';

/**
 * Exécute `fn` dans une transaction avec l'organisation courante positionnée (RLS). Dans une requête authentifiée, le sujet
 * courant est posé avec les projets et trackers que les listes d'ayants droit lui refusent : les politiques restrictives de la
 * base filtrent alors chaque lecture et chaque écriture. `system: true` ignore le sujet (gestion des listes, traitements système).
 */
export class Db {
  constructor(private readonly pool: Pool) {}

  async tx<T>(organizationId: string, fn: (client: PoolClient) => Promise<T>, options: { system?: boolean } = {}): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true)", [organizationId]);
      const subject = options.system ? undefined : currentSubject();
      if (subject !== undefined) {
        // projets où le sujet n'est pas ayant droit du marquage de contrôle export et qui ont des items marqués (calculé avant de poser les refus)
        const deniedExport = (await client.query(
          `select coalesce(string_agg(p.id::text, ','), '') as ids from project p
           where exists (select 1 from artifact a where a.project_id = p.id and a.export_control is not null)
             and not exists (select 1 from export_control_member m where m.project_id = p.id and m.subject = $1)`, [subject])).rows[0].ids as string;
        await client.query(
          `select set_config('app.subject', $1, true), set_config('app.denied_export', $2, true),
                  set_config('app.denied_projects', coalesce(string_agg(l.project_id::text, ',') filter (where l.tracker_id is null), ''), true),
                  set_config('app.denied_trackers', coalesce(string_agg(l.tracker_id::text, ',') filter (where l.tracker_id is not null), ''), true)
           from access_list l
           where not exists (select 1 from access_list_member m where m.access_list_id = l.id and m.subject = $1)`,
          [subject, deniedExport],
        );
      }
      const value = await fn(client);
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export interface Actor {
  id: string;
  roles: string[];
}
