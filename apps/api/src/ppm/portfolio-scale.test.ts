import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KpiService } from '../agile/kpi.service';
import { ReportService } from '../agile/report.service';
import { SprintService } from '../agile/sprint.service';
import { SearchService } from '../atql/search.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TemplateService } from '../core/template.service';
import { TemplateUpgradeService } from '../core/template-upgrade.service';
import { TrackerService } from '../core/tracker.service';
import { ScheduleService } from '../planning/schedule.service';
import { ArtifactService } from '../core/artifact.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { CachedKpiService } from './kpi-cache.service';
import { CapacityService } from './capacity.service';
import { FinanceService } from './finance.service';
import { GovernanceService } from './governance.service';
import { HealthService } from './health.service';
import { LifecycleService } from './lifecycle.service';
import { PortfolioService } from './portfolio.service';
import { RoadmapService } from './roadmap.service';
import { PpmSettingsService } from './settings.service';
import { SnapshotService } from './snapshot.service';

// T-0250 (B42) : mesure de charge au palier 2 du plan de livraison. Longue : lancée seulement avec ATHENA_SCALE=1
// (`ATHENA_SCALE=1 [ATHENA_SCALE_PROJECTS=300] [ATHENA_SCALE_TICKETS=500000] pnpm vitest run src/ppm/portfolio-scale.test.ts --disable-console-intercept`).
const suite = pgUp && process.env['ATHENA_SCALE'] === '1' ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const PROJECTS = Number(process.env['ATHENA_SCALE_PROJECTS'] ?? 300);
const TICKETS = Number(process.env['ATHENA_SCALE_TICKETS'] ?? 500_000);
const PEOPLE = Number(process.env['ATHENA_SCALE_PEOPLE'] ?? 1000);

const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * p) - 1)]!;

