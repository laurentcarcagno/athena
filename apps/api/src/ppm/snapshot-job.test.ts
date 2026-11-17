import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { HealthService } from './health.service';
import { LifecycleService } from './lifecycle.service';
import { PortfolioService } from './portfolio.service';
import { PpmSettingsService } from './settings.service';
import { SnapshotJobService } from './snapshot-job.service';
import { SnapshotService } from './snapshot.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const day = (iso: string) => new Date(`${iso}T03:00:00Z`);

suite('jobs instantanes et retention (B32)', () => {
  let testDb: TestDb;
  let db: Db;
  let jobs: SnapshotJobService;
  let snaps: SnapshotService;
  let settings: PpmSettingsService;
  const org = crypto.randomUUID();
  const kpis = { async kpis(_o: string, project: string) { return { project: { key: project, name: project, createdAt: '2026-01-01T00:00:00.000Z', members: 1, managers: [] }, progress: { total: 1, done: 0, inProgress: 0, todo: 1, percent: 0 }, late: 0, blocked: 0, dueSoon: 0, open: 1, workload: [], velocity: { average: 0, forecast: 0, sprints: 0 }, sprint: null, health: { state: 'ok' as const, reasons: [] } }; } };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_snapshot_job');
    db = new Db(testDb.pool);
    settings = new PpmSettingsService(db);
    const portfolios = new PortfolioService(db, kpis);
    snaps = new SnapshotService(db, new HealthService(db, portfolios, new LifecycleService(db)));
    jobs = new SnapshotJobService(db, settings, snaps);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'sj','sj')", [org]));
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await trackers.createProject(org, 'JA', 'Projet JA', admin);
    for (const k of ['un', 'deux']) { await portfolios.create(org, { key: k, name: k }, admin); await portfolios.setProject(org, k, 'JA', {}, admin); }
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('un instantané hebdomadaire par portefeuille ; rejouer le job la même semaine n’en crée aucun', async () => {
    expect(await jobs.run(org, day('2026-11-16'))).toEqual({ taken: 2, purged: 0 });
    expect(await jobs.run(org, day('2026-11-17'))).toEqual({ taken: 0, purged: 0 });
    expect((await snaps.list(org, 'un')).map((s) => s.period)).toEqual(['2026-W47']);
    expect(await jobs.run(org, day('2026-11-23'))).toEqual({ taken: 2, purged: 0 }); // semaine suivante
  });

  it('la fréquence mensuelle est un réglage de l’organisation', async () => {
    await settings.put(org, { snapshotFrequency: 'monthly' }, admin);
    expect((await jobs.run(org, day('2026-12-01'))).taken).toBe(2);
    expect((await jobs.run(org, day('2026-12-15'))).taken).toBe(0);
    expect((await snaps.list(org, 'un')).map((s) => s.kind)).toContain('monthly');
  });

  it('la rétention est réglable : la purge ne garde que les périodes assez récentes', async () => {
    await settings.put(org, { snapshotWeeklyRetentionWeeks: 2 }, admin);
    const r = await jobs.run(org, day('2027-03-01'));
    expect(r.purged).toBeGreaterThanOrEqual(4); // les instantanés de novembre et de décembre dépassent 2 semaines
    expect((await snaps.list(org, 'un')).every((s) => s.takenAt >= '2027-02-15')).toBe(true);
    expect(await jobs.run(org, day('2027-03-01'))).toMatchObject({ purged: 0 }); // rejouée : rien de plus
  });

  it('un portefeuille peut surcharger la rétention de l’organisation', async () => {
    await settings.put(org, { snapshotWeeklyRetentionWeeks: 520 }, admin);
    await snaps.take(org, 'un', { kind: 'manual', label: 'vieux un', at: day('2026-01-05') }, admin);
    await snaps.take(org, 'deux', { kind: 'manual', label: 'vieux deux', at: day('2026-01-05') }, admin);
    await snaps.setRetention(org, 'un', { weeks: 4, reviewMonths: null }, admin);
    expect(await snaps.retentionOf(org, 'un')).toEqual({ weeks: 4, reviewMonths: null });
    await jobs.run(org, day('2027-03-02'));
    expect((await snaps.list(org, 'un')).map((x) => x.label)).not.toContain('vieux un'); // 4 semaines : purgé
    expect((await snaps.list(org, 'deux')).map((x) => x.label)).toContain('vieux deux'); // réglage de l'organisation : 520 semaines
    await snaps.setRetention(org, 'un', { weeks: null, reviewMonths: null }, admin);
    expect(await snaps.retentionOf(org, 'un')).toEqual({ weeks: null, reviewMonths: null });
  });
});
