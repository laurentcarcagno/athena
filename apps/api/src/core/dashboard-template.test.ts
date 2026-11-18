import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ROLES_KEY, withUserRole } from '../auth/auth.guard';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { DashboardController } from './dashboard.controller';
import { DashboardTemplateController } from './dashboard-template.controller';
import { DashboardService, MAX_WIDGETS, allowedKinds } from './dashboard.service';
import { DashboardTemplateService, scopeInfo } from './dashboard-template.service';
import { ASSIGNABLE_ROLES, TemplateInput, checkTemplate, fits, resolveTemplate, type TemplateInputData } from './dashboard-template';
import { BUILTIN_DASHBOARD_TEMPLATES } from './dashboard-templates';
import { runAs } from './request-context';
import { TrackerService } from './tracker.service';
import { FieldTypeRegistry } from './field-types';

// Lot 27 (ADR-0010) : gabarits de tableaux de bord : modèle, gabarits livrés, résolution, administration, proposition et application.

const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof DomainError ? `${e.code}:${e.message} ${e.details.join(' ')}` : e ? `autre:${(e as Error).message}` : 'ok';
};
/** Problèmes (détails de la 422) levés par la validation d'un gabarit, en une chaîne. */
const problems = (fn: () => void): string => { try { fn(); } catch (e) { return e instanceof DomainError ? e.details.join(' | ') : String(e); } return ''; };
const input = (over: Partial<TemplateInputData> = {}): TemplateInputData => TemplateInput.parse({
  type: 'home', name: 'Essai', roles: ['athena-team-member'], tabs: [{ name: 'Un', widgets: [{ kind: 'mentions' }] }], ...over,
});

describe('gabarits livrés', () => {
  it('chacun est valide : cartes permises à chaque rôle ciblé, requêtes ATQL correctes, grille sans chevauchement (P10)', () => {
    for (const t of BUILTIN_DASHBOARD_TEMPLATES) expect(() => checkTemplate(TemplateInput.parse({ ...t, key: undefined })), t.key).not.toThrow();
  });
  it('les clés sont uniques et sans collision, de 1 à 9 onglets, au plus 24 cartes par onglet', () => {
    const keys = BUILTIN_DASHBOARD_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(23);
    for (const t of BUILTIN_DASHBOARD_TEMPLATES) {
      expect(t.tabs.length).toBeGreaterThanOrEqual(1);
      expect(t.tabs.length).toBeLessThanOrEqual(9);
      for (const tab of t.tabs) expect(tab.widgets.length).toBeLessThanOrEqual(MAX_WIDGETS);
    }
  });
  it('R1 : ni Favoris ni Récents ; R2 : le Contributeur a deux onglets, « Mes anomalies » dans « Aujourd’hui »', () => {
    for (const t of BUILTIN_DASHBOARD_TEMPLATES) for (const tab of t.tabs) for (const w of tab.widgets) expect(['favorites', 'recents']).not.toContain(w.kind);
    const c = BUILTIN_DASHBOARD_TEMPLATES.find((t) => t.key === 'home-contributeur')!;
    expect(c.tabs.map((x) => x.name)).toEqual(['Aujourd’hui', 'À prendre']);
    expect(c.tabs[0]!.widgets.map((w) => w.title)).toContain('Mes anomalies');
  });
  it('couvrent chaque type et chaque rôle d’accueil : un gabarit de Mon travail par rôle, plus l’essentiel commun', () => {
    const home = BUILTIN_DASHBOARD_TEMPLATES.filter((t) => t.type === 'home');
    for (const role of ASSIGNABLE_ROLES) expect(home.some((t) => t.roles.includes(role) && t.key !== 'home-essentiel'), role).toBe(true);
    expect(BUILTIN_DASHBOARD_TEMPLATES.filter((t) => t.type === 'project')).toHaveLength(8);
    expect(BUILTIN_DASHBOARD_TEMPLATES.filter((t) => t.type === 'progress')).toHaveLength(3);
    expect(BUILTIN_DASHBOARD_TEMPLATES.filter((t) => t.type === 'portfolio')).toHaveLength(3);
  });
  it('les graphiques ne réclament que des champs de répartition connus de la recherche', () => {
    for (const t of BUILTIN_DASHBOARD_TEMPLATES) for (const tab of t.tabs) for (const w of tab.widgets) if (w.kind === 'chart') expect(w.field).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });
});

