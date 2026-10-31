import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginCrashed, PluginError, PluginHost, PluginTimeout, type PluginApi } from './host';
import { ManifestSchema, signPackage, verifyPackage, type Manifest, type Permission } from './manifest';

const keys = generateKeyPairSync('ed25519');
const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const trust = { publishers: { acme: publicPem } };

const manifest = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'com.acme.colors', name: 'Couleurs', version: '1.0.0', athena: '>=1.0.0', publisher: 'acme', permissions: [],
  contributes: { fieldTypes: ['hex-color'], hooks: [] }, ...overrides,
});

const HEX_PLUGIN = `plugin = { fieldTypes: { 'hex-color': { validate(value) { return /^#[0-9a-f]{6}$/i.test(value) ? null : 'couleur #RRGGBB attendue'; } } } };`;

describe('manifeste et signature', () => {
  const pkg = (m: Record<string, unknown>, code: string) => ({ manifest: m, code, signature: signPackage(m, code, keys.privateKey) });

  it('accepte un paquet signé par un éditeur reconnu', () => {
    const result = verifyPackage(pkg(manifest(), HEX_PLUGIN), trust);
    expect(result.ok).toBe(true);
  });
  it('refuse un code modifié après signature', () => {
    const signed = pkg(manifest(), HEX_PLUGIN);
    expect(verifyPackage({ ...signed, code: `${HEX_PLUGIN} /* altéré */` }, trust)).toEqual({ ok: false, reason: 'signature invalide' });
  });
  it('refuse un manifeste modifié (permissions élargies) après signature', () => {
    const signed = pkg(manifest(), HEX_PLUGIN);
    const tampered = { ...signed, manifest: manifest({ permissions: ['storage'] }) };
    expect(verifyPackage(tampered, trust)).toEqual({ ok: false, reason: 'signature invalide' });
  });
  it('refuse un éditeur inconnu et une signature d’un autre signataire', () => {
    expect(verifyPackage(pkg(manifest({ publisher: 'inconnu' }), HEX_PLUGIN), trust)).toMatchObject({ ok: false, reason: expect.stringContaining('éditeur non reconnu') });
    const other = generateKeyPairSync('ed25519');
    const forged = { manifest: manifest(), code: HEX_PLUGIN, signature: signPackage(manifest(), HEX_PLUGIN, other.privateKey) };
    expect(verifyPackage(forged, trust)).toEqual({ ok: false, reason: 'signature invalide' });
  });
  it('refuse un manifeste invalide, un code trop gros et une signature malformée', () => {
    expect(ManifestSchema.safeParse(manifest({ id: 'Mauvais Id' })).success).toBe(false);
    expect(ManifestSchema.safeParse(manifest({ permissions: ['root'] })).success).toBe(false);
    expect(verifyPackage(pkg(manifest(), 'x'.repeat(300 * 1024)), trust)).toEqual({ ok: false, reason: 'code trop volumineux' });
    expect(verifyPackage({ manifest: manifest(), code: HEX_PLUGIN, signature: '!!!' }, trust)).toEqual({ ok: false, reason: 'signature invalide' });
  });
});

function api(store = new Map<string, unknown>(), logs: string[] = []): PluginApi {
  return {
    log: (m) => { logs.push(m); },
    storageGet: async (k) => store.get(k),
    storageSet: async (k, v) => { store.set(k, v); },
    storageDelete: async (k) => { store.delete(k); },
    artifactGet: async (k) => ({ key: k }),
  };
}

const hosts: PluginHost[] = [];
async function start(code: string, overrides: Partial<Manifest> = {}, granted: Permission[] = [], pluginApi: PluginApi = api(), options?: { callTimeoutMs: number; maxMemoryMb: number }) {
  const m = ManifestSchema.parse(manifest(overrides as Record<string, unknown>));
  const host = new PluginHost(m, code, new Set(granted), pluginApi, options);
  hosts.push(host);
  await host.start();
  return host;
}
afterEach(() => { for (const h of hosts.splice(0)) h.stop(); });

