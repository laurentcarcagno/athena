import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TemplateService } from '../core/template.service';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { EarnedValueService, quadrantOf } from './earned-value.service';
import { PortfolioService } from './portfolio.service';
import { RequestService } from './request.service';
import { ScenarioService, type ReadOnlyPlan } from './scenario.service';
import { PpmSettingsService } from './settings.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return (e as { code?: string })?.code ?? (e ? 'autre' : 'ok'); };

describe('quadrant de la valeur acquise et architecture des scénarios', () => {
  it('CPI et SPI : sous le budget et dans les temps, ou l’un des deux perdu, ou les deux', () => {
    expect([quadrantOf(1.2, 1.1), quadrantOf(1.2, 0.8), quadrantOf(0.8, 1.2), quadrantOf(0.7, 0.7), quadrantOf(null, 1), quadrantOf(1, null)]).toEqual(['on_track', 'late_under_budget', 'early_over_budget', 'late_over_budget', 'unknown', 'unknown']);
  });
  it('le service de scénarios n’importe aucun service d’écriture du plan officiel (types seulement) et n’écrit que dans ses tables', () => {
    const src = readFileSync(join(__dirname, 'scenario.service.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => /^import /.test(l) && !/^import type /.test(l)).map((l) => /from '([^']+)'/.exec(l)?.[1]);
    expect(imports.sort()).toEqual(['../core/db', '../core/errors', '../core/tracker.service', './capacity', 'zod'].sort());
    const writes = [...src.matchAll(/(insert into|update|delete from)\s+([a-z_]+)/gi)].map((m) => m[2]);
    expect([...new Set(writes)].sort()).toEqual(['scenario', 'scenario_change']);
  });
});

suite('demandes, scénarios et valeur acquise (B41, intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let requests: RequestService;
  let scenarios: ScenarioService;
  let earned: EarnedValueService;
  let reqKeys: string[] = [];
  const org = crypto.randomUUID();
  const plan: ReadOnlyPlan = {
    propagate: async (_o, i) => ({ impacts: [{ key: 'BBB-TSK-1', project: 'BBB', shiftDays: i.shiftDays, newStart: '2026-11-19', newEnd: '2026-11-25' }] }),
    capacity: async () => ({ granularity: 'month', overloadPercent: 110, workdayMinutes: 468, periods: [], people: [], bottlenecks: [], teams: [{ team: 'thermique', name: 'Thermique', needs: [], cells: [{ period: '2026-11', capacityMinutes: 10_000, nominativeMinutes: 6000, genericMinutes: 0, freeMinutes: 4000, level: 'normal' }, { period: '2026-12', capacityMinutes: 10_000, nominativeMinutes: 9000, genericMinutes: 0, freeMinutes: 1000, level: 'normal' }] }] }),
    finance: async (_o, project) => ({ project, lines: [], totals: { budget: 100_000, committed: 0, actual: 60_000, forecast: 30_000, eac: 90_000, variance: 10_000 }, alerts: [], curve: [] }),
  };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_prioritization');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    const templates = new TemplateService(db, trackers);
    requests = new RequestService(db, templates);
    const calendar = new CalendarService(db);
    scenarios = new ScenarioService(db, plan, calendar, new PpmSettingsService(db));
    earned = new EarnedValueService(db, { project: async (_o, p) => ({ project: p, lines: [], totals: { budget: 100_000, committed: 0, actual: 40_000, forecast: 0, eac: 40_000, variance: 60_000 }, alerts: [], curve: [] }) },
      { kpis: async () => ({ progress: { total: 10, done: 5, inProgress: 0, todo: 5, percent: 50 } }) as never });
    const portfolios = new PortfolioService(db, { kpis: async () => { throw new Error('inutilisé'); } });
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'pz','pz')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-admin','admin.dev','Admin Dev','a@example.test')", [org]);
    });
    await portfolios.create(org, { key: 'prio', name: 'Priorisation' }, admin);
    await trackers.createProject(org, 'PIL', 'Pilotage', admin);
    await trackers.createProject(org, 'EXE', 'Exécution', admin);
    await portfolios.setProject(org, 'prio', 'PIL', { kind: 'pilot' }, admin);
    await portfolios.setProject(org, 'prio', 'EXE', {}, admin);
    await trackers.createTracker(org, { projectKey: 'PIL', key: 'REQ', name: 'Demandes', typeKey: 'request', fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }], statuses: [{ key: 'new', name: 'Nouvelle', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'new' }] }, admin);
    reqKeys = [];
    for (const t of ['Demande A', 'Demande B']) reqKeys.push((await artifacts.create(org, 'PIL', 'REQ', { title: t }, admin)).key);
    // projet d'exécution daté : la moitié du temps est écoulée au 2026-06-15
    await db.tx(org, (c) => c.query("insert into project_meta (organization_id, project_id, planned_start, planned_end, updated_by) select $1, id, '2026-01-01', '2026-12-31', 'x' from project where key = 'EXE'", [org]));
  }, 90_000);
  afterAll(async () => { await testDb?.drop(); });

  it('convertir une demande crée un projet du gabarit choisi, lié à la demande ; une seule décision par demande', async () => {
    const r = await requests.convert(org, reqKeys[0]!, { project: 'NEW1', name: 'Nouvelle mission', template: 'spatial-project' }, admin);
    expect(r).toMatchObject({ outcome: 'converted', project: 'NEW1', template: 'spatial-project' });
    const phases = (await db.tx(org, (c) => c.query("select count(*)::int n from project_phase x join project p on p.id = x.project_id where p.key = 'NEW1'"))).rows[0].n;
    expect(phases).toBe(7); // le projet a les 7 phases du gabarit
    expect(await code(requests.convert(org, reqKeys[0]!, { project: 'NEW2', name: 'Autre' }, admin))).toBe('conflict');
    expect(await code(requests.convert(org, 'PIL-ZZZ-1', { project: 'NEW3', name: 'x' }, admin))).toBe('not_found');
  });

  it('refuser exige un motif et le conserve', async () => {
    const r = await requests.refuse(org, reqKeys[1]!, { reason: 'Hors périmètre du programme' }, admin);
    expect(r).toMatchObject({ outcome: 'refused', reason: 'Hors périmètre du programme' });
    expect(await code(requests.refuse(org, reqKeys[1]!, { reason: 'encore' }, admin))).toBe('conflict');
    expect((await db.tx(org, (c) => c.query("select outcome, reason from request_conversion where outcome = 'refused'"))).rows[0]).toEqual({ outcome: 'refused', reason: 'Hors périmètre du programme' });
  });

  it('scénario : effets calculés (propagation, charge d’équipe, budget) sans rien écrire dans le plan officiel', async () => {
    const before = await db.tx(org, async (c) => ({ alloc: (await c.query('select count(*)::int n from allocation')).rows[0].n, budget: (await c.query('select count(*)::int n from budget_line')).rows[0].n, deps: (await c.query('select count(*)::int n from project_dependency')).rows[0].n }));
    const s = await scenarios.create(org, 'prio', { name: 'Et si le capteur glisse', changes: [
      { kind: 'shift_ticket', ticket: 'AAA-TSK-1', shiftDays: 3 }, { kind: 'allocate', team: 'thermique', project: 'EXE', from: '2026-11-01', to: '2026-12-31', fte: 0.5 }, { kind: 'budget_delta', project: 'EXE', amount: -15_000 },
    ] }, admin);
    const { result } = await scenarios.evaluate(org, 'prio', s.id, admin);
    expect(result.shifts[0]!.impacts[0]).toMatchObject({ project: 'BBB', shiftDays: 3 });
    const cap = result.capacity[0]!.periods;
    // sans calendrier configuré : lundi au vendredi, 21 jours ouvrés en novembre 2026 et 23 en décembre ; 0,5 ETP de 7 h 48
    expect(cap.map((p) => [p.period, p.beforeLevel, p.afterLevel])).toEqual([['2026-11', 60, Math.round((6000 + 21 * 468 * 0.5) / 100)], ['2026-12', 90, Math.round((9000 + 23 * 468 * 0.5) / 100)]]);
    expect(result.budget[0]).toMatchObject({ project: 'EXE', varianceBefore: 10_000, varianceAfter: -5000 });
    const after = await db.tx(org, async (c) => ({ alloc: (await c.query('select count(*)::int n from allocation')).rows[0].n, budget: (await c.query('select count(*)::int n from budget_line')).rows[0].n, deps: (await c.query('select count(*)::int n from project_dependency')).rows[0].n }));
    expect(after).toEqual(before);
    expect((await scenarios.list(org, 'prio'))[0]).toMatchObject({ name: 'Et si le capteur glisse', changeCount: 3 });
    expect(await code(scenarios.evaluate(org, 'prio', crypto.randomUUID(), admin))).toBe('not_found');
  });

  it('valeur acquise : EV = BAC × avancement, PV = BAC × temps écoulé, CPI et SPI ; le projet de pilotage est exclu', async () => {
    const rows = await earned.portfolio(org, 'prio', admin, new Date('2026-07-02T00:00:00Z'));
    expect(rows.map((r) => r.project)).toEqual(['EXE']);
    const r = rows[0]!;
    expect(r).toMatchObject({ bac: 100_000, ev: 50_000, ac: 40_000, cpi: 1.25 });
    expect(r.pv).toBeCloseTo(100_000 * (182 / 364), -2); // du 1er janvier au 2 juillet : la moitié du temps
    expect(r.spi).toBeCloseTo(1, 1);
    expect(['on_track', 'late_under_budget']).toContain(r.quadrant);
  });
});
