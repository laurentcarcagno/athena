import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { bugTemplate, requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

function adminUrl(): string | undefined {
  if (process.env['ATHENA_TEST_ADMIN_URL']) return process.env['ATHENA_TEST_ADMIN_URL'];
  try {
    const env = readFileSync(join(__dirname, '../../../../deploy/dev/.env'), 'utf8');
    const password = /^POSTGRES_PASSWORD=(.+)$/m.exec(env)?.[1];
    if (password) return `postgres://athena:${encodeURIComponent(password.trim())}@127.0.0.1:5432/postgres`;
  } catch { /* pas de .env de dev */ }
  return undefined;
}
const ADMIN = adminUrl();
const reachable =
  ADMIN !== undefined &&
  spawnSync(process.execPath, ['-e', "const {Client}=require('pg');const c=new Client({connectionString:process.env.PROBE_URL,connectionTimeoutMillis:1500});c.connect().then(()=>c.end()).then(()=>process.exit(0),()=>process.exit(1))"],
    { env: { ...process.env, PROBE_URL: ADMIN }, cwd: join(__dirname, '../..'), timeout: 5000 }).status === 0;
if (!reachable && process.env['CI']) throw new Error('PostgreSQL requis en CI');
const suite = reachable ? describe : describe.skip;

// Noms uniques par processus (voir core-http.test.ts).
const DB = `athena_test_core_${process.pid.toString(36)}`;
const APP_USER = `athena_app_core_${process.pid.toString(36)}`;
const withDb = (database: string, user?: string, password?: string) => {
  const url = new URL(ADMIN!);
  url.pathname = `/${database}`;
  if (user) { url.username = user; url.password = password ?? ''; }
  return url.toString();
};

const dev: Actor = { id: 'u-dev', roles: ['athena-user'] };
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };

async function expectDomain(promise: Promise<unknown>, code: DomainError['code'], text?: RegExp) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  if (text) expect(`${(error as DomainError).message} ${(error as DomainError).details.join(' ')}`).toMatch(text);
}

