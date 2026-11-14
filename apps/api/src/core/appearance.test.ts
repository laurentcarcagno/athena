import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppearanceInput, AppearanceService } from './appearance.service';
import { Db, type Actor } from './db';
import { PreferenceService } from './preference.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';

// Apparence de l'organisation (ADR-0004, T-0136) : thème par défaut, thèmes proposés ; famille de thème sur le compte.

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-team-member'] };

describe('validation de l’apparence', () => {
  it('exige des noms de thème valides et refuse les clés étrangères', () => {
    expect(AppearanceInput.safeParse({ defaultTheme: 'nord', allowedThemes: ['nord', 'athena'] }).success).toBe(true);
    expect(AppearanceInput.safeParse({ defaultTheme: 'Nord!', allowedThemes: [] }).success).toBe(false);
    expect(AppearanceInput.safeParse({ defaultTheme: 'nord', allowedThemes: ['<script>'] }).success).toBe(false);
    expect(AppearanceInput.safeParse({ defaultTheme: 'nord', allowedThemes: [], logo: 'x' }).success).toBe(false);
  });
});

suite('apparence de l’organisation (intégration)', () => {
  let testDb: TestDb;
  let appearance: AppearanceService;
  let prefs: PreferenceService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_appearance');
    const db = new Db(testDb.pool);
    appearance = new AppearanceService(db);
    prefs = new PreferenceService(db);
    for (const [id, key] of [[org, 'app1'], [other, 'app2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('Athena et tous les thèmes sans réglage ; enregistre le défaut et la liste, sans doublon', async () => {
    expect(await appearance.get(org)).toEqual({ defaultTheme: 'athena', allowedThemes: [] });
    expect(await appearance.put(org, { defaultTheme: 'nord', allowedThemes: ['nord', 'athena', 'nord'] })).toEqual({ defaultTheme: 'nord', allowedThemes: ['nord', 'athena'] });
    expect(await appearance.get(org)).toEqual({ defaultTheme: 'nord', allowedThemes: ['nord', 'athena'] });
    expect(await appearance.get(other)).toEqual({ defaultTheme: 'athena', allowedThemes: [] });
  });

  it('refuse un défaut absent de la liste proposée', async () => {
    await expect(appearance.put(org, { defaultTheme: 'gruvbox', allowedThemes: ['nord'] })).rejects.toMatchObject({ details: ['Le thème par défaut doit faire partie des thèmes proposés.'] });
  });

  it('la famille de thème est une préférence du compte', async () => {
    expect((await prefs.put(org, { family: 'catppuccin' }, alice)).family).toBe('catppuccin');
    expect((await prefs.get(org, alice)).family).toBe('catppuccin');
    expect((await prefs.put(org, { family: null }, alice)).family).toBeNull();
  });
});
