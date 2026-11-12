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
  await seedAgile(pool, db, trackers, artifacts);
  await pool.end();
}

/**
 * Démonstration agile (ADR-0003 § 2.6, T-0115) : projet NOVA avec un tracker Tâche, un backlog classé, un sprint actif et
 * un sprint planifié. Idempotent : rien n'est fait si le projet existe déjà (bases amorcées avant le Lot 9 comprises).
 */
async function seedAgile(pool, db, trackers, artifacts) {
  const org = (await pool.query("select organization_id_by_key('demo') as id")).rows[0].id;
  if (!org) return;
  const exists = await db.tx(org, async (c) => (await c.query("select 1 from project where key = 'NOVA'")).rowCount > 0);
  if (exists) return;
  const { SprintService } = dist('agile/sprint.service.js');
  const { BacklogService } = dist('agile/backlog.service.js');
  const actor = { id: 'seed', roles: ['athena-user', 'athena-admin'] };
  await trackers.createProject(org, 'NOVA', 'Nova (démonstration agile)', actor);
  await trackers.createTracker(org, {
    projectKey: 'NOVA', key: 'TSK', name: 'Tâches', typeKey: 'task',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'description', label: 'Description', type: 'richtext', semanticRole: 'description' },
      { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee', isContent: false },
      { key: 'priority', label: 'Priorité', type: 'select', config: { options: ['basse', 'moyenne', 'haute'] }, semanticRole: 'priority', isContent: false },
      { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date', isContent: false },
      { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date', isContent: false },
      { key: 'progress', label: 'Avancement (%)', type: 'number', config: { min: 0, max: 100 }, semanticRole: 'progress', isContent: false },
      { key: 'remaining', label: 'Reste à faire (jours)', type: 'number', config: { min: 0 }, semanticRole: 'remaining', isContent: false },
      { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate', isContent: false },
    ],
    statuses: [
      { key: 'todo', name: 'À faire', category: 'todo' },
      { key: 'doing', name: 'En cours', category: 'in_progress' },
      { key: 'done', name: 'Terminé', category: 'done' },
    ],
    transitions: [
      { name: 'Démarrer', from: 'todo', to: 'doing' },
      { name: 'Terminer', from: 'doing', to: 'done' },
      { name: 'Rouvrir', from: null, to: 'todo' },
    ],
  }, actor);
  const titles = [
    ['Écran de connexion', 5, 'haute'], ['Export CSV des tickets', 3, 'moyenne'], ['Notifications par courriel', 8, 'haute'],
    ['Thème sombre du tableau de bord', 2, 'basse'], ['Recherche par étiquette', 5, 'moyenne'], ['Historique des sprints', 3, 'basse'],
    ['Import depuis Jira', 13, 'haute'], ['Raccourcis clavier du board', 2, 'moyenne'],
  ];
  // Planning (ADR-0006, T-0159) : dates, avancement, reste à faire en jours ouvrés et dépendances « précède ».
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const plan = [[-6, -2, 100, 0], [-1, 2, 60, 2], [3, 7, 0, 5], [-1, 3, 25, 4], [0, 4, 10, 4], [5, 8, 0, 3], [8, 17, 0, 8], [3, 5, 0, 2]];
  const keys = [];
  for (const [i, [title, points, priority]] of titles.entries()) {
    const [from, to, progress, remaining] = plan[i];
    keys.push((await artifacts.create(org, 'NOVA', 'TSK', { title, points, priority, start: day(from), due: day(to), progress, remaining }, actor)).key);
  }
  const { LinkService } = dist('core/link.service.js');
  const links = new LinkService(db);
  for (const [a, b, lag] of [[0, 1, 0], [1, 2, 0], [0, 3, 0], [4, 5, 0], [2, 6, 1], [5, 6, 0], [3, 7, 0], [7, 6, 0]]) await links.link(org, 'NOVA', keys[a], keys[b], 'precedes', actor, lag);
  const sprints = new SprintService(db);
  const active = await sprints.create(org, 'NOVA', { name: 'Sprint 1', goal: 'Socle utilisable', startsOn: day(-5), endsOn: day(9) }, actor);
  for (const key of keys.slice(0, 3)) await sprints.addItem(org, active, key, 'NOVA', actor);
  await sprints.start(org, active, actor);
  const planned = await sprints.create(org, 'NOVA', { name: 'Sprint 2', goal: 'Import et recherche', startsOn: day(10), endsOn: day(23) }, actor);
  await sprints.addItem(org, planned, keys[6], 'NOVA', actor);
  // Backlog classé : la recherche passe en tête.
  await new BacklogService(db).rank(org, 'NOVA', keys[4], null, actor);
  console.log('démonstration agile amorcée : projet NOVA, tracker Tâches, backlog, sprints actif et planifié');
}

/** Garantit les rôles athena-pm et athena-qa et les comptes pm.dev et qa.dev sur un Keycloak déjà initialisé (l'import du royaume n'a lieu qu'une fois). */
async function ensureKeycloak() {
  const base = 'http://localhost:8080';
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: get('KEYCLOAK_ADMIN'), password: get('KEYCLOAK_ADMIN_PASSWORD') });
  const token = (await (await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: form })).json()).access_token;
  if (!token) { console.log('Keycloak : jeton administrateur indisponible, rôles athena-pm et athena-qa non vérifiés'); return; }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const api = (path, init = {}) => fetch(`${base}/admin/realms/athena${path}`, { headers, ...init });
  for (const [name, description] of [['athena-pm', 'Chef de projet'], ['athena-qa', 'Assurance qualité étatique (lecture seule, approbation des jalons et baselines)']]) {
    if ((await api(`/roles/${name}`)).status === 404) await api('/roles', { method: 'POST', body: JSON.stringify({ name, description }) });
  }
  const group = (await (await api('/groups?search=org-demo')).json())[0];
  for (const { username, password, firstName, lastName, roles: wanted } of [
    { username: 'pm.dev', password: 'dev-only-pm', firstName: 'Chef', lastName: 'Projet', roles: ['athena-pm', 'athena-user'] },
    { username: 'qa.dev', password: 'dev-only-qa', firstName: 'Assurance', lastName: 'Qualité', roles: ['athena-qa'] },
  ]) {
    let users = await (await api(`/users?username=${username}&exact=true`)).json();
    if (users.length === 0) {
      await api('/users', { method: 'POST', body: JSON.stringify({ username, enabled: true, email: `${username}@example.test`, emailVerified: true, firstName, lastName, credentials: [{ type: 'password', value: password, temporary: false }] }) });
      users = await (await api(`/users?username=${username}&exact=true`)).json();
    }
    const id = users[0].id;
    const roles = await Promise.all(wanted.map(async (n) => (await api(`/roles/${n}`)).json()));
    await api(`/users/${id}/role-mappings/realm`, { method: 'POST', body: JSON.stringify(roles) });
    if (group) await api(`/users/${id}/groups/${group.id}`, { method: 'PUT' });
  }
}

await ensureKeycloak().catch((e) => console.log(`Keycloak : ${e.message}`));
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
console.log('Athena démarre : http://localhost:3000  (utilisateurs : user.dev / dev-only-user ; admin.dev / dev-only-admin ; pm.dev / dev-only-pm ; qa.dev / dev-only-qa, assurance qualité étatique)');
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