suite('services du noyau', () => {
  let pool: Pool;
  let trackers: TrackerService;
  let artifacts: ArtifactService;
  let adminPool: Pool;
  const org = crypto.randomUUID();
  const registry = new FieldTypeRegistry();

  beforeAll(async () => {
    const root = new Client({ connectionString: ADMIN });
    await root.connect();
    await root.query(`drop database if exists ${DB} with (force)`);
    await root.query(`create database ${DB}`);
    await root.end();
    await migrate(withDb(DB));
    adminPool = new Pool({ connectionString: withDb(DB), max: 2 });
    await adminPool.query(`drop role if exists ${APP_USER}`).catch(() => undefined);
    await adminPool.query(`create role ${APP_USER} login password 'core-test-only' nosuperuser nobypassrls in role athena_app`);
    pool = new Pool({ connectionString: withDb(DB, APP_USER, 'core-test-only'), max: 10 });
    const db = new Db(pool);
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1, $2, $2)', [org, 'org-core']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    await trackers.createTracker(org, requirementTemplate('ARI'), admin);
  });

  afterAll(async () => {
    await pool?.end();
    await adminPool?.end();
    const root = new Client({ connectionString: ADMIN });
    await root.connect();
    await root.query(`drop database if exists ${DB} with (force)`);
    await root.query(`drop role if exists ${APP_USER}`);
    await root.end();
  });

  it('plusieurs trackers coexistent dans un projet', async () => {
    const n = await pool.query('select 1');
    expect(n.rowCount).toBe(1);
    const bug = await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash', severity: 'majeure' }, dev);
    const req = await artifacts.create(org, 'ARI', 'REQ', { title: 'Journal', statement: 'Le système journalise.' }, dev);
    expect(bug.key).toBe('BUG-1');
    expect(req.key).toBe('REQ-1');
    expect(bug.status).toBe('open');
    expect(req.status).toBe('draft');
  });

  it('refuse un tracker invalide', async () => {
    const bad = { ...bugTemplate('ARI', 'BAD'), fields: [{ key: 'x', label: 'x', type: 'inconnu' }], statuses: [{ key: 'done', name: 'Fini', category: 'done' as const }] };
    await expectDomain(trackers.createTracker(org, bad, admin), 'validation', /type inconnu.*todo/s);
    await expectDomain(trackers.createTracker(org, bugTemplate('NOPE', 'ZZ'), admin), 'not_found');
  });

  it('valide les valeurs selon les types de champ', async () => {
    await expectDomain(artifacts.create(org, 'ARI', 'BUG', { severity: 'majeure' }, dev), 'validation', /title : obligatoire/);
    await expectDomain(artifacts.create(org, 'ARI', 'BUG', { title: 't', severity: 'fatale' }, dev), 'validation', /hors liste/);
    await expectDomain(artifacts.create(org, 'ARI', 'BUG', { title: 't', severity: 'mineure', inconnu: 1 }, dev), 'validation', /champ inconnu/);
  });

  it('modifie avec verrou optimiste, révision et événement', async () => {
    const a = await artifacts.create(org, 'ARI', 'BUG', { title: 'Lent', severity: 'mineure' }, dev);
    const updated = await artifacts.update(org, 'ARI', a.key, { severity: 'bloquante' }, 1, dev);
    expect(updated.version).toBe(2);
    await expectDomain(artifacts.update(org, 'ARI', a.key, { severity: 'majeure' }, 1, dev), 'conflict', /Version attendue 1/);
    const noop = await artifacts.update(org, 'ARI', a.key, { severity: 'bloquante' }, 2, dev);
    expect(noop.version).toBe(2);
    const hidden = await pool.query('select * from artifact_revision');
    expect(hidden.rowCount).toBe(0); // sans organisation positionnée, la RLS masque tout
    const events = await new Db(pool).tx(org, (c) => c.query("select type from outbox_event where payload->>'key' = $1 order by created_at", [a.key]));
    expect(events.rows.map((r) => r.type)).toEqual(['artifact.created', 'artifact.updated']);
  });

  it('applique le workflow : validateurs, conditions de rôle, transitions interdites', async () => {
    const a = await artifacts.create(org, 'ARI', 'BUG', { title: 'Workflow', severity: 'majeure' }, dev);
    await expectDomain(artifacts.transition(org, 'ARI', a.key, 'Démarrer', 1, dev), 'validation', /assignee/);
    await expectDomain(artifacts.transition(org, 'ARI', a.key, 'Résoudre', 1, dev), 'conflict', /impossible/);
    const withOwner = await artifacts.update(org, 'ARI', a.key, { assignee: 'u-dev' }, 1, dev);
    const started = await artifacts.transition(org, 'ARI', a.key, 'Démarrer', withOwner.version, dev);
    expect(started.status).toBe('in_progress');
    const review = await artifacts.transition(org, 'ARI', a.key, 'Soumettre à revue', started.version, dev);
    await expectDomain(artifacts.transition(org, 'ARI', a.key, 'Résoudre', review.version, dev), 'validation', /root_cause/);
    const documented = await artifacts.update(org, 'ARI', a.key, { root_cause: 'Fuite de connexion' }, review.version, dev);
    const resolved = await artifacts.transition(org, 'ARI', a.key, 'Résoudre', documented.version, dev);
    await expectDomain(artifacts.transition(org, 'ARI', a.key, 'Livrer', resolved.version, dev), 'forbidden', /réservée/);
    const delivered = await artifacts.transition(org, 'ARI', a.key, 'Livrer', resolved.version, admin);
    expect(delivered.status).toBe('delivered');
    const reopened = await artifacts.transition(org, 'ARI', a.key, 'Rouvrir', delivered.version, dev);
    expect(reopened.status).toBe('open');
  });

  it("chaque opération laisse une trace d'audit chaînée", async () => {
    const rows = await new Db(pool).tx(org, (c) => c.query('select prev_hash, hash, action from audit_log order by seq'));
    expect(rows.rowCount).toBeGreaterThan(10);
    rows.rows.forEach((r, i) => {
      if (i === 0) expect(r.prev_hash).toBeNull();
      else expect(r.prev_hash).toBe(rows.rows[i - 1].hash);
    });
  });

  it('numérotation sans doublon sous création concurrente', async () => {
    const created = await Promise.all(
      Array.from({ length: 15 }, (_, i) => artifacts.create(org, 'ARI', 'REQ', { title: `R${i}`, statement: 's' }, dev)),
    );
    expect(new Set(created.map((a) => a.key)).size).toBe(15);
  });

  it('un type de champ de plugin peut être enregistré', () => {
    registry.register('plugin.hex-color', { validate: (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? null : 'couleur attendue') });
    expect(registry.validate('plugin.hex-color', '#12293A', {})).toBeNull();
    expect(registry.validate('plugin.hex-color', 'rouge', {})).toBe('couleur attendue');
    expect(() => registry.register('text', { validate: () => null })).toThrow(/déjà/);
  });
});
