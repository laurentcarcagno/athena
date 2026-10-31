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
    await links.link(org, 'ARI', 'BUG-1', 'REQ-1', 'verifies', actor);
    const fromBug = await links.list(org, 'ARI', 'BUG-1');
    const fromReq = await links.list(org, 'ARI', 'REQ-1');
    expect(fromBug).toMatchObject([{ direction: 'outward', label: 'vérifie', other: 'REQ-1', suspect: false }]);
    expect(fromReq).toMatchObject([{ direction: 'inward', label: 'vérifié par', other: 'BUG-1' }]);
  });

  it('refuse doublon, auto-lien, type et artefact inconnus', async () => {
    expect(await code(links.link(org, 'ARI', 'BUG-1', 'REQ-1', 'verifies', actor))).toMatch(/autre:.*duplicate/);
    expect(await code(links.link(org, 'ARI', 'BUG-1', 'BUG-1', 'verifies', actor))).toBe('validation');
    expect(await code(links.link(org, 'ARI', 'BUG-1', 'REQ-1', 'nope', actor))).toBe('not_found');
    expect(await code(links.link(org, 'ARI', 'BUG-1', 'REQ-99', 'verifies', actor))).toBe('not_found');
  });

  it('marque suspect un lien quand la cible change, puis acquitte', async () => {
    await artifacts.update(org, 'ARI', 'REQ-1', { statement: 'Énoncé modifié' }, 1, actor);
    const [link] = await links.list(org, 'ARI', 'BUG-1');
    expect(link!.suspect).toBe(true);
    await links.clearSuspect(org, link!.id, actor);
    expect((await links.list(org, 'ARI', 'BUG-1'))[0]!.suspect).toBe(false);
    expect(await code(links.clearSuspect(org, link!.id, actor))).toBe('not_found');
  });

  it('interdit les cycles dans un type hiérarchique', async () => {
    for (const t of ['A', 'B', 'C']) await artifacts.create(org, 'ARI', 'REQ', { title: t, statement: t }, actor);
    await links.link(org, 'ARI', 'REQ-2', 'REQ-3', 'parent', actor);
    await links.link(org, 'ARI', 'REQ-3', 'REQ-4', 'parent', actor);
    expect(await code(links.link(org, 'ARI', 'REQ-4', 'REQ-2', 'parent', actor))).toBe('conflict');
  });

  it('ajoute et liste les commentaires dans l’ordre', async () => {
    await links.addComment(org, 'ARI', 'BUG-1', 'Premier', actor);
    await links.addComment(org, 'ARI', 'BUG-1', 'Second', actor);
    expect((await links.comments(org, 'ARI', 'BUG-1')).map((c) => c.body)).toEqual(['Premier', 'Second']);
    expect(await code(links.addComment(org, 'ARI', 'BUG-1', '   ', actor))).toBe('validation');
  });
});
