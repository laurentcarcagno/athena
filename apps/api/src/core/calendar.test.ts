import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { CalendarInput, CalendarService } from './calendar.service';
import { Db, type Actor } from './db';
import { isWorkingDay } from './work-calendar';

const admin: Actor = { id: 'admin', roles: ['athena-admin'] };

describe('validation du calendrier', () => {
  it('exige au moins un jour ISO, des dates réelles et refuse les clés étrangères', () => {
    expect(CalendarInput.safeParse({ workDays: [1, 2, 3], holidays: [{ day: '2026-12-25', label: 'Noël' }] }).success).toBe(true);
    expect(CalendarInput.safeParse({ workDays: [], holidays: [] }).success).toBe(false);
    expect(CalendarInput.safeParse({ workDays: [0, 8], holidays: [] }).success).toBe(false);
    expect(CalendarInput.safeParse({ workDays: [1], holidays: [{ day: '2026-02-30', label: 'x' }] }).success).toBe(false);
    expect(CalendarInput.safeParse({ workDays: [1], holidays: [{ day: '2026-12-25', label: '' }] }).success).toBe(false);
    expect(CalendarInput.safeParse({ workDays: [1], holidays: [], extra: 1 }).success).toBe(false);
  });
});

const suite = pgUp ? describe : describe.skip;
suite('calendrier d’organisation (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let calendar: CalendarService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_calendar');
    db = new Db(testDb.pool);
    calendar = new CalendarService(db);
    for (const [id, key] of [[org, 'cal1'], [other, 'cal2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('lundi au vendredi sans férié tant que rien n’est réglé', async () => {
    expect(await calendar.get(org)).toEqual({ workDays: [1, 2, 3, 4, 5], holidays: [] });
  });

  it('enregistre la semaine et les fériés triés, sans doublon de jour de semaine, isolés par organisation', async () => {
    const saved = await calendar.put(org, { workDays: [5, 1, 2, 3, 4, 4], holidays: [{ day: '2026-12-25', label: 'Noël' }, { day: '2026-11-11', label: 'Armistice' }] }, admin);
    expect(saved).toEqual({ workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }, { day: '2026-12-25', label: 'Noël' }] });
    expect(await calendar.get(other)).toEqual({ workDays: [1, 2, 3, 4, 5], holidays: [] });
    const loaded = await calendar.load(org);
    expect(isWorkingDay(loaded, '2026-11-11')).toBe(false);
    expect(isWorkingDay(loaded, '2026-11-12')).toBe(true);
  });

  it('remplace l’ensemble à chaque enregistrement et le journalise', async () => {
    await calendar.put(org, { workDays: [1, 2, 3, 4, 5, 6], holidays: [] }, admin);
    expect(await calendar.get(org)).toEqual({ workDays: [1, 2, 3, 4, 5, 6], holidays: [] });
    const log = await db.tx(org, async (c) => (await c.query("select actor, detail from audit_log where action = 'calendar.update'")).rows);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ actor: 'admin' });
  });

  it('refuse deux fériés le même jour', async () => {
    await expect(calendar.put(org, { workDays: [1], holidays: [{ day: '2026-05-01', label: 'a' }, { day: '2026-05-01', label: 'b' }] }, admin)).rejects.toMatchObject({ code: 'validation' });
    expect((await calendar.get(org)).workDays).toEqual([1, 2, 3, 4, 5, 6]); // rien n'a changé
  });
});
