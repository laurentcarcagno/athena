import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { TrackerService, type TrackerSpec } from '../core/tracker.service';
import { BaselineService } from '../history/baseline.service';
import { GitLabClient } from '../history/gitlab-client';
import { HistorySync } from '../history/history-sync';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    expect(s.links.map(({ id: _id, ...l }) => l)).toEqual([{ from: t.a.key, to: t.b.key, lag: 0 }, { from: t.b.key, to: t.c.key, lag: 1 }, { from: t.c.key, to: t.m.key, lag: 0 }]);
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

suite('édition d’une tâche du planning (intégration)', () => {
  let f: Fixture;
  let t: Awaited<ReturnType<typeof seedReference>>;
  const vals = async (key: string) => (await f.artifacts.get(f.org, 'NOVA', key)).values;

  beforeAll(async () => {
    f = await fixture('athena_test_schedule_edit', 'sch2');
    t = await seedReference(f);
    await f.schedule.apply(f.org, 'NOVA', pm); // part d’un planning cohérent
  }, 60_000);
  afterAll(async () => { await f?.testDb.drop(); });

  it('une nouvelle durée repousse les successeurs, sous un seul lot', async () => {
    // A dure 2 jours (9-10 nov.) ; 4 jours la font finir le 12 : B, C et le jalon glissent d’autant.
    const r = await f.schedule.edit(f.org, 'NOVA', t.a.key, { duration: 4 }, pm);
    expect(await vals(t.a.key)).toMatchObject({ start: '2026-11-09', due: '2026-11-13' });
    expect(await vals(t.b.key)).toMatchObject({ start: '2026-11-16' });
    expect(r.keys.sort()).toEqual([t.a.key, t.b.key, t.c.key, t.m.key].sort());
    expect(r.moved).toBe(4);
    const batches = await f.db.tx(f.org, async (c) => (await c.query("select distinct payload->>'batch' b from outbox_event where payload->>'batch' = $1", [r.batch])).rows);
    expect(batches).toHaveLength(1);
    const events = await f.db.tx(f.org, async (c) => Number((await c.query("select count(*) n from outbox_event where payload->>'batch' = $1 and type = 'artifact.updated'", [r.batch])).rows[0].n));
    expect(events).toBe(4);
  });

  it('déplacer le début garde la durée en jours ouvrés et cale sur un jour ouvré', async () => {
    const before = await vals(t.d.key); // D : 9-10 nov., deux jours
    expect(before).toMatchObject({ start: '2026-11-09', due: '2026-11-10' });
    await f.schedule.edit(f.org, 'NOVA', t.d.key, { start: '2026-11-14' }, pm); // samedi : lundi 16
    expect(await vals(t.d.key)).toMatchObject({ start: '2026-11-16', due: '2026-11-17' });
  });

  it('étirer la fin change la durée ; une fin avant le début est refusée', async () => {
    await f.schedule.edit(f.org, 'NOVA', t.d.key, { due: '2026-11-19' }, pm);
    expect(await vals(t.d.key)).toMatchObject({ start: '2026-11-16', due: '2026-11-19' });
    await expect(f.schedule.edit(f.org, 'NOVA', t.d.key, { due: '2026-11-13' }, pm)).rejects.toMatchObject({ code: 'validation' });
  });

  it('un jalon ne bouge que par sa date ; une tâche parente n’est pas modifiable', async () => {
    await f.schedule.edit(f.org, 'NOVA', t.m.key, { due: '2026-12-01' }, pm);
    expect(await vals(t.m.key)).toMatchObject({ due: '2026-12-01' });
    await expect(f.schedule.edit(f.org, 'NOVA', t.m.key, { duration: 3 }, pm)).rejects.toMatchObject({ code: 'validation' });
    const p = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'Parent', start: '2026-12-07', due: '2026-12-08' }, admin);
    const x = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'Enfant', start: '2026-12-07', due: '2026-12-08' }, admin);
    await f.links.link(f.org, 'NOVA', x.key, p.key, 'parent', admin);
    await expect(f.schedule.edit(f.org, 'NOVA', p.key, { start: '2026-12-14' }, pm)).rejects.toMatchObject({ code: 'validation', details: [expect.stringContaining('tâche parente')] });
  });

  it('refuse zéro ou plusieurs champs, et une tâche inconnue', async () => {
    await expect(f.schedule.edit(f.org, 'NOVA', t.a.key, {}, pm)).rejects.toMatchObject({ code: 'validation' });
    await expect(f.schedule.edit(f.org, 'NOVA', t.a.key, { start: '2026-11-09', due: '2026-11-10' }, pm)).rejects.toMatchObject({ code: 'validation' });
    await expect(f.schedule.edit(f.org, 'NOVA', 'NOVA-TSK-9999', { duration: 2 }, pm)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('expose les identifiants de lien et la version des tickets pour l’interface', async () => {
    const s = await f.schedule.get(f.org, 'NOVA', ['athena-user']);
    expect(s.links.every((l) => typeof l.id === 'string' && l.id.length > 0)).toBe(true);
    expect(s.tasks.find((x) => x.key === t.a.key)!.version).toBeGreaterThan(1);
    expect(s.tasks.find((x) => x.key === t.a.key)!.status).toEqual({ key: 'todo', name: 'À faire', category: 'todo', color: null });
    expect(s.tasks.find((x) => x.key === t.a.key)!.assignee).toBeNull();
  });
});

suite('décalage d’un lien modifiable après création (intégration)', () => {
  let f: Fixture;
  let t: Awaited<ReturnType<typeof seedReference>>;
  const vals = async (key: string) => (await f.artifacts.get(f.org, 'NOVA', key)).values;
  const linkId = async (from: string) => (await f.schedule.get(f.org, 'NOVA', ['athena-user'])).links.find((l) => l.from === from)!.id;

  beforeAll(async () => {
    f = await fixture('athena_test_schedule_lag', 'sch4');
    t = await seedReference(f);
    await f.schedule.apply(f.org, 'NOVA', pm);
  }, 60_000);
  afterAll(async () => { await f?.testDb.drop(); });

  it('allonger le décalage repousse les successeurs, sous un seul lot', async () => {
    // B finit le 12 ; C (décalage 1) commence le 16. Passer le décalage à 3 repousse C au 18, puis le jalon.
    const r = await f.schedule.setLag(f.org, 'NOVA', await linkId(t.b.key), 3, pm);
    expect(r.keys.sort()).toEqual([t.c.key, t.m.key].sort());
    expect(await vals(t.c.key)).toMatchObject({ start: '2026-11-18', due: '2026-11-23' });
    const view = await f.schedule.get(f.org, 'NOVA', ['athena-user']);
    expect(view.links.find((l) => l.from === t.b.key)!.lag).toBe(3);
    const events = await f.db.tx(f.org, async (c) => (await c.query("select type from outbox_event where type in ('link.updated','schedule.changed') order by created_at desc limit 2")).rows.map((x) => x.type).sort());
    expect(events).toEqual(['link.updated', 'schedule.changed']);
  });

  it('un décalage identique ne change rien ; refuse hors bornes et un lien inconnu ou non ordonné', async () => {
    const id = await linkId(t.b.key);
    expect(await f.schedule.setLag(f.org, 'NOVA', id, 3, pm)).toEqual({ moved: 0, keys: [], batch: null });
    await expect(f.schedule.setLag(f.org, 'NOVA', id, 400, pm)).rejects.toMatchObject({ code: 'validation' });
    await expect(f.schedule.setLag(f.org, 'NOVA', '00000000-0000-0000-0000-000000000000', 1, pm)).rejects.toMatchObject({ code: 'not_found' });
    const x = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'X', start: '2026-12-01', due: '2026-12-01' }, admin);
    const y = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'Y', start: '2026-12-01', due: '2026-12-01' }, admin);
    const other = await f.links.link(f.org, 'NOVA', x.key, y.key, 'blocks', admin);
    await expect(f.schedule.setLag(f.org, 'NOVA', other, 1, pm)).rejects.toMatchObject({ code: 'not_found' }); // « bloque » n’est pas une dépendance de planning
  });
});

