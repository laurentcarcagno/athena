import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { DEFAULT_WIDGETS, DashboardService, ScopeSchema, WidgetSchema, allowedKinds, checkGrid, homeWidgetsFor, toGrid, type Widget } from './dashboard.service';

// T-0122 : disposition personnelle du tableau de bord, défaut sans réglage, réinitialisation.

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-team-member'] };
const bob: Actor = { id: 'bob', roles: ['athena-team-member'] };
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

  it('donne la disposition par défaut sans réglage : l’utilisateur voit en plus ses tâches en retard', async () => {
    const d = await dash.get(org, alice);
    expect(d.isDefault).toBe(true);
    expect(d.widgets.map((w) => w.id)).toEqual(['assigned', 'mylate', 'approvals', 'mentions', 'due', 'favorites', 'recents']);
    expect(d.widgets.filter((w) => w.id !== 'mylate')).toMatchObject([...DEFAULT_WIDGETS]);
    expect(d.widgets.find((w) => w.id === 'mylate')!.query).toBe('assignee = currentUser() AND late()');
  });

  it('selon le rôle : le chef de projet ouvre sur retards, chemin critique et risques ; l’assurance produit sur ses visas et écarts', async () => {
    const pm = (await dash.get(org, { id: 'pm', roles: ['athena-pm', 'athena-team-member'] })).widgets;
    expect(pm.map((w) => w.id)).toEqual(['assigned', 'late', 'critical', 'risks', 'approvals', 'mentions', 'due', 'favorites', 'recents']);
    expect(pm.find((w) => w.id === 'late')!.query).toBe('late() ORDER BY dueDate');
    const qa = (await dash.get(org, { id: 'qa', roles: ['athena-qa'] })).widgets;
    expect(qa.map((w) => w.id)).toEqual(['approvals', 'mentions', 'ncr', 'rid', 'favorites', 'recents']);
    expect((await dash.get(org, { id: 'qa2', roles: ['athena-qa', 'athena-team-member'] })).widgets.map((w) => w.id)).toEqual(['approvals', 'mentions', 'ncr', 'rid', 'favorites', 'recents']); // rôle effectif
    expect((await dash.get(org, { id: 'adm', roles: ['athena-admin', 'athena-team-member'] })).widgets.map((w) => w.id)).toContain('critical');
    // toutes ces dispositions sont des requêtes ATQL valides, enregistrables telles quelles
    for (const w of [...pm, ...qa]) expect(await code(dash.put(org, { widgets: [w] }, { id: 'probe', roles: ['athena-pm'] }))).toBe('ok');
  });

  it('enregistre, relit, réordonne, reste personnelle et propre à l’organisation, se réinitialise', async () => {
    const widgets = [{ id: 'mentions', kind: 'mentions' as const }, { id: 'v1', kind: 'search' as const, title: 'Ouverts NOVA', query: 'category != done', projects: ['NOVA'] }];
    expect((await dash.put(org, { widgets }, alice)).isDefault).toBe(false);
    const got = await dash.get(org, alice);
    expect(got.isDefault).toBe(false);
    expect(got.widgets).toMatchObject(widgets);
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
    expect((await dash.get(org, alice, 'NOVA:avancement')).widgets).toMatchObject([{ id: 'flow', kind: 'flow', projects: ['NOVA'], size: 'XL', x: 0, y: 0, w: 12 }]);
    await dash.reset(org, alice, 'NOVA:avancement');
    expect(ScopeSchema.safeParse('NOVA:avancement').success).toBe(true);
    expect(ScopeSchema.safeParse('NOVA:autre').success).toBe(false);
    expect(WidgetSchema.safeParse({ id: 'x', kind: 'mentions', size: 'XXL' }).success).toBe(false);
  });

  it('carte graphique (T-0156) : recherche, champ et forme gardés ; forme ou champ manquants refusés', async () => {
    const chart = { id: 'c1', kind: 'chart' as const, title: 'Bugs par sévérité', query: 'tracker = BUG', projects: ['NOVA'], field: 'severity', form: 'donut' as const, size: 'S' as const };
    await dash.put(org, { widgets: [chart, { id: 'c2', kind: 'chart', query: 'category != done', form: 'count' }] }, alice, 'NOVA');
    expect((await dash.get(org, alice, 'NOVA')).widgets[0]).toMatchObject(chart);
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

// T-0169 : grille 2D, conversion S/M/L/XL → colonnes, refus des chevauchements et des bornes.
describe('disposition 2D (T-0169)', () => {
  const w = (id: string, extra: Partial<Widget> = {}): Widget => ({ id, kind: 'mentions', ...extra });
  const rejected = (f: () => void) => { try { f(); return null; } catch (e) { return e instanceof DomainError ? e.code : 'autre'; } };

  it('convertit les tailles en colonnes sans perte, dans l’ordre, à la première place libre', () => {
    const grid = toGrid([w('a', { size: 'S' }), w('b', { size: 'S' }), w('c', { size: 'S' }), w('d', { size: 'M' }), w('e', { size: 'XL' }), w('f')]);
    expect(grid.map((g) => [g.id, g.x, g.y, g.w, g.size])).toEqual([
      ['a', 0, 0, 4, 'S'], ['b', 4, 0, 4, 'S'], ['c', 8, 0, 4, 'S'], ['d', 0, 3, 6, 'M'], ['e', 0, 6, 12, 'XL'], ['f', 6, 3, 4, 'S'],
    ]);
    expect(grid.every((g) => g.h === 3)).toBe(true);
    expect(toGrid(grid)).toEqual(grid); // idempotente : relire une disposition convertie ne la change pas
  });

  it('un ancien client lit encore `size` sur une disposition convertie', () => {
    expect(toGrid([w('a', { size: 'L' })])[0]!.size).toBe('L');
    expect(toGrid([w('a', { x: 0, y: 0, w: 5, h: 2 })])[0]!.size).toBe('M');
  });

  it('refuse chevauchement et dépassement de la grille (validation)', () => {
    expect(rejected(() => checkGrid(toGrid([w('a', { x: 0, y: 0, w: 6, h: 3 }), w('b', { x: 5, y: 2, w: 4, h: 2 })])))).toBe('validation');
    expect(rejected(() => checkGrid(toGrid([w('a', { x: 8, y: 0, w: 6, h: 3 })])))).toBe('validation');
    expect(rejected(() => checkGrid(toGrid([w('a', { x: 0, y: 0, w: 6, h: 3 }), w('b', { x: 6, y: 0, w: 6, h: 3 }), w('c', { x: 0, y: 3, w: 12, h: 2 })])))).toBeNull();
  });

  it('borne les valeurs du schéma et accepte plusieurs exemplaires d’un genre', () => {
    expect(WidgetSchema.safeParse(w('a', { x: 12 })).success).toBe(false);
    expect(WidgetSchema.safeParse(w('a', { w: 13 })).success).toBe(false);
    expect(WidgetSchema.safeParse(w('a', { h: 0 })).success).toBe(false);
    expect(WidgetSchema.safeParse(w('a', { project: 'nova' })).success).toBe(false);
    expect(WidgetSchema.safeParse(w('a', { project: 'NOVA', period: '30d' })).success).toBe(true);
    expect(rejected(() => checkGrid(toGrid([w('a', { project: 'NOVA' }), w('b', { project: 'LUMEN' })])))).toBeNull();
  });
});

// T-0170 : catalogue par rôle.
describe('catalogue par rôle (T-0170)', () => {
  const dev: Actor = { id: 'd', roles: ['athena-team-member'] };
  const lead: Actor = { id: 'l', roles: ['athena-pm', 'athena-team-member'] };
  const svc = new DashboardService(null as unknown as Db);
  it('le développeur ne voit pas le pilotage ; le chef de projet et l’administrateur voient tout', () => {
    const kinds = (a: Actor) => svc.catalog(a).map((k) => k.kind);
    expect(kinds(dev)).not.toContain('sprint-progress');
    expect(kinds(dev)).not.toContain('health');
    expect(kinds(dev)).toEqual(expect.arrayContaining(['search', 'pipelines', 'quality', 'badges']));
    expect(kinds(lead)).toContain('sprint-progress');
    expect(kinds({ id: 'a', roles: ['athena-admin'] }).length).toBe(kinds(lead).length);
    // Le directeur accède aux tableaux de bord de pilotage ; le manager garde le catalogue d’un membre d’équipe.
    expect(kinds({ id: 'r', roles: ['athena-director', 'athena-team-member'] })).toContain('health');
    expect(kinds({ id: 'm', roles: ['athena-manager', 'athena-team-member'] })).not.toContain('health');
    expect(svc.catalog(lead).find((k) => k.kind === 'health')!.project).toBe(true);
  });
  it('les dispositions par défaut de chaque rôle sont posables par ce rôle et sans chevauchement', () => {
    for (const a of [dev, lead, { id: 'r', roles: ['athena-director', 'athena-team-member'] }, { id: 'm', roles: ['athena-manager', 'athena-team-member'] }, { id: 'q', roles: ['athena-qa'] }, { id: 'a', roles: ['athena-admin'] }]) {
      const allowed = new Set(allowedKinds(a.roles));
      const grid = toGrid(homeWidgetsFor(a.roles));
      expect(grid.every((w) => allowed.has(w.kind))).toBe(true);
      expect(() => checkGrid(grid)).not.toThrow();
    }
  });
});

suite('refus d’un genre interdit (T-0170, intégration)', () => {
  it('le développeur ne peut pas poser « Progression du sprint » (403) ; le chef de projet le peut', async () => {
    const testDb = await createTestDb('athena_test_dashboard2');
    try {
      const db = new Db(testDb.pool);
      const dash = new DashboardService(db);
      const org = crypto.randomUUID();
      await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'dash3']));
      const widgets = [{ id: 'sp', kind: 'sprint-progress' as const, project: 'NOVA' }];
      expect(await code(dash.put(org, { widgets }, { id: 'dev', roles: ['athena-team-member'] }))).toMatch(/^forbidden/);
      expect(await code(dash.put(org, { widgets }, { id: 'pm', roles: ['athena-pm'] }))).toBe('ok');
    } finally { await testDb.drop(); }
  }, 30_000);
});
