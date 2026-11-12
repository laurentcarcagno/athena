import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { LinkTypeService } from './link-type.service';
import { builtinNormative } from './templates/index';
import { roleTypeProblems } from './semantic-roles';
import { TrackerService, type TrackerSpec } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof DomainError ? `${e.code}: ${e.message} ${e.details.join(' ')}` : `autre: ${(e as Error)?.message}`;
};

describe('rôles de planification (sans base)', () => {
  it('exigent un type de champ : date pour start_date, nombre pour progress et remaining', () => {
    expect(roleTypeProblems([{ key: 'd', type: 'date', semanticRole: 'start_date' }, { key: 'p', type: 'number', semanticRole: 'progress' }, { key: 'r', type: 'number', semanticRole: 'remaining' }])).toEqual([]);
    expect(roleTypeProblems([{ key: 'd', type: 'text', semanticRole: 'start_date' }, { key: 'p', type: 'select', semanticRole: 'progress' }])).toEqual([
      'champ d : le rôle start_date exige un champ de type date (type text)',
      'champ p : le rôle progress exige un champ de type number (type select)',
    ]);
    expect(roleTypeProblems([{ key: 'x', type: 'text', semanticRole: 'description' }])).toEqual([]);
  });

  it('les gabarits Spatial et Défense livrent un tracker Tâches de type task avec les rôles de planification', () => {
    for (const key of ['spatial', 'defense']) {
      for (const v of builtinNormative(key)!.versions) {
        const task = v.trackers.find((t) => t.key === 'TSK')!;
        expect(task.typeKey).toBe('task');
        expect(task.fields.filter((f) => f.semanticRole).map((f) => f.semanticRole)).toEqual(expect.arrayContaining(['start_date', 'due_date', 'progress', 'remaining']));
        expect(roleTypeProblems(task.fields)).toEqual([]);
      }
    }
  });
});

const suite = pgUp ? describe : describe.skip;
suite('modèle de planification', () => {
  let testDb: TestDb;
  let db: Db;
  let trackers: TrackerService;
  let artifacts: ArtifactService;
  let links: LinkService;
  let types: LinkTypeService;
  const org = crypto.randomUUID();

  const taskSpec = (project: string, key: string, fields: TrackerSpec['fields']): TrackerSpec => ({
    projectKey: project, key, name: 'Tâches', typeKey: 'task',
    fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, ...fields],
    statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }],
  });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_planning');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    types = new LinkTypeService(db);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'plan','plan')", [org]));
    await trackers.createProject(org, 'NOVA', 'Nova', actor);
    await trackers.createTracker(org, taskSpec('NOVA', 'TSK', [
      { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date' },
      { key: 'progress', label: 'Avancement', type: 'number', semanticRole: 'progress' },
      { key: 'remaining', label: 'Reste à faire', type: 'number', semanticRole: 'remaining' },
    ]), actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  const task = (title: string) => artifacts.create(org, 'NOVA', 'TSK', { title }, actor);

  it('conserve les rôles de planification dans la configuration du tracker', async () => {
    const roles = await db.tx(org, async (c) => (await c.query("select key, semantic_role from field_definition where semantic_role in ('start_date','progress','remaining') order by key")).rows);
    expect(roles).toEqual([{ key: 'progress', semantic_role: 'progress' }, { key: 'remaining', semantic_role: 'remaining' }, { key: 'start', semantic_role: 'start_date' }]);
  });

  it('refuse un rôle sur un champ de mauvais type, à la création du tracker et à l’ajout d’un champ', async () => {
    expect(await code(trackers.createTracker(org, taskSpec('NOVA', 'BAD', [{ key: 'start', label: 'Début', type: 'text', semanticRole: 'start_date' }]), actor)))
      .toMatch(/^validation: .*start.*start_date.*date/);
    expect(await code(trackers.addField(org, 'NOVA', 'TSK', { key: 'pct', label: 'Pct', type: 'text', semanticRole: 'progress' }, actor))).toMatch(/^validation: .*progress.*number/);
  });

  it('un rôle reste unique par tracker', async () => {
    await expect(trackers.addField(org, 'NOVA', 'TSK', { key: 'start2', label: 'Début bis', type: 'date', semanticRole: 'start_date' }, actor)).rejects.toThrow();
  });

  it('livre le type de lien « précède », ordonné, utilisable sans création préalable', async () => {
    const precedes = (await types.list(org)).find((t) => t.key === 'precedes');
    expect(precedes).toMatchObject({ outwardLabel: 'précède', inwardLabel: 'succède à', ordered: true, hierarchical: false, builtin: true, modified: false });
  });

  it('crée un lien « précède » avec un décalage en jours ouvrés, relu dans la liste', async () => {
    const a = await task('A');
    const b = await task('B');
    const id = await links.link(org, 'NOVA', a.key, b.key, 'precedes', actor, 2);
    expect(id).toBeTruthy();
    expect((await links.list(org, 'NOVA', a.key))[0]).toMatchObject({ type: 'precedes', direction: 'outward', label: 'précède', ordered: true, lagDays: 2 });
    expect((await links.list(org, 'NOVA', b.key))[0]).toMatchObject({ direction: 'inward', label: 'succède à', lagDays: 2 });
  });

  it('refuse un lien qui crée un cycle (422), direct ou à travers d’autres tâches', async () => {
    const [a, b, c] = [await task('C1'), await task('C2'), await task('C3')];
    await links.link(org, 'NOVA', a.key, b.key, 'precedes', actor);
    await links.link(org, 'NOVA', b.key, c.key, 'precedes', actor);
    expect(await code(links.link(org, 'NOVA', b.key, a.key, 'precedes', actor))).toMatch(/^validation: .*cycle/);
    expect(await code(links.link(org, 'NOVA', c.key, a.key, 'precedes', actor))).toMatch(/^validation: .*cycle/);
    await links.link(org, 'NOVA', a.key, c.key, 'precedes', actor); // raccourci sans cycle : accepté
  });

  it('refuse un décalage sur un type non ordonné ou hors bornes', async () => {
    const [a, b] = [await task('D1'), await task('D2')];
    expect(await code(links.link(org, 'NOVA', a.key, b.key, 'blocks', actor, 1))).toMatch(/^validation: .*décalage/);
    await links.link(org, 'NOVA', a.key, b.key, 'precedes', actor, -1); // chevauchement d’un jour
    expect((await links.list(org, 'NOVA', a.key)).find((l) => l.type === 'precedes')).toMatchObject({ lagDays: -1 });
  });

  it('un type ordonné de l’organisation garde son caractère : pas de changement une fois utilisé', async () => {
    const precedes = (await types.list(org)).find((t) => t.key === 'precedes')!;
    expect(await code(types.update(org, 'precedes', { outwardLabel: precedes.outwardLabel, inwardLabel: precedes.inwardLabel, hierarchical: false, propagatesSuspect: false, ordered: false, pairs: [] }, actor)))
      .toMatch(/^conflict: .*ordonné/);
  });
});
