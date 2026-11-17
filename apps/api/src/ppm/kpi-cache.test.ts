import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { CachedKpiService } from './kpi-cache.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };

suite('indicateurs matérialisés (B42, intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let cache: CachedKpiService;
  let access: AccessService;
  let calls = 0;
  const org = crypto.randomUUID();
  const live = { async kpis(_o: string, project: string) { calls += 1; return { project: { key: project, name: project, createdAt: '2026-01-01T00:00:00.000Z', members: 1, managers: [] }, progress: { total: 4, done: calls, inProgress: 0, todo: 0, percent: calls }, late: calls, blocked: 0, dueSoon: 0, open: 4, workload: [], velocity: { average: 0, forecast: 0, sprints: 0 }, sprint: null, health: { state: 'ok' as const, reasons: [] } }; } };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_kpi_cache');
    db = new Db(testDb.pool);
    cache = new CachedKpiService(db, live as never, 15 * 60_000);
    access = new AccessService(db);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'kc','kc')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-admin','admin.dev','Admin Dev','a@example.test')", [org]);
    });
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    for (const k of ['KA', 'KB']) await trackers.createProject(org, k, k, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('sans ligne ou avec une ligne périmée, la lecture calcule en direct ; avec une ligne fraîche, elle la lit', async () => {
    const t0 = new Date('2026-11-18T10:00:00Z');
    calls = 0;
    expect((await cache.kpis(org, 'KA', admin, t0)).late).toBe(1); // aucune ligne : calcul direct
    expect(await cache.refresh(org, undefined, t0)).toBe(2); // job : une ligne par projet (calculs 2 et 3)
    const before = calls;
    const fresh = await cache.kpis(org, 'KA', admin, new Date('2026-11-18T10:10:00Z'));
    expect(calls).toBe(before); // lue, pas recalculée
    expect(fresh.late).toBe(2);
    const stale = await cache.kpis(org, 'KA', admin, new Date('2026-11-18T10:20:00Z')); // plus de 15 minutes
    expect(calls).toBe(before + 1);
    expect(stale.late).toBe(before + 1);
  });

  it('un projet masqué au lecteur : la ligne matérialisée ne lui est pas rendue (visibilité du projet)', async () => {
    await cache.refresh(org, ['KB'], new Date('2026-11-18T11:00:00Z'));
    await runAs('sub-admin', () => access.set(org, 'KB', { members: ['sub-admin'] }, admin));
    const rows = await runAs('sub-dir', () => db.tx(org, async (c) => (await c.query('select count(*)::int n from project_kpi')).rows[0].n as number));
    expect(rows).toBe(1); // seule la ligne de KA est visible
    await runAs('sub-admin', () => access.remove(org, 'KB', null, admin));
    void director;
  });
});