suite('baselines antérieures à la migration 061 (intégration)', () => {
  let f: Fixture;
  let t: Awaited<ReturnType<typeof seedReference>>;

  beforeAll(async () => {
    f = await fixture('athena_test_schedule_backfill', 'sch5');
    t = await seedReference(f);
  }, 60_000);
  afterAll(async () => { await f?.testDb.drop(); });

  it('reconstitue les dates figées depuis les révisions au moment de la baseline, sans toucher aux autres', async () => {
    const project = await f.db.tx(f.org, async (c) => (await c.query("select id from project where key = 'NOVA'")).rows[0].id as string);
    // Baseline d'avant la migration 060 : créée après les tickets, sans dates figées.
    await f.testDb.exec("insert into baseline (organization_id, project_id, name, git_tag, git_sha, created_by, created_at) values ($1,$2,'ANCIENNE','baseline/ANCIENNE','abc','u', now() + interval '1 minute')", [f.org, project]);
    // Modification postérieure : la baseline doit garder l'ancienne date.
    const b = await f.artifacts.get(f.org, 'NOVA', t.b.key);
    await f.artifacts.update(f.org, 'NOVA', t.b.key, { due: '2026-11-30' }, b.version, admin);
    await f.testDb.exec("update artifact_revision set created_at = now() + interval '5 minutes' where artifact_id = $1 and version = 2", [b.id]);
    await f.testDb.exec(readFileSync(join(__dirname, '../db/migrations/061_baseline_schedule_backfill.sql'), 'utf8'));
    const rows = await f.db.tx(f.org, async (c) => (await c.query(
      "select artifact_key, to_char(planned_start,'YYYY-MM-DD') s, to_char(planned_end,'YYYY-MM-DD') e from baseline_schedule order by artifact_key")).rows);
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.artifact_key === t.b.key)).toEqual({ artifact_key: t.b.key, s: '2026-11-10', e: '2026-11-10' });
    expect(rows.find((r) => r.artifact_key === t.m.key)).toEqual({ artifact_key: t.m.key, s: null, e: '2026-11-19' });
    const view = await f.schedule.get(f.org, 'NOVA', ['athena-user'], 'ANCIENNE');
    expect(view.tasks.find((x) => x.key === t.b.key)).toMatchObject({ baselineEnd: '2026-11-10' });
    // Rejouée, la migration n'ajoute rien (une baseline qui a un planning est laissée telle quelle).
    await f.testDb.exec(readFileSync(join(__dirname, '../db/migrations/061_baseline_schedule_backfill.sql'), 'utf8'));
    expect(await f.db.tx(f.org, async (c) => Number((await c.query('select count(*) n from baseline_schedule')).rows[0].n))).toBe(5);
  });
});

