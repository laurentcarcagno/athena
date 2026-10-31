import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { SavedFilterService } from './saved-filter.service';

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-user'] };
const bob: Actor = { id: 'bob', roles: ['athena-user'] };
const admin: Actor = { id: 'root', roles: ['athena-admin'] };
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof DomainError ? `${e.code}:${e.message} ${e.details.join(' ')}` : `autre:${(e as Error)?.message}`;
};

suite('filtres enregistrés (intégration)', () => {
  let testDb: TestDb;
  let filters: SavedFilterService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_filters');
    const db = new Db(testDb.pool);
    filters = new SavedFilterService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'flt']));
    await new TrackerService(db, new FieldTypeRegistry()).createProject(org, 'ARI', 'Ariane', admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('valide la requête, refuse les doublons et sépare personnel et partagé', async () => {
    expect(await code(filters.create(org, 'ARI', { name: 'x', query: 'status =' }, alice))).toMatch(/validation.*Valeur attendue/);
    const mine = await filters.create(org, 'ARI', { name: 'Mes bugs', query: 'status = open' }, alice);
    await filters.create(org, 'ARI', { name: 'Équipe', query: 'severity = majeure', shared: true }, alice);
    expect(await code(filters.create(org, 'ARI', { name: 'Mes bugs', query: 'status = done' }, alice))).toMatch(/conflict/);
    expect((await filters.list(org, 'ARI', alice)).map((f) => f.name)).toEqual(['Mes bugs', 'Équipe']);
    expect((await filters.list(org, 'ARI', bob)).map((f) => f.name)).toEqual(['Équipe']);
    expect(await code(filters.remove(org, 'ARI', mine.id, bob))).toMatch(/forbidden/);
    await filters.remove(org, 'ARI', mine.id, admin);
    expect((await filters.list(org, 'ARI', alice)).map((f) => f.name)).toEqual(['Équipe']);
    expect(await code(filters.remove(org, 'ARI', mine.id, alice))).toMatch(/not_found/);
  });
});
