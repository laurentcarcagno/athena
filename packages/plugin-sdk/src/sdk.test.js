import { describe, expect, it } from 'vitest';
import { checkManifest, definePlugin, generateKeys, pack, packageDigest, verifyPackage } from './index.js';

const manifest = { id: 'com.acme.demo', name: 'Démo', version: '1.2.3', athena: '>=1.0.0', publisher: 'acme', permissions: [], contributes: { fieldTypes: [], hooks: [] } };

describe('SDK de plugin', () => {
  it('signe et vérifie, la signature dépendant du manifeste et du code', () => {
    const keys = generateKeys();
    const pkg = pack(manifest, 'plugin = {};', keys.privateKey);
    expect(verifyPackage(pkg, keys.publicKey)).toBe(true);
    expect(verifyPackage({ ...pkg, code: 'plugin = { x: 1 };' }, keys.publicKey)).toBe(false);
    expect(verifyPackage({ ...pkg, manifest: { ...manifest, permissions: ['storage'] } }, keys.publicKey)).toBe(false);
    expect(verifyPackage(pkg, generateKeys().publicKey)).toBe(false);
    expect(verifyPackage({ ...pkg, signature: '!!' }, keys.publicKey)).toBe(false);
  });

  it('calcule la même empreinte quel que soit l’ordre des clés du manifeste', () => {
    const reordered = Object.fromEntries(Object.entries(manifest).reverse());
    expect(packageDigest(manifest, 'x').equals(packageDigest(reordered, 'x'))).toBe(true);
  });

  it('contrôle le manifeste', () => {
    expect(checkManifest(manifest)).toEqual([]);
    expect(checkManifest({ id: 'MAUVAIS', version: '1' }).length).toBeGreaterThan(2);
  });

  it('definePlugin retourne sa définition', () => {
    const definition = { fieldTypes: { a: { validate: () => null } } };
    expect(definePlugin(definition)).toBe(definition);
  });
});
