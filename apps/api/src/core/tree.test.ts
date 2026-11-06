import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';
import { TreeService } from './tree.service';

const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };
const suite = pgUp ? describe : describe.skip;

suite('arbre hiérarchique d’un tracker', () => {
  let testDb: TestDb;
  let tree: TreeService;
  let links: LinkService;
  const org = crypto.randomUUID();
  const keysOf = async (parent: string | null, roles = ['athena-user'], tracker = 'REQ') =>
    (await tree.children(org, 'ARI', tracker, parent, roles)).items.map((n) => n.key);

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_tree');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    tree = new TreeService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'tree']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, requirementTemplate('ARI'), actor);
    await trackers.createTracker(org, { ...requirementTemplate('ARI', 'DSG'), name: 'Conception' }, actor);
    // REQ-1 ← REQ-2 ← REQ-4 ; REQ-1 ← REQ-3 ; REQ-5 (racine seule) ; REQ-4 a aussi REQ-3 pour parent ; DSG-1 raffine REQ-1 (autre tracker)
    for (const t of ['REQ-1', 'REQ-2', 'REQ-3', 'REQ-4', 'REQ-5']) await artifacts.create(org, 'ARI', 'REQ', { title: t, statement: 's' }, actor);
    await artifacts.create(org, 'ARI', 'DSG', { title: 'Conception 1', statement: 's' }, actor);
    const link = (from: string, to: string, type = 'refines') => links.link(org, 'ARI', from, to, type, actor);
    await link('ARI-REQ-0002', 'ARI-REQ-0001');
    await link('ARI-REQ-0003', 'ARI-REQ-0001');
    await link('ARI-REQ-0004', 'ARI-REQ-0002');
    await link('ARI-REQ-0004', 'ARI-REQ-0003');
    await links.link(org, 'ARI', 'ARI-DSG-0001', 'ARI-REQ-0001', 'satisfies', actor); // type non hiérarchique : ignoré
  });
  afterAll(async () => { await testDb?.drop(); });

  it('renvoie les racines : les items sans parent dans le tracker, dans l’ordre de création', async () => {
    expect(await keysOf(null)).toEqual(['ARI-REQ-0001', 'ARI-REQ-0005']);
    const page = await tree.children(org, 'ARI', 'REQ', null, ['athena-user']);
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({ key: 'ARI-REQ-0001', title: 'REQ-1', status: 'draft', statusName: 'Brouillon', category: 'todo', childCount: 2, suspect: false });
    expect(page.items[1]).toMatchObject({ childCount: 0 });
  });

  it('renvoie un niveau à la fois ; un item à plusieurs parents apparaît sous chacun', async () => {
    expect(await keysOf('ARI-REQ-0001')).toEqual(['ARI-REQ-0002', 'ARI-REQ-0003']);
    expect(await keysOf('ARI-REQ-0002')).toEqual(['ARI-REQ-0004']);
    expect(await keysOf('ARI-REQ-0003')).toEqual(['ARI-REQ-0004']);
    expect(await keysOf('ARI-REQ-0004')).toEqual([]);
    expect((await tree.children(org, 'ARI', 'REQ', 'ARI-REQ-0001', ['athena-user'])).items.map((n) => n.childCount)).toEqual([1, 1]);
  });

  it('ignore les liens d’un autre tracker et les types non hiérarchiques', async () => {
    expect(await keysOf(null, ['athena-user'], 'DSG')).toEqual(['ARI-DSG-0001']); // il « satisfait » REQ-1 mais n'est pas son enfant
    expect(await keysOf('ARI-REQ-0001')).not.toContain('ARI-DSG-0001');
  });

  it('un lien suspect est signalé sur les deux items', async () => {
    await testDb.exec("update artifact_link set suspect = true where from_artifact_id = (select id from artifact where key = 'ARI-REQ-0004') and to_artifact_id = (select id from artifact where key = 'ARI-REQ-0002')");
    const roots = await tree.children(org, 'ARI', 'REQ', 'ARI-REQ-0002', ['athena-user']);
    expect(roots.items[0]).toMatchObject({ key: 'ARI-REQ-0004', suspect: true });
    expect((await tree.children(org, 'ARI', 'REQ', 'ARI-REQ-0001', ['athena-user'])).items.map((n) => n.suspect)).toEqual([true, false]);
    await testDb.exec('update artifact_link set suspect = false');
  });

  it('masque le titre à un lecteur sans le rôle du champ, et accepte une ancienne clé', async () => {
    await testDb.exec("update field_definition set read_roles = '{qualite}' where key = 'title' and tracker_id = (select id from tracker where key = 'REQ')");
    expect((await tree.children(org, 'ARI', 'REQ', null, ['athena-user'])).items[0]!.title).toBe('ARI-REQ-0001');
    expect((await tree.children(org, 'ARI', 'REQ', null, ['athena-user', 'qualite'])).items[0]!.title).toBe('REQ-1');
    expect((await tree.children(org, 'ARI', 'REQ', null, ['athena-admin'])).items[0]!.title).toBe('REQ-1');
    await testDb.exec("update field_definition set read_roles = null where key = 'title'");
  });

  it('refuse un tracker ou un parent inconnu, et un parent d’un autre tracker', async () => {
    for (const run of [() => tree.children(org, 'ARI', 'NOPE', null, []), () => tree.children(org, 'ARI', 'REQ', 'ARI-REQ-0099', []), () => tree.children(org, 'ARI', 'REQ', 'ARI-DSG-0001', []), () => tree.children(crypto.randomUUID(), 'ARI', 'REQ', null, [])]) {
      const error = await run().then(() => null, (e: unknown) => e);
      expect((error as DomainError).code).toBe('not_found');
    }
  });

  it('la détection de cycle du type hiérarchique protège l’arbre', async () => {
    const error = await links.link(org, 'ARI', 'ARI-REQ-0001', 'ARI-REQ-0004', 'refines', actor).then(() => null, (e: unknown) => e);
    expect((error as DomainError).code).toBe('conflict');
  });
});
