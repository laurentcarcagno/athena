import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applique les migrations SQL dans l'ordre, une transaction chacune.
 * Une migration déjà appliquée dont le contenu a changé fait échouer le démarrage.
 */
export async function migrate(
  connectionString: string,
  directory: string = join(__dirname, 'migrations'),
): Promise<MigrationResult> {
  const client = new Client({ connectionString });
  await client.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query('select pg_advisory_lock(7447001)');
    await client.query(`create table if not exists schema_migration (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const done = new Map<string, string>(
      (await client.query('select name, checksum from schema_migration')).rows.map(
        (row: { name: string; checksum: string }) => [row.name, row.checksum] as [string, string],
      ),
    );
    const files = readdirSync(directory).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = readFileSync(join(directory, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const known = done.get(file);
      if (known !== undefined) {
        if (known !== checksum) throw new Error(`Migration modifiée après application : ${file}`);
        result.skipped.push(file);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migration (name, checksum) values ($1, $2)', [file, checksum]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Échec de ${file} : ${(error as Error).message}`);
      }
      result.applied.push(file);
    }
    return result;
  } finally {
    await client.query('select pg_advisory_unlock(7447001)').catch(() => undefined);
    await client.end();
  }
}
