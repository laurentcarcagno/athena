import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { SavedSearchService } from './saved-search.service';

// T-0118 : recherches enregistrées de la recherche globale, personnelles et isolées par organisation.

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-team-member'] };
const bob: Actor = { id: 'bob', roles: ['athena-team-member'] };
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof DomainError ? `${e.code}:${e.message} ${e.details.join(' ')}` : e ? `autre:${(e as Error).message}` : 'ok';
};

suite('recherches enregistrées (intégration)', () => {
  let testDb: TestDb;
  let saved: SavedSearchService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_saved_search');
    const db = new Db(testDb.pool);
    saved = new SavedSearchService(db);
    for (const [id, key] of [[org, 'srch'], [other, 'srch2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('valide la requête et les projets, refuse les doublons, reste personnelle et propre à l’organisation', async () => {
    expect(await code(saved.create(org, { name: 'x', query: 'status =' }, alice))).toMatch(/^validation/);
    expect(await code(saved.create(org, { name: 'x', query: '', projects: ['ari'] }, alice))).toMatch(/^validation/);
    const mine = await saved.create(org, { name: 'Ouverts', query: 'category != done', projects: ['ARI', 'ARI', 'NOVA'] }, alice);
    expect(mine.projects).toEqual(['ARI', 'NOVA']);
    expect(await code(saved.create(org, { name: 'Ouverts', query: '' }, alice))).toMatch(/^conflict/);
    await saved.create(org, { name: 'Ouverts', query: '' }, bob); // même nom, autre propriétaire
    expect((await saved.list(org, alice)).map((s) => [s.name, s.query, s.projects])).toEqual([['Ouverts', 'category != done', ['ARI', 'NOVA']]]);
    expect(await saved.list(other, alice)).toEqual([]);
    expect(await code(saved.remove(org, mine.id, bob))).toMatch(/^not_found/);
    expect(await code(saved.remove(other, mine.id, alice))).toMatch(/^not_found/);
    expect(await code(saved.remove(org, 'nope', alice))).toMatch(/^not_found/);
    expect(await code(saved.remove(org, mine.id, alice))).toBe('ok');
    expect(await saved.list(org, alice)).toEqual([]);
  }, 30_000);
});
