import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { PpmSettingsService } from './settings.service';
import { StatusNoteInput, StatusNoteService } from './status-note.service';
import { WeatherReminderService } from './weather-reminder.service';

const suite = pgUp ? describe : describe.skip;
const pm: Actor = { id: 'sub-pm', roles: ['athena-team-member', 'athena-pm'] };
const day = (n: number) => new Date(Date.now() + n * 86_400_000);

suite('rappel de météo (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let reminders: WeatherReminderService;
  let notes: StatusNoteService;
  const org = crypto.randomUUID();
  const count = async (project: string) => (await db.tx(org, (c) => c.query(
    "select count(*)::int n from notification x join project p on p.id = x.project_id where p.key = $1 and x.event = 'weather'", [project]))).rows[0].n as number;

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_weather');
    db = new Db(testDb.pool);
    reminders = new WeatherReminderService(db, new PpmSettingsService(db));
    notes = new StatusNoteService(db);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'wr','wr')", [org]);
      await c.query("insert into project (organization_id, key, name, created_at) values ($1,'OLD','Ancien', now() - interval '60 days'), ($1,'NEW','Récent', now()), ($1,'DON','Terminé', now() - interval '60 days')", [org]);
      await c.query("update project set lifecycle_state = 'completed' where key = 'DON'");
      await c.query("insert into project_member (organization_id, project_id, subject, role, added_by) select $1, id, 'sub-pm', 'manager', 'x' from project", [org]);
    });
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('rappelle le chef d’un projet actif sans météo depuis 30 jours, une seule fois par période, jamais un projet terminé ni récent', async () => {
    expect(await reminders.run(org)).toBe(1);
    expect([await count('OLD'), await count('NEW'), await count('DON')]).toEqual([1, 0, 0]);
    expect(await reminders.run(org)).toBe(0); // même période : pas de second rappel
    expect(await reminders.run(org, day(29))).toBe(0);
    expect(await reminders.run(org, day(31))).toBe(2); // période suivante : OLD, et NEW devenu vieux de 31 jours
    expect([await count('OLD'), await count('NEW')]).toEqual([2, 1]);
  });

  it('une météo écrite repousse le rappel ; le réglage de notification « weather » désactivé l’empêche', async () => {
    await notes.write(org, 'OLD', StatusNoteInput.parse({ schedule: 'ok', scope: 'ok', risk: 'ok' }), pm);
    expect(await reminders.run(org, day(10))).toBe(0); // météo écrite il y a moins de 30 jours
    await db.tx(org, (c) => c.query("insert into notification_pref (organization_id, subject, event, enabled) values ($1,'sub-pm','weather',false)", [org]));
    expect(await reminders.run(org, day(200))).toBe(0);
  });

  it('échéance d’une décision : le responsable est notifié une seule fois, à trois jours de l’échéance', async () => {
    await db.tx(org, async (c) => {
      await c.query("insert into portfolio (organization_id, key, name, created_by) values ($1,'dec','Décisions','x')", [org]);
      await c.query("insert into portfolio_decision (organization_id, portfolio_id, project_id, kind, rationale, owner, due_on, decided_by) select $1, f.id, p.id, 'continue', 'À suivre', 'sub-pm', '2026-12-10', 'x' from portfolio f, project p where f.key = 'dec' and p.key = 'NEW'", [org]);
    });
    const countDecision = async () => (await db.tx(org, (c) => c.query("select count(*)::int n from notification where event = 'decision'"))).rows[0].n as number;
    expect(await reminders.runDecisions(org, new Date('2026-12-01T00:00:00Z'))).toBe(0); // trop tôt
    expect(await reminders.runDecisions(org, new Date('2026-12-08T00:00:00Z'))).toBe(1);
    expect(await reminders.runDecisions(org, new Date('2026-12-11T00:00:00Z'))).toBe(0); // une seule fois
    expect(await countDecision()).toBe(1);
  });
});
