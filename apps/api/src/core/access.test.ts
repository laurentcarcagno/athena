import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { AccessService } from './access.service';
import { ArtifactService } from './artifact.service';
import { CoverageService } from './coverage.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { MatrixService } from './matrix.service';
import { PinService } from './pin.service';
import { ProjectOverviewService } from './project-overview.service';
import { runAs, runAsSystem } from './request-context';
import { requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';
import { TreeService } from './tree.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-team-member', 'athena-admin'] };
const user = (id: string): Actor => ({ id, roles: ['athena-team-member'] });
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? e.code : e ? `autre:${(e as Error).message}` : 'ok'; };

suite('listes d’ayants droit : la base filtre toutes les lectures', () => {
  let testDb: TestDb;
  let db: Db;
  let access: AccessService;
  let artifacts: ArtifactService;
  let search: SearchService;
  let overview: ProjectOverviewService;
  let coverage: CoverageService;
  let links: LinkService;
  let trackers: TrackerService;
  let pins: PinService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_access');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    access = new AccessService(db);
    search = new SearchService(db);
    overview = new ProjectOverviewService(db);
    coverage = new CoverageService(db);
    links = new LinkService(db);
    pins = new PinService(db);
    for (const [id, key] of [[org, 'acl'], [other, 'acl2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
    for (const s of ['u-admin', 'u-alice', 'u-bob']) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$2)', [org, s]));
    await trackers.createProject(org, 'SEC', 'Secret', admin);
    await trackers.createProject(org, 'PUB', 'Public', admin);
    await trackers.createTracker(org, requirementTemplate('SEC'), admin);
    await trackers.createTracker(org, { ...requirementTemplate('SEC', 'TST'), name: 'Essais' }, admin);
    await trackers.createTracker(org, requirementTemplate('PUB'), admin);
    await trackers.createTracker(org, { ...requirementTemplate('PUB', 'CUI'), name: 'Confidentiel' }, admin);
    for (const [p, t, n] of [['SEC', 'REQ', 3], ['SEC', 'TST', 1], ['PUB', 'REQ', 2], ['PUB', 'CUI', 2]] as const) for (let i = 1; i <= n; i++) await artifacts.create(org, p, t, { title: `${p}-${t} ${i}`, statement: 's' }, admin);
    await links.link(org, 'SEC', 'SEC-TST-0001', 'SEC-REQ-0001', 'verifies', admin);
    await links.link(org, 'PUB', 'PUB-CUI-0001', 'PUB-REQ-0001', 'verifies', admin); // lien entre un tracker public et un tracker à liste
    await pins.setFavorite(org, 'u-bob', { kind: 'project', project: 'SEC', ref: 'SEC', label: 'SEC' }, true);
    await pins.setFavorite(org, 'u-bob', { kind: 'project', project: 'PUB', ref: 'PUB', label: 'PUB' }, true);
    await coverage.create(org, 'SEC', 'ver', { name: 'Vérifiées', fromTracker: 'REQ', linkType: 'verifies', direction: 'any', minCount: 1, statuses: [], threshold: { target: 100 } }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  const as = <T>(subject: string, fn: () => Promise<T>) => runAs(subject, fn);
  const projects = (subject: string) => as(subject, () => db.tx(org, async (c) => (await c.query('select key from project order by key')).rows.map((r) => r.key as string)));
  const counts = (subject: string) => as(subject, () => db.tx(org, async (c) => (await c.query('select (select count(*)::int from artifact) a, (select count(*)::int from tracker) t, (select count(*)::int from artifact_link) l, (select count(*)::int from artifact_revision) r, (select count(*)::int from status) s, (select count(*)::int from field_definition) f')).rows[0]));

  it('sans liste, tout le monde lit comme avant', async () => {
    expect(await projects('u-bob')).toEqual(['PUB', 'SEC']);
    expect(await counts('u-bob')).toMatchObject({ a: 8, t: 4, l: 2 });
  });

  it('la gestion des listes est réservée à son service et se fait hors filtre : un administrateur non membre la gère sans lire le contenu', async () => {
    await as('u-admin', () => access.set(org, 'SEC', { members: ['u-alice'] }, admin));
    expect(await as('u-admin', () => access.list(org, 'SEC'))).toEqual([{ scope: 'project', tracker: null, members: [{ subject: 'u-alice', username: 'u-alice', displayName: 'u-alice' }] }]);
    expect(await code(access.set(org, 'SEC', { members: ['inconnu'] }, admin))).toBe('validation');
    expect(await code(access.set(org, 'ZZZ', { members: ['u-alice'] }, admin))).toBe('not_found');
    expect(await code(access.set(org, 'SEC', { tracker: 'NOP', members: ['u-alice'] }, admin))).toBe('not_found');
  });

  it('un projet doté d’une liste n’est lisible que de ses membres, administrateurs d’organisation compris', async () => {
    expect(await projects('u-alice')).toEqual(['PUB', 'SEC']);
    expect(await projects('u-bob')).toEqual(['PUB']);
    expect(await projects('u-admin')).toEqual(['PUB']); // administrateur non membre : pas d’accès
    expect(await projects('u-alice')).toContain('SEC');
    expect(await runAsSystem(() => db.tx(org, async (c) => (await c.query('select key from project order by key')).rows.map((r) => r.key as string)))).toContain('SEC'); // traitement système (historique, webhooks) : non filtré
  });

  it('lecture directe, recherche ATQL et compteurs : aucune fuite', async () => {
    expect(await as('u-bob', () => code(artifacts.get(org, 'SEC', 'SEC-REQ-0001')))).toBe('not_found');
    expect((await as('u-alice', () => artifacts.get(org, 'SEC', 'SEC-REQ-0001'))).key).toBe('SEC-REQ-0001');
    const hit = (subject: string, project: string, q: string) => as(subject, () => search.search(org, project, q, subject));
    expect((await hit('u-bob', 'SEC', 'tracker = REQ')).total).toBe(0);
    expect((await hit('u-bob', 'SEC', 'tracker = REQ')).hits).toEqual([]);
    expect((await hit('u-alice', 'SEC', 'tracker = REQ')).total).toBe(3);
    expect((await hit('u-bob', 'PUB', 'tracker = REQ')).total).toBe(2);
    expect(await counts('u-bob')).toMatchObject({ a: 4, t: 2, l: 1, s: 6, f: 8 }); // ni items, ni trackers, ni statuts, ni champs, ni liens de SEC
    expect(await counts('u-alice')).toMatchObject({ a: 8, t: 4, l: 2 });
    expect(await as('u-bob', () => overview.overview(org, 'SEC', 'u-bob').then(() => 'ok', (e: DomainError) => e.code))).toBe('not_found');
    expect(await as('u-bob', () => code(overview.modules(org, 'SEC')))).toBe('not_found');
    expect((await as('u-alice', () => overview.overview(org, 'SEC', 'u-alice'))).trackers.map((t) => [t.key, t.artifacts])).toEqual([['REQ', 3], ['TST', 1]]);
  });

  it('recherche globale (T-0118) : un ticket d’un projet non autorisé n’apparaît jamais, même nommé', async () => {
    const global = (subject: string, q: string, projects?: string[]) =>
      as(subject, () => search.searchOrganization(org, q, subject, { projects, roles: ['athena-team-member'], limit: 200 }));
    const keys = async (subject: string, q: string, projects?: string[]) => (await global(subject, q, projects)).hits.map((h) => h.key).sort();
    expect((await global('u-bob', '')).total).toBe(4);
    expect((await keys('u-bob', '')).every((k) => k.startsWith('PUB-'))).toBe(true);
    expect(await keys('u-bob', 'project = SEC')).toEqual([]);
    expect(await keys('u-bob', 'key = SEC-REQ-0001')).toEqual([]);
    expect(await keys('u-bob', '', ['SEC'])).toEqual([]);
    expect(await keys('u-bob', '', ['SEC', 'PUB'])).toHaveLength(4);
    expect((await global('u-alice', '')).total).toBe(8);
    expect(await keys('u-alice', 'tracker = REQ', ['SEC'])).toEqual(['SEC-REQ-0001', 'SEC-REQ-0002', 'SEC-REQ-0003']);
    const first = (await global('u-alice', 'key = SEC-REQ-0001')).hits[0]!;
    expect(first).toMatchObject({ project: 'SEC', tracker: 'REQ', title: 'SEC-REQ 1' });
    // Une autre organisation ne voit rien (RLS d'organisation).
    expect((await as('u-alice', () => search.searchOrganization(other, '', 'u-alice'))).total).toBe(0);
    expect(await code(global('u-alice', '', ['sec; drop']))).toBe('validation');
    expect(await code(global('u-alice', 'champ ~~ ='))).toBe('validation');
  });

  it('plein texte, palette (recherche par clé ou titre) et journal des automatisations respectent la liste', async () => {
    const hits = (s: string, q: string) => as(s, () => search.search(org, 'SEC', q, s)).then((r) => r.hits.map((h) => h.key));
    expect(await hits('u-bob', 'text ~ "sec"')).toEqual([]);
    expect((await hits('u-alice', 'text ~ "sec"')).length).toBeGreaterThan(0);
    expect(await hits('u-bob', 'key ~ "SEC" OR title ~ "SEC"')).toEqual([]); // requête de la palette et de l’autocomplétion des liens
    expect((await hits('u-alice', 'key ~ "SEC" OR title ~ "SEC"')).length).toBeGreaterThan(0);
    await db.tx(org, async (c) => {
      const rule = (await c.query("insert into automation_rule (organization_id, project_id, name, trigger_type, condition, actions, created_by) select organization_id, id, 'r', 'artifact.created', '', '[]', 'u-admin' from project where key = 'SEC' returning id")).rows[0];
      await c.query("insert into automation_run (organization_id, rule_id, event_id, artifact_key, status) select organization_id, id, gen_random_uuid(), 'SEC-REQ-0001', 'done' from automation_rule where id = $1", [rule.id]);
    }, { system: true });
    const runs = (s: string) => as(s, () => db.tx(org, async (c) => Number((await c.query('select count(*) n from automation_run')).rows[0].n)));
    expect([await runs('u-bob'), await runs('u-alice')]).toEqual([0, 1]);
  });

  it('couverture, favoris et écritures respectent la liste', async () => {
    expect(await as('u-bob', () => code(coverage.evaluate(org, 'SEC', ['athena-team-member'])))).toBe('not_found');
    expect((await as('u-alice', () => coverage.evaluate(org, 'SEC', ['athena-team-member'])))[0]).toMatchObject({ total: 3, covered: 1 });
    expect((await as('u-bob', () => pins.list(org, 'u-bob'))).favorites.map((f) => f.ref)).toEqual(['PUB']); // le favori vers SEC ne trahit pas son existence
    expect(await as('u-bob', () => code(artifacts.create(org, 'SEC', 'REQ', { title: 'intrus', statement: 's' }, user('u-bob'))))).not.toBe('ok');
    expect(await as('u-alice', () => code(artifacts.create(org, 'SEC', 'REQ', { title: 'légitime', statement: 's' }, user('u-alice'))))).toBe('ok');
  });

  it('une liste de tracker ne restreint que ce tracker ; les liens vers un item caché disparaissent', async () => {
    await as('u-admin', () => access.set(org, 'PUB', { tracker: 'CUI', members: ['u-alice'] }, admin));
    expect((await as('u-bob', () => search.search(org, 'PUB', 'tracker = REQ', 'u-bob'))).total).toBe(2);
    expect((await as('u-bob', () => search.search(org, 'PUB', 'tracker = CUI', 'u-bob'))).total).toBe(0);
    expect((await as('u-alice', () => search.search(org, 'PUB', 'tracker = CUI', 'u-alice'))).total).toBe(2);
    expect(await as('u-bob', () => code(artifacts.get(org, 'PUB', 'PUB-CUI-0001')))).toBe('not_found');
    expect((await as('u-bob', () => artifacts.get(org, 'PUB', 'PUB-REQ-0001'))).key).toBe('PUB-REQ-0001');
    expect(await as('u-bob', () => db.tx(org, async (c) => Number((await c.query("select count(*) n from artifact_link l join artifact a on a.id = l.to_artifact_id where a.key = 'PUB-REQ-0001'")).rows[0].n)))).toBe(0);
    expect(await as('u-alice', () => db.tx(org, async (c) => Number((await c.query("select count(*) n from artifact_link l join artifact a on a.id = l.to_artifact_id where a.key = 'PUB-REQ-0001'")).rows[0].n)))).toBe(1);
    expect((await as('u-admin', () => access.list(org, 'PUB'))).map((l) => [l.scope, l.tracker])).toEqual([['tracker', 'CUI']]);
  });

  it('plein texte, matrice et arbre ne renvoient rien des trackers refusés', async () => {
    const tree = new TreeService(db);
    const matrix = new MatrixService(db);
    expect(await as('u-bob', () => code(tree.children(org, 'SEC', 'REQ', null, ['athena-team-member'])))).not.toBe('ok');
    expect(await as('u-bob', () => code(matrix.matrix(org, 'SEC', 'REQ', 'TST', 'verifies', ['athena-team-member'])))).not.toBe('ok');
  });

  it('chaque modification de liste est consignée dans le journal d’audit chaîné, avec les membres ajoutés et retirés', async () => {
    await as('u-admin', () => access.set(org, 'SEC', { members: ['u-alice', 'u-bob'] }, admin));
    await as('u-admin', () => access.set(org, 'SEC', { members: ['u-bob'] }, admin));
    const rows = await db.tx(org, async (c) => (await c.query("select action, detail from audit_log where action like 'access_list.%' order by seq")).rows, { system: true });
    expect(rows.map((r) => r.action)).toEqual(['access_list.set', 'access_list.set', 'access_list.set', 'access_list.set']);
    expect(rows[2]!.detail).toMatchObject({ added: ['u-bob'], removed: [], created: false });
    expect(rows[3]!.detail).toMatchObject({ added: [], removed: ['u-alice'] });
    expect(await projects('u-alice')).toEqual(['PUB']);
    expect(await projects('u-bob')).toEqual(['PUB', 'SEC']);
  });

  it('supprimer la liste rend la portée aux seuls rôles ; une autre organisation n’est jamais concernée', async () => {
    await as('u-admin', () => access.remove(org, 'SEC', null, admin));
    await as('u-admin', () => access.remove(org, 'PUB', 'CUI', admin));
    expect(await code(access.remove(org, 'SEC', null, admin))).toBe('not_found');
    expect(await projects('u-admin')).toEqual(['PUB', 'SEC']);
    expect((await as('u-bob', () => search.search(org, 'PUB', 'tracker = CUI', 'u-bob'))).total).toBe(2);
    await trackers.createProject(other, 'OTH', 'Autre', admin);
    expect(await as('u-bob', () => db.tx(other, async (c) => (await c.query('select key from project')).rows.length))).toBe(1);
  });
});
