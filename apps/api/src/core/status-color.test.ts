import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db, type Actor } from './db';
import { FieldTypeRegistry } from './field-types';
import { HueSchema, HUES } from './hues';
import { bugTemplate } from './templates';
import { TrackerService } from './tracker.service';

// Teintes nommées des statuts (ADR-0004, T-0138) : liste fermée ; nulle = teinte de la catégorie.

const admin: Actor = { id: 'u-admin', roles: ['athena-admin'] };

describe('teintes nommées', () => {
  it('douze teintes, liste fermée : un code couleur ou une teinte inconnue est refusé', () => {
    expect(HUES).toHaveLength(12);
    expect(HueSchema.safeParse('teal').success).toBe(true);
    expect(HueSchema.safeParse('#FF0000').success).toBe(false);
    expect(HueSchema.safeParse('violet').success).toBe(false);
  });
});

const suite = pgUp ? describe : describe.skip;
suite('teinte d’un statut (intégration)', () => {
  let testDb: TestDb;
  let trackers: TrackerService;
  let db: Db;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_statuscolor');
    db = new Db(testDb.pool);
    trackers = new TrackerService(db, new FieldTypeRegistry());
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'hue']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    const spec = bugTemplate('ARI');
    await trackers.createTracker(org, { ...spec, statuses: spec.statuses.map((s, i) => (i === 0 ? { ...s, color: 'teal' as const } : s)) }, admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  const colors = async () => Object.fromEntries((await db.tx(org, (c) => trackers.getDefinition(c, 'ARI', 'BUG'))).statuses.map((s) => [s.key, s.color]));

  it('création : la teinte choisie est gardée, les autres restent nulles (teinte de la catégorie)', async () => {
    const c = await colors();
    expect(Object.values(c).filter((v) => v === 'teal')).toHaveLength(1);
    expect(Object.values(c).filter((v) => v === null).length).toBeGreaterThan(0);
  });

  it('ajout avec teinte, changement, effacement ; le nom et la catégorie restent', async () => {
    await trackers.addStatus(org, 'ARI', 'BUG', { key: 'review', name: 'En revue', category: 'in_progress', color: 'purple' }, admin);
    expect((await colors())['review']).toBe('purple');
    await trackers.updateStatus(org, 'ARI', 'BUG', 'review', { color: 'orange' }, admin);
    expect((await colors())['review']).toBe('orange');
    await trackers.updateStatus(org, 'ARI', 'BUG', 'review', { name: 'Relecture' }, admin);
    expect((await colors())['review']).toBe('orange');
    await trackers.updateStatus(org, 'ARI', 'BUG', 'review', { color: null }, admin);
    const def = await db.tx(org, (c) => trackers.getDefinition(c, 'ARI', 'BUG'));
    expect(def.statuses.find((s) => s.key === 'review')).toMatchObject({ name: 'Relecture', category: 'in_progress', color: null });
  });

  it('la base refuse une teinte hors liste', async () => {
    await expect(db.tx(org, (c) => c.query("update status set color = 'violet' where key = 'review'"))).rejects.toThrow();
  });
});
