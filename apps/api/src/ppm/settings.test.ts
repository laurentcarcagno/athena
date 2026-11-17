import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { PPM_DEFAULTS, PpmSettingsInput, PpmSettingsService } from './settings.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };

describe('réglages PPM : validation', () => {
  it('accepte une journée de 7 h 48, 7 h 00, 8 h 00 ou toute durée entre 1 minute et 24 heures', () => {
    for (const minutes of [468, 420, 480, 1, 1440, 455]) expect(PpmSettingsInput.safeParse({ workdayMinutes: minutes }).success, String(minutes)).toBe(true);
    for (const minutes of [0, -5, 1441, 7.5]) expect(PpmSettingsInput.safeParse({ workdayMinutes: minutes }).success, String(minutes)).toBe(false);
  });
  it('refuse une fréquence ou un seuil hors bornes ; la rétention des revues peut être nulle (sans limite)', () => {
    expect(PpmSettingsInput.safeParse({ snapshotFrequency: 'daily' }).success).toBe(false);
    expect(PpmSettingsInput.safeParse({ overloadPercent: 99 }).success).toBe(false);
    expect(PpmSettingsInput.safeParse({ snapshotWeeklyRetentionWeeks: 0 }).success).toBe(false);
    expect(PpmSettingsInput.safeParse({ snapshotReviewRetentionMonths: null }).success).toBe(true);
    expect(PpmSettingsInput.safeParse({}).success).toBe(true);
  });
});

suite('réglages PPM (intégration)', () => {
  let testDb: TestDb;
  let settings: PpmSettingsService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_ppm_settings');
    const db = new Db(testDb.pool);
    settings = new PpmSettingsService(db);
    for (const id of [org, other]) await db.tx(id, async (c) => { await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, `s${id.slice(0, 6)}`]); });
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('sans réglage de l’organisation, les valeurs par défaut s’appliquent (7 h 48, 26 semaines, sans limite pour les revues)', async () => {
    expect(await settings.get(org)).toEqual(PPM_DEFAULTS);
    expect(PPM_DEFAULTS.workdayMinutes).toBe(7 * 60 + 48);
  });

  it('la durée de la journée se règle en minutes ; les autres réglages restent', async () => {
    expect((await settings.put(org, { workdayMinutes: 420 }, admin)).workdayMinutes).toBe(420);
    expect(await settings.get(org)).toEqual({ ...PPM_DEFAULTS, workdayMinutes: 420 });
    await settings.put(org, { workdayMinutes: 480 }, admin);
    expect((await settings.get(org)).workdayMinutes).toBe(480);
    await settings.put(org, { workdayMinutes: 468 }, admin);
    expect((await settings.get(org)).workdayMinutes).toBe(468);
  });

  it('la rétention et la fréquence se règlent, et la rétention des revues revient à « sans limite »', async () => {
    await settings.put(org, { snapshotFrequency: 'monthly', snapshotWeeklyRetentionWeeks: 52, snapshotReviewRetentionMonths: 60, overloadPercent: 120, statusNoteStaleDays: 14 }, admin);
    expect(await settings.get(org)).toEqual({ workdayMinutes: 468, snapshotFrequency: 'monthly', snapshotWeeklyRetentionWeeks: 52, snapshotReviewRetentionMonths: 60, overloadPercent: 120, statusNoteStaleDays: 14 });
    await settings.put(org, { snapshotReviewRetentionMonths: null }, admin);
    expect((await settings.get(org)).snapshotReviewRetentionMonths).toBeNull();
  });

  it('chaque organisation garde ses réglages, et chaque changement est audité', async () => {
    expect(await settings.get(other)).toEqual(PPM_DEFAULTS);
    const audited = await new Db(testDb.pool).tx(org, async (c) => (await c.query("select count(*)::int n from audit_log where action = 'ppm.settings.update'")).rows[0].n);
    expect(audited).toBeGreaterThanOrEqual(4);
  });
});
