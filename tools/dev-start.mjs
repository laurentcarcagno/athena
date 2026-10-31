// Démarre Athena en local sur l'infra de développement (deploy/dev) : base `athena_dev` persistante (créée et amorcée
// au premier lancement), API (3001), worker, web Vite (3000).
// Usage : node tools/dev-start.mjs        (Ctrl+C arrête tout)
// Prérequis : `docker compose up -d` dans deploy/dev, `pnpm install`, `pnpm --filter @athena/api build`.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const apiDir = join(root, 'apps/api');
const require = createRequire(join(apiDir, 'package.json'));
const { Client, Pool } = require('pg');
const dist = (p) => require(join(apiDir, 'dist', p));

const env = readFileSync(join(root, 'deploy/dev/.env'), 'utf8');
const get = (name) => new RegExp(`^${name}=(.+)$`, 'm').exec(env)?.[1]?.trim();
const pw = get('POSTGRES_PASSWORD');
const url = (db, user = 'athena', password = pw) => `postgres://${user}:${encodeURIComponent(password)}@127.0.0.1:5432/${db}`;
const DB = 'athena_dev';
const APP = { user: 'athena_dev_app', password: 'dev-only-app' };

async function prepare() {
  const admin = new Client({ connectionString: url('postgres') });
  await admin.connect();
  const exists = (await admin.query('select 1 from pg_database where datname = $1', [DB])).rowCount > 0;
  if (!exists) await admin.query(`create database ${DB}`);
  await admin.end();
  await dist('db/migrate.js').migrate(url(DB));
  const owner = new Client({ connectionString: url(DB) });
  await owner.connect();
  const role = (await owner.query('select 1 from pg_roles where rolname = $1', [APP.user])).rowCount > 0;
  if (!role) await owner.query(`create role ${APP.user} login password '${APP.password}' nosuperuser nobypassrls in role athena_app`);
  await owner.end();

  const pool = new Pool({ connectionString: url(DB, APP.user, APP.password) });
  const { Db } = dist('core/db.js');
  const { FieldTypeRegistry } = dist('core/field-types.js');
  const { TrackerService } = dist('core/tracker.service.js');
  const { ArtifactService } = dist('core/artifact.service.js');
  const { bugTemplate } = dist('core/templates.js');
  const db = new Db(pool);
  const registry = new FieldTypeRegistry();
  const trackers = new TrackerService(db, registry);
  const artifacts = new ArtifactService(db, trackers, registry);
  // L'organisation « demo » correspond au groupe Keycloak /org-demo des utilisateurs de développement.
  const hasOrg = (await pool.query("select organization_id_by_key('demo') as id")).rows[0].id;
  if (!hasOrg) {
    const org = crypto.randomUUID();
    const actor = { id: 'seed', roles: ['athena-user', 'athena-admin'] };
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1, 'demo', 'Démo')", [org]));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, bugTemplate('ARI'), actor);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Premier bug de démonstration', severity: 'majeure' }, actor);
    console.log('base athena_dev amorcée : organisation demo, projet ARI, tracker BUG');
  }
  await pool.end();
}

await prepare();

const apiEnv = {
  ...process.env,
  PORT: '3001', HOST: '127.0.0.1',
  DATABASE_URL: url(DB, APP.user, APP.password),
  KEYCLOAK_ISSUER: 'http://localhost:8080/realms/athena',
  KEYCLOAK_WEB_CLIENT_SECRET: 'dev-only-athena-web-secret',
  SESSION_SECRET: 'dev-only-session-secret-0123456789abcdef',
  COOKIE_SECURE: 'false', PUBLIC_URL: 'http://localhost:3001', WEB_ORIGIN: 'http://localhost:3000', CORS_ORIGIN: 'http://localhost:3000',
  S3_ENDPOINT: 'http://127.0.0.1:9000', S3_ACCESS_KEY: get('MINIO_ROOT_USER'), S3_SECRET_KEY: get('MINIO_ROOT_PASSWORD'), S3_BUCKET: 'athena-dev',
  OPENBAO_ADDR: 'http://127.0.0.1:8200', OPENBAO_TOKEN: get('BAO_DEV_ROOT_TOKEN'),
  GITLAB_URL: 'http://127.0.0.1:8929', GITLAB_TOKEN: get('GITLAB_DEV_TOKEN'), GITLAB_NAMESPACE: 'root',
  WEBHOOK_ALLOW_PRIVATE: 'true',
};
const procs = [
  ['api', process.execPath, [join(apiDir, 'dist/main.js')], apiEnv, apiDir],
  ['worker', process.execPath, [join(apiDir, 'dist/worker.js')], { ...apiEnv, WORKER_HEALTH_PORT: '3002' }, apiDir],
  ['web', process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--port', '3000', '--strictPort'], { ...process.env, ATHENA_API_URL: 'http://127.0.0.1:3001' }, join(root, 'apps/web')],
].map(([name, cmd, args, e, cwd]) => {
  const child = spawn(cmd, args, { env: e, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = (d) => String(d).split('\n').filter((l) => l.trim()).forEach((l) => console.log(`[${name}] ${l.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 200)}`));
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  child.on('exit', (code) => console.log(`[${name}] arrêté (${code})`));
  return child;
});
console.log('Athena démarre : http://localhost:3000  (utilisateurs : user.dev / dev-only-user ; admin.dev / dev-only-admin, TOTP à configurer)');
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
