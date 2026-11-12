import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { TrackerService, type TrackerSpec } from '../core/tracker.service';
import { GitLabClient } from '../history/gitlab-client';
import { HistorySync } from '../history/history-sync';
import { createTestDb, fromEnv, pgUp, probe, type TestDb } from '../testing/harness';
import { ScheduleService } from './schedule.service';

const GITLAB_URL = fromEnv('GITLAB_TEST_URL') ?? 'http://127.0.0.1:8929';
const TOKEN = fromEnv('GITLAB_DEV_TOKEN');
const gitlabUp = !!TOKEN && probe("fetch(process.env.U+'/users/sign_in',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))", { U: GITLAB_URL });
const suite = pgUp ? describe : describe.skip;
const gitSuite = pgUp && gitlabUp ? describe : describe.skip;

const admin: Actor = { id: 'sub-admin', roles: ['athena-user', 'athena-admin'] };
const pm: Actor = { id: 'sub-pm', roles: ['athena-user', 'athena-pm'] };

const taskSpec = (project: string): TrackerSpec => ({
  projectKey: project, key: 'TSK', name: 'Tâches', typeKey: 'task',
  fields: [
    { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
    { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date', isContent: false },
    { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date', isContent: false },
    { key: 'progress', label: 'Avancement', type: 'number', semanticRole: 'progress', isContent: false },
  ],
  statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }],
});

interface Fixture {
  testDb: TestDb;
  db: Db;
  artifacts: ArtifactService;
  links: LinkService;
  calendar: CalendarService;
  schedule: ScheduleService;
  org: string;
}

async function fixture(name: string, orgKey: string): Promise<Fixture> {
  const testDb = await createTestDb(name);
  const db = new Db(testDb.pool);
  const registry = new FieldTypeRegistry();
  const trackers = new TrackerService(db, registry);
  const artifacts = new ArtifactService(db, trackers, registry);
  const calendar = new CalendarService(db);
  const org = crypto.randomUUID();
  await db.tx(org, async (c) => {
    await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, orgKey]);
    await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-pm','pm','Pat Manager','pm@example.test')", [org]);
  });
  await trackers.createProject(org, 'NOVA', 'Nova', admin);
  await trackers.createTracker(org, taskSpec('NOVA'), admin);
  const links = new LinkService(db);
  await links.createLinkType(org, 'NOVA', { key: 'parent', outwardLabel: 'a pour parent', inwardLabel: 'a pour enfant', hierarchical: true }, admin);
  await calendar.put(org, { workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }] }, admin);
  return { testDb, db, artifacts, links, calendar, schedule: new ScheduleService(db, artifacts, calendar), org };
}

/** Planning de référence : A → B (+0) → C (+1) → jalon M, D indépendante ; B est saisie trop tôt. */
async function seedReference(f: Fixture) {
  const make = (title: string, start: string | null, due: string) => f.artifacts.create(f.org, 'NOVA', 'TSK', { title, ...(start ? { start } : {}), due }, admin);
  const a = await make('A', '2026-11-09', '2026-11-10');
  const b = await make('B', '2026-11-10', '2026-11-10');
  const c = await make('C', '2026-11-09', '2026-11-13');
  const d = await make('D', '2026-11-09', '2026-11-10');
  const m = await make('Jalon', null, '2026-11-19');
  await f.links.link(f.org, 'NOVA', a.key, b.key, 'precedes', admin);
  await f.links.link(f.org, 'NOVA', b.key, c.key, 'precedes', admin, 1);
  await f.links.link(f.org, 'NOVA', c.key, m.key, 'precedes', admin);
  return { a, b, c, d, m };
}

