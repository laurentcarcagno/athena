import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TemplateService } from '../core/template.service';
import { TemplateUpgradeService } from '../core/template-upgrade.service';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { AlertService } from './alert.service';
import { CapacityService } from './capacity.service';
import { DecisionService } from './decision.service';
import { FinanceService } from './finance.service';
import { GovernanceService } from './governance.service';
import { HealthService } from './health.service';
import { LifecycleService } from './lifecycle.service';
import { PortfolioService } from './portfolio.service';
import { PpmSettingsService } from './settings.service';
import { SnapshotService } from './snapshot.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const pmo: Actor = { id: 'sub-pmo', roles: ['athena-pmo', 'athena-team-member'] };
const finance: Actor = { id: 'sub-fin', roles: ['athena-finance'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return (e as { code?: string })?.code ?? (e ? 'autre' : 'ok'); };
const kpis = { async kpis(_o: string, project: string) { return { project: { key: project, name: project, createdAt: '2026-01-01T00:00:00.000Z', members: 1, managers: [] }, progress: { total: 1, done: 0, inProgress: 0, todo: 1, percent: 0 }, late: project === 'DEC' ? 5 : 0, blocked: project === 'DEC' ? 3 : 0, dueSoon: 0, open: project === 'DEC' ? 8 : 1, workload: [], velocity: { average: 0, forecast: 0, sprints: 0 }, sprint: null, health: { state: 'ok' as const, reasons: [] } }; } };

suite('gouvernance V2 : décisions, projet de pilotage, alertes (B38, intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let decisions: DecisionService;
  let alerts: AlertService;
  let portfolios: PortfolioService;
  let health: HealthService;
  let finService: FinanceService;
  let snaps: SnapshotService;
  let access: AccessService;
  let upgrades: TemplateUpgradeService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_decision');
    db = new Db(testDb.pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    const templates = new TemplateService(db, trackers);
    upgrades = new TemplateUpgradeService(db, trackers, templates);
    const calendar = new CalendarService(db);
    portfolios = new PortfolioService(db, kpis);
    health = new HealthService(db, portfolios, new LifecycleService(db));
    finService = new FinanceService(db);
    snaps = new SnapshotService(db, health);
    access = new AccessService(db);
    decisions = new DecisionService(db, finService);
    const gov = new GovernanceService(db, upgrades);
    alerts = new AlertService(db, (o, k) => gov.gates(o, k), snaps, finService, new CapacityService(db, calendar, new PpmSettingsService(db)));
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'dc','dc')", [org]);
      for (const s of ['sub-admin', 'sub-pmo', 'sub-fin']) await c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$2,$2,$3)', [org, s, `${s}@example.test`]);
    });
    await portfolios.create(org, { key: 'gov2', name: 'Gouvernance V2' }, admin);
    await templates.createProject(org, 'DEC', 'Décision', 'spatial-project', admin);
    await trackers.createProject(org, 'PIL', 'Pilotage', admin);
    await trackers.createProject(org, 'SEC', 'Secret', admin);
    for (const k of ['DEC', 'SEC']) await portfolios.setProject(org, 'gov2', k, {}, admin);
    await portfolios.setProject(org, 'gov2', 'PIL', { kind: 'pilot', purpose: 'Risques transverses' }, admin);
    await finService.upsertCategory(org, { key: 'logiciel', name: 'Logiciel', kind: 'internal' }, finance);
  }, 90_000);
  afterAll(async () => { await testDb?.drop(); });

  it('le projet de pilotage n’entre ni dans la santé ni dans la roadmap, mais reste dans le portefeuille', async () => {
    expect((await health.health(org, 'gov2', admin)).rows.map((r) => r.key)).toEqual(['DEC', 'SEC']);
    expect((await portfolios.summary(org, 'gov2', admin)).projects.map((p) => p.key)).toEqual(['DEC', 'SEC']);
    expect((await portfolios.list(org)).find((p) => p.key === 'gov2')!.projects).toBe(3);
  });

  it('décisions : suspendre propose une transition sans l’appliquer ; le journal se filtre ; les droits', async () => {
    const d = await decisions.create(org, 'gov2', { project: 'DEC', kind: 'suspend', rationale: 'Financement gelé', conditions: 'Reprise après arbitrage', owner: 'sub-pmo', dueOn: '2026-12-01' }, pmo);
    expect(d).toMatchObject({ kind: 'suspend', proposedState: 'on_hold', appliedAt: null, owner: 'sub-pmo', dueOn: '2026-12-01' });
    expect((await db.tx(org, (c) => c.query("select lifecycle_state from project where key = 'DEC'"))).rows[0].lifecycle_state).toBe('in_progress'); // rien n'est appliqué
    await decisions.create(org, 'gov2', { project: 'SEC', kind: 'continue', rationale: 'Sur la bonne voie' }, admin);
    expect((await decisions.list(org, 'gov2')).map((x) => x.kind)).toEqual(['continue', 'suspend']);
    expect((await decisions.list(org, 'gov2', { project: 'DEC' })).map((x) => x.kind)).toEqual(['suspend']);
    expect((await decisions.list(org, 'gov2', { kind: 'suspend' }))[0]!.proposedState).toBe('on_hold');
    expect(await code(decisions.create(org, 'gov2', { project: 'NOPE', kind: 'stop', rationale: 'x' }, pmo))).toBe('not_found');
    expect(await code(decisions.create(org, 'gov2', { project: 'DEC', kind: 'change', rationale: 'x', costDelta: 1000 }, pmo))).toBe('validation');
  });

  it('changement chiffré : s’applique en avenant de budget par la finance, une seule fois', async () => {
    const d = await decisions.create(org, 'gov2', { project: 'DEC', kind: 'change', rationale: 'Ajout de périmètre', costDelta: 12_000, scheduleDeltaDays: 10, budgetCategory: 'logiciel' }, pmo);
    expect(await code(decisions.apply(org, 'gov2', d.id, { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] }))).toBe('forbidden'); // la direction ne l'applique pas ; le PMO, oui (droits de la finance)
    await finService.addBudget(org, { project: 'DEC', category: 'logiciel', kind: 'initial', amount: 50_000 }, finance);
    const done = await decisions.apply(org, 'gov2', d.id, finance);
    expect(done.appliedAt).not.toBeNull();
    expect((await finService.project(org, 'DEC', finance)).totals.budget).toBe(62_000);
    expect(await code(decisions.apply(org, 'gov2', d.id, finance))).toBe('conflict');
  });

  it('un projet masqué au lecteur : ni décision ni alerte', async () => {
    await runAs('sub-admin', () => access.set(org, 'SEC', { members: ['sub-admin'] }, admin));
    const seen = await runAs('sub-dir', () => decisions.list(org, 'gov2'));
    expect(seen.every((x) => x.project !== 'SEC')).toBe(true);
    expect(JSON.stringify(await runAs('sub-dir', () => alerts.alerts(org, 'gov2', director)))).not.toContain('SEC');
    await runAs('sub-admin', () => access.remove(org, 'SEC', null, admin));
  });

  it('alertes calculées à la lecture : revue en retard, critique depuis deux instantanés, dépassement budgétaire ; elles se résolvent seules', async () => {
    await upgrades.setPhaseDates(org, 'DEC', 'phase-0', { reviewPlannedOn: '2026-03-01' }, admin);
    await portfolios.setProject(org, 'gov2', 'DEC', { health: 'critical' }, admin);
    await snaps.take(org, 'gov2', { kind: 'manual', at: new Date('2026-04-01T10:00:00Z') }, admin);
    await snaps.take(org, 'gov2', { kind: 'manual', at: new Date('2026-04-08T10:00:00Z') }, admin);
    await finService.addActual(org, { project: 'DEC', category: 'logiciel', period: '2026-05', amount: 70_000 }, finance); // 70 000 > budget 62 000
    const now = new Date('2026-06-15T00:00:00Z');
    const open = await alerts.alerts(org, 'gov2', admin, now);
    const kinds = open.map((a) => `${a.kind}:${a.project}`);
    expect(kinds).toEqual(expect.arrayContaining(['review_late:DEC', 'critical_persistent:DEC', 'budget_exceeded:DEC']));
    expect(open.find((a) => a.kind === 'review_late')).toMatchObject({ since: '2026-03-01', value: 106 });
    expect(open[0]!.since).toBe('2026-03-01'); // les plus anciennes d'abord
    // la cause disparaît (revue tenue, santé forcée levée) : l'alerte se résout seule
    await db.tx(org, (c) => c.query("update project_phase set review_held_on = '2026-03-02' where phase = 'phase-0' and project_id = (select id from project where key = 'DEC')"));
    expect((await alerts.alerts(org, 'gov2', admin, now)).map((a) => a.kind)).not.toContain('review_late');
  });
});
