import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { KpiService } from '../agile/kpi.service';
import { ReportService } from '../agile/report.service';
import { SprintService } from '../agile/sprint.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { CalendarService } from '../core/calendar.service';
import { TemplateService } from '../core/template.service';
import { TemplateUpgradeService } from '../core/template-upgrade.service';
import { ScheduleService } from '../planning/schedule.service';
import { LifecycleService } from './lifecycle.service';
import { PortfolioService } from './portfolio.service';
import { RoadmapService } from './roadmap.service';
import { HealthService } from './health.service';

// T-0198 (B16) : mesure de PortfolioService.summary sur 50 projets de démonstration (palier 1 du plan de livraison). Mesure longue :
// lancée seulement avec ATHENA_PERF=1 (`ATHENA_PERF=1 pnpm vitest run src/ppm/portfolio-perf.test.ts`). Seuil : P95 sous 2 s.

const suite = pgUp && process.env['ATHENA_PERF'] === '1' ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const PROJECTS = 50;
const TICKETS = 60;
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

suite('tableau de santé : performance au palier 1 (B16)', () => {
  let testDb: TestDb;
  let portfolios: PortfolioService;
  let roadmaps: RoadmapService;
  let healths: HealthService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_portfolio_perf');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    const kpi = new KpiService(db, new SearchService(db), new ReportService(db), new SprintService(db));
    portfolios = new PortfolioService(db, kpi);
    roadmaps = new RoadmapService(db, new TemplateUpgradeService(db, trackers, new TemplateService(db, trackers)), new ScheduleService(db, artifacts, new CalendarService(db)), new LifecycleService(db));
    healths = new HealthService(db, portfolios, new LifecycleService(db));
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'perf','perf')", [org]));
    await portfolios.create(org, { key: 'perf', name: 'Palier 1' }, admin);
    for (let p = 0; p < PROJECTS; p++) {
      const key = `P${String(p).padStart(2, '0')}`;
      await trackers.createProject(org, key, `Projet ${key}`, admin);
      await trackers.createTracker(org, {
        projectKey: key, key: 'TSK', name: 'Tâches', typeKey: 'task',
        fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'end', label: 'Fin', type: 'date', semanticRole: 'due_date' }],
        statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'done', name: 'Fait', category: 'done' }],
        transitions: [{ name: 'Terminer', from: 'todo', to: 'done' }, { name: 'Rouvrir', from: null, to: 'todo' }],
      }, admin);
      for (let i = 0; i < TICKETS; i++) await artifacts.create(org, key, 'TSK', { title: `Tâche ${i}`, end: iso((i % 20) - 8) }, admin);
      await portfolios.setProject(org, 'perf', key, {}, admin);
    }
  }, 600_000);
  afterAll(async () => { await testDb?.drop(); });

  it(`summary sur ${PROJECTS} projets de ${TICKETS} tickets : P95 sous 2 s`, async () => {
    const runs: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const s = await portfolios.summary(org, 'perf', admin); // cache neuf à chaque appel : aucun projet n'est réutilisé
      runs.push(performance.now() - t0);
      expect(s.totals.projects).toBe(PROJECTS);
    }
    runs.sort((a, b) => a - b);
    const p95 = runs[Math.ceil(runs.length * 0.95) - 1]!;
    console.log(`B16 summary ${PROJECTS} projets × ${TICKETS} tickets : min ${runs[0]!.toFixed(0)} ms, médiane ${runs[10]!.toFixed(0)} ms, P95 ${p95.toFixed(0)} ms, max ${runs[19]!.toFixed(0)} ms`);
    expect(p95).toBeLessThan(2000);
  }, 120_000);

  it('roadmap et tableau de santé (B18, B27) sur 50 projets : P95 sous 2 s', async () => {
    for (const [name, run] of [['roadmap', () => roadmaps.roadmap(org, 'perf', admin)], ['santé', () => healths.health(org, 'perf', admin)]] as const) {
      const runs: number[] = [];
      for (let i = 0; i < 10; i++) { const t0 = performance.now(); await run(); runs.push(performance.now() - t0); }
      runs.sort((a, b) => a - b);
      const p95 = runs[Math.ceil(runs.length * 0.95) - 1]!;
      console.log(`B16 ${name} ${PROJECTS} projets : médiane ${runs[5]!.toFixed(0)} ms, P95 ${p95.toFixed(0)} ms`);
      expect(p95).toBeLessThan(2000);
    }
  }, 120_000);
});
