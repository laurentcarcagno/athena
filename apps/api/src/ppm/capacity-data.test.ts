import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { CapacityDataService } from './capacity-data.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const manager: Actor = { id: 'sub-mgr', roles: ['athena-team-member', 'athena-manager'] };
const otherManager: Actor = { id: 'sub-mgr2', roles: ['athena-team-member', 'athena-manager'] };
const ana: Actor = { id: 'sub-ana', roles: ['athena-team-member'] };
const bob: Actor = { id: 'sub-bob', roles: ['athena-team-member'] };
const pmo: Actor = { id: 'sub-pmo', roles: ['athena-pmo', 'athena-team-member'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return (e as { code?: string })?.code ?? (e ? 'autre' : 'ok'); };

suite('saisie de la capacité (B35, intégration)', () => {
  let testDb: TestDb;
  let svc: CapacityDataService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_capacity_data');
    const db = new Db(testDb.pool);
    svc = new CapacityDataService(db);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'cd','cd')", [org]);
      for (const s of ['sub-admin', 'sub-mgr', 'sub-mgr2', 'sub-ana', 'sub-bob', 'sub-pmo']) await c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$2,$2,$3)', [org, s, `${s}@example.test`]);
      const t = (await c.query("insert into team (organization_id, key, name, created_by) values ($1,'thermique','Thermique','x') returning id", [org])).rows[0].id;
      await c.query("insert into team_member (organization_id, team_id, subject, role, added_by) values ($1,$2,'sub-mgr','manager','x'), ($1,$2,'sub-ana','member','x')", [org, t]);
    });
    await new TrackerService(db, new FieldTypeRegistry()).createProject(org, 'CAP', 'Capacité', admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('disponibilité : le manager de l’équipe la saisit, un autre manager non, la personne ne règle pas son propre temps partiel', async () => {
    const a = await svc.addAvailability(org, { subject: 'sub-ana', from: '2026-01-01', to: null, ratio: 0.8, workdayMinutes: 420 }, manager);
    expect(a).toMatchObject({ ratio: 0.8, workdayMinutes: 420 });
    expect(await code(svc.addAvailability(org, { subject: 'sub-ana', from: '2026-01-01', to: null, ratio: 0.5, workdayMinutes: null }, otherManager))).toBe('forbidden');
    expect(await code(svc.addAvailability(org, { subject: 'sub-ana', from: '2026-01-01', to: null, ratio: 0.5, workdayMinutes: null }, ana))).toBe('forbidden');
    expect(await code(svc.addAvailability(org, { subject: 'inconnu', from: '2026-01-01', to: null, ratio: 1, workdayMinutes: null }, admin))).toBe('validation');
    expect((await svc.listAvailability(org, 'sub-ana', ana))[0]).toMatchObject({ ratio: 0.8 }); // la personne lit la sienne
    expect(await code(svc.listAvailability(org, 'sub-ana', bob))).toBe('forbidden');
    expect((await svc.listAvailability(org, 'sub-ana', pmo)).length).toBe(1);
  });

  it('absences : la personne saisit les siennes ; le motif n’est rendu ni au PMO ni à un autre ; une demi-journée tient sur un jour', async () => {
    const abs = await svc.addAbsence(org, { subject: 'sub-ana', from: '2026-11-19', to: '2026-11-20', kind: 'training', halfDay: false }, ana);
    expect(await code(svc.addAbsence(org, { subject: 'sub-ana', from: '2026-11-19', to: '2026-11-20', kind: 'leave', halfDay: true }, ana))).toBe('validation');
    expect(await code(svc.addAbsence(org, { subject: 'sub-ana', from: '2026-12-01', to: '2026-12-01', kind: 'leave', halfDay: false }, bob))).toBe('forbidden');
    expect((await svc.listAbsences(org, 'sub-ana', ana))[0]!.kind).toBe('training');
    expect((await svc.listAbsences(org, 'sub-ana', manager))[0]!.kind).toBe('training');
    expect((await svc.listAbsences(org, 'sub-ana', pmo))[0]).toMatchObject({ from: '2026-11-19', kind: null });
    await svc.removeAbsence(org, abs.id, ana);
    expect(await svc.listAbsences(org, 'sub-ana', ana)).toEqual([]);
    expect(await code(svc.removeAbsence(org, abs.id, ana))).toBe('not_found');
  });

  it('allocations : nominative ou générique (équipe et rôle), jamais les deux', async () => {
    const nominative = await svc.addAllocation(org, { project: 'CAP', subject: 'sub-ana', from: '2026-11-01', to: '2026-12-31', fte: 0.5 }, admin);
    const generic = await svc.addAllocation(org, { project: 'CAP', team: 'thermique', roleLabel: 'thermicien', from: '2026-11-01', to: null, fte: 0.5 }, admin);
    expect(await svc.listAllocations(org, 'CAP')).toMatchObject([{ subject: 'sub-ana', team: null }, { subject: null, team: 'thermique', roleLabel: 'thermicien' }]);
    expect(await code(svc.addAllocation(org, { project: 'CAP', subject: 'sub-ana', team: 'thermique', roleLabel: 'x', from: '2026-11-01', to: null, fte: 1 }, admin))).toBe('validation');
    expect(await code(svc.addAllocation(org, { project: 'CAP', team: 'thermique', from: '2026-11-01', to: null, fte: 1 }, admin))).toBe('validation');
    expect(await code(svc.addAllocation(org, { project: 'CAP', team: 'nope', roleLabel: 'x', from: '2026-11-01', to: null, fte: 1 }, admin))).toBe('not_found');
    await svc.removeAllocation(org, 'CAP', generic.id, admin);
    expect((await svc.listAllocations(org, 'CAP')).map((a) => a.id)).toEqual([nominative.id]);
  });
});