suite('planning d’un projet (intégration)', () => {
  let f: Fixture;
  let t: Awaited<ReturnType<typeof seedReference>>;

  beforeAll(async () => {
    f = await fixture('athena_test_schedule', 'sch1');
    t = await seedReference(f);
  }, 60_000);
  afterAll(async () => { await f?.testDb.drop(); });

  it('calcule le planning de référence à partir des tickets, des liens et du calendrier', async () => {
    const s = await f.schedule.get(f.org, 'NOVA', ['athena-user']);
    const row = (k: string) => s.tasks.find((x) => x.key === k)!;
    expect([row(t.b.key).plannedStart, row(t.b.key).plannedEnd]).toEqual(['2026-11-12', '2026-11-12']);
    expect([row(t.c.key).plannedStart, row(t.c.key).plannedEnd]).toEqual(['2026-11-16', '2026-11-19']);
    expect(row(t.m.key)).toMatchObject({ milestone: true, plannedEnd: '2026-11-19', slack: 0 });
    expect(row(t.d.key)).toMatchObject({ slack: 6, critical: false });
    expect(s.criticalPath).toEqual([t.a.key, t.b.key, t.c.key, t.m.key]);
    expect(s.projectEnd).toBe('2026-11-19');
    expect(s.moved).toBe(2);
    expect(s.tasks[0]).toMatchObject({ title: 'A', tracker: 'TSK' });
    expect(s.links).toEqual([{ from: t.a.key, to: t.b.key, lag: 0 }, { from: t.b.key, to: t.c.key, lag: 1 }, { from: t.c.key, to: t.m.key, lag: 0 }]);
  });

  it('suit le calendrier de l’organisation : un jour férié de plus décale la suite', async () => {
    await f.calendar.put(f.org, { workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }, { day: '2026-11-12', label: 'Pont' }] }, admin);
    const s = await f.schedule.get(f.org, 'NOVA', ['athena-user']);
    expect(s.tasks.find((x) => x.key === t.b.key)!.plannedStart).toBe('2026-11-13');
    await f.calendar.put(f.org, { workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }] }, admin);
  });

  it('ignore les trackers sans début ni échéance et un projet sans planning', async () => {
    const trackers = new TrackerService(f.db, new FieldTypeRegistry());
    await trackers.createProject(f.org, 'EMPTY', 'Vide', admin);
    expect((await f.schedule.get(f.org, 'EMPTY', ['athena-user'])).tasks).toEqual([]);
    await expect(f.schedule.get(f.org, 'NOPE', ['athena-user'])).rejects.toMatchObject({ code: 'not_found' });
  });

  it('applique le planning : seules les tickets qui bougent sont modifiées, en un lot, avec un événement', async () => {
    const result = await f.schedule.apply(f.org, 'NOVA', pm);
    expect(result.moved).toBe(2);
    expect(result.keys.sort()).toEqual([t.b.key, t.c.key].sort());
    expect(result.batch).toBeTruthy();
    expect((await f.artifacts.get(f.org, 'NOVA', t.b.key)).values).toMatchObject({ start: '2026-11-12', due: '2026-11-12' });
    expect((await f.artifacts.get(f.org, 'NOVA', t.c.key)).values).toMatchObject({ start: '2026-11-16', due: '2026-11-19' });
    expect((await f.artifacts.get(f.org, 'NOVA', t.a.key)).version).toBe(1); // intacte

    const events = await f.db.tx(f.org, async (c) => (await c.query(
      "select type, payload from outbox_event where payload->>'batch' = $1 order by type", [result.batch])).rows);
    expect(events.map((e) => e.type)).toEqual(['artifact.updated', 'artifact.updated', 'schedule.changed']);
    expect(events[2].payload).toMatchObject({ project: 'NOVA', moved: 2, actor: 'sub-pm' });
    const log = await f.db.tx(f.org, async (c) => (await c.query("select actor, detail from audit_log where action = 'schedule.apply'")).rows);
    expect(log).toHaveLength(1);
  });

  it('une seconde application ne change rien et n’émet aucun événement', async () => {
    const before = await f.db.tx(f.org, async (c) => Number((await c.query("select count(*) n from outbox_event where type = 'schedule.changed'")).rows[0].n));
    expect(await f.schedule.apply(f.org, 'NOVA', pm)).toEqual({ moved: 0, keys: [], batch: null });
    expect(await f.db.tx(f.org, async (c) => Number((await c.query("select count(*) n from outbox_event where type = 'schedule.changed'")).rows[0].n))).toBe(before);
  });

  it('écrit aussi les dates d’une tâche parente, calculées depuis ses enfants (D3)', async () => {
    const p = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'Parent', start: '2026-12-01', due: '2026-12-01' }, admin);
    const x = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'X', start: '2026-12-07', due: '2026-12-08' }, admin);
    const y = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'Y', start: '2026-12-10', due: '2026-12-11' }, admin);
    await f.links.link(f.org, 'NOVA', x.key, p.key, 'parent', admin);
    await f.links.link(f.org, 'NOVA', y.key, p.key, 'parent', admin);
    const s = await f.schedule.get(f.org, 'NOVA', ['athena-user']);
    expect(s.tasks.find((r) => r.key === p.key)).toMatchObject({ summary: true, plannedStart: '2026-12-07', plannedEnd: '2026-12-11', moved: true });
    expect((await f.schedule.apply(f.org, 'NOVA', pm)).keys).toEqual([p.key]);
    expect((await f.artifacts.get(f.org, 'NOVA', p.key)).values).toMatchObject({ start: '2026-12-07', due: '2026-12-11' });
    expect(s.tasks.find((r) => r.key === x.key)!.parent).toBe(p.key);
  });

  it('refuse un lien « précède » qui ferme un cycle avant tout calcul', async () => {
    await expect(f.links.link(f.org, 'NOVA', t.c.key, t.a.key, 'precedes', admin)).rejects.toMatchObject({ code: 'validation' });
  });
});

