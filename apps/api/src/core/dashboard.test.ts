import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ROLES_KEY, withUserRole } from '../auth/auth.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService, ScopeSchema, WidgetSchema, allowedKinds, checkGrid, homeWidgetsFor, suggestedHomeWidgets, toGrid, type Widget } from './dashboard.service';

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

  it('l’accueil est vide par défaut pour tous les rôles, et reste enregistrable carte par carte', async () => {
    for (const roles of [['athena-team-member'], ['athena-pm', 'athena-team-member'], ['athena-qa'], ['athena-admin', 'athena-team-member'], ['athena-director']]) {
      expect(await dash.get(org, { id: 'r', roles })).toEqual({ widgets: [], isDefault: true });
    }
    // les dispositions suggérées par rôle (à définir plus tard) restent des requêtes ATQL valides
    for (const roles of [['athena-pm'], ['athena-qa'], ['athena-team-member']]) for (const w of suggestedHomeWidgets(roles)) expect(await code(dash.put(org, { widgets: [w] }, { id: 'probe', roles: ['athena-pm'] }))).toBe('ok');
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
    // L'administrateur a en plus les deux cartes de portefeuille (lot 18).
    expect(kinds({ id: 'a', roles: ['athena-admin'] }).filter((k) => !k.startsWith('portfolio-'))).toEqual(kinds(lead));
    // Le directeur accède aux tableaux de bord de pilotage ; le manager garde le catalogue d’un membre d’équipe.
    expect(kinds({ id: 'r', roles: ['athena-director', 'athena-team-member'] })).toContain('health');
    expect(kinds({ id: 'm', roles: ['athena-manager', 'athena-team-member'] })).not.toContain('health');
    expect(svc.catalog(lead).find((k) => k.kind === 'health')!.project).toBe(true);
  });
  it('les dispositions par défaut de chaque rôle sont posables par ce rôle et sans chevauchement', () => {
    for (const a of [dev, lead, { id: 'r', roles: ['athena-director', 'athena-team-member'] }, { id: 'm', roles: ['athena-manager', 'athena-team-member'] }, { id: 'q', roles: ['athena-qa'] }, { id: 'a', roles: ['athena-admin'] }]) {
      const allowed = new Set(allowedKinds(a.roles));
      const grid = toGrid(suggestedHomeWidgets(a.roles));
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

describe('portée de portefeuille (lot 18, B24)', () => {
  it('la portée portfolio:<clé> est valide ; une clé de projet minuscule ou un portefeuille vide ne le sont pas', () => {
    expect(ScopeSchema.safeParse('portfolio:spatial').success).toBe(true);
    expect(ScopeSchema.safeParse('portfolio:').success).toBe(false);
    expect(ScopeSchema.safeParse('portfolio:Spatial').success).toBe(false);
  });
  it('les cartes de portefeuille sont dans le catalogue du PMO, du directeur et de l’administrateur, jamais d’un membre d’équipe ni d’un chef de projet', () => {
    for (const roles of [['athena-pmo'], ['athena-director'], ['athena-admin']]) expect(allowedKinds(roles)).toEqual(expect.arrayContaining(['portfolio-health', 'portfolio-tiles']));
    for (const roles of [['athena-team-member'], ['athena-pm', 'athena-team-member'], ['athena-qa']]) {
      expect(allowedKinds(roles)).not.toContain('portfolio-health');
      expect(allowedKinds(roles)).not.toContain('portfolio-tiles');
    }
  });
});

suite('tableau de bord d’un portefeuille (intégration)', () => {
  it('défaut tuiles puis tableau ; réservé au PMO et au directeur ; ces cartes ne se posent que dans un portefeuille', async () => {
    const testDb = await createTestDb('athena_test_dashboard_pf');
    try {
      const db = new Db(testDb.pool);
      const dash = new DashboardService(db);
      const org = crypto.randomUUID();
      await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'dashpf']));
      const pmo = { id: 'pmo', roles: ['athena-pmo', 'athena-team-member'] };
      const dev = { id: 'dev', roles: ['athena-team-member'] };
      const first = await dash.get(org, pmo, 'portfolio:spatial');
      expect(first.isDefault).toBe(true);
      expect(first.widgets.map((w) => w.kind)).toEqual(['portfolio-tiles', 'portfolio-health']);
      expect(await code(dash.get(org, dev, 'portfolio:spatial'))).toMatch(/^forbidden/);
      expect(await code(dash.put(org, { widgets: [{ id: 'h', kind: 'portfolio-health' }] }, pmo, 'portfolio:spatial'))).toBe('ok');
      expect((await dash.get(org, pmo, 'portfolio:spatial')).widgets.map((w) => w.kind)).toEqual(['portfolio-health']);
      expect(await code(dash.put(org, { widgets: [{ id: 'h', kind: 'portfolio-health' }] }, pmo, ''))).toMatch(/^validation/);
      expect(await code(dash.put(org, { widgets: [{ id: 'm', kind: 'mentions' }] }, pmo, 'portfolio:spatial'))).toMatch(/^validation/);
      expect((await dash.get(org, pmo, '')).isDefault).toBe(true); // l'accueil personnel est intact
    } finally { await testDb.drop(); }
  }, 30_000);
});

