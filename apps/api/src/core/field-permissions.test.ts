import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService, visibleValues } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };
const dev: Actor = { id: 'u-dev', roles: ['athena-user'] };
const hr: Actor = { id: 'u-hr', roles: ['athena-user', 'hr'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('permissions par champ (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let search: SearchService;
  let trackers: TrackerService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_fieldperm');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    search = new SearchService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'perm']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'STAFF', name: 'Équipe',
      fields: [
        { key: 'title', label: 'Nom', type: 'text', required: true, semanticRole: 'title' },
        { key: 'salary', label: 'Salaire', type: 'number', readRoles: ['hr'], writeRoles: ['hr'] },
        { key: 'notes', label: 'Notes', type: 'text', writeRoles: ['manager'] },
      ],
      statuses: [{ key: 'active', name: 'Actif', category: 'todo' }], transitions: [],
    }, admin);
    await artifacts.create(org, 'ARI', 'STAFF', { title: 'Alice', salary: 5000, notes: 'RAS' }, admin);
    await artifacts.create(org, 'ARI', 'STAFF', { title: 'Bob', salary: 3000 }, hr);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('refuse l’écriture d’un champ restreint sans le rôle, et laisse passer les autres champs', async () => {
    expect(await code(artifacts.create(org, 'ARI', 'STAFF', { title: 'Carl', salary: 1 }, dev))).toMatch(/forbidden.*Écriture interdite sur : salary/);
    const created = await artifacts.create(org, 'ARI', 'STAFF', { title: 'Carl' }, dev);
    expect(await code(artifacts.update(org, 'ARI', created.key, { salary: 9999 }, 1, dev))).toMatch(/forbidden/);
    expect(await code(artifacts.update(org, 'ARI', created.key, { notes: 'x' }, 1, dev))).toMatch(/forbidden.*notes/); // rôle « manager » requis
    const ok = await artifacts.update(org, 'ARI', created.key, { title: 'Carl D.' }, 1, dev);
    expect(ok.values['title']).toBe('Carl D.');
    expect((await artifacts.update(org, 'ARI', created.key, { salary: 2000 }, 2, hr)).values['salary']).toBe(2000);
    expect((await artifacts.update(org, 'ARI', created.key, { notes: 'ok' }, 3, admin)).values['notes']).toBe('ok'); // l'administrateur passe toujours
  });

  it('retire les champs à lecture restreinte pour les lecteurs sans le rôle', async () => {
    expect((await artifacts.get(org, 'ARI', 'ARI-STAFF-0001', dev)).values).toEqual({ title: 'Alice', notes: 'RAS' });
    expect((await artifacts.get(org, 'ARI', 'ARI-STAFF-0001', hr)).values).toMatchObject({ salary: 5000 });
    expect((await artifacts.get(org, 'ARI', 'ARI-STAFF-0001', admin)).values).toMatchObject({ salary: 5000 });
    expect((await artifacts.get(org, 'ARI', 'ARI-STAFF-0001')).values).toMatchObject({ salary: 5000 }); // usage interne sans lecteur
  });

  it('filtre les résultats de recherche et empêche de déduire un champ caché par filtre ou tri', async () => {
    const asDev = await search.search(org, 'ARI', 'ORDER BY key', 'u-dev', 50, 0, dev.roles);
    expect(asDev.hits.every((h) => !('salary' in h.values))).toBe(true);
    expect(asDev.hits[0]!.values).toMatchObject({ title: 'Alice' });
    expect(await code(search.search(org, 'ARI', 'salary > 4000', 'u-dev', 50, 0, dev.roles))).toMatch(/validation.*Champ non accessible : salary/);
    expect(await code(search.search(org, 'ARI', 'ORDER BY salary DESC', 'u-dev', 50, 0, dev.roles))).toMatch(/Champ non accessible/);
    expect(await code(search.search(org, 'ARI', 'salary IS EMPTY', 'u-dev', 50, 0, dev.roles))).toMatch(/Champ non accessible/);
    const asHr = await search.search(org, 'ARI', 'salary > 4000', 'u-hr', 50, 0, hr.roles);
    expect(asHr.hits.map((h) => h.key)).toEqual(['ARI-STAFF-0001']);
    expect(asHr.hits[0]!.values).toMatchObject({ salary: 5000 });
    expect((await search.search(org, 'ARI', 'salary > 4000', 'x', 50, 0, ['athena-admin'])).total).toBe(1);
  });

  it('refuse le plein texte aux lecteurs qui ont des champs masqués, et l’autorise sinon', async () => {
    expect(await code(search.search(org, 'ARI', 'text ~ "5000"', 'u-dev', 50, 0, dev.roles))).toMatch(/validation.*plein texte indisponible/i);
    expect((await search.search(org, 'ARI', 'text ~ "alice"', 'u-hr', 50, 0, hr.roles)).hits.map((h) => h.key)).toEqual(['ARI-STAFF-0001']);
  });

  it('applique les rôles aux champs ajoutés ensuite et les expose dans la définition', async () => {
    await trackers.addField(org, 'ARI', 'STAFF', { key: 'review', label: 'Évaluation', type: 'text', readRoles: ['manager'] }, admin);
    const def = await new Db(testDb.pool).tx(org, (c) => trackers.getDefinition(c, 'ARI', 'STAFF'));
    expect(def.fields.find((f) => f.key === 'review')).toMatchObject({ readRoles: ['manager'], writeRoles: null });
    expect(def.fields.find((f) => f.key === 'title')).toMatchObject({ readRoles: null });
    expect(visibleValues(def, { title: 'x', review: 'secret', salary: 1 }, ['athena-user'])).toEqual({ title: 'x' });
    expect(visibleValues(def, { review: 'secret' }, ['manager'])).toEqual({ review: 'secret' });
  });
});
