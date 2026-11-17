import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { CapacityDataService } from './capacity-data.service';
import { CapacityService } from './capacity.service';
import { PpmSettingsService } from './settings.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const manager: Actor = { id: 'sub-mgr', roles: ['athena-team-member', 'athena-manager'] };
const otherManager: Actor = { id: 'sub-mgr2', roles: ['athena-team-member', 'athena-manager'] };
const ana: Actor = { id: 'sub-ana', roles: ['athena-team-member'] };
const bob: Actor = { id: 'sub-bob', roles: ['athena-team-member'] };
const pmo: Actor = { id: 'sub-pmo', roles: ['athena-pmo', 'athena-team-member'] };
const nov = { from: '2026-11-01', to: '2026-11-30', granularity: 'month' as const };

suite('capacité par personne et par équipe (B35, intégration)', () => {
  let testDb: TestDb;
  let data: CapacityDataService;
  let cap: CapacityService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_capacity_view');
    const db = new Db(testDb.pool);
    data = new CapacityDataService(db);
    const calendar = new CalendarService(db);
    cap = new CapacityService(db, calendar, new PpmSettingsService(db));
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'cv','cv')", [org]);
      for (const s of ['sub-admin', 'sub-mgr', 'sub-mgr2', 'sub-ana', 'sub-bob', 'sub-pmo']) await c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$2,$2,$3)', [org, s, `${s}@example.test`]);
      const t1 = (await c.query("insert into team (organization_id, key, name, created_by) values ($1,'thermique','Thermique','x') returning id", [org])).rows[0].id;
      const t2 = (await c.query("insert into team (organization_id, key, name, created_by) values ($1,'logiciel','Logiciel','x') returning id", [org])).rows[0].id;
      await c.query("insert into team_member (organization_id, team_id, subject, role, added_by) values ($1,$2,'sub-mgr','manager','x'), ($1,$2,'sub-ana','member','x'), ($1,$2,'sub-bob','member','x'), ($1,$3,'sub-mgr2','manager','x')", [org, t1, t2]);
    });
    await calendar.put(org, { workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }] }, admin);
    await new TrackerService(db, new FieldTypeRegistry()).createProject(org, 'CAP', 'Capacité', admin);
    await data.addAvailability(org, { subject: 'sub-ana', from: '2026-01-01', to: null, ratio: 0.8, workdayMinutes: null }, admin);
    await data.addAbsence(org, { subject: 'sub-ana', from: '2026-11-19', to: '2026-11-20', kind: 'leave', halfDay: false }, admin);
    await data.addAllocation(org, { project: 'CAP', subject: 'sub-ana', from: '2026-11-01', to: null, fte: 0.5 }, admin);
    await data.addAllocation(org, { project: 'CAP', team: 'thermique', roleLabel: 'thermicien', from: '2026-11-01', to: '2026-11-30', fte: 0.5 }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('la capacité d’une personne égale le calcul de référence ; la charge vient de ses allocations ; l’équipe additionne', async () => {
    const v = await cap.view(org, admin, { ...nov, team: 'thermique' });
    const a = v.people.find((p) => p.subject === 'sub-ana')!.cells[0]!;
    expect(a.capacityMinutes).toBe(Math.round(18 * 468 * 0.8)); // 21 jours − férié − 2 jours d'absence = 18 jours à 80 %
    expect(a.loadMinutes).toBe(Math.round(20 * 468 * 0.5)); // 0,5 ETP sur les 20 jours ouvrés du mois
    expect(a.projects).toEqual([{ project: 'CAP', minutes: 4680 }]);
    expect(v.people.find((p) => p.subject === 'sub-bob')!.cells[0]).toMatchObject({ capacityMinutes: 20 * 468, loadMinutes: 0, level: 'free' });
    const t = v.teams[0]!;
    expect(t.cells[0]).toMatchObject({ nominativeMinutes: 4680, genericMinutes: 4680 });
    expect(t.cells[0]!.capacityMinutes).toBe(a.capacityMinutes + 20 * 468 + 20 * 468); // ana, bob et le manager (membre de l'équipe)
    expect(t.needs).toEqual([{ roleLabel: 'thermicien', minutes: [4680] }]);
  });

  it('visibilité : le manager ne voit que ses équipes, un autre manager est refusé, la personne ne voit qu’elle, le PMO voit tout', async () => {
    expect((await cap.view(org, manager, nov)).people.map((p) => p.subject).sort()).toEqual(['sub-ana', 'sub-bob', 'sub-mgr']);
    expect((await cap.view(org, otherManager, nov)).people.map((p) => p.subject)).toEqual(['sub-mgr2']);
    await expect(cap.view(org, otherManager, { ...nov, team: 'thermique' })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await cap.view(org, bob, nov)).people.map((p) => p.subject)).toEqual(['sub-bob']);
    expect((await cap.view(org, pmo, nov)).people.length).toBe(4);
    await expect(cap.view(org, admin, { ...nov, team: 'inconnue' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('semaines et mois : même charge sur le mois ; l’horizon est borné', async () => {
    const weeks = await cap.view(org, admin, { from: '2026-11-02', to: '2026-11-27', granularity: 'week', team: 'thermique' });
    const month = await cap.view(org, admin, { from: '2026-11-02', to: '2026-11-27', granularity: 'month', team: 'thermique' });
    const sum = (v: typeof weeks) => v.people.find((p) => p.subject === 'sub-ana')!.cells.reduce((n, c) => n + c.loadMinutes, 0);
    // quatre semaines pleines du 2 au 27 : 19 jours ouvrés (le 11 est férié) à 0,5 ETP ; le mois civil en compte 20 (le 30 est hors de ces semaines)
    expect(sum(weeks)).toBe(Math.round(19 * 468 * 0.5));
    expect(sum(month)).toBe(Math.round(20 * 468 * 0.5));
    expect(month.periods).toHaveLength(1);
    await expect(cap.view(org, admin, { from: '2020-01-01', to: '2030-12-31', granularity: 'week' })).rejects.toMatchObject({ code: 'validation' });
  });

  it('goulots : une équipe saturée est classée avec les projets qui la chargent ; surcharge au-delà du seuil', async () => {
    await data.addAllocation(org, { project: 'CAP', subject: 'sub-bob', from: '2026-11-01', to: '2026-11-30', fte: 1.5 }, admin);
    await data.addAllocation(org, { project: 'CAP', subject: 'sub-mgr', from: '2026-11-01', to: '2026-11-30', fte: 1 }, admin);
    const v = await cap.view(org, admin, { ...nov, team: 'thermique' });
    expect(v.people.find((p) => p.subject === 'sub-bob')!.cells[0]!.level).toBe('overload');
    expect(v.bottlenecks[0]).toMatchObject({ team: 'thermique', period: '2026-11' });
    expect(v.bottlenecks[0]!.projects[0]!.project).toBe('CAP');
    expect(v.bottlenecks[0]!.saturationPercent).toBeGreaterThan(100);
  });
});
