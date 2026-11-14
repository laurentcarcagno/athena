import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ScheduleService } from './schedule.service';

// T-0166 : mesure à 500 lignes, de bout en bout côté API (lecture des tickets et des liens, calcul, sérialisation).

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };

suite('planning de 500 tickets et 800 liens (intégration)', () => {
  let testDb: TestDb;
  let schedule: ScheduleService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_schedule_perf');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    schedule = new ScheduleService(db, artifacts, new CalendarService(db));
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'perf','perf')", [org]));
    await trackers.createProject(org, 'PERF', 'Perf', admin);
    await trackers.createTracker(org, {
      projectKey: 'PERF', key: 'TSK', name: 'Tâches', typeKey: 'task',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date' },
        { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date' },
      ],
      statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }],
    }, admin);
    const day = (n: number) => new Date(Date.UTC(2026, 0, 5) + n * 86_400_000).toISOString().split('T')[0]!;
    for (let i = 0; i < 500; i++) await artifacts.create(org, 'PERF', 'TSK', { title: `T${i}`, start: day(i % 120), due: day((i % 120) + 3 + (i % 5)) }, admin);
    // 800 liens « précède » d'un ticket vers un ticket plus récent (jamais de cycle), en une requête.
    await db.tx(org, async (c) => {
      const link = (await c.query("select id from link_type where key = 'precedes' and project_id is null")).rows[0]?.id as string | undefined
        ?? (await c.query(`insert into link_type (organization_id, project_id, key, outward_label, inward_label, ordered) values ($1,null,'precedes','précède','succède à',true) returning id`, [org])).rows[0].id as string;
      await c.query(
        `with a as (select id, row_number() over (order by number) n from artifact),
              pairs as (select x.n as f, x.n + 1 + (x.n * 7) % 40 as t from a x where x.n < 500 union all select x.n, x.n + 1 + (x.n * 13) % 90 from a x where x.n < 500)
         insert into artifact_link (organization_id, from_artifact_id, to_artifact_id, link_type_id, lag_days)
         select $1, af.id, at.id, $2, 0 from (select distinct f, t from pairs where t <= 500) p join a af on af.n = p.f join a at on at.n = p.t limit 800`,
        [org, link],
      );
    });
  }, 300_000);
  afterAll(async () => { await testDb?.drop(); });

  it('lit, calcule et assemble le planning en moins de 500 ms', async () => {
    const count = await new Db(testDb.pool).tx(org, async (c) => Number((await c.query('select count(*) n from artifact_link')).rows[0].n));
    expect(count).toBe(800);
    await schedule.get(org, 'PERF', ['athena-team-member']); // échauffement (plans de requête, calendrier)
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const view = await schedule.get(org, 'PERF', ['athena-team-member']);
      times.push(performance.now() - t0);
      expect(view.tasks).toHaveLength(500);
      expect(view.links).toHaveLength(800);
    }
    console.info(`planning 500 tickets / 800 liens : ${times.map((t) => `${t.toFixed(0)} ms`).join(', ')}`);
    expect(Math.min(...times)).toBeLessThan(500);
  });
});
