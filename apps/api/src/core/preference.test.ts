import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from './db';
import { PreferenceInput, PreferenceService } from './preference.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';

// Préférences personnelles sur le compte : accueil, langue, thème.

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-team-member'] };
const bob: Actor = { id: 'bob', roles: ['athena-team-member'] };

describe('validation des préférences', () => {
  it('refuse une valeur inconnue ou une clé étrangère, accepte null pour effacer', () => {
    expect(PreferenceInput.safeParse({ home: 'dashboard' }).success).toBe(false);
    expect(PreferenceInput.safeParse({ locale: 'de' }).success).toBe(false);
    expect(PreferenceInput.safeParse({ theme: 'blue' }).success).toBe(false);
    expect(PreferenceInput.safeParse({ density: 'spacious' }).success).toBe(false);
    expect(PreferenceInput.safeParse({ density: 'compact', family: null }).success).toBe(true);
    expect(PreferenceInput.safeParse({ density: 'comfortable' }).success).toBe(true);
    expect(PreferenceInput.safeParse({ admin: true }).success).toBe(false);
    expect(PreferenceInput.safeParse({ home: null, theme: 'dark', density: null, family: null }).success).toBe(true);
  });
});

suite('préférences personnelles (intégration)', () => {
  let testDb: TestDb;
  let prefs: PreferenceService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_preferences');
    const db = new Db(testDb.pool);
    prefs = new PreferenceService(db);
    for (const [id, key] of [[org, 'pref'], [other, 'pref2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('ne donne rien sans réglage, fusionne les mises à jour partielles, efface avec null', async () => {
    expect(await prefs.get(org, alice)).toEqual({ home: null, locale: null, theme: null, density: null, family: null });
    expect(await prefs.put(org, { home: 'projects' }, alice)).toEqual({ home: 'projects', locale: null, theme: null, density: null, family: null });
    expect(await prefs.put(org, { theme: 'dark', locale: 'en' }, alice)).toEqual({ home: 'projects', locale: 'en', theme: 'dark', density: null, family: null });
    expect(await prefs.put(org, { home: null }, alice)).toEqual({ home: null, locale: 'en', theme: 'dark', density: null, family: null });
    expect(await prefs.get(org, alice)).toEqual({ home: null, locale: 'en', theme: 'dark', density: null, family: null });
  });

  it('enregistre la densité (T-0135) sans toucher aux autres réglages', async () => {
    expect(await prefs.put(org, { density: 'compact' }, alice)).toEqual({ home: null, locale: 'en', theme: 'dark', density: 'compact', family: null });
    expect((await prefs.put(org, { density: 'comfortable' }, alice)).density).toBe('comfortable');
    expect(await prefs.put(org, { density: null }, alice)).toEqual({ home: null, locale: 'en', theme: 'dark', density: null, family: null });
  });

  it('reste personnelle et propre à l’organisation', async () => {
    expect(await prefs.get(org, bob)).toEqual({ home: null, locale: null, theme: null, density: null, family: null });
    expect(await prefs.get(other, alice)).toEqual({ home: null, locale: null, theme: null, density: null, family: null });
  });
});