suite('planning figé par une baseline (intégration)', () => {
  let f: Fixture;
  let t: Awaited<ReturnType<typeof seedReference>>;

  beforeAll(async () => {
    f = await fixture('athena_test_schedule_baseline', 'sch3');
    t = await seedReference(f);
    await f.schedule.apply(f.org, 'NOVA', pm);
  }, 60_000);
  afterAll(async () => { await f?.testDb.drop(); });

  /** Insère directement une baseline et ses dates figées (la création complète passe par GitLab, voir plus bas). */
  async function freeze(name: string) {
    const rows = await f.schedule.snapshot(f.org, 'NOVA');
    await f.db.tx(f.org, async (c) => {
      const project = (await c.query("select id from project where key = 'NOVA'")).rows[0].id as string;
      const id = (await c.query("insert into baseline (organization_id, project_id, name, git_tag, git_sha, created_by) values ($1,$2,$3,$4,'abc','u') returning id", [f.org, project, name, `baseline/${name}`])).rows[0].id as string;
      for (const r of rows) await c.query('insert into baseline_schedule (baseline_id, organization_id, artifact_key, planned_start, planned_end) values ($1,$2,$3,$4,$5)', [id, f.org, r.key, r.start, r.end]);
    });
    return rows;
  }

  it('l’instantané contient les dates planifiées, sans début pour un jalon', async () => {
    const rows = await f.schedule.snapshot(f.org, 'NOVA');
    expect(rows.find((r) => r.key === t.m.key)).toEqual({ key: t.m.key, start: null, end: '2026-11-19' });
    expect(rows.find((r) => r.key === t.c.key)).toEqual({ key: t.c.key, start: '2026-11-16', end: '2026-11-19' });
    expect(rows).toHaveLength(5);
  });

  it('compare à la baseline : dates figées et écart en jours ouvrés (positif = retard)', async () => {
    await freeze('B1');
    expect((await f.schedule.baselines(f.org, 'NOVA')).map((b) => [b.name, b.tasks])).toEqual([['B1', 5]]);
    await f.schedule.edit(f.org, 'NOVA', t.a.key, { duration: 4 }, pm); // A finit le 13 (le 11 est férié : +2 jours ouvrés) ; B, C et le jalon glissent d’autant
    const s = await f.schedule.get(f.org, 'NOVA', ['athena-user'], 'B1');
    const row = (k: string) => s.tasks.find((x) => x.key === k)!;
    expect(s.baseline).toMatchObject({ name: 'B1' });
    expect(row(t.a.key)).toMatchObject({ baselineStart: '2026-11-09', baselineEnd: '2026-11-10', plannedEnd: '2026-11-13', variance: 2 });
    expect(row(t.m.key)).toMatchObject({ baselineStart: null, baselineEnd: '2026-11-19', plannedEnd: '2026-11-23', variance: 2 });
    expect(row(t.d.key)).toMatchObject({ variance: 0 });
  });

  it('une baseline ne change pas quand le planning bouge ; un ticket créé depuis n’y figure pas', async () => {
    const late = await f.artifacts.create(f.org, 'NOVA', 'TSK', { title: 'Tardive', start: '2026-12-01', due: '2026-12-02' }, admin);
    const s = await f.schedule.get(f.org, 'NOVA', ['athena-user'], 'B1');
    expect(s.tasks.find((x) => x.key === late.key)).toMatchObject({ baselineEnd: null, variance: null });
    expect(s.tasks.find((x) => x.key === t.d.key)).toMatchObject({ baselineStart: '2026-11-09' });
  });

  it('sans baseline demandée, aucun écart ; une baseline inconnue est introuvable', async () => {
    const s = await f.schedule.get(f.org, 'NOVA', ['athena-user']);
    expect(s.baseline).toBeNull();
    expect(s.tasks.every((x) => x.variance === null && x.baselineEnd === null)).toBe(true);
    await expect(f.schedule.get(f.org, 'NOVA', ['athena-user'], 'NOPE')).rejects.toMatchObject({ code: 'not_found' });
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

  it('une baseline créée par le service fige les dates planifiées', async () => {
    const sync = new HistorySync(f.testDb.pool, gitlab, 'root');
    await sync.runOnce();
    const baselines = new BaselineService(f.testDb.pool, gitlab, 'root', 'main', (org, project) => f.schedule.snapshot(org, project));
    await baselines.create(f.org, 'NOVA', 'PLAN-1', pm);
    expect((await f.schedule.baselines(f.org, 'NOVA')).map((b) => [b.name, b.tasks])).toEqual([['PLAN-1', 5]]);
    const view = await f.schedule.get(f.org, 'NOVA', ['athena-user'], 'PLAN-1');
    expect(view.tasks.filter((x) => x.baselineEnd !== null)).toHaveLength(5);
    expect(view.tasks.every((x) => x.variance === 0)).toBe(true);
  }, 120_000);
});
