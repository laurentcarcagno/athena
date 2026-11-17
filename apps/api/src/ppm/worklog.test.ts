import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { ArtifactService } from '../core/artifact.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { CapacityDataService } from './capacity-data.service';
import { PpmSettingsService } from './settings.service';
import { WorklogService } from './worklog.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const ana: Actor = { id: 'sub-ana', roles: ['athena-team-member'] };
const bob: Actor = { id: 'sub-bob', roles: ['athena-team-member'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return (e as { code?: string })?.code ?? (e ? 'autre' : 'ok'); };

suite('temps passé (B36, intégration)', () => {
  let testDb: TestDb;
  let svc: WorklogService;
  let access: AccessService;
  let ticket = '';
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_worklog');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    svc = new WorklogService(db, new CalendarService(db), new PpmSettingsService(db));
    access = new AccessService(db);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'wl','wl')", [org]);
      for (const s of ['sub-admin', 'sub-ana', 'sub-bob']) await c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$2,$2,$3)', [org, s, `${s}@example.test`]);
    });
    await trackers.createProject(org, 'TPS', 'Temps', admin);
    await trackers.createTracker(org, {
      projectKey: 'TPS', key: 'TSK', name: 'Tâches', typeKey: 'task', fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }],
      statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }],
    }, admin);
    ticket = (await artifacts.create(org, 'TPS', 'TSK', { title: 'Écrire le plan' }, admin)).key;
    await new CapacityDataService(db).addAllocation(org, { project: 'TPS', subject: 'sub-ana', from: '2026-11-01', to: '2026-11-30', fte: 0.5 }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('chacun saisit son temps ; on ne saisit pas pour un autre (sauf l’administrateur) ; on ne retire que le sien', async () => {
    const a = await svc.add(org, 'TPS', ticket, { day: '2026-11-10', minutes: 468, comment: 'Plan' }, ana);
    await svc.add(org, 'TPS', ticket, { day: '2026-11-12', minutes: 90, comment: '' }, bob);
    expect(await code(svc.add(org, 'TPS', ticket, { day: '2026-11-10', minutes: 60, comment: '' }, ana, 'sub-bob'))).toBe('forbidden');
    expect((await svc.add(org, 'TPS', ticket, { day: '2026-11-13', minutes: 30, comment: 'correction' }, admin, 'sub-bob')).subject).toBe('sub-bob');
    const list = await svc.forTicket(org, 'TPS', ticket);
    expect(list.totalMinutes).toBe(468 + 90 + 30);
    expect(list.rows[0]!.day).toBe('2026-11-13');
    expect(await code(svc.remove(org, a.id, bob))).toBe('forbidden');
    await svc.remove(org, a.id, ana);
    expect((await svc.forTicket(org, 'TPS', ticket)).totalMinutes).toBe(120);
    expect(await code(svc.add(org, 'TPS', 'TPS-TSK-9999', { day: '2026-11-10', minutes: 60, comment: '' }, ana))).toBe('not_found');
  });

  it('planifié contre consommé : allocations du projet et temps passé, par période et par personne', async () => {
    await svc.add(org, 'TPS', ticket, { day: '2026-11-17', minutes: 480, comment: '' }, ana);
    const r = await svc.plannedVsConsumed(org, 'TPS', { from: '2026-11-01', to: '2026-12-31', granularity: 'month' });
    expect(r.periods).toEqual([{ key: '2026-11', plannedMinutes: Math.round(21 * 468 * 0.5), consumedMinutes: 600 }, { key: '2026-12', plannedMinutes: 0, consumedMinutes: 0 }]);
    expect(r.byPerson.map((p) => [p.subject, p.consumedMinutes])).toEqual([['sub-ana', 480], ['sub-bob', 120]]);
  });

  it('le temps passé suit la visibilité du ticket : un projet masqué n’expose rien', async () => {
    await runAs('sub-admin', () => access.set(org, 'TPS', { members: ['sub-admin'] }, admin));
    const seen = await runAs('sub-bob', () => svc.plannedVsConsumed(org, 'TPS', { from: '2026-11-01', to: '2026-11-30' }).catch((e: unknown) => ({ erreur: (e as { code?: string }).code })));
    expect(JSON.stringify(seen)).not.toContain('sub-ana');
    await runAs('sub-admin', () => access.remove(org, 'TPS', null, admin));
  });
});
