import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { signPackage } from './manifest';
import { PluginService, QUOTA } from './plugin.service';

const suite = pgUp ? describe : describe.skip;
const keys = generateKeyPairSync('ed25519');
const trust = { publishers: { acme: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } };
const admin: Actor = { id: 'u-admin', roles: ['athena-admin'] };

const manifest = (over: Record<string, unknown> = {}) => ({
  id: 'com.acme.colors', name: 'Couleurs', version: '1.0.0', athena: '>=1.0.0', publisher: 'acme', permissions: ['storage'],
  contributes: { fieldTypes: ['hex-color'], hooks: [] }, ...over,
});
const CODE = `plugin = { fieldTypes: { 'hex-color': {
  validate: async (value) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return 'couleur #RRGGBB attendue';
    const n = ((await athena.storage.get('compteur')) || 0) + 1;
    await athena.storage.set('compteur', n);
    return null;
  },
} } };`;
const pkg = (m: Record<string, unknown>, code = CODE) => ({ manifest: m, code, signature: signPackage(m, code, keys.privateKey) });

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('service de plugins (intégration)', () => {
  let testDb: TestDb;
  let plugins: PluginService;
  let artifacts: ArtifactService;
  let db: Db;
  const org = crypto.randomUUID();
  const TYPE = 'com.acme.colors.hex-color';

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_plugins');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    plugins = new PluginService(db, registry, trust, { read: async (_o, ref) => ({ ref }) });
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'plug']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    (globalThis as { __trackers?: TrackerService }).__trackers = trackers;
  }, 30_000);
  afterAll(async () => {
    plugins?.shutdown();
    await testDb?.drop();
  });

  it('refuse un paquet non signé, altéré ou demandant plus de permissions que déclaré', async () => {
    const good = pkg(manifest());
    expect(await code(plugins.install(org, { ...good, code: `${CODE}//x` }, [], admin))).toMatch(/validation.*signature invalide/);
    expect(await code(plugins.install(org, good, ['artifacts:read'], admin))).toMatch(/validation.*non déclarées/);
    expect(await code(plugins.install(org, pkg(manifest({ publisher: 'inconnu' })), [], admin))).toMatch(/éditeur non reconnu/);
  });

  it('installe, démarre et fournit un type de champ utilisable dans un tracker', async () => {
    expect(await plugins.install(org, pkg(manifest()), ['storage'], admin)).toEqual({ id: 'com.acme.colors', version: '1.0.0' });
    expect(await plugins.loadEnabled(org)).toEqual(['com.acme.colors']);
    const trackers = (globalThis as { __trackers?: TrackerService }).__trackers!;
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'BRAND', name: 'Charte',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'color', label: 'Couleur', type: TYPE }],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
    }, admin);
    const ok = await artifacts.create(org, 'ARI', 'BRAND', { title: 'Bleu', color: '#12293A' }, admin);
    expect(ok.key).toBe('BRAND-1');
    expect(await code(artifacts.create(org, 'ARI', 'BRAND', { title: 'Rouge', color: 'rouge' }, admin))).toMatch(/validation.*couleur #RRGGBB attendue/);
  }, 30_000);

  it('persiste le stockage du plugin dans la base, isolé par organisation', async () => {
    const rows = await db.tx(org, (c) => c.query("select value from plugin_storage where plugin_id = 'com.acme.colors' and key = 'compteur'"));
    expect(Number(rows.rows[0].value)).toBe(1);
    const other = await db.tx(crypto.randomUUID(), (c) => c.query('select * from plugin_storage'));
    expect(other.rowCount).toBe(0);
  });

  it('refuse une version non supérieure, accepte une mise à jour', async () => {
    expect(await code(plugins.install(org, pkg(manifest()), ['storage'], admin))).toMatch(/conflict.*non supérieure/);
    expect((await plugins.install(org, pkg(manifest({ version: '1.1.0' })), ['storage'], admin)).version).toBe('1.1.0');
  });

  it('échoue fermé quand le plugin est arrêté', async () => {
    await plugins.stop(org, 'com.acme.colors');
    expect(await code(artifacts.create(org, 'ARI', 'BRAND', { title: 'Vert', color: '#00ff00' }, admin))).toMatch(/validation.*validation indisponible/);
  });

  it('refuse de démarrer un plugin dont le code a été altéré en base', async () => {
    await testDb.exec("update plugin_installation set code = code || ' //altéré'");
    const started = await plugins.loadEnabled(org);
    expect(started).toEqual([]);
  });

  it('applique les quotas de stockage', async () => {
    const storing = `plugin = { fieldTypes: { 'hex-color': { validate: async (v) => { await athena.storage.set(v.key, v.value); return null; } } } };`;
    const m = manifest({ id: 'com.acme.quota', version: '1.0.0' });
    await plugins.install(org, pkg(m, storing), ['storage'], admin);
    await plugins.loadEnabled(org);
    const run = (value: unknown) => artifacts['fieldTypes'].validate('com.acme.quota.hex-color', value, {}) as Promise<string | null>;
    expect(await run({ key: 'a', value: 'x'.repeat(100) })).toBeNull();
    expect(await run({ key: 'b', value: 'x'.repeat(QUOTA.maxValueBytes + 10) })).toMatch(/indisponible/);
    for (let i = 0; i < QUOTA.maxKeys + 5; i++) await run({ key: `k${i}`, value: 1 });
    const count = await db.tx(org, (c) => c.query("select count(*)::int n from plugin_storage where plugin_id = 'com.acme.quota'"));
    expect(count.rows[0].n).toBeLessThanOrEqual(QUOTA.maxKeys);
  }, 120_000);

  it('désactive un plugin et le liste', async () => {
    await plugins.setEnabled(org, 'com.acme.quota', false, admin);
    const list = await plugins.list(org);
    expect(list.find((p) => p.id === 'com.acme.quota')).toMatchObject({ enabled: false });
    expect(await code(plugins.setEnabled(org, 'com.inconnu.x', true, admin))).toMatch(/not_found/);
  });

  it('exécute actions et widgets déclarés, jamais ceux qui ne le sont pas', async () => {
    const m = manifest({ id: 'com.acme.ext', version: '1.0.0', contributes: { fieldTypes: [], hooks: [], actions: ['notifier'], widgets: ['stats'] } });
    const extCode = `plugin = {
      actions: { notifier: async (p) => { await athena.storage.set('dernier', p.key); return { ok: true, key: p.key, by: p.actor }; }, secret: async () => 'non déclarée' },
      widgets: { stats: async (ctx) => ({ kind: 'stat', label: 'Projet ' + ctx.project, value: 42 }) },
    };`;
    await plugins.install(org, pkg(m, extCode), ['storage'], admin);
    expect(await plugins.runAction(org, 'com.acme.ext', 'notifier', { key: 'BRAND-1', version: 1 }, admin)).toEqual({ ok: true, key: 'BRAND-1', by: 'u-admin' });
    expect(await plugins.widget(org, 'com.acme.ext', 'stats', 'ARI')).toEqual({ kind: 'stat', label: 'Projet ARI', value: 42 });
    expect(await plugins.widgets(org)).toEqual([{ plugin: 'com.acme.ext', name: 'stats', title: 'Couleurs · stats' }]);
    expect(await code(plugins.runAction(org, 'com.acme.ext', 'secret', {}, admin))).toMatch(/validation.*inconnu/);
    expect(await code(plugins.widget(org, 'com.acme.ext', 'absent', 'ARI'))).toMatch(/validation/);
    expect(await code(plugins.runAction(org, 'com.absent.x', 'notifier', {}, admin))).toMatch(/not_found/);
  }, 30_000);

  it('désinstalle avec politique de données et refuse si un type de champ est utilisé', async () => {
    await plugins.setEnabled(org, 'com.acme.colors', true, admin);
    expect(await code(plugins.uninstall(org, 'com.acme.colors', admin))).toMatch(/conflict.*Désinstallation refusée/);
    const keep = await db.tx(org, (c) => c.query("select count(*)::int n from plugin_storage where plugin_id = 'com.acme.ext'"));
    expect(keep.rows[0].n).toBe(1);
    await plugins.uninstall(org, 'com.acme.ext', admin, true); // conserve les données
    expect((await db.tx(org, (c) => c.query("select count(*)::int n from plugin_storage where plugin_id = 'com.acme.ext'"))).rows[0].n).toBe(1);
    expect((await plugins.list(org)).some((p) => p.id === 'com.acme.ext')).toBe(false);
    await plugins.uninstall(org, 'com.acme.quota', admin); // purge par défaut
    expect((await db.tx(org, (c) => c.query("select count(*)::int n from plugin_storage where plugin_id = 'com.acme.quota'"))).rows[0].n).toBe(0);
    expect(await code(plugins.uninstall(org, 'com.acme.quota', admin))).toMatch(/not_found/);
  }, 30_000);

  it('exécute un connecteur : le plugin transforme, l’hôte valide la forme et le nombre d’enregistrements', async () => {
    const m = manifest({ id: 'com.acme.conn', version: '1.0.0', permissions: [], contributes: { fieldTypes: [], hooks: [], connectors: ['jira'] } });
    const connCode = `plugin = { connectors: { jira: async (p) => p.issues.map((i) => i.bad ? { tracker: 'nope' } : ({ tracker: 'BRAND', values: { title: i.summary, color: '#112233' } })) } };`;
    await plugins.install(org, pkg(m, connCode), [], admin);
    const ok = await plugins.runConnector(org, 'com.acme.conn', 'jira', { issues: [{ summary: 'Un' }, { summary: 'Deux' }] });
    expect(ok).toEqual([{ tracker: 'BRAND', values: { title: 'Un', color: '#112233' } }, { tracker: 'BRAND', values: { title: 'Deux', color: '#112233' } }]);
    expect(await code(plugins.runConnector(org, 'com.acme.conn', 'jira', { issues: [{ bad: true }] }))).toMatch(/validation.*enregistrement 0 invalide/);
    expect(await code(plugins.runConnector(org, 'com.acme.conn', 'jira', { issues: Array.from({ length: 51 }, () => ({ summary: 'x' })) }))).toMatch(/50 enregistrements/);
    expect(await code(plugins.runConnector(org, 'com.acme.conn', 'autre', {}))).toMatch(/validation.*inconnu/);
  }, 30_000);
});
