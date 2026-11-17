import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { ArtifactService } from '../core/artifact.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TemplateService } from '../core/template.service';
import { TemplateUpgradeService } from '../core/template-upgrade.service';
import { TrackerService } from '../core/tracker.service';
import { ScheduleService } from '../planning/schedule.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { LifecycleService } from './lifecycle.service';
import { PortfolioService } from './portfolio.service';
import { RoadmapService } from './roadmap.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };

suite('roadmap consolidée (intégration)', () => {
  let testDb: TestDb;
  let roadmap: RoadmapService;
  let schedule: ScheduleService;
  let access: AccessService;
  let upgrades: TemplateUpgradeService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_roadmap');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    const templates = new TemplateService(db, trackers);
    upgrades = new TemplateUpgradeService(db, trackers, templates);
    schedule = new ScheduleService(db, artifacts, new CalendarService(db));
    access = new AccessService(db);
    roadmap = new RoadmapService(db, upgrades, schedule, new LifecycleService(db));
    const portfolios = new PortfolioService(db, { kpis: async () => { throw new Error('inutilisé'); } });
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'rm','rm')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-admin','admin.dev','Admin Dev','a@example.test')", [org]);
    });
    await portfolios.create(org, { key: 'rm', name: 'Roadmap' }, admin);
    // GRP : projet planifié, avec baseline ; SAT : projet depuis le gabarit ECSS ; VID : projet sans aucune date
    await trackers.createProject(org, 'GRP', 'Groupe', admin);
    await trackers.createTracker(org, {
      projectKey: 'GRP', key: 'TSK', name: 'Tâches', typeKey: 'task',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date' }, { key: 'due', label: 'Fin', type: 'date', semanticRole: 'due_date' }],
      statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }],
    }, admin);
    const a = await artifacts.create(org, 'GRP', 'TSK', { title: 'A', start: '2026-11-09', due: '2026-11-13' }, admin);
    const b = await artifacts.create(org, 'GRP', 'TSK', { title: 'B', start: '2026-11-16', due: '2026-11-27' }, admin);
    await templates.createProject(org, 'SAT', 'Satellite', 'spatial-project', admin);
    await trackers.createProject(org, 'VID', 'Vide', admin);
    for (const k of ['GRP', 'SAT', 'VID']) await portfolios.setProject(org, 'rm', k, {}, admin);
    await db.tx(org, async (c) => {
      const grp = (await c.query("select id from project where key = 'GRP'")).rows[0].id;
      // baseline figée une semaine plus tôt pour B : la fin planifiée du 27/11 est en retard de 5 jours ouvrés
      const bl = (await c.query("insert into baseline (organization_id, project_id, name, git_tag, git_sha, created_by) values ($1,$2,'PLAN-1','t','s','x') returning id", [org, grp])).rows[0].id;
      await c.query("insert into baseline_schedule (baseline_id, organization_id, artifact_key, planned_start, planned_end) values ($1,$2,$3,'2026-11-09','2026-11-13'), ($1,$2,$4,'2026-11-09','2026-11-20')", [bl, org, a.key, b.key]);
      await c.query("insert into project_meta (organization_id, project_id, planned_start, planned_end, updated_by) values ($1,$2,'2026-11-09','2026-11-20','x')", [org, grp]);
      await c.query("insert into release (organization_id, project_id, name, starts_on, ends_on) values ($1,$2,'v1','2026-11-09','2026-11-27')", [org, grp]);
      await c.query("insert into project_phase (organization_id, project_id, phase, planned_start, planned_end, review_planned_on, review_held_on, updated_by) select $1, id, 'phase-a', '2026-01-05', '2026-03-01', '2026-03-01', '2026-03-10', 'x' from project where key = 'SAT' on conflict (project_id, phase) do update set planned_start = excluded.planned_start, planned_end = excluded.planned_end, review_planned_on = excluded.review_planned_on, review_held_on = excluded.review_held_on", [org]);
    });
    await trackers.createProject(org, 'DON', 'Terminé', admin);
    await portfolios.setProject(org, 'rm', 'DON', {}, admin);
    await db.tx(org, (c) => c.query("update project set lifecycle_state = 'completed' where key = 'DON'"));
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('couloirs : projet planifié, projet du gabarit ECSS, projet vide en fin de liste ; les projets terminés sont exclus et comptés', async () => {
    const r = await roadmap.roadmap(org, 'rm', admin);
    expect(r.projects.map((p) => p.key)).toEqual(['GRP', 'SAT', 'VID']);
    expect(r.projects.map((p) => p.unscheduled)).toEqual([false, false, true]);
    expect(r.hiddenByState).toBe(1);
    expect((await roadmap.roadmap(org, 'rm', admin, { includeClosed: true })).projects.map((p) => p.key)).toContain('DON');
  });

  it('phases et revues du gabarit : 7 phases ECSS, dates, revue tenue en retard, phase courante', async () => {
    const sat = (await roadmap.roadmap(org, 'rm', admin)).projects.find((p) => p.key === 'SAT')!;
    expect(sat.phases.map((p) => p.key)).toEqual(['phase-0', 'phase-a', 'phase-b', 'phase-c', 'phase-d', 'phase-e', 'phase-f']);
    expect(sat.phases[0]).toMatchObject({ current: true, undated: true, heldLate: false });
    expect(sat.phases[1]).toMatchObject({ reviewPlannedOn: '2026-03-01', reviewHeldOn: '2026-03-10', heldLate: true, undated: false });
  });

  it('B27/B28 : l’écart à la baseline est celui du Gantt du projet, au jour ouvré près', async () => {
    const grp = (await roadmap.roadmap(org, 'rm', admin)).projects.find((p) => p.key === 'GRP')!;
    expect(grp).toMatchObject({ plannedEnd: '2026-11-20', calculatedEnd: '2026-11-27', baseline: { name: 'PLAN-1', end: '2026-11-20', gapDays: 5 } });
    expect(grp.releases).toEqual([{ name: 'v1', startsOn: '2026-11-09', endsOn: '2026-11-27', state: 'planned' }]);
    const gantt = await schedule.get(org, 'GRP', admin.roles, 'PLAN-1');
    const latest = gantt.tasks.reduce((a, t) => (t.plannedEnd! > a.plannedEnd! ? t : a));
    expect(grp.baseline!.gapDays).toBe(latest.variance); // test de concordance
  });

  it('choix de la baseline : le nom demandé est comparé là où il existe, les autres projets n’ont pas de calque', async () => {
    const r = await roadmap.roadmap(org, 'rm', admin, { baseline: 'PLAN-1' });
    expect(r.baselines).toEqual(['PLAN-1']);
    expect(r.projects.find((p) => p.key === 'GRP')!.baseline).toMatchObject({ name: 'PLAN-1', gapDays: 5 });
    expect((await roadmap.roadmap(org, 'rm', admin, { baseline: 'inconnue' })).projects.every((p) => p.baseline === null)).toBe(true);
  });

  it('un projet masqué au lecteur n’apparaît pas dans la roadmap', async () => {
    await runAs('sub-admin', () => access.set(org, 'SAT', { members: ['sub-admin'] }, admin));
    const seen = await runAs('sub-dir', () => roadmap.roadmap(org, 'rm', director));
    expect(seen.projects.map((p) => p.key)).toEqual(['GRP', 'VID']);
    expect(JSON.stringify(seen)).not.toContain('SAT');
    await runAs('sub-admin', () => access.remove(org, 'SAT', null, admin));
  });
});
