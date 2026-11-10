import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { BacklogService } from './backlog.service';
import { SprintService } from './sprint.service';

// T-0115 : backlog côté API (ordre stable, réordonnancement, sprints exclus, droits par champ, RLS).

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'admin', roles: ['athena-user', 'athena-admin'] };
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof DomainError ? `${e.code}: ${e.message}` : String(e)));

suite('backlog (intégration)', () => {
  let testDb: TestDb;
  let backlog: BacklogService;
  let sprints: SprintService;
  let artifacts: ArtifactService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();
  const keys = async (o = org) => (await backlog.list(o, 'NOV', ['athena-user'])).map((i) => i.key);

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_backlog');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    backlog = new BacklogService(db);
    sprints = new SprintService(db);
    for (const [id, key] of [[org, 'nova'], [other, 'autre']] as const) {
      await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
      await trackers.createProject(id, 'NOV', 'Nova', admin);
    }
    const task = (key: string, typeKey: string | null) => ({
      projectKey: 'NOV', key, name: key, typeKey,
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' as const },
        { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate' as const },
        { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee' as const },
      ],
      statuses: [{ key: 'todo', name: 'À faire', category: 'todo' as const }, { key: 'done', name: 'Fait', category: 'done' as const }],
      transitions: [{ name: 'Finir', from: 'todo', to: 'done' }],
    });
    await trackers.createTracker(org, task('TSK', 'task'), admin);
    await trackers.createTracker(org, task('BUG', 'bug'), admin);
    await trackers.createTracker(other, task('TSK', 'task'), admin);
    for (const t of ['A', 'B', 'C', 'D']) await artifacts.create(org, 'NOV', 'TSK', { title: t, points: 3, assignee: 'u1' }, admin);
    await artifacts.create(org, 'NOV', 'BUG', { title: 'pas une tâche' }, admin);
    await artifacts.create(other, 'NOV', 'TSK', { title: 'autre organisation' }, admin);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('ne garde que les tickets des trackers Tâche, dans l’ordre de création tant qu’aucun rang n’existe', async () => {
    expect(await keys()).toEqual(['NOV-TSK-0001', 'NOV-TSK-0002', 'NOV-TSK-0003', 'NOV-TSK-0004']);
    expect((await backlog.list(org, 'NOV', ['athena-user']))[0]).toMatchObject({ title: 'A', points: 3, assignee: 'u1', category: 'todo' });
  });

  it('réordonne : après un ticket, ou en tête ; l’ordre est stable d’une lecture à l’autre', async () => {
    await backlog.rank(org, 'NOV', 'NOV-TSK-0004', null, admin);
    expect(await keys()).toEqual(['NOV-TSK-0004', 'NOV-TSK-0001', 'NOV-TSK-0002', 'NOV-TSK-0003']);
    await backlog.rank(org, 'NOV', 'NOV-TSK-0001', 'NOV-TSK-0003', admin);
    const order = ['NOV-TSK-0004', 'NOV-TSK-0002', 'NOV-TSK-0003', 'NOV-TSK-0001'];
    expect(await keys()).toEqual(order);
    expect(await keys()).toEqual(order);
    // un nouveau ticket, sans rang, se range à la fin
    await artifacts.create(org, 'NOV', 'TSK', { title: 'E' }, admin);
    expect((await keys()).at(-1)).toBe('NOV-TSK-0005');
  });

  it('refuse un ticket ou un voisin hors du backlog', async () => {
    expect(await code(backlog.rank(org, 'NOV', 'NOV-BUG-0001', null, admin))).toMatch(/not_found/);
    expect(await code(backlog.rank(org, 'NOV', 'NOV-TSK-0002', 'NOV-BUG-0001', admin))).toMatch(/not_found/);
    expect(await code(backlog.rank(org, 'NOV', 'NOV-TSK-0002', 'NOV-TSK-0002', admin))).toMatch(/validation/);
  });

  it('un ticket dans un sprint en cours ou planifié quitte le backlog, et y revient à la clôture sans perdre son rang', async () => {
    const id = await sprints.create(org, 'NOV', { name: 'S1', startsOn: '2026-11-01', endsOn: '2026-11-14' }, admin);
    await sprints.addItem(org, id, 'NOV-TSK-0002', 'NOV', admin);
    expect(await keys()).not.toContain('NOV-TSK-0002');
    await sprints.start(org, id, admin);
    await sprints.close(org, id, admin);
    expect((await keys()).slice(0, 2)).toEqual(['NOV-TSK-0004', 'NOV-TSK-0002']);
  });

  it('un ticket terminé quitte le backlog', async () => {
    const a = await artifacts.get(org, 'NOV', 'NOV-TSK-0003');
    await artifacts.transition(org, 'NOV', 'NOV-TSK-0003', 'Finir', a.version, admin);
    expect(await keys()).not.toContain('NOV-TSK-0003');
  });

  it('masque titre et responsable à lecture restreinte ; isole les organisations (RLS)', async () => {
    await testDb.exec("update field_definition set read_roles = '{hr}' where key in ('title', 'assignee')");
    expect((await backlog.list(org, 'NOV', ['athena-user']))[0]).toMatchObject({ title: 'NOV-TSK-0004', assignee: null });
    await testDb.exec("update field_definition set read_roles = null where key in ('title', 'assignee')");
    expect(await keys(other)).toEqual(['NOV-TSK-0001']);
    expect((await backlog.list(other, 'NOV', ['athena-user']))[0]!.title).toBe('autre organisation');
  });

  it('respecte la liste d’ayants droit du projet : un non-membre ne voit ni ne classe rien', async () => {
    const db = new Db(testDb.pool);
    await db.tx(org, async (c) => {
      const project = (await c.query("select id from project where key = 'NOV'")).rows[0].id;
      const list = (await c.query("insert into access_list (organization_id, project_id, created_by) values ($1,$2,'admin') returning id", [org, project])).rows[0].id;
      await c.query("insert into access_list_member (access_list_id, organization_id, subject, added_by) values ($1,$2,'membre','admin')", [list, org]);
    }, { system: true });
    expect(await runAs('membre', () => keys())).toContain('NOV-TSK-0004');
    expect(await runAs('intrus', () => code(backlog.list(org, 'NOV', ['athena-user'])))).toMatch(/not_found|ok/);
    expect(await runAs('intrus', () => backlog.list(org, 'NOV', ['athena-user']).catch(() => []))).toEqual([]);
    expect(await runAs('intrus', () => code(backlog.rank(org, 'NOV', 'NOV-TSK-0004', null, admin)))).toMatch(/not_found/);
  });
});
