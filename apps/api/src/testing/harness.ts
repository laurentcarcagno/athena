import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { migrate } from '../db/migrate';

const envFile = (() => {
  try {
    return readFileSync(join(__dirname, '../../../../deploy/dev/.env'), 'utf8');
  } catch {
    return '';
  }
})();

export const fromEnv = (name: string): string | undefined =>
  process.env[name] ?? new RegExp(`^${name}=(.+)$`, 'm').exec(envFile)?.[1]?.trim();

const password = fromEnv('POSTGRES_PASSWORD');
export const ADMIN_URL: string | undefined =
  process.env['ATHENA_TEST_ADMIN_URL'] ??
  (password ? `postgres://athena:${encodeURIComponent(password)}@127.0.0.1:5432/postgres` : undefined);

export const probe = (script: string, env: Record<string, string>): boolean =>
  spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, ...env },
    cwd: join(__dirname, '../..'),
    timeout: 8000,
  }).status === 0;

export const pgUp =
  ADMIN_URL !== undefined &&
  probe(
    "const {Client}=require('pg');const c=new Client({connectionString:process.env.U,connectionTimeoutMillis:1500});c.connect().then(()=>c.end()).then(()=>process.exit(0),()=>process.exit(1))",
    { U: ADMIN_URL },
  );
if (!pgUp && process.env['CI']) throw new Error('PostgreSQL requis en CI');

export function urlFor(database: string, user?: string, userPassword?: string): string {
  const url = new URL(ADMIN_URL!);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user;
    url.password = userPassword ?? '';
  }
  return url.toString();
}

export interface TestDb {
  /** Pool connecté avec le rôle applicatif (RLS appliquée). */
  pool: Pool;
  /** Exécute une requête avec les droits du propriétaire (hors RLS), pour préparer ou antidater des données de test. */
  exec(sql: string, params?: unknown[]): Promise<void>;
  drop(): Promise<void>;
}

/** Crée une base jetable migrée, et un rôle applicatif sans privilège particulier. */
export async function createTestDb(name: string): Promise<TestDb> {
  // Nom unique par processus : deux exécutions simultanées de la série ne se détruisent plus mutuellement la base.
  const database = `${name}_${process.pid.toString(36)}`.slice(0, 55);
  const role = `${database}_app`.slice(0, 60);
  const secret = 'harness-test-only';
  const root = new Client({ connectionString: ADMIN_URL });
  await root.connect();
  await root.query(`drop database if exists ${database} with (force)`);
  await root.query(`create database ${database}`);
  await root.end();
  await migrate(urlFor(database));
  const admin = new Pool({ connectionString: urlFor(database), max: 1 });
  await admin.query(`drop role if exists ${role}`).catch(() => undefined);
  await admin.query(`create role ${role} login password '${secret}' nosuperuser nobypassrls in role athena_app`);
  await admin.end();
  const pool = new Pool({ connectionString: urlFor(database, role, secret), max: 8 });
  return {
    pool,
    async exec(sql: string, params: unknown[] = []) {
      const owner = new Client({ connectionString: urlFor(database) });
      await owner.connect();
      try {
        await owner.query(sql, params);
      } finally {
        await owner.end();
      }
    },
    async drop() {
      await pool.end();
      const cleanup = new Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${database} with (force)`);
      await cleanup.query(`drop role if exists ${role}`);
      await cleanup.end();
    },
  };
}