describe('droits du directeur sur sa disposition', () => {
  const allowed = (handler: keyof DashboardController, method: string) => {
    const required = Reflect.getMetadata(ROLES_KEY, DashboardController.prototype[handler]) as string[];
    return required.some((r) => withUserRole(['athena-director'], method).includes(r));
  };
  it('le directeur lit, enregistre et réinitialise son tableau de bord (préférence personnelle) ; la lecture seule reste la règle ailleurs', () => {
    expect(allowed('get', 'GET')).toBe(true);
    expect(allowed('put', 'PUT')).toBe(true);
    expect(allowed('reset', 'DELETE')).toBe(true);
    expect(allowed('createTab', 'POST')).toBe(true);
    expect(allowed('deleteTab', 'DELETE')).toBe(true);
  });
});

suite('classeur à onglets du tableau de bord (intégration)', () => {
  it('crée, remplit, renomme et supprime des onglets, par portée et par personne', async () => {
    const testDb = await createTestDb('athena_test_dashboard_tabs');
    try {
      const db = new Db(testDb.pool);
      const dash = new DashboardService(db);
      const org = crypto.randomUUID();
      await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'dashtabs']));
      expect(await dash.tabs(org, alice)).toEqual([{ id: '', title: null }]);
      const a = await dash.createTab(org, alice, '', 'Qualité & risques');
      expect(a).toEqual({ id: 'qualite-risques', title: 'Qualité & risques' });
      expect((await dash.createTab(org, alice, '', 'Qualité risques')).id).toBe('qualite-risques-2'); // titre voisin : identifiant distinct
      // feuille blanche, puis disposition propre à l'onglet ; l'onglet principal garde la sienne
      expect(await dash.get(org, alice, '', a.id)).toEqual({ widgets: [], isDefault: true });
      expect(await code(dash.put(org, { widgets: [{ id: 'm', kind: 'mentions' }] }, alice, '', a.id))).toBe('ok');
      expect((await dash.get(org, alice, '', a.id)).widgets.map((w) => w.id)).toEqual(['m']);
      expect((await dash.get(org, alice, '')).isDefault).toBe(true);
      // un onglet est personnel et propre à sa portée
      expect(await code(dash.get(org, bob, '', a.id))).toMatch(/^not_found/);
      expect((await dash.tabs(org, bob)).length).toBe(1);
      expect((await dash.tabs(org, alice, 'NOVA')).length).toBe(1);
      expect(await code(dash.put(org, { widgets: [] }, alice, '', 'inconnu'))).toMatch(/^not_found/);
      // renommer, vider, supprimer
      expect(await dash.renameTab(org, alice, '', a.id, 'Risques')).toEqual({ id: a.id, title: 'Risques' });
      expect((await dash.tabs(org, alice)).map((t) => t.title)).toEqual([null, 'Risques', 'Qualité risques']);
      await dash.reset(org, alice, '', a.id);
      expect((await dash.get(org, alice, '', a.id)).widgets).toEqual([]);
      await dash.put(org, { widgets: [{ id: 'm', kind: 'mentions' }] }, alice, '', a.id);
      await dash.deleteTab(org, alice, '', a.id);
      expect(await code(dash.get(org, alice, '', a.id))).toMatch(/^not_found/);
      // l'identifiant libéré repart sur une feuille blanche : la disposition supprimée ne ressuscite pas
      expect((await dash.createTab(org, alice, '', 'Qualité & risques')).id).toBe('qualite-risques');
      expect((await dash.get(org, alice, '', 'qualite-risques')).widgets).toEqual([]);
      // l'onglet principal ne se renomme ni ne se supprime ; la limite est tenue
      // l'onglet principal se renomme (titre propre à la portée), sans compter dans la limite
      expect(await dash.renameTab(org, alice, '', '', 'Mon quotidien')).toEqual({ id: '', title: 'Mon quotidien' });
      await dash.renameTab(org, alice, '', '', 'Au quotidien');
      expect((await dash.tabs(org, alice)).slice(0, 2)).toEqual([{ id: '', title: 'Au quotidien' }, { id: 'qualite-risques-2', title: 'Qualité risques' }]);
      expect((await dash.tabs(org, alice, 'NOVA'))[0]!.title).toBeNull();
      expect(await code(dash.deleteTab(org, alice, '', ''))).toMatch(/^validation/);
      for (let i = 0; i < 6; i++) await dash.createTab(org, alice, '', `Onglet ${i}`);
      expect(await code(dash.createTab(org, alice, '', 'De trop'))).toMatch(/^validation/);
      // les onglets d'un tableau de bord de portefeuille restent réservés à ses rôles
      expect(await code(dash.createTab(org, alice, 'portfolio:spatial', 'X'))).toMatch(/^forbidden/);
      const pmo = { id: 'pmo', roles: ['athena-pmo', 'athena-team-member'] };
      expect((await dash.createTab(org, pmo, 'portfolio:spatial', 'Synthèse')).id).toBe('synthese');
    } finally { await testDb.drop(); }
  }, 30_000);
});