suite(`palier 2 : ${PROJECTS} projets, ${TICKETS} tickets, ${PEOPLE} personnes (B42)`, () => {
  let testDb: TestDb;
  let db: Db;
  const org = crypto.randomUUID();
  let kpiCache: CachedKpiService;
  let health: HealthService;
  let roadmap: RoadmapService;
  let snapshots: SnapshotService;
  let capacity: CapacityService;
  let gov: GovernanceService;
  let finance: FinanceService;
  const report: string[] = [];

  const measure = async (label: string, runs: number, fn: () => Promise<unknown>) => {
    const times: number[] = [];
    for (let i = 0; i < runs; i++) { const t0 = performance.now(); await fn(); times.push(performance.now() - t0); }
    const line = `${label} : P50 ${percentile(times, 0.5).toFixed(0)} ms, P95 ${percentile(times, 0.95).toFixed(0)} ms (${runs} appels)`;
    report.push(line);
    console.log(`B42 ${line}`);
    return times;
  };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_scale');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const calendar = new CalendarService(db);
    const kpi = new KpiService(db, new SearchService(db), new ReportService(db), new SprintService(db));
    kpiCache = new CachedKpiService(db, kpi);
    const portfolios = new PortfolioService(db, kpiCache);
    const upgrades = new TemplateUpgradeService(db, trackers, new TemplateService(db, trackers));
    health = new HealthService(db, portfolios, new LifecycleService(db));
    roadmap = new RoadmapService(db, upgrades, new ScheduleService(db, new ArtifactService(db, trackers, registry), calendar), new LifecycleService(db));
    snapshots = new SnapshotService(db, health);
    capacity = new CapacityService(db, calendar, new PpmSettingsService(db));
    gov = new GovernanceService(db, upgrades);
    finance = new FinanceService(db);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'sc','sc')", [org]));
    await portfolios.create(org, { key: 'palier2', name: 'Palier 2' }, admin);
    await finance.upsertCategory(org, { key: 'logiciel', name: 'Logiciel', kind: 'internal' }, admin);
    const t0 = performance.now();
    for (let p = 0; p < PROJECTS; p++) {
      const key = `S${String(p).padStart(3, '0')}`;
      await trackers.createProject(org, key, `Projet ${key}`, admin);
      await trackers.createTracker(org, {
        projectKey: key, key: 'TSK', name: 'Tâches', typeKey: 'task',
        fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date' }],
        statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'done', name: 'Fait', category: 'done' }], transitions: [{ name: 'Terminer', from: 'todo', to: 'done' }, { name: 'Rouvrir', from: null, to: 'todo' }],
      }, admin);
      await portfolios.setProject(org, 'palier2', key, {}, admin);
    }
    // tickets en masse, côté base : le tiers terminés, une part en retard
    const per = Math.floor(TICKETS / PROJECTS);
    await db.tx(org, async (c) => {
      await c.query(
        `with t as (select t.id tracker_id, t.project_id, p.key pkey, (select id from status s where s.tracker_id = t.id and s.key = 'todo') todo, (select id from status s where s.tracker_id = t.id and s.key = 'done') done
                      from tracker t join project p on p.id = t.project_id where t.key = 'TSK')
         insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by)
         select $1, t.project_id, t.tracker_id, n, t.pkey || '-TSK-' || lpad(n::text, 6, '0'), case when n % 3 = 0 then t.done else t.todo end,
                jsonb_build_object('title', 'Tâche ' || n, 'due', to_char(current_date + ((n % 60) - 20), 'YYYY-MM-DD')), 'sub-admin'
           from t cross join generate_series(1, $2::int) n`, [org, per]);
      await c.query("insert into tracker_sequence (tracker_id, organization_id, last_number) select id, organization_id, $1 from tracker where key = 'TSK' on conflict (tracker_id) do update set last_number = excluded.last_number", [per]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) select $1, 'p' || n, 'p' || n, 'Personne ' || n, 'p' || n || '@example.test' from generate_series(1, $2::int) n", [org, PEOPLE]);
      const teams = Math.max(1, Math.round(PEOPLE / 25));
      await c.query("insert into team (organization_id, key, name, created_by) select $1, 'eq' || n, 'Équipe ' || n, 'x' from generate_series(1, $2::int) n", [org, teams]);
      await c.query("insert into team_member (organization_id, team_id, subject, role, added_by) select $1, (select id from team where key = 'eq' || (1 + (n % $3::int))), 'p' || n, 'member', 'x' from generate_series(1, $2::int) n", [org, PEOPLE, teams]);
      await c.query("insert into allocation (organization_id, project_id, subject, from_day, fte, created_by) select $1, (select id from project where key = 'S' || lpad((n % $3::int)::text, 3, '0')), 'p' || n, '2026-01-01', 0.8, 'x' from generate_series(1, $2::int) n", [org, PEOPLE, PROJECTS]);
      await c.query("insert into budget_line (organization_id, project_id, category, kind, amount, created_by) select $1, id, 'logiciel', 'initial', 100000, 'x' from project", [org]);
      await c.query("insert into actual_cost (organization_id, project_id, category, period, amount, source, created_by) select $1, id, 'logiciel', '2026-05', 40000, 'manual', 'x' from project", [org]);
    });
    console.log(`B42 jeu de données prêt en ${((performance.now() - t0) / 1000).toFixed(0)} s : ${PROJECTS} projets, ${per * PROJECTS} tickets, ${PEOPLE} personnes`);
  }, 3_600_000);
  afterAll(async () => { await testDb?.drop(); console.log(`B42 RAPPORT\n${report.join('\n')}`); });

  it('le jeu de données a la taille annoncée', async () => {
    const n = (await db.tx(org, (c) => c.query('select count(*)::int n from artifact'))).rows[0].n as number;
    expect(n).toBeGreaterThanOrEqual(Math.floor(TICKETS / PROJECTS) * PROJECTS);
  });

  it('vues de portefeuille : santé, roadmap, gates, finances d\'un projet', async () => {
    const h0 = await measure('santé SANS matérialisation (calcul direct)', 1, () => health.health(org, 'palier2', admin));
    const t0 = performance.now();
    await kpiCache.refresh(org);
    report.push(`job de matérialisation des indicateurs (300 projets) : ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    console.log(`B42 ${report[report.length - 1]}`);
    const h = await measure('santé AVEC indicateurs matérialisés', 3, () => health.health(org, 'palier2', admin));
    expect(percentile(h, 0.95)).toBeLessThan(percentile(h0, 0.95));
    await measure('roadmap (300 projets)', 3, () => roadmap.roadmap(org, 'palier2', admin));
    await measure('passage des gates', 3, () => gov.gates(org, 'palier2'));
    await measure('finances d\'un projet', 10, () => finance.project(org, 'S001', admin));
  }, 3_600_000);

  it('capacité de 1 000 personnes sur 12 mois, jobs d\'instantané', async () => {
    await measure('capacité (1 000 personnes, 12 mois)', 3, () => capacity.view(org, admin, { from: '2026-06-01', to: '2027-05-31', granularity: 'month' }));
    await measure('instantané du portefeuille (300 projets)', 2, () => snapshots.take(org, 'palier2', { kind: 'manual', label: `mesure ${Math.random()}` }, admin));
  }, 3_600_000);

  it('concurrence : 50 lectures simultanées du tableau de santé matérialisé ; import de 100 000 lignes de réels', async () => {
    const t0 = performance.now();
    const times = await Promise.all(Array.from({ length: 50 }, async () => { const a = performance.now(); await health.health(org, 'palier2', admin); return performance.now() - a; }));
    report.push(`santé, 50 lectures simultanées : P50 ${percentile(times, 0.5).toFixed(0)} ms, P95 ${percentile(times, 0.95).toFixed(0)} ms, durée totale ${(performance.now() - t0).toFixed(0)} ms`);
    console.log(`B42 ${report[report.length - 1]}`);
    const rows = ['projet;catégorie;période;montant'];
    for (let i = 0; i < 100_000; i++) rows.push(`S${String(i % PROJECTS).padStart(3, '0')};logiciel;2026-${String((i % 12) + 1).padStart(2, '0')};${(i % 90) + 10},25`);
    const t1 = performance.now();
    const r = await finance.importActuals(org, 'reels-100k.csv', rows.join('\n'), admin);
    report.push(`import de 100 000 lignes de réels : ${((performance.now() - t1) / 1000).toFixed(1)} s (${r.imported} enregistrées, ${r.rejected.length} rejetées)`);
    console.log(`B42 ${report[report.length - 1]}`);
    expect(r.imported).toBe(100_000);
  }, 3_600_000);
});
