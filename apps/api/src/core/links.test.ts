import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { bugTemplate, requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? error.code : `autre:${(error as Error)?.message}`;
}

suite('liens et commentaires', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let links: LinkService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_links');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'links']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, bugTemplate('ARI'), actor);
    await trackers.createTracker(org, requirementTemplate('ARI'), actor);
    await links.createLinkType(org, 'ARI', { key: 'verifies', outwardLabel: 'vérifie', inwardLabel: 'vérifié par' }, actor);
    await links.createLinkType(org, 'ARI', { key: 'parent', outwardLabel: 'parent de', inwardLabel: 'enfant de', hierarchical: true }, actor);
  });
  afterAll(async () => {
    await testDb?.drop();
  });

  it('lie des artefacts de trackers différents et liste les deux sens', async () => {
    await artifacts.create(org, 'ARI', 'REQ', { title: 'R', statement: 's' }, actor);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'B', severity: 'mineure' }, actor);
    await links.link(org, 'ARI', 'ARI-BUG-0001', 'ARI-REQ-0001', 'verifies', actor);
    const fromBug = await links.list(org, 'ARI', 'ARI-BUG-0001');
    const fromReq = await links.list(org, 'ARI', 'ARI-REQ-0001');
    expect(fromBug).toMatchObject([{ direction: 'outward', label: 'vérifie', other: 'ARI-REQ-0001', suspect: false }]);
    expect(fromReq).toMatchObject([{ direction: 'inward', label: 'vérifié par', other: 'ARI-BUG-0001' }]);
  });

  it('refuse doublon, auto-lien, type et artefact inconnus', async () => {
    expect(await code(links.link(org, 'ARI', 'ARI-BUG-0001', 'ARI-REQ-0001', 'verifies', actor))).toMatch(/autre:.*duplicate/);
    expect(await code(links.link(org, 'ARI', 'ARI-BUG-0001', 'ARI-BUG-0001', 'verifies', actor))).toBe('validation');
    expect(await code(links.link(org, 'ARI', 'ARI-BUG-0001', 'ARI-REQ-0001', 'nope', actor))).toBe('not_found');
    expect(await code(links.link(org, 'ARI', 'ARI-BUG-0001', 'ARI-REQ-0099', 'verifies', actor))).toBe('not_found');
  });

  it('marque suspect un lien quand la cible change, puis acquitte', async () => {
    await artifacts.update(org, 'ARI', 'ARI-REQ-0001', { statement: 'Énoncé modifié' }, 1, actor);
    const [link] = await links.list(org, 'ARI', 'ARI-BUG-0001');
    expect(link!.suspect).toBe(true);
    await links.clearSuspect(org, link!.id, actor);
    expect((await links.list(org, 'ARI', 'ARI-BUG-0001'))[0]!.suspect).toBe(false);
    expect(await code(links.clearSuspect(org, link!.id, actor))).toBe('not_found');
  });

  it('interdit les cycles dans un type hiérarchique', async () => {
    for (const t of ['A', 'B', 'C']) await artifacts.create(org, 'ARI', 'REQ', { title: t, statement: t }, actor);
    await links.link(org, 'ARI', 'ARI-REQ-0002', 'ARI-REQ-0003', 'parent', actor);
    await links.link(org, 'ARI', 'ARI-REQ-0003', 'ARI-REQ-0004', 'parent', actor);
    expect(await code(links.link(org, 'ARI', 'ARI-REQ-0004', 'ARI-REQ-0002', 'parent', actor))).toBe('conflict');
  });

  it('ajoute et liste les commentaires dans l’ordre', async () => {
    await links.addComment(org, 'ARI', 'ARI-BUG-0001', 'Premier', actor);
    await links.addComment(org, 'ARI', 'ARI-BUG-0001', 'Second', actor);
    expect((await links.comments(org, 'ARI', 'ARI-BUG-0001')).map((c) => c.body)).toEqual(['Premier', 'Second']);
    expect(await code(links.addComment(org, 'ARI', 'ARI-BUG-0001', '   ', actor))).toBe('validation');
  });

  it('liste les types de liens du projet pour le sélecteur de création', async () => {
    const types = await links.listTypes(org, 'ARI');
    // Les types du projet d'abord par clé avec les types livrés de l'organisation, sans doublon : « verifies » du projet surcharge celui de l'organisation.
    expect(types.map((t) => [t.key, t.scope])).toEqual([['blocks', 'organization'], ['concerns', 'organization'], ['duplicates', 'organization'], ['implements', 'organization'], ['parent', 'project'], ['refines', 'organization'], ['satisfies', 'organization'], ['verifies', 'project']]);
    expect(types.find((t) => t.key === 'verifies')).toMatchObject({ outwardLabel: 'vérifie', inwardLabel: 'vérifié par' });
  });

  it('supprime un lien (événement, audit), refuse un lien d’un autre projet ou inconnu', async () => {
    const [mine] = await links.list(org, 'ARI', 'ARI-BUG-0001');
    const db = new Db(testDb.pool);
    await new TrackerService(db, new FieldTypeRegistry()).createProject(org, 'OTH', 'Autre', actor);
    expect(await code(links.remove(org, 'OTH', mine!.id, actor))).toBe('not_found'); // le lien n'appartient pas à ce projet
    await links.remove(org, 'ARI', mine!.id, actor);
    expect(await links.list(org, 'ARI', 'ARI-BUG-0001')).toEqual([]);
    expect(await links.list(org, 'ARI', 'ARI-REQ-0001')).toEqual([]); // l'autre extrémité ne le voit plus non plus
    expect(await code(links.remove(org, 'ARI', mine!.id, actor))).toBe('not_found');
    const event = await db.tx(org, async (c) => (await c.query("select payload from outbox_event where type = 'link.deleted'")).rows[0]?.payload);
    expect(event).toMatchObject({ from: 'ARI-BUG-0001', to: 'ARI-REQ-0001', type: 'verifies', actor: 'u1' });
    const audited = await db.tx(org, async (c) => Number((await c.query("select count(*) n from audit_log where action = 'link.delete'")).rows[0].n));
    expect(audited).toBe(1);
    await links.link(org, 'ARI', 'ARI-BUG-0001', 'ARI-REQ-0001', 'verifies', actor); // le même lien peut être recréé
  });
});