gitSuite('replanification dans l’historique (GitLab réel)', () => {
  let f: Fixture;
  let gitlab: GitLabClient;
  const orgKey = `sch${Date.now().toString(36)}${process.pid.toString(36)}`;

  beforeAll(async () => {
    f = await fixture('athena_test_schedule_git', orgKey);
    gitlab = new GitLabClient(GITLAB_URL, TOKEN!);
  }, 60_000);
  afterAll(async () => { await f?.testDb.drop(); });

  it('écrit N tickets déplacés en un seul commit « replanification »', async () => {
    const t = await seedReference(f);
    const sync = new HistorySync(f.testDb.pool, gitlab, 'root');
    await sync.runOnce(); // création des tickets et des liens
    const projectId = await gitlab.ensureRepository('root', `athena-history-${orgKey}-nova`);
    const path = (key: string) => `trackers/TSK/artifacts/${key}.yaml`;
    const before = (await gitlab.commits(projectId, path(t.b.key), 'main')).length;

    const result = await f.schedule.apply(f.org, 'NOVA', pm);
    expect(result.moved).toBe(2);
    expect(await sync.runOnce()).toEqual({ committed: 1, failed: 0 });

    const b = await gitlab.commits(projectId, path(t.b.key), 'main');
    const c = await gitlab.commits(projectId, path(t.c.key), 'main');
    expect(b).toHaveLength(before + 1);
    expect(b[0]!.id).toBe(c[0]!.id); // le même commit pour les deux tickets
    expect(b[0]!.message).toMatch(/^replanification: 2 tickets/);
    expect(b[0]!.message).toContain(`Athena-Batch-Id: ${result.batch}`);
    expect(b[0]!.author_email).toBe('pm@example.test');
    expect(await gitlab.commits(projectId, path(t.a.key), 'main')).toHaveLength(1); // A n'a pas bougé
    expect(await gitlab.fileContent(projectId, path(t.c.key), 'main')).toContain('2026-11-19');
    const unsynced = await f.db.tx(f.org, async (c2) => Number((await c2.query('select count(*) n from outbox_event where history_synced_at is null')).rows[0].n));
    expect(unsynced).toBe(0);
    const revs = await f.db.tx(f.org, async (c2) => (await c2.query("select distinct git_sha from artifact_revision r join artifact a on a.id = r.artifact_id where a.key = any($1) and r.version = 2", [[t.b.key, t.c.key]])).rows);
    expect(revs).toEqual([{ git_sha: b[0]!.id }]);
  }, 120_000);
});