describe('exécution isolée des plugins', () => {
  it('valide une valeur avec un type de champ fourni par un plugin', async () => {
    const host = await start(HEX_PLUGIN);
    expect(host.fieldTypes).toEqual(['hex-color']);
    expect(await host.validateFieldType('hex-color', '#12293A', {})).toBeNull();
    expect(await host.validateFieldType('hex-color', 'rouge', {})).toBe('couleur #RRGGBB attendue');
  }, 20_000);

  it('ne contribue que ce que le manifeste déclare', async () => {
    const host = await start(`plugin = { fieldTypes: { 'hex-color': { validate() { return null; } }, sneaky: { validate() { return null; } } } };`);
    expect(host.fieldTypes).toEqual(['hex-color']);
  }, 20_000);

  it('n’expose ni process, ni require, ni fetch, et empêche les évasions par constructeur', async () => {
    const host = await start(`plugin = { fieldTypes: { 'hex-color': { validate() {
      const out = [typeof process, typeof require, typeof fetch, typeof module, typeof globalThis.setTimeout];
      const attempts = [
        () => athena.log.constructor('return typeof process')(),
        () => athena.storage.get('x').constructor.constructor('return typeof process')(),
        () => (function () {}).constructor('return typeof process')(),
        () => Object.getPrototypeOf(athena.storage.get('x')).constructor.constructor('return typeof process')(),
      ];
      for (const a of attempts) { try { out.push('essai:' + a()); } catch (e) { out.push('bloqué'); } }
      return out.join(',');
    } } } };`);
    const report = String(await host.validateFieldType('hex-color', 'x', {}));
    expect(report.startsWith('undefined,undefined,undefined,undefined,undefined')).toBe(true);
    expect(report).not.toMatch(/essai:(object|function)/); // jamais d'accès à process
  }, 20_000);

  it('interrompt une boucle infinie synchrone', async () => {
    const host = await start(`plugin = { fieldTypes: { 'hex-color': { validate() { while (true) {} } } } };`);
    await expect(host.validateFieldType('hex-color', 'x', {})).rejects.toBeInstanceOf(PluginError);
  }, 20_000);

  it('tue un plugin qui ne rend jamais la main, et l’hôte survit', async () => {
    const host = await start(`plugin = { fieldTypes: { 'hex-color': { validate() { return new Promise(() => {}); } } } };`, {}, [], api(), { callTimeoutMs: 500, maxMemoryMb: 48 });
    await expect(host.validateFieldType('hex-color', 'x', {})).rejects.toBeInstanceOf(PluginTimeout);
    await expect(host.validateFieldType('hex-color', 'x', {})).rejects.toBeInstanceOf(PluginCrashed);
  }, 20_000);

  it('contient une fuite de mémoire dans le processus du plugin', async () => {
    const host = await start(`plugin = { fieldTypes: { 'hex-color': { validate() { const a = []; for (;;) a.push(new Array(1e6).fill(1)); } } } };`);
    const error = await host.validateFieldType('hex-color', 'x', {}).catch((e: unknown) => e);
    expect(error instanceof PluginCrashed || error instanceof PluginError || error instanceof PluginTimeout).toBe(true);
  }, 30_000);

  it('contrôle les permissions côté hôte', async () => {
    const code = `plugin = { fieldTypes: { 'hex-color': { validate: async (v) => { await athena.storage.set('dernier', v); return String(await athena.storage.get('dernier')); } } } };`;
    const denied = await start(code);
    await expect(denied.validateFieldType('hex-color', '#fff', {})).rejects.toThrow(/permission refusée : storage/);

    const store = new Map<string, unknown>();
    const allowed = await start(code, { permissions: ['storage'] }, ['storage'], api(store));
    expect(await allowed.validateFieldType('hex-color', '#abc', {})).toBe('#abc');
    expect(store.get('dernier')).toBe('#abc');
  }, 30_000);

  it('interdit l’accès aux artefacts sans permission artifacts:read', async () => {
    const code = `plugin = { fieldTypes: { 'hex-color': { validate: async () => JSON.stringify(await athena.artifacts.get('BUG-1')) } } };`;
    await expect((await start(code)).validateFieldType('hex-color', 'x', {})).rejects.toThrow(/permission refusée/);
    expect(await (await start(code, {}, ['artifacts:read'])).validateFieldType('hex-color', 'x', {})).toBe('{"key":"BUG-1"}');
  }, 30_000);

  it('signale un plugin sans définition `plugin` et une erreur levée par le plugin', async () => {
    await expect(start('var x = 1;')).rejects.toThrow(/doit définir/);
    const host = await start(`plugin = { fieldTypes: { 'hex-color': { validate() { throw new Error('échec interne'); } } } };`);
    await expect(host.validateFieldType('hex-color', 'x', {})).rejects.toThrow(/échec interne/);
  }, 30_000);
});