describe('validation d’un gabarit (P1, P7, P10)', () => {
  it('refuse une carte que l’un des rôles ciblés ne peut pas poser', async () => {
    expect(allowedKinds(['athena-team-member'])).not.toContain('platform-ops');
    expect(problems(() => checkTemplate(input({ type: 'home', roles: ['athena-pm'], tabs: [{ name: 'A', widgets: [{ kind: 'platform-ops' }] }] })))).toMatch(/n'est pas permise au rôle athena-pm/);
    expect(problems(() => checkTemplate(input({ type: 'home', roles: ['athena-admin', 'athena-qa'], tabs: [{ name: 'A', widgets: [{ kind: 'platform-ops' }] }] })))).toMatch(/athena-qa/);
    expect(problems(() => checkTemplate(input({ type: 'home', roles: ['athena-admin'], tabs: [{ name: 'A', widgets: [{ kind: 'platform-ops' }] }] })))).toBe('');
  });
  it('une carte de projet ou de portefeuille, dans Mon travail, doit se répéter ; une répétition n’a de sens que là', () => {
    expect(problems(() => checkTemplate(input({ roles: ['athena-pm'], tabs: [{ name: 'A', widgets: [{ kind: 'health' }] }] })))).toMatch(/une par projet/);
    expect(problems(() => checkTemplate(input({ roles: ['athena-pmo'], tabs: [{ name: 'A', widgets: [{ kind: 'portfolio-tiles' }] }] })))).toMatch(/un par portefeuille/);
    expect(problems(() => checkTemplate(input({ roles: ['athena-pm'], tabs: [{ name: 'A', widgets: [{ kind: 'health', repeat: 'project' }] }] })))).toBe('');
    expect(problems(() => checkTemplate(input({ type: 'project', roles: ['athena-pm'], tabs: [{ name: 'A', widgets: [{ kind: 'health', repeat: 'project' }] }] })))).toMatch(/Mon travail/);
  });
  it('un tableau de bord de projet n’accepte pas les cartes de portefeuille ; un portefeuille refuse les cartes de projet non répétées', () => {
    expect(problems(() => checkTemplate(input({ type: 'project', roles: ['athena-pmo'], tabs: [{ name: 'A', widgets: [{ kind: 'portfolio-tiles' }] }] })))).toMatch(/portefeuille/);
    expect(problems(() => checkTemplate(input({ type: 'portfolio', roles: ['athena-pmo'], tabs: [{ name: 'A', widgets: [{ kind: 'health' }] }] })))).toMatch(/n'accepte que/);
    expect(problems(() => checkTemplate(input({ type: 'portfolio', roles: ['athena-finance'], tabs: [{ name: 'A', widgets: [{ kind: 'project-finance', repeat: 'project' }] }] })))).toBe('');
  });
  it('requête ATQL invalide, onglet en double, natures hors projet : 422 en clair', () => {
    expect(problems(() => checkTemplate(input({ tabs: [{ name: 'A', widgets: [{ kind: 'search', query: 'assignee = = x' }] }] })))).toMatch(/carte 1/);
    expect(problems(() => checkTemplate(input({ tabs: [{ name: 'A', widgets: [] }, { name: 'a', widgets: [] }] })))).toMatch(/en double/);
    expect(problems(() => checkTemplate(input({ type: 'home', natures: ['armament'] })))).toMatch(/natures/);
    expect(problems(() => checkTemplate(input({ tabs: [{ name: 'A', widgets: [{ kind: 'chart', query: '', form: 'donut' }] }] })))).toMatch(/champ/);
  });
  it('refuse des cartes qui se chevauchent à la même position', () => {
    expect(problems(() => checkTemplate(input({ tabs: [{ name: 'A', widgets: [{ kind: 'mentions', x: 0, y: 0, w: 4, h: 2 }, { kind: 'approvals', x: 2, y: 1, w: 4, h: 2 }] }] })))).not.toBe('');
  });
  it('un gabarit n’a ni clé de projet, ni clé de portefeuille (P7)', () => {
    expect(TemplateInput.safeParse({ type: 'home', name: 'X', roles: ['athena-pm'], tabs: [{ name: 'A', widgets: [{ kind: 'search', query: '', projects: ['NOVA'] }] }] }).success).toBe(true); // clé inconnue ignorée
    const parsed = TemplateInput.parse({ type: 'home', name: 'X', roles: ['athena-pm'], tabs: [{ name: 'A', widgets: [{ kind: 'search', query: '', projects: ['NOVA'] }] }] });
    expect((parsed.tabs[0]!.widgets[0] as Record<string, unknown>)['projects']).toBeUndefined();
  });
});

describe('résolution (P7)', () => {
  const widgets = (r: ReturnType<typeof resolveTemplate>, tab = 0) => r.tabs[tab]!.widgets;
  it('dans un tableau de bord de projet, les cartes visent le projet courant', () => {
    const t = BUILTIN_DASHBOARD_TEMPLATES.find((x) => x.key === 'project-chef')!;
    const r = resolveTemplate(t, { project: 'LUMEN', repeatProjects: [], repeatPortfolios: [] });
    expect(r.tabs.map((x) => x.name)).toEqual(['Synthèse', 'Planning', 'Risques et écarts', 'Équipe et budget']);
    const health = widgets(r).find((w) => w.kind === 'health')!;
    expect(health.projects).toEqual(['LUMEN']);
    expect(health.project).toBe('LUMEN');
    const search = widgets(r, 1).find((w) => w.kind === 'search')!;
    expect(search.projects).toEqual(['LUMEN']);
    for (const tab of r.tabs) expect(new Set(tab.widgets.map((w) => w.id)).size).toBe(tab.widgets.length);
  });
  it('dans Mon travail, « une par projet » se répète, titrée par la clé, sans chevauchement', () => {
    const t = BUILTIN_DASHBOARD_TEMPLATES.find((x) => x.key === 'home-chef-de-projet')!;
    const r = resolveTemplate(t, { repeatProjects: ['LUMEN', 'SAT1', 'RADC'], repeatPortfolios: [] });
    const mine = widgets(r, 1);
    expect(mine).toHaveLength(9);
    expect(mine.map((w) => w.title)).toContain('Santé du projet · SAT1');
    expect(mine.filter((w) => w.kind === 'health').map((w) => w.projects![0])).toEqual(['LUMEN', 'SAT1', 'RADC']);
    expect(new Set(mine.map((w) => w.id)).size).toBe(9);
    // aucune répétition : l'onglet se résout vide, sans erreur
    expect(widgets(resolveTemplate(t, { repeatProjects: [], repeatPortfolios: [] }), 1)).toEqual([]);
  });
  it('« un par portefeuille » vise chaque portefeuille ; dans un portefeuille, « une par projet » vise ses projets', () => {
    const pmo = BUILTIN_DASHBOARD_TEMPLATES.find((x) => x.key === 'home-pmo')!;
    const r = resolveTemplate(pmo, { repeatProjects: [], repeatPortfolios: ['defense', 'spatial'] });
    expect(widgets(r).map((w) => w.portfolio)).toEqual(['defense', 'spatial', 'defense', 'spatial']);
    const fin = BUILTIN_DASHBOARD_TEMPLATES.find((x) => x.key === 'portfolio-finance')!;
    const rf = resolveTemplate(fin, { portfolio: 'defense', repeatProjects: ['DRNT', 'RADC'], repeatPortfolios: [] });
    expect(widgets(rf, 1).map((w) => w.projects![0])).toEqual(['DRNT', 'RADC']);
    expect(widgets(rf, 0).every((w) => w.portfolio === 'defense')).toBe(true);
  });
  it('au plus 24 cartes par onglet ; le surplus est compté', () => {
    const t = BUILTIN_DASHBOARD_TEMPLATES.find((x) => x.key === 'home-chef-de-projet')!;
    const many = Array.from({ length: 30 }, (_, i) => `P${String(i).padStart(2, '0')}`);
    const r = resolveTemplate(t, { repeatProjects: many, repeatPortfolios: [] });
    expect(widgets(r, 1)).toHaveLength(MAX_WIDGETS);
    expect(r.truncated).toBe(66); // 3 cartes × 30 projets = 90, dont 24 gardées
  });
});

describe('ciblage (P8, P9)', () => {
  it('fits : listes vides = tous ; sinon nature et rôle dans le projet doivent correspondre', () => {
    expect(fits({ natures: [], projectRoles: [] }, { nature: 'armament', projectRole: 'reader' })).toBe(true);
    expect(fits({ natures: ['armament'], projectRoles: [] }, { nature: 'generic', projectRole: 'manager' })).toBe(false);
    expect(fits({ natures: [], projectRoles: ['manager'] }, { nature: 'generic', projectRole: 'member' })).toBe(false);
    expect(fits({ natures: ['generic'], projectRoles: ['manager', 'member'] }, { nature: 'generic', projectRole: 'member' })).toBe(true);
  });
  it('portée → type, projet, portefeuille', () => {
    expect(scopeInfo('')).toEqual({ type: 'home' });
    expect(scopeInfo('LUMEN')).toEqual({ type: 'project', project: 'LUMEN' });
    expect(scopeInfo('LUMEN:avancement')).toEqual({ type: 'progress', project: 'LUMEN' });
    expect(scopeInfo('portfolio:defense')).toEqual({ type: 'portfolio', portfolio: 'defense' });
  });
});

describe('droits des routes', () => {
  const allowed = (controller: { prototype: object }, handler: string, roles: string[], method: string) => {
    const required = Reflect.getMetadata(ROLES_KEY, (controller.prototype as Record<string, object>)[handler]!) as string[];
    return required.some((r) => withUserRole(roles, method).includes(r));
  };
  it('l’administration des gabarits est réservée à l’administrateur ; chacun lit et applique les siens (le directeur aussi)', () => {
    for (const h of ['list', 'catalog', 'one', 'create', 'duplicate', 'update', 'remove', 'hidden', 'setDefault', 'clearDefault', 'preview']) {
      expect(allowed(DashboardTemplateController, h, ['athena-admin'], 'POST'), h).toBe(true);
      for (const role of ['athena-pmo', 'athena-pm', 'athena-director', 'athena-team-member', 'athena-finance']) expect(allowed(DashboardTemplateController, h, [role], 'GET'), `${h} ${role}`).toBe(false);
    }
    expect(allowed(DashboardController, 'proposed', ['athena-team-member'], 'GET')).toBe(true);
    expect(allowed(DashboardController, 'apply', ['athena-director'], 'POST')).toBe(true);
    expect(allowed(DashboardController, 'apply', ['athena-team-member'], 'POST')).toBe(true);
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-admin', 'athena-team-member'] };
const pm: Actor = { id: 'u-pm', roles: ['athena-pm', 'athena-team-member'] };
const dev: Actor = { id: 'u-dev', roles: ['athena-team-member'] };
const pmo: Actor = { id: 'u-pmo', roles: ['athena-pmo', 'athena-team-member'] };

suite('gabarits de tableaux de bord (intégration)', () => {
  let testDb: TestDb; let db: Db; let templates: DashboardTemplateService; let dash: DashboardService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_dash_templates');
    db = new Db(testDb.pool);
    templates = new DashboardTemplateService(db);
    dash = new DashboardService(db);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    for (const [id, key] of [[org, 'dtpl'], [other, 'dtpl2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
    for (const p of ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA']) await trackers.createProject(org, p, p, admin);
    await db.tx(org, async (c) => {
      const id = async (k: string) => (await c.query('select id from project where key = $1', [k])).rows[0].id as string;
      await c.query("insert into project_member (organization_id, project_id, subject, role, added_by) values ($1,$2,'u-pm','manager','x'), ($1,$3,'u-pm','manager','x'), ($1,$4,'u-dev','member','x')", [org, await id('ALFA'), await id('BRAVO'), await id('ALFA')]);
      await c.query("update project set template_key = 'spatial-project' where key = 'ALFA'");
      await c.query("update project set template_key = 'armement-1618' where key = 'BRAVO'");
      await c.query("insert into project_template (organization_id, key, name, trackers, parent_key, created_by) values ($1,'mon-gabarit','Mon gabarit','[]','defense','x')", [org]);
      await c.query("update project set template_key = 'mon-gabarit' where key = 'CHARLIE'");
      await c.query("insert into portfolio (organization_id, key, name, created_by) values ($1,'defense','Défense','x'), ($1,'spatial','Spatial','x')", [org]);
      await c.query("insert into portfolio_project (organization_id, portfolio_id, project_id, added_by) select $1, f.id, p.id, 'x' from portfolio f, project p where f.key = 'defense' and p.key in ('ALFA','BRAVO')", [org]);
    }, { system: true });
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('T-0254 : nature du projet (héritages compris) et rôle de la personne dans le projet', async () => {
    expect(await templates.context(org, pm, 'ALFA')).toEqual({ nature: 'space-project', projectRole: 'manager' });
    expect(await templates.context(org, pm, 'BRAVO')).toEqual({ nature: 'armament', projectRole: 'manager' });
    expect(await templates.context(org, pm, 'CHARLIE')).toEqual({ nature: 'defense-software', projectRole: 'reader' }); // hérite de « defense »
    expect(await templates.context(org, dev, 'ALFA')).toEqual({ nature: 'space-project', projectRole: 'member' });
    expect(await templates.context(org, pm, 'DELTA')).toEqual({ nature: 'generic', projectRole: 'reader' });
    expect(await code(templates.context(org, pm, 'NOPE'))).toMatch(/^not_found/);
  });

  it('T-0257 : créer, modifier, dupliquer un gabarit livré, masquer, supprimer ; un gabarit livré ne se modifie pas', async () => {
    const all = await templates.all(org);
    expect(all.filter((t) => t.builtin)).toHaveLength(BUILTIN_DASHBOARD_TEMPLATES.length);
    const made = await templates.create(org, input({ name: 'Équipe qualité', roles: ['athena-qa'], tabs: [{ name: 'Visas', widgets: [{ kind: 'approvals' }] }] }), admin);
    expect(made).toMatchObject({ key: 'tequipe-qualite', builtin: false, hidden: false, type: 'home' });
    expect(await code(templates.create(org, input({ key: 'home-pmo' }), admin))).toMatch(/^conflict/);
    expect(await code(templates.create(org, input({ key: 'tequipe-qualite' }), admin))).toMatch(/^conflict/);
    const edited = await templates.update(org, made.key, input({ name: 'Équipe qualité 2', roles: ['athena-qa'], tabs: [{ name: 'Visas', widgets: [{ kind: 'approvals' }, { kind: 'mentions' }] }] }), admin);
    expect(edited.tabs[0]!.widgets).toHaveLength(2);
    expect(await code(templates.update(org, made.key, input({ type: 'project', roles: ['athena-qa'] }), admin))).toMatch(/^validation/);
    expect(await code(templates.update(org, 'home-pmo', input(), admin))).toMatch(/^forbidden/);
    expect(await code(templates.remove(org, 'home-pmo', admin))).toMatch(/^forbidden/);
    const copy = await templates.duplicate(org, 'home-pmo', admin);
    expect(copy).toMatchObject({ name: 'PMO (copie)', derivedFrom: 'home-pmo', builtin: false, type: 'home' });
    expect(copy.tabs).toHaveLength(4);
    // masquer un livré, jamais un gabarit d'organisation
    await templates.setHidden(org, 'home-essentiel', true, admin);
    expect((await templates.get(org, 'home-essentiel')).hidden).toBe(true);
    expect(await code(templates.setHidden(org, made.key, true, admin))).toMatch(/^validation/);
    await templates.setHidden(org, 'home-essentiel', false, admin);
    await templates.remove(org, made.key, admin);
    expect(await code(templates.get(org, made.key))).toMatch(/^not_found/);
    // l'isolation d'organisation tient
    expect((await templates.all(other)).filter((t) => !t.builtin)).toEqual([]);
  });

  it('T-0258 : proposé selon les rôles ; pour un projet, selon la nature et le rôle dans le projet, la nature d’abord', async () => {
    const home = (await templates.proposed(org, dev, '')).map((t) => t.key);
    expect(home).toContain('home-essentiel');
    expect(home).toContain('home-contributeur');
    expect(home).not.toContain('home-pmo');
    expect(await templates.proposed(org, dev, 'portfolio:defense')).toEqual([]);
    // même un gabarit de portefeuille ciblant le chef de projet n'est pas proposé à qui ne peut pas ouvrir un tableau de bord de portefeuille
    const risky = await templates.create(org, input({ type: 'portfolio', name: 'Risques du chef', roles: ['athena-pm'], tabs: [{ name: 'R', widgets: [{ kind: 'risk-matrix' }] }] }), admin);
    expect(await templates.proposed(org, pm, 'portfolio:defense')).toEqual([]);
    await templates.remove(org, risky.key, admin);
    // chef du projet ALFA (projet spatial, chef) : « Chef du projet », « Revues ECSS » en tête
    const alfa = (await templates.proposed(org, pm, 'ALFA')).map((t) => t.key);
    expect(alfa[0]).toBe('project-revues-ecss');
    expect(alfa).toContain('project-chef');
    expect(alfa).not.toContain('project-jalons-im1618'); // autre nature
    expect(alfa).not.toContain('project-membre'); // il est chef, pas membre
    const bravo = (await templates.proposed(org, pm, 'BRAVO')).map((t) => t.key);
    expect(bravo[0]).toBe('project-jalons-im1618');
    // membre du projet ALFA
    const member = (await templates.proposed(org, dev, 'ALFA')).map((t) => t.key);
    expect(member).toContain('project-membre');
    expect(member).not.toContain('project-chef');
    // un gabarit masqué n'est plus proposé
    await templates.setHidden(org, 'home-contributeur', true, admin);
    expect((await templates.proposed(org, dev, '')).map((t) => t.key)).not.toContain('home-contributeur');
    await templates.setHidden(org, 'home-contributeur', false, admin);
    // avancement : le cycle en V n'est proposé qu'aux natures normatives
    expect((await templates.proposed(org, pm, 'DELTA:avancement')).map((t) => t.key)).toEqual(['progress-code']); // projet générique : ni cycle en V, ni itératif (réservé aux chefs et membres)
    expect((await templates.proposed(org, pm, 'BRAVO:avancement')).map((t) => t.key)).toContain('progress-cycle-v');
  });

  it('T-0258 : ajouter les onglets à côté des siens, ou tout remplacer ; les copies sont indépendantes du gabarit', async () => {
    await dash.put(org, { widgets: [{ id: 'm', kind: 'mentions' }] }, dev, '');
    const added = await templates.apply(org, dev, '', 'home-contributeur', 'add');
    expect(added.tabs.map((t) => t.title)).toEqual(['Aujourd’hui', 'À prendre']);
    expect((await dash.tabs(org, dev, '')).map((t) => t.title)).toEqual([null, 'Aujourd’hui', 'À prendre']);
    expect((await dash.get(org, dev, '')).widgets.map((w) => w.id)).toEqual(['m']); // l'onglet principal n'a pas bougé
    expect((await dash.get(org, dev, '', added.tabs[0]!.id)).widgets.length).toBeGreaterThan(4);
    // un second ajout : les noms en double sont suffixés
    const again = await templates.apply(org, dev, '', 'home-contributeur', 'add');
    expect(again.tabs.map((t) => t.title)).toEqual(['Aujourd’hui (2)', 'À prendre (2)']);
    // la limite de huit onglets nommés tient
    await templates.apply(org, dev, '', 'home-contributeur', 'add');
    await templates.apply(org, dev, '', 'home-contributeur', 'add');
    expect(await code(templates.apply(org, dev, '', 'home-contributeur', 'add'))).toMatch(/^validation.*au plus 8/);
    // remplacer : tout est remplacé, le premier onglet devient l'onglet principal
    const replaced = await templates.apply(org, dev, '', 'home-essentiel', 'replace');
    expect(replaced.tabs).toEqual([{ id: '', title: 'Mon travail' }]);
    expect(await dash.tabs(org, dev, '')).toEqual([{ id: '', title: 'Mon travail' }]);
    expect((await dash.get(org, dev, '')).widgets.map((w) => w.kind)).toEqual(['search', 'search', 'approvals', 'mentions']);
    // la copie est indépendante : la personne peut tout modifier, et le gabarit reste intact
    await dash.put(org, { widgets: [] }, dev, '');
    expect((await templates.get(org, 'home-essentiel')).tabs[0]!.widgets).toHaveLength(4);
    // un gabarit non proposé (autre rôle) ou d'un autre type est refusé
    expect(await code(templates.apply(org, dev, '', 'home-pmo', 'add'))).toMatch(/^not_found/);
    expect(await code(templates.apply(org, dev, 'ALFA', 'home-essentiel', 'add'))).toMatch(/^not_found/);
  });

  it('T-0255 : sur un projet, les cartes visent le projet ; dans Mon travail, « une par projet » suit mes projets', async () => {
    const r = await templates.apply(org, pm, 'ALFA', 'project-chef', 'replace');
    expect(r.tabs.map((t) => t.title)).toEqual(['Synthèse', 'Planning', 'Risques et écarts', 'Équipe et budget']);
    const main = await dash.get(org, pm, 'ALFA');
    expect(main.widgets.find((w) => w.kind === 'health')).toMatchObject({ projects: ['ALFA'], project: 'ALFA' });
    // chef de ALFA et BRAVO : Mon travail répète par projet dont il est chef
    await templates.apply(org, pm, '', 'home-chef-de-projet', 'replace');
    const mine = await dash.get(org, pm, '', 'mes-projets');
    expect(mine.widgets.filter((w) => w.kind === 'health').map((w) => w.projects![0])).toEqual(['ALFA', 'BRAVO']);
    expect(mine.widgets.map((w) => w.title)).toContain('Santé du projet · BRAVO');
  });

  it('T-0255 : pour un PMO, « un par portefeuille » suit les portefeuilles ; pour la finance, « une par projet » prend tous les projets visibles', async () => {
    await templates.apply(org, pmo, '', 'home-pmo', 'replace');
    const tiles = (await dash.get(org, pmo, '')).widgets;
    expect(tiles.map((w) => [w.kind, w.portfolio])).toEqual([['portfolio-tiles', 'defense'], ['portfolio-tiles', 'spatial'], ['portfolio-health', 'defense'], ['portfolio-health', 'spatial']]);
    const fin: Actor = { id: 'u-fin', roles: ['athena-finance', 'athena-team-member'] };
    await templates.apply(org, fin, '', 'home-finance', 'replace');
    const projects = await dash.get(org, fin, '', 'projets');
    expect(projects.widgets.map((w) => w.projects![0])).toEqual(['ALFA', 'BRAVO', 'CHARLIE', 'DELTA']);
  });

  it('T-0256 : cartes de portefeuille dans Mon travail et recherches dans un portefeuille ; refus des cartes de projet', async () => {
    expect(await code(dash.put(org, { widgets: [{ id: 't', kind: 'portfolio-tiles', portfolio: 'defense' }] }, pmo, ''))).toBe('ok');
    expect(await code(dash.put(org, { widgets: [{ id: 't', kind: 'portfolio-tiles', portfolio: 'defense' }] }, dev, ''))).toMatch(/^forbidden/);
    expect(await code(dash.put(org, { widgets: [{ id: 's', kind: 'search', query: 'type = risk', portfolio: 'defense' }, { id: 'c', kind: 'capacity', portfolio: 'defense' }] }, pmo, 'portfolio:defense'))).toBe('ok');
    expect(await code(dash.put(org, { widgets: [{ id: 'h', kind: 'health' }] }, pmo, 'portfolio:defense'))).toMatch(/^validation.*n’accepte que/);
    expect(await code(dash.put(org, { widgets: [{ id: 'm', kind: 'mentions', portfolio: 'defense' }] }, pmo, ''))).toMatch(/^validation.*portfolio ne concerne/);
    // la finance a son catalogue : finances et tuiles, pas la santé du portefeuille
    const fin: Actor = { id: 'u-fin2', roles: ['athena-finance', 'athena-team-member'] };
    expect(allowedKinds(fin.roles)).toEqual(expect.arrayContaining(['portfolio-finance', 'project-finance', 'portfolio-tiles']));
    expect(allowedKinds(fin.roles)).not.toContain('portfolio-health');
    expect(await code(dash.get(org, fin, 'portfolio:defense'))).toBe('ok');
    expect(await code(dash.get(org, dev, 'portfolio:defense'))).toMatch(/^forbidden/);
  });

  it('T-0258 : gabarit par défaut par type et par rôle, appliqué une fois à la première lecture, jamais écrasé ensuite', async () => {
    const eve: Actor = { id: 'u-eve', roles: ['athena-team-member'] };
    expect(await templates.applyDefault(org, eve, '')).toBe(false); // aucun défaut à la livraison
    expect((await dash.get(org, eve, '')).widgets).toEqual([]);
    expect(await code(templates.setDefault(org, 'home', 'athena-pm', 'home-contributeur', admin))).toMatch(/ne cible pas/);
    expect(await code(templates.setDefault(org, 'project', 'athena-team-member', 'home-contributeur', admin))).toMatch(/de type home/);
    await templates.setDefault(org, 'home', 'athena-team-member', 'home-contributeur', admin);
    expect(await templates.defaults(org)).toEqual([{ type: 'home', role: 'athena-team-member', templateKey: 'home-contributeur' }]);
    expect(await templates.applyDefault(org, eve, '')).toBe(true);
    expect((await dash.tabs(org, eve, '')).map((t) => t.title)).toEqual(['Aujourd’hui', 'À prendre']);
    expect(await templates.applyDefault(org, eve, '')).toBe(false); // déjà chez elle
    // une personne qui a déjà enregistré quelque chose n'est jamais touchée
    expect(await templates.applyDefault(org, dev, '')).toBe(false);
    // un simple titre donné à l'onglet principal n'est pas un tableau de bord enregistré : le défaut s'applique quand même
    const zoe: Actor = { id: 'u-zoe', roles: ['athena-team-member'] };
    await dash.renameTab(org, zoe, '', '', 'Ma page');
    expect(await templates.applyDefault(org, zoe, '')).toBe(true);
    expect((await dash.tabs(org, zoe, '')).map((t) => t.title)).toEqual(['Aujourd’hui', 'À prendre']);
    // priorité des rôles : PMO avant membre d'équipe
    await templates.setDefault(org, 'home', 'athena-pmo', 'home-pmo', admin);
    const sam: Actor = { id: 'u-sam', roles: ['athena-pmo', 'athena-team-member'] };
    expect(await templates.applyDefault(org, sam, '')).toBe(true);
    expect((await dash.tabs(org, sam, '')).map((t) => t.title)).toEqual(['Portefeuilles', 'Arbitrages', 'Ressources et finances', 'Risques et retards']);
    // un gabarit masqué n'est plus appliqué par défaut
    await templates.setHidden(org, 'home-contributeur', true, admin).catch(() => undefined);
    const liz: Actor = { id: 'u-liz', roles: ['athena-team-member'] };
    expect(await templates.applyDefault(org, liz, '')).toBe(false);
    await templates.setHidden(org, 'home-contributeur', false, admin);
    await templates.clearDefault(org, 'home', 'athena-team-member', admin);
    await templates.clearDefault(org, 'home', 'athena-pmo', admin);
    expect(await templates.defaults(org)).toEqual([]);
  });

  it('T-0261 : l’aperçu résout sur un projet ou un portefeuille réels, sans rien enregistrer', async () => {
    const p = await templates.preview(org, admin, 'project-chef', { project: 'ALFA' });
    expect(p.scope).toBe('ALFA');
    expect(p.tabs[0]!.widgets.find((w) => w.kind === 'health')!.projects).toEqual(['ALFA']);
    expect((await dash.tabs(org, admin, 'ALFA')).length).toBe(1); // rien d'enregistré
    const home = await templates.preview(org, admin, 'home-pmo', { portfolios: ['x', 'y'] });
    expect(home.tabs[0]!.widgets.map((w) => w.portfolio)).toEqual(['x', 'y', 'x', 'y']);
    expect(await code(templates.preview(org, admin, 'project-chef', {}))).toMatch(/^validation/);
    expect(await code(templates.preview(org, admin, 'portfolio-pmo', { portfolio: 'nope' }))).toMatch(/^not_found/);
    expect(await code(templates.preview(org, admin, 'project-chef', { project: 'NOPE' }))).toMatch(/^not_found/);
  });

  it('T-0256 : chef de projet limité à ses projets, la nature d’un autre projet reste invisible (404)', async () => {
    const r = await runAs('u-pm', () => code(templates.context(org, pm, 'CHARLIE')), { managedOnly: true });
    expect(r).toMatch(/^not_found/);
    const mine = await runAs('u-pm', () => templates.apply(org, pm, '', 'home-chef-de-projet', 'replace'), { managedOnly: true });
    expect(mine.tabs.length).toBe(4);
    const projects = await runAs('u-pm', () => dash.get(org, pm, '', 'mes-projets'), { managedOnly: true });
    expect(projects.widgets.map((w) => w.projects![0]).sort()).toEqual(['ALFA', 'ALFA', 'ALFA', 'BRAVO', 'BRAVO', 'BRAVO']);
  });
});
