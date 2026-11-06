import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate, requirementTemplate } from '../core/templates';
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

  it('rattache des vues à un tracker : listées pour ce tracker seulement, les filtres de projet restent à part', async () => {
    const db = new Db(testDb.pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    await trackers.createTracker(org, requirementTemplate('ARI'), admin);
    const mineView = await filters.create(org, 'ARI', { name: 'Mes ouverts', query: 'status = open', trackerKey: 'BUG', view: 'tableau', columns: ['key', 'status'] }, alice);
    expect(mineView).toMatchObject({ trackerKey: 'BUG', view: 'tableau', columns: ['key', 'status'], isDefault: false, shared: false });
    await filters.create(org, 'ARI', { name: 'Bloquants', query: 'severity = bloquante', trackerKey: 'BUG', shared: true }, alice);
    await filters.create(org, 'ARI', { name: 'Brouillons', query: 'status = draft', trackerKey: 'REQ', shared: true }, alice);
    expect((await filters.list(org, 'ARI', alice, 'BUG')).map((f) => f.name)).toEqual(['Bloquants', 'Mes ouverts']);
    expect((await filters.list(org, 'ARI', bob, 'BUG')).map((f) => f.name)).toEqual(['Bloquants']); // la vue personnelle d'alice reste privée
    expect((await filters.list(org, 'ARI', alice, 'REQ')).map((f) => f.name)).toEqual(['Brouillons']);
    expect((await filters.list(org, 'ARI', alice)).map((f) => f.name)).toEqual(['Équipe']); // sans tracker : filtres de projet, comme avant
    expect(await code(filters.create(org, 'ARI', { name: 'x', query: 'status = open', trackerKey: 'NOPE' }, alice))).toMatch(/not_found/);
  });

  it('une seule vue par défaut par tracker, choisie par un responsable, partagée et rattachée à un tracker', async () => {
    const pm: Actor = { id: 'pm', roles: ['athena-user', 'athena-pm'] };
    expect(await code(filters.create(org, 'ARI', { name: 'D1', query: 'status = open', trackerKey: 'BUG', shared: true, isDefault: true }, alice))).toMatch(/forbidden/);
    expect(await code(filters.create(org, 'ARI', { name: 'D2', query: 'status = open', trackerKey: 'BUG', isDefault: true }, pm))).toMatch(/validation.*partagée/);
    expect(await code(filters.create(org, 'ARI', { name: 'D3', query: 'status = open', shared: true, isDefault: true }, pm))).toMatch(/validation/);
    const first = await filters.create(org, 'ARI', { name: 'Défaut A', query: 'status = open', trackerKey: 'BUG', shared: true, isDefault: true }, pm);
    expect((await filters.list(org, 'ARI', bob, 'BUG'))[0]).toMatchObject({ name: 'Défaut A', isDefault: true });
    const second = await filters.create(org, 'ARI', { name: 'Défaut B', query: 'status = in_progress', trackerKey: 'BUG', shared: true, isDefault: true }, pm);
    const defaults = (await filters.list(org, 'ARI', bob, 'BUG')).filter((f) => f.isDefault).map((f) => f.name);
    expect(defaults).toEqual(['Défaut B']); // la précédente est retirée
    expect(await code(filters.setDefault(org, 'ARI', first.id, true, alice))).toMatch(/forbidden/);
    await filters.setDefault(org, 'ARI', first.id, true, pm);
    expect((await filters.list(org, 'ARI', bob, 'BUG')).filter((f) => f.isDefault).map((f) => f.name)).toEqual(['Défaut A']);
    await filters.setDefault(org, 'ARI', first.id, false, pm);
    expect((await filters.list(org, 'ARI', bob, 'BUG')).some((f) => f.isDefault)).toBe(false);
    void second;
  });
});
