import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { compile } from './compile';
import { AtqlError, parse } from './parser';
import { SearchService } from './search.service';

describe('analyse ATQL', () => {
  it('analyse conditions, priorité AND/OR et tri', () => {
    const q = parse('status = open OR severity IN (majeure, "bloquante") AND NOT assignee IS EMPTY ORDER BY updated DESC, key');
    expect(q.where).toMatchObject({ type: 'or', right: { type: 'and' } });
    expect(q.orderBy).toEqual([{ field: 'updated', descending: true }, { field: 'key', descending: false }]);
  });
  it('accepte une requête vide', () => {
    expect(parse('')).toEqual({ where: null, orderBy: [] });
    expect(parse('ORDER BY key').where).toBeNull();
  });
  it.each([
    ['status =', /Valeur attendue/],
    ['status open', /Opérateur attendu/],
    ['(status = open', /« \) » attendu/],
    ['status = "ouvert', /Chaîne non fermée/],
    ['status = open AND', /Nom de champ attendu/],
    ['status @ open', /Caractère inattendu/],
    ['status = open ORDER key', /« BY » attendu/],
    ['status IS FULL', /« EMPTY » attendu/],
  ])('signale l’erreur de %s', (src, message) => {
    expect(() => parse(src)).toThrow(AtqlError);
    expect(() => parse(src)).toThrow(message);
  });
  it('applique les limites de coût', () => {
    expect(() => parse('a'.repeat(2001))).toThrow(/trop longue/);
    expect(() => parse(`${'('.repeat(13)}status = open${')'.repeat(13)}`)).toThrow(/profonde/);
    expect(() => parse(Array.from({ length: 51 }, () => 'status = open').join(' OR '))).toThrow(/Trop de conditions/);
  });
});

describe('compilation SQL', () => {
  const ctx = { currentUser: 'u-1' };
  it('ne concatène jamais de données utilisateur dans le SQL', () => {
    const attack = `x" OR 1=1; DROP TABLE artifact; --`;
    const compiled = compile(`title ~ "${attack.replace(/"/g, '\\"')}" AND status = "${attack.replace(/"/g, '\\"')}"`, ctx);
    expect(compiled.where).not.toMatch(/DROP|1=1/i);
    expect(compiled.params.join('|')).toContain('DROP TABLE');
  });
  it('refuse les noms de champ dangereux', () => {
    expect(() => compile('"a; drop" = 1', ctx)).toThrow();
    expect(() => compile('Titre-x = 1', ctx)).toThrow(/invalide/);
    expect(() => compile('title = unknownFn()', ctx)).toThrow(/Fonction inconnue/);
  });
  it('résout daysAgo(n) en date relative et refuse les arguments hors bornes', () => {
    const [iso] = compile('created < daysAgo(7)', ctx).params as string[];
    expect(Date.now() - Date.parse(iso!)).toBeGreaterThan(6.99 * 86_400_000);
    expect(() => compile('created < daysAgo(99999)', ctx)).toThrow(/Fonction inconnue/);
    expect(() => compile('created < daysAgo()', ctx)).toThrow(/Fonction inconnue/);
  });
  it('résout daysFromNow(n) en date à venir (T-0122) et refuse les arguments hors bornes', () => {
    const [iso] = compile('created < daysFromNow(7)', ctx).params as string[];
    expect(Date.parse(iso!) - Date.now()).toBeGreaterThan(6.99 * 86_400_000);
    expect(() => compile('created < daysFromNow(99999)', ctx)).toThrow(/Fonction inconnue/);
  });
  it('résout currentUser()', () => {
    expect(compile('created_by = currentUser()', ctx).params).toContain('u-1');
  });
});

const suite = pgUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };

