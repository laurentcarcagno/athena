import type { Pool, PoolClient } from 'pg';

/** Exécute `fn` dans une transaction avec l'organisation courante positionnée (RLS). */
export class Db {
  constructor(private readonly pool: Pool) {}

  async tx<T>(organizationId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true)", [organizationId]);
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
