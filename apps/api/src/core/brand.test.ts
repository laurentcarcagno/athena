import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkBrandImage, MAX_BRAND_BYTES, sanitizeSvg } from './brand-image';
import { BrandService, type ObjectStore } from './brand.service';
import { Db } from './db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';

// Icône de marque par thème (ADR-0004, T-0137) : un SVG peut porter du script ; seul un SVG reconstruit sur liste blanche passe.

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#123456"/></svg>';

describe('nettoyage des SVG de marque', () => {
  it('garde un SVG simple tel quel', () => {
    expect(sanitizeSvg(SVG)).toBe(SVG.replace('"/>', '"/>'));
  });

  it('refuse script, foreignObject, style et DOCTYPE', () => {
    expect(() => sanitizeSvg('<svg><script>alert(1)</script></svg>')).toThrow(/Données invalides/);
    expect(() => sanitizeSvg('<svg><foreignObject><div/></foreignObject></svg>')).toThrow();
    expect(() => sanitizeSvg('<svg><style>*{}</style></svg>')).toThrow();
    expect(() => sanitizeSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>')).toThrow();
  });

  it('retire les gestionnaires d’événement, les liens externes, les styles et les schémas dangereux', () => {
    const out = sanitizeSvg('<svg onload="alert(1)" style="x"><use href="https://evil.example/x.svg#a"/><use xlink:href="#ok"/><path d="M0 0" fill="url(https://evil/x)" stroke="javascript:alert(1)"/></svg>');
    expect(out).not.toMatch(/onload|style|evil|javascript/);
    expect(out).toContain('xlink:href="#ok"');
  });

  it('refuse un document mal formé ou sans racine svg', () => {
    expect(() => sanitizeSvg('<g></g>')).toThrow();
    expect(() => sanitizeSvg('<svg><g></svg>')).toThrow();
  });
});

describe('vérification des images de marque', () => {
  it('reconnaît le type par les octets ; refuse le reste, le vide et le trop volumineux', () => {
    expect(checkBrandImage(PNG).contentType).toBe('image/png');
    expect(checkBrandImage(Buffer.concat([Buffer.from('RIFF0000WEBP'), Buffer.alloc(8)])).contentType).toBe('image/webp');
    expect(checkBrandImage(Buffer.from(SVG)).contentType).toBe('image/svg+xml');
    expect(() => checkBrandImage(Buffer.from('GIF89a'))).toThrow();
    expect(() => checkBrandImage(Buffer.alloc(0))).toThrow();
    expect(() => checkBrandImage(Buffer.concat([PNG, Buffer.alloc(MAX_BRAND_BYTES)]))).toThrow();
  });
});

const suite = pgUp ? describe : describe.skip;
suite('icône de marque par thème (intégration)', () => {
  let testDb: TestDb;
  let brand: BrandService;
  const objects = new Map<string, Buffer>();
  const store: ObjectStore = { put: async (k, b) => { objects.set(k, b); }, get: async (k) => objects.get(k) ?? null, delete: async (k) => { objects.delete(k); } };
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_brand');
    const db = new Db(testDb.pool);
    brand = new BrandService(db, store);
    for (const [id, key] of [[org, 'br1'], [other, 'br2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('l’image d’un thème l’emporte sur celle de tous les thèmes ; un SVG est stocké nettoyé', async () => {
    await brand.put(org, '*', 'mark', PNG);
    await brand.put(org, 'nord', 'mark', Buffer.from('<svg onload="x()"><path d="M0 0"/></svg>'));
    expect((await brand.read(org, 'gruvbox', 'mark')).contentType).toBe('image/png');
    const nord = await brand.read(org, 'nord', 'mark');
    expect(nord.contentType).toBe('image/svg+xml');
    expect(nord.data.toString()).not.toContain('onload');
    expect((await brand.list(org)).map((e) => `${e.theme}/${e.kind}`)).toEqual(['*/mark', 'nord/mark']);
  });

  it('reste propre à l’organisation ; la suppression revient à l’image de tous les thèmes', async () => {
    await expect(brand.read(other, 'nord', 'mark')).rejects.toThrow(/introuvable/);
    await brand.remove(org, 'nord', 'mark');
    expect((await brand.read(org, 'nord', 'mark')).contentType).toBe('image/png');
  });

  it('refuse un thème ou un type invalide', async () => {
    await expect(brand.put(org, '../x', 'mark', PNG)).rejects.toThrow();
    await expect(brand.put(org, 'nord', 'favicon', PNG)).rejects.toThrow();
  });
});
