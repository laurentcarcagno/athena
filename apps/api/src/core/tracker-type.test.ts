import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { TemplateService } from './template.service';
import { bugTemplate } from './templates';
import { TrackerService } from './tracker.service';
import { TrackerTypeService, type TrackerTypeInput } from './tracker-type.service';
import { CATEGORIES, builtinTrackerTypes } from './tracker-types';

const actor: Actor = { id: 'u1', roles: ['athena-team-member', 'athena-admin'] };
const input: TrackerTypeInput = { name: 'Interface matérielle', description: 'Connecteurs et bus', category: 'engineering', defaultViews: ['tableau', 'matrice'], baseFields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? error.code : `autre:${(error as Error)?.message}`;
}

describe('types livrés', () => {
  it('couvrent les quatre catégories, avec des clés uniques et des vues connues', () => {
    const types = builtinTrackerTypes();
    expect(new Set(types.map((t) => t.key)).size).toBe(types.length);
    expect([...new Set(types.map((t) => t.category))].sort()).toEqual([...CATEGORIES].sort());
    expect(types.every((t) => t.defaultViews.includes('tableau') && t.baseFields.some((f) => f.semanticRole === 'title'))).toBe(true);
    expect(types.find((t) => t.key === 'task')!.defaultViews).toContain('board');
    expect(types.find((t) => t.key === 'requirement')!.defaultViews).toEqual(expect.arrayContaining(['arbre', 'matrice']));
  });
});

const suite = pgUp ? describe : describe.skip;
suite('types de tracker d’organisation', () => {
  let testDb: TestDb;
  let types: TrackerTypeService;
  let trackers: TrackerService;
  let templates: TemplateService;
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_types');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    types = new TrackerTypeService(db);
    templates = new TemplateService(db, trackers);
    for (const [org, key] of [[orgA, 'types-a'], [orgB, 'types-b']] as const) {
      await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, key]));
    }
    await trackers.createProject(orgA, 'ARI', 'Ariane', actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('liste les types livrés pour toute organisation neuve', async () => {
    const list = await types.list(orgB);
    expect(list).toHaveLength(builtinTrackerTypes().length);
    expect(list.every((t) => t.builtin && !t.modified)).toBe(true);
  });

  it('crée un type propre à l’organisation, refuse un doublon ou une clé livrée, et l’isole des autres organisations', async () => {
    await types.create(orgA, 'hw-interface', input, actor);
    expect(await code(types.create(orgA, 'hw-interface', input, actor))).toBe('conflict');
    expect(await code(types.create(orgA, 'task', input, actor))).toBe('conflict');
    expect((await types.list(orgA)).find((t) => t.key === 'hw-interface')).toMatchObject({ builtin: false, modified: false, category: 'engineering' });
    expect((await types.list(orgB)).some((t) => t.key === 'hw-interface')).toBe(false);
  });

  it('modifie un type livré (version de l’organisation) puis le réinitialise', async () => {
    await types.update(orgA, 'risk', { ...input, name: 'Risque programme', category: 'management' }, actor);
    expect((await types.list(orgA)).find((t) => t.key === 'risk')).toMatchObject({ name: 'Risque programme', builtin: true, modified: true });
    expect((await types.list(orgB)).find((t) => t.key === 'risk')).toMatchObject({ name: 'Risque', modified: false });
    await types.remove(orgA, 'risk', actor);
    expect((await types.list(orgA)).find((t) => t.key === 'risk')).toMatchObject({ name: 'Risque', modified: false });
    expect(await code(types.remove(orgA, 'risk', actor))).toBe('conflict'); // livré et intact
    expect(await code(types.update(orgA, 'inconnu', input, actor))).toBe('not_found');
  });

  it('rattache un tracker à un type livré ou propre, refuse un type inconnu, et garde les trackers sans type', async () => {
    await trackers.createTracker(orgA, bugTemplate('ARI'), actor); // sans type : comportement d'avant
    expect((await testDb.pool.query('select 1')).rowCount).toBe(1);
    const def = async () => new Db(testDb.pool).tx(orgA, (c) => trackers.getDefinition(c, 'ARI', 'BUG'));
    expect((await def()).typeKey).toBeNull();
    await trackers.setType(orgA, 'ARI', 'BUG', 'bug', actor);
    expect((await def()).typeKey).toBe('bug');
    await trackers.setType(orgA, 'ARI', 'BUG', 'hw-interface', actor);
    expect(await code(trackers.setType(orgA, 'ARI', 'BUG', 'nexiste-pas', actor))).toBe('validation');
    expect(await code(trackers.createTracker(orgA, { ...bugTemplate('ARI', 'ERR'), typeKey: 'nexiste-pas' }, actor))).toBe('validation');
    await trackers.createTracker(orgA, { ...bugTemplate('ARI', 'TSK'), typeKey: 'task' }, actor);
    expect((await new Db(testDb.pool).tx(orgA, (c) => trackers.getDefinition(c, 'ARI', 'TSK'))).typeKey).toBe('task');
    await trackers.setType(orgA, 'ARI', 'BUG', null, actor);
    expect((await def()).typeKey).toBeNull();
  });

  it('refuse de supprimer un type utilisé, puis l’autorise une fois le tracker détaché', async () => {
    await trackers.setType(orgA, 'ARI', 'BUG', 'hw-interface', actor);
    expect(await code(types.remove(orgA, 'hw-interface', actor))).toBe('conflict');
    await trackers.setType(orgA, 'ARI', 'BUG', null, actor);
    await types.remove(orgA, 'hw-interface', actor);
    expect((await types.list(orgA)).some((t) => t.key === 'hw-interface')).toBe(false);
  });

  it('reprend le type d’un tracker dans un template de projet', async () => {
    const [fromProject] = await templates.trackersOf(orgA, 'ARI', ['TSK']);
    expect(fromProject!.typeKey).toBe('task');
  });
});
