import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ReportService } from './report.service';
import { SprintService } from './sprint.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('vélocité, flux, roadmap et tableau de bord (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let sprints: SprintService;
  let reports: ReportService;
  let trackers: TrackerService;
  const org = crypto.randomUUID();

  const storyTracker = {
    projectKey: 'ARI', key: 'STORY', name: 'Stories',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' as const },
      { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate' as const },
      { key: 'team', label: 'Équipe', type: 'text' },
    ],
    statuses: [
      { key: 'todo', name: 'À faire', category: 'todo' as const },
      { key: 'doing', name: 'En cours', category: 'in_progress' as const },
      { key: 'done', name: 'Terminé', category: 'done' as const },
    ],
    transitions: [
      { name: 'Démarrer', from: 'todo', to: 'doing' },
      { name: 'Terminer', from: 'doing', to: 'done' },
    ],
  };

  async function finish(key: string) {
    const a = await artifacts.get(org, 'ARI', key);
    const started = await artifacts.transition(org, 'ARI', key, 'Démarrer', a.version, admin);
    await artifacts.transition(org, 'ARI', key, 'Terminer', started.version, admin);
  }

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_reports');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    sprints = new SprintService(db);
    reports = new ReportService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'rep']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, storyTracker, admin);
    for (const [title, points, team] of [['A', 5, 'alpha'], ['B', 3, 'alpha'], ['C', 8, 'beta'], ['D', 2, 'beta'], ['E', 13, 'alpha'], ['F', 1, 'beta']] as const) {
      await artifacts.create(org, 'ARI', 'STORY', { title, points, team }, admin);
    }
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('fige engagé et terminé par sprint et calcule vélocité et prévision', async () => {
    expect(await reports.velocity(org, 'ARI')).toEqual({ sprints: [], average: 0, forecast: 0 });
    const run = async (name: string, items: string[], done: string[]) => {
      const id = await sprints.create(org, 'ARI', { name, startsOn: iso(-14), endsOn: iso(0) }, admin);
      for (const k of items) await sprints.addItem(org, id, k, 'ARI', admin);
      await sprints.start(org, id, admin);
      for (const k of done) await finish(k);
      await sprints.close(org, id, admin);
    };
    await run('S1', ['ARI-STORY-0001', 'ARI-STORY-0002'], ['ARI-STORY-0001']); // engagé 8, terminé 5
    await run('S2', ['ARI-STORY-0003', 'ARI-STORY-0004'], ['ARI-STORY-0003', 'ARI-STORY-0004']); // engagé 10, terminé 10
    await run('S3', ['ARI-STORY-0002', 'ARI-STORY-0005'], ['ARI-STORY-0002']); // engagé 16, terminé 3 (ARI-STORY-0002 retourné au backlog puis repris)
    const velocity = await reports.velocity(org, 'ARI');
    expect(velocity.sprints).toEqual([
      { sprint: 'S1', committed: 8, completed: 5 }, { sprint: 'S2', committed: 10, completed: 10 }, { sprint: 'S3', committed: 16, completed: 3 },
    ]);
    expect(velocity.average).toBe(6);
    expect(velocity.forecast).toBe(6);
    expect((await reports.velocity(org, 'ARI', 2)).sprints.map((s) => s.sprint)).toEqual(['S2', 'S3']);
  }, 60_000);

  it('reconstitue le flux cumulé par catégorie depuis les révisions antidatées', async () => {
    await testDb.exec("update artifact_revision set created_at = now() - interval '3 days'");
    await testDb.exec(
      "update artifact_revision r set created_at = now() - interval '1 day' from artifact a where a.id = r.artifact_id and a.key = 'ARI-STORY-0003' and (r.snapshot ->> 'status') = 'done'",
    );
    const flow = await reports.cumulativeFlow(org, 'ARI', 5);
    expect(flow).toHaveLength(5);
    expect(flow[0]!.date).toBe(iso(-4));
    expect(flow[0]).toMatchObject({ todo: 0, in_progress: 0, done: 0 }); // avant toute création
    const afterCreation = flow.find((d) => d.date === iso(-3))!;
    expect(afterCreation.done + afterCreation.in_progress + afterCreation.todo).toBe(6);
    expect(flow.at(-1)!.done).toBe(4); // ARI-STORY-0001, 2, 3, 4 terminés
    expect(flow.every((d) => d.todo + d.in_progress + d.done <= 6)).toBe(true);
    expect(await code(reports.cumulativeFlow(org, 'ARI', 999))).toMatch(/validation/);
  }, 30_000);

  it('suit une roadmap par releases avec avancement en points', async () => {
    const r1 = await reports.createRelease(org, 'ARI', { name: '1.0', startsOn: iso(-30), endsOn: iso(-1) }, admin);
    const r2 = await reports.createRelease(org, 'ARI', { name: '1.1', startsOn: iso(0), endsOn: iso(30) }, admin);
    for (const k of ['ARI-STORY-0001', 'ARI-STORY-0003', 'ARI-STORY-0005']) await reports.assign(org, 'ARI', r1, k, admin);
    await reports.assign(org, 'ARI', r2, 'ARI-STORY-0006', admin);
    const roadmap = await reports.roadmap(org, 'ARI');
    expect(roadmap.map((r) => r.name)).toEqual(['1.0', '1.1']);
    expect(roadmap[0]).toMatchObject({ items: 3, doneItems: 2, totalPoints: 26, donePoints: 13, progress: 0.5 });
    expect(roadmap[1]).toMatchObject({ items: 1, doneItems: 0, totalPoints: 1, progress: 0 });
    // T-0117 : tickets de la version, retrait, portée du projet.
    const items = await reports.releaseItems(org, 'ARI', r1);
    expect(items.map((i) => i.key)).toEqual(['ARI-STORY-0001', 'ARI-STORY-0003', 'ARI-STORY-0005']);
    expect(items[0]).toMatchObject({ done: true, statusName: 'Terminé' });
    expect(items[0]!.title).not.toBe('ARI-STORY-0001');
    await reports.assign(org, 'ARI', r1, 'ARI-STORY-0006', admin);
    await reports.unassign(org, 'ARI', r1, 'ARI-STORY-0006', admin);
    expect((await reports.releaseItems(org, 'ARI', r1)).length).toBe(3);
    expect(await code(reports.unassign(org, 'ARI', r1, 'ARI-STORY-0006', admin))).toMatch(/not_found/);
    await trackers.createProject(org, 'AUT', 'Autre', admin);
    expect(await code(reports.releaseItems(org, 'AUT', r1))).toMatch(/not_found/);
    expect(await code(reports.assign(org, 'AUT', r1, 'ARI-STORY-0006', admin))).toMatch(/not_found/);
    expect(await code(reports.publish(org, r1, admin, 'AUT'))).toMatch(/not_found/);
    expect(await code(reports.releaseItems(org, 'ARI', 'pas-un-uuid'))).toMatch(/not_found/);
    await reports.publish(org, r1, admin, 'ARI');
    expect(await code(reports.assign(org, 'ARI', r1, 'ARI-STORY-0006', admin))).toMatch(/conflict.*publiée/);
    expect(await code(reports.unassign(org, 'ARI', r1, 'ARI-STORY-0001', admin))).toMatch(/conflict.*publiée/);
    expect(await code(reports.publish(org, r1, admin))).toMatch(/conflict/);
    expect(await code(reports.createRelease(org, 'ARI', { name: 'x', startsOn: iso(5), endsOn: iso(1) }, admin))).toMatch(/autre:.*check/i);
  }, 30_000);

  it('alimente le tableau de bord : catégories, trackers, distribution d’un champ, activité', async () => {
    const dashboard = await reports.dashboard(org, 'ARI', 'team');
    expect(dashboard.byCategory).toEqual({ todo: 2, in_progress: 0, done: 4 }); // ARI-STORY-0005 et ARI-STORY-0006 restent à faire
    expect(dashboard.byTracker).toEqual([{ tracker: 'STORY', total: 6, open: 2 }]);
    expect(dashboard.distribution).toEqual([{ value: 'alpha', count: 3 }, { value: 'beta', count: 3 }]);
    expect(dashboard.recent.length).toBeGreaterThan(0);
    const keys = dashboard.recent.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length); // T-0155 : une ligne par ticket, sa dernière révision
    const times = dashboard.recent.map((e) => e.at);
    expect([...times].sort().reverse()).toEqual(times); // du plus récent au plus ancien
    expect((await reports.dashboard(org, 'ARI')).distribution).toBeNull();
    expect(await code(reports.dashboard(org, 'ARI', 'x"; drop'))).toMatch(/validation/);
  }, 30_000);
});