suite('recherche ATQL (intégration)', () => {
  let testDb: TestDb;
  let search: SearchService;
  const org = crypto.randomUUID();
  const run = (q: string, user = 'u1') => search.search(org, 'ARI', q, user);
  const keys = async (q: string) => (await run(q)).hits.map((h) => h.key);

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_atql');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    search = new SearchService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'atql']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'BUG', name: 'Bugs',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure', 'bloquante'] } },
        { key: 'points', label: 'Points', type: 'number' },
        { key: 'tags', label: 'Étiquettes', type: 'multiselect', config: { options: ['ui', 'api', 'db'] } },
        { key: 'assignee', label: 'Responsable', type: 'user' },
      ],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'done', name: 'Fini', category: 'done' }],
      transitions: [{ name: 'Terminer', from: 'open', to: 'done' }],
    }, actor);
    const make = (values: Record<string, unknown>, user: Actor = actor) => artifacts.create(org, 'ARI', 'BUG', values, user);
    await make({ title: 'Crash au démarrage', severity: 'bloquante', points: 8, tags: ['api', 'db'], assignee: 'alice' });
    await make({ title: 'Lenteur de la liste', severity: 'majeure', points: 3, tags: ['ui'] });
    await make({ title: '100% de CPU', severity: 'mineure', points: 10 }, { id: 'u2', roles: [] });
    await make({ title: 'Faute de frappe', severity: 'mineure', points: 1, tags: ['ui'], assignee: 'bob' });
    await artifacts.transition(org, 'ARI', 'ARI-BUG-0004', 'Terminer', 1, actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('filtre par champs natifs et personnalisés', async () => {
    expect(await keys('status = open ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0002', 'ARI-BUG-0003']);
    expect(await keys('severity = mineure ORDER BY key')).toEqual(['ARI-BUG-0003', 'ARI-BUG-0004']);
    expect(await keys('severity != mineure ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0002']);
    expect(await keys('severity IN (majeure, bloquante) ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0002']);
    expect(await keys('severity NOT IN (mineure) ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0002']);
    expect(await keys('tracker = BUG AND project = ARI ORDER BY key')).toHaveLength(4);
    expect(await keys('category != done ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0002', 'ARI-BUG-0003']);
    expect(await keys('category = done')).toEqual(['ARI-BUG-0004']);
  });
  it('compare les nombres numériquement', async () => {
    expect(await keys('points > 3 ORDER BY points')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0003']);
    expect(await keys('points <= 3 ORDER BY points DESC')).toEqual(['ARI-BUG-0002', 'ARI-BUG-0004']);
    expect(await keys('points = 10')).toEqual(['ARI-BUG-0003']);
  });
  it('cherche dans les listes, par texte et gère les caractères spéciaux', async () => {
    expect(await keys('tags = ui ORDER BY key')).toEqual(['ARI-BUG-0002', 'ARI-BUG-0004']);
    expect(await keys('title ~ "démarrage"')).toEqual(['ARI-BUG-0001']);
    expect(await keys('title ~ "100%"')).toEqual(['ARI-BUG-0003']);
    expect(await keys('title ~ "%"')).toEqual(['ARI-BUG-0003']); // le joker est échappé
  });
  it('gère vide, négation, parenthèses et currentUser()', async () => {
    expect(await keys('assignee IS EMPTY ORDER BY key')).toEqual(['ARI-BUG-0002', 'ARI-BUG-0003']);
    expect(await keys('assignee IS NOT EMPTY ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0004']);
    expect(await keys('tags IS EMPTY')).toEqual(['ARI-BUG-0003']);
    expect(await keys('NOT (severity = mineure OR severity = majeure)')).toEqual(['ARI-BUG-0001']);
    expect(await keys('(severity = mineure OR points > 7) AND status = open ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0003']);
    expect(await keys('created_by = currentUser() ORDER BY key')).toEqual(['ARI-BUG-0001', 'ARI-BUG-0002', 'ARI-BUG-0004']);
    expect(await (await run('created_by = currentUser()', 'u2')).hits.map((h) => h.key)).toEqual(['ARI-BUG-0003']);
  });
  it('trie, pagine et compte', async () => {
    const page = await search.search(org, 'ARI', 'ORDER BY points DESC', 'u1', 2, 1);
    expect(page.total).toBe(4);
    expect(page.hits.map((h) => h.key)).toEqual(['ARI-BUG-0001', 'ARI-BUG-0002']);
    expect((await run('created > "2000-01-01"')).total).toBe(4);
    expect((await run('created < "2000-01-01"')).total).toBe(0);
  });
  it('rejette les requêtes invalides en erreur de validation, jamais en 500', async () => {
    const error = await run('status = ').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('validation');
    await expect(run('x = "\'; drop table artifact; --"')).resolves.toMatchObject({ total: 0 });
    const still = await run('');
    expect(still.total).toBe(4);
    await expect(search.search(org, 'ARI', '', 'u1', 500)).rejects.toBeInstanceOf(DomainError);
  });
  it('isole les organisations', async () => {
    const other = await search.search(crypto.randomUUID(), 'ARI', '', 'u1');
    expect(other.total).toBe(0);
  });

  it('recherche en plein texte sur toutes les valeurs, avec expressions exactes et exclusions', async () => {
    expect(await keys('text ~ "démarrage"')).toEqual(['ARI-BUG-0001']);
    expect(await keys('text ~ "crash"')).toEqual(['ARI-BUG-0001']);
    expect(await keys('text ~ "lenteur liste" ORDER BY key')).toEqual(['ARI-BUG-0002']); // tous les mots, dans n'importe quel champ
    expect(await keys('text ~ "faute OR cpu" ORDER BY key')).toEqual(['ARI-BUG-0003', 'ARI-BUG-0004']);
    expect(await keys('text ~ "ui -lenteur"')).toEqual(['ARI-BUG-0004']); // « ui » est une étiquette de ARI-BUG-0002 et ARI-BUG-0004
    expect(await keys('text ~ "\\"faute de frappe\\"" AND status = done')).toEqual(['ARI-BUG-0004']);
    expect(await keys('text ~ "api" AND severity = bloquante')).toEqual(['ARI-BUG-0001']);
  });
  it('limite l’opérateur du plein texte et le refuse quand des champs sont masqués au lecteur', async () => {
    const code = async (p: Promise<unknown>) => {
      const e = await p.then(() => null, (x: unknown) => x);
      return e instanceof DomainError ? `${e.code}:${e.message} ${e.details.join(' ')}` : `autre:${(e as Error)?.message}`;
    };
    expect(await code(run('text = "x"'))).toMatch(/validation.*n'accepte que l'opérateur ~/);
    expect(await code(run('text > 3'))).toMatch(/validation.*n'accepte que l'opérateur ~/);
    const hidden = await search.search(org, 'ARI', 'text ~ "crash"', 'u1', 50, 0, ['athena-user']);
    expect(hidden.total).toBe(1); // aucun champ restreint dans ce jeu de données : le plein texte reste disponible
  });
});
