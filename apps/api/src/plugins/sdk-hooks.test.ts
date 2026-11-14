import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { generateKeys, pack, verifyPackage as sdkVerify } from '../../../../packages/plugin-sdk/src/index.js';
import { verifyPackage } from './manifest';
import { PluginService } from './plugin.service';

const admin: Actor = { id: 'u-admin', roles: ['athena-team-member', 'athena-admin'] };
const CLI = join(__dirname, '../../../../packages/plugin-sdk/bin/athena-plugin.mjs');

describe('SDK de plugin et CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'athena-sdk-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  it('crée un plugin, des clés, un paquet signé et le vérifie', () => {
    run('init', join(dir, 'p'));
    run('keygen', join(dir, 'cle'));
    expect(run('pack', join(dir, 'p'), '--key', `${dir}/cle.key`)).toContain('paquet signé');
    const file = join(dir, 'p', 'dist', 'com.exemple.couleurs-0.1.0.athena.json');
    expect(run('verify', file, '--pub', `${dir}/cle.pub`).trim()).toBe('signature valide');
    // altération → refus
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    const tampered = join(dir, 'altere.json');
    require('node:fs').writeFileSync(tampered, JSON.stringify({ ...pkg, code: `${pkg.code}// x` }));
    expect(() => run('verify', tampered, '--pub', `${dir}/cle.pub`)).toThrow(/signature invalide/);
  });

  it('refuse d’écraser des clés existantes et un plugin existant', () => {
    expect(() => run('keygen', join(dir, 'cle'))).toThrow(/existe déjà/);
    expect(() => run('init', join(dir, 'p'))).toThrow(/déjà un plugin/);
    expect(existsSync(`${dir}/cle.key`)).toBe(true);
  });

  it('produit des paquets que le serveur accepte (même représentation signée)', () => {
    const keys = generateKeys();
    const manifest = { id: 'com.acme.compat', name: 'Compat', version: '1.0.0', athena: '>=1.0.0', publisher: 'acme', permissions: [], contributes: { fieldTypes: [], hooks: [] } };
    const pkg = pack(manifest as never, 'plugin = {};', keys.privateKey);
    expect(sdkVerify(pkg, keys.publicKey)).toBe(true);
    expect(verifyPackage(pkg, { publishers: { acme: keys.publicKey } })).toMatchObject({ ok: true });
    expect(verifyPackage({ ...pkg, code: 'plugin = {x:1};' }, { publishers: { acme: keys.publicKey } })).toEqual({ ok: false, reason: 'signature invalide' });
  });

  it('refuse un manifeste incomplet à l’emballage', () => {
    expect(() => pack({ id: 'mauvais id' } as never, '', generateKeys().privateKey)).toThrow(/champ manquant/);
  });
});

const suite = pgUp ? describe : describe.skip;

suite('hooks de plugins déclenchés par l’outbox (intégration)', () => {
  let testDb: TestDb;
  let plugins: PluginService;
  let artifacts: ArtifactService;
  let db: Db;
  const org = crypto.randomUUID();
  const keys = generateKeys();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_hooks');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    plugins = new PluginService(db, registry, { publishers: { acme: keys.publicKey } }, { read: async () => null });
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'hooks']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    const manifest = { id: 'com.acme.audit', name: 'Audit', version: '1.0.0', athena: '>=1.0.0', publisher: 'acme', permissions: ['storage'], contributes: { fieldTypes: [], hooks: ['artifact.created', 'artifact.updated'] } };
    const code = `plugin = { hooks: {
      'artifact.created': async (e) => { await athena.storage.set('creation:' + e.key, JSON.stringify(e)); },
      'artifact.updated': async () => { throw new Error('échec volontaire'); },
    } };`;
    await plugins.install(org, pack(manifest as never, code, keys.privateKey), ['storage'], admin);
    await plugins.loadEnabled(org);
  }, 60_000);
  afterAll(async () => {
    plugins?.shutdown();
    await testDb?.drop();
  });

  it('exécute le hook sans transmettre les valeurs des champs, et tolère l’échec d’un autre hook', async () => {
    const created = await artifacts.create(org, 'ARI', 'BUG', { title: 'Secret commercial', severity: 'majeure' }, admin);
    await artifacts.update(org, 'ARI', created.key, { severity: 'mineure' }, 1, admin);
    const delivered = await plugins.dispatchHooks(org);
    expect(delivered).toBe(1); // created exécuté ; updated en échec (journalisé), non compté
    const stored = (await db.tx(org, (c) => c.query("select value from plugin_storage where key = 'creation:ARI-BUG-0001'"))).rows[0].value as string;
    const payload = JSON.parse(stored);
    expect(payload).toMatchObject({ type: 'artifact.created', key: 'ARI-BUG-0001', project: 'ARI', version: 1, actor: 'u-admin' });
    expect(payload.changedFields.sort()).toEqual(['severity', 'title']);
    expect(stored).not.toContain('Secret commercial'); // jamais les valeurs
    expect(await plugins.dispatchHooks(org)).toBe(0); // événements marqués : pas de rejeu
  }, 60_000);
});
