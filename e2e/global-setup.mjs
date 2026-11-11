import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, '../apps/api');
const require = createRequire(join(apiDir, 'package.json'));
const { Client, Pool } = require('pg');
const dist = (p) => require(join(apiDir, 'dist', p));

const env = readFileSync(join(here, '../deploy/dev/.env'), 'utf8');
const password = /^POSTGRES_PASSWORD=(.+)$/m.exec(env)[1].trim();
const url = (db, user = 'athena', pw = password) => `postgres://${user}:${encodeURIComponent(pw)}@127.0.0.1:5432/${db}`;

export const DB = 'athena_e2e';
export const APP_URL = url(DB, 'e2e_app', 'e2e-only');

/** Base jetable migrée, rôle applicatif sous RLS, organisation « demo » et un projet avec un tracker de bugs. */
/** Retire l'action requise TOTP de admin.dev (compte de développement) pour permettre une connexion automatisée. */
async function relaxAdminLogin() {
  const base = 'http://localhost:8080';
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: /^KEYCLOAK_ADMIN=(.+)$/m.exec(env)[1].trim(), password: /^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m.exec(env)[1].trim() });
  const token = (await (await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: form })).json()).access_token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const users = await (await fetch(`${base}/admin/realms/athena/users?username=admin.dev&exact=true`, { headers })).json();
  const target = `${base}/admin/realms/athena/users/${users[0].id}`;
  const previous = users[0].requiredActions ?? [];
  const put = (requiredActions) => fetch(target, { method: 'PUT', headers, body: JSON.stringify({ requiredActions }) });
  const res = await put([]);
  if (!res.ok) throw new Error(`Keycloak : mise à jour de admin.dev impossible (${res.status})`);
  // Un TOTP déjà enregistré par le compte déclencherait l'étape OTP, à la connexion (navigateur) comme pour les jetons des
  // tests (direct grant) : elle est désactivée le temps des tests, dans le seul realm de développement, puis rétablie par
  // global-teardown.mjs (lot 11).
  const realm = await (await fetch(`${base}/admin/realms/athena`, { headers })).json();
  const otp = [];
  for (const name of [realm.browserFlow, realm.directGrantFlow]) {
    const flow = encodeURIComponent(name);
    const executions = await (await fetch(`${base}/admin/realms/athena/authentication/flows/${flow}/executions`, { headers })).json();
    for (const e of executions.filter((x) => /otp/i.test(`${x.displayName} ${x.providerId ?? ''}`) && x.requirement !== 'DISABLED')) {
      const r = await fetch(`${base}/admin/realms/athena/authentication/flows/${flow}/executions`, { method: 'PUT', headers, body: JSON.stringify({ ...e, requirement: 'DISABLED' }) });
      if (!r.ok) throw new Error(`Keycloak : désactivation de l'étape OTP impossible (${r.status})`);
      otp.push({ ...e, flow: name });
    }
  }
  // Mémorise l'état d'origine : global-teardown.mjs le restaure après les tests. Un état déjà mémorisé (préparation relancée
  // sans fin de tests) est gardé, pour ne jamais enregistrer l'état modifié comme état d'origine.
  const file = join(here, '.admin-required-actions.json');
  const before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  writeFileSync(file, JSON.stringify({
    id: users[0].id,
    requiredActions: before?.requiredActions ?? previous,
    otp: [...(before?.otp ?? []), ...otp.filter((e) => !(before?.otp ?? []).some((b) => b.id === e.id)).map((e) => ({ id: e.id, flow: e.flow, requirement: e.requirement }))],
  }));
}

async function globalSetup() {
  await relaxAdminLogin();
  const root = new Client({ connectionString: url('postgres') });
  await root.connect();
  await root.query(`drop database if exists ${DB} with (force)`);
  await root.query(`create database ${DB}`);
  await root.end();
  await dist('db/migrate.js').migrate(url(DB));
  const owner = new Client({ connectionString: url(DB) });
  await owner.connect();
  await owner.query('drop role if exists e2e_app').catch(() => undefined);
  await owner.query("create role e2e_app login password 'e2e-only' nosuperuser nobypassrls in role athena_app");
  await owner.end();

  const pool = new Pool({ connectionString: APP_URL });
  const { Db } = dist('core/db.js');
  const { FieldTypeRegistry } = dist('core/field-types.js');
  const { TrackerService } = dist('core/tracker.service.js');
  const { ArtifactService } = dist('core/artifact.service.js');
  const db = new Db(pool);
  const registry = new FieldTypeRegistry();
  const trackers = new TrackerService(db, registry);
  const artifacts = new ArtifactService(db, trackers, registry);
  const org = crypto.randomUUID();
  const actor = { id: 'seed', roles: ['athena-user', 'athena-admin'] };
  await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1, 'demo', 'Démo')", [org]));
  await trackers.createProject(org, 'ARI', 'Ariane', actor);
  await trackers.createTracker(org, {
    projectKey: 'ARI', key: 'BUG', name: 'Bugs',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure', 'bloquante'] } },
    ],
    statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'done', name: 'Fini', category: 'done' }],
    transitions: [{ name: 'Terminer', from: 'open', to: 'done' }],
  }, actor);
  await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash au démarrage', severity: 'bloquante' }, actor);
  await pool.end();
}

await globalSetup();
