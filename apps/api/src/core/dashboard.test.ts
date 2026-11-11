import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { DEFAULT_WIDGETS, DashboardService, ScopeSchema, WidgetSchema } from './dashboard.service';

// T-0122 : disposition personnelle du tableau de bord, défaut sans réglage, réinitialisation.

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-user'] };
const bob: Actor = { id: 'bob', roles: ['athena-user'] };
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof DomainError ? `${e.code}:${e.message} ${e.details.join(' ')}` : e ? `autre:${(e as Error).message}` : 'ok';
};

suite('tableau de bord personnel (intégration)', () => {
  let testDb: TestDb;
  let dash: DashboardService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_dashboard');
    const db = new Db(testDb.pool);
    dash = new DashboardService(db);
    for (const [id, key] of [[org, 'dash'], [other, 'dash2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('donne la disposition par défaut sans réglage, six widgets', async () => {
    const d = await dash.get(org, alice);
    expect(d.isDefault).toBe(true);
    expect(d.widgets.map((w) => w.id)).toEqual(['assigned', 'approvals', 'mentions', 'due', 'favorites', 'recents']);
    expect(d.widgets).toEqual([...DEFAULT_WIDGETS]);
  });

  it('enregistre, relit, réordonne, reste personnelle et propre à l’organisation, se réinitialise', async () => {
    const widgets = [{ id: 'mentions', kind: 'mentions' as const }, { id: 'v1', kind: 'search' as const, title: 'Ouverts NOVA', query: 'category != done', projects: ['NOVA'] }];
    expect((await dash.put(org, { widgets }, alice)).isDefault).toBe(false);
    expect(await dash.get(org, alice)).toEqual({ widgets, isDefault: false });
    expect((await dash.get(org, bob)).isDefault).toBe(true);
    expect((await dash.get(other, alice)).isDefault).toBe(true);
    await dash.put(org, { widgets: [widgets[1]!] }, alice); // remplace
    expect((await dash.get(org, alice)).widgets.map((w) => w.id)).toEqual(['v1']);
    await dash.reset(org, alice);
    expect((await dash.get(org, alice)).isDefault).toBe(true);
  });

  it('donne à chaque projet sa propre Vue d’ensemble, indépendante de l’accueil', async () => {
    const d = await dash.get(org, alice, 'NOVA');
    expect(d.isDefault).toBe(true);
    expect(d.widgets.map((w) => w.id)).toEqual(['assigned', 'due', 'trackers', 'mentions', 'indicators']); // T-0155 : indicateurs du projet en pleine largeur
    expect(d.widgets[0]!.projects).toEqual(['NOVA']);
    await dash.put(org, { widgets: [{ id: 'trackers', kind: 'trackers', projects: ['NOVA'] }] }, alice, 'NOVA');
    expect((await dash.get(org, alice, 'NOVA')).widgets.map((w) => w.id)).toEqual(['trackers']);
    expect((await dash.get(org, alice)).isDefault).toBe(true); // l'accueil n'est pas touché
    expect((await dash.get(org, alice, 'ARI')).isDefault).toBe(true);
    await dash.reset(org, alice, 'NOVA');
    expect((await dash.get(org, alice, 'NOVA')).isDefault).toBe(true);
  });

  it('garde la largeur de chaque carte et accepte la page Avancement d’un projet (T-0153, migration 057)', async () => {
    await dash.put(org, { widgets: [{ id: 'trackers', kind: 'trackers', projects: ['NOVA'], size: 'L' }] }, alice, 'NOVA:avancement');
    expect((await dash.get(org, alice, 'NOVA:avancement')).widgets[0]).toMatchObject({ id: 'trackers', size: 'L' });
    expect((await dash.get(org, alice, 'NOVA')).isDefault).toBe(true); // la Vue d’ensemble est une autre page
    await dash.reset(org, alice, 'NOVA:avancement');
    // Avancement par défaut (T-0155) : les variantes retenues, avec la clé du projet ; elles acceptent un projet.
    const progress = await dash.get(org, alice, 'NOVA:avancement');
    expect(progress.isDefault).toBe(true);
    expect(progress.widgets.map((w) => [w.id, w.size])).toEqual([['indicators', 'L'], ['release', 'S'], ['flow', 'M'], ['tracker-status', 'M'], ['velocity', 'M'], ['activity', 'M']]);
    expect(progress.widgets.every((w) => w.projects?.[0] === 'NOVA')).toBe(true);
    await dash.put(org, { widgets: [{ id: 'flow', kind: 'flow', projects: ['NOVA'], size: 'XL' }] }, alice, 'NOVA:avancement');
    expect((await dash.get(org, alice, 'NOVA:avancement')).widgets).toEqual([{ id: 'flow', kind: 'flow', projects: ['NOVA'], size: 'XL' }]);
    await dash.reset(org, alice, 'NOVA:avancement');
    expect(ScopeSchema.safeParse('NOVA:avancement').success).toBe(true);
    expect(ScopeSchema.safeParse('NOVA:autre').success).toBe(false);
    expect(WidgetSchema.safeParse({ id: 'x', kind: 'mentions', size: 'XXL' }).success).toBe(false);
  });

  it('carte graphique (T-0156) : recherche, champ et forme gardés ; forme ou champ manquants refusés', async () => {
    const chart = { id: 'c1', kind: 'chart' as const, title: 'Bugs par sévérité', query: 'tracker = BUG', projects: ['NOVA'], field: 'severity', form: 'donut' as const, size: 'S' as const };
    await dash.put(org, { widgets: [chart, { id: 'c2', kind: 'chart', query: 'category != done', form: 'count' }] }, alice, 'NOVA');
    expect((await dash.get(org, alice, 'NOVA')).widgets[0]).toEqual(chart);
    const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code} ${e.details.join(' ')}` : 'autre'; };
    expect(await code(dash.put(org, { widgets: [{ id: 'c3', kind: 'chart', query: '', form: 'bars' }] }, alice, 'NOVA'))).toMatch(/validation.*exige/);
    expect(await code(dash.put(org, { widgets: [{ id: 'c4', kind: 'chart', query: 'status =', field: 'status', form: 'bars' }] }, alice, 'NOVA'))).toMatch(/validation/);
    expect(await code(dash.put(org, { widgets: [{ id: 'c5', kind: 'mentions', form: 'donut' }] }, alice, 'NOVA'))).toMatch(/validation.*graphiques/);
    await dash.reset(org, alice, 'NOVA');
  });

  it('refuse un identifiant en double, une requête invalide et une requête sur un widget qui n’en a pas', async () => {
    expect(await code(dash.put(org, { widgets: [{ id: 'a', kind: 'mentions' }, { id: 'a', kind: 'recents' }] }, alice))).toMatch(/^validation.*double/);
    expect(await code(dash.put(org, { widgets: [{ id: 'a', kind: 'search', query: 'status =' }] }, alice))).toMatch(/^validation/);
    expect(await code(dash.put(org, { widgets: [{ id: 'a', kind: 'mentions', query: 'x = 1' }] }, alice))).toMatch(/^validation/);
    expect((await dash.get(org, alice)).isDefault).toBe(true);
  });
});
