import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { FieldTypeRegistry } from './field-types';
import { roleTypeProblems } from './semantic-roles';
import { builtinTrackerTypes } from './tracker-types';
import { TrackerService, type TrackerSpec } from './tracker.service';

// T-0195 : rôles sémantiques probabilité et impact (lot 17, B13).

describe('rôles de risque (sans base)', () => {
  it('exigent un champ numérique', () => {
    expect(roleTypeProblems([{ key: 'p', type: 'number', semanticRole: 'probability' }, { key: 'i', type: 'number', semanticRole: 'impact' }])).toEqual([]);
    expect(roleTypeProblems([{ key: 'p', type: 'select', semanticRole: 'probability' }])).toEqual(['champ p : le rôle probability exige un champ de type number (type select)']);
  });
  it('le type livré « Risque » porte les deux rôles, de 1 à 5', () => {
    const risk = builtinTrackerTypes().find((x) => x.key === 'risk')!;
    expect(risk.baseFields.filter((f) => f.semanticRole === 'probability' || f.semanticRole === 'impact').map((f) => [f.key, f.config])).toEqual([['probability', { min: 1, max: 5 }], ['impact', { min: 1, max: 5 }]]);
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };

suite('rôles de risque (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let search: SearchService;
  const org = crypto.randomUUID();
  const spec = (key: string, fields: TrackerSpec['fields']): TrackerSpec => ({
    projectKey: 'RSK', key, name: key, typeKey: 'risk',
    fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, ...fields],
    statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'open' }],
  });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_risk_roles');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    search = new SearchService(db, async () => []);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'rsk','rsk')", [org]));
    await trackers.createProject(org, 'RSK', 'Risques', admin);
    // champs aux noms libres, repérés par leur rôle ; un second tracker sans rôle
    await trackers.createTracker(org, spec('R1', [
      { key: 'proba_x', label: 'Vraisemblance', type: 'number', semanticRole: 'probability' }, { key: 'gravite', label: 'Gravité', type: 'number', semanticRole: 'impact' },
    ]), admin);
    await trackers.createTracker(org, spec('R2', [{ key: 'probability', label: 'Probabilité', type: 'number' }]), admin);
    await artifacts.create(org, 'RSK', 'R1', { title: 'Panne du bus', proba_x: 4, gravite: 5 }, admin);
    await artifacts.create(org, 'RSK', 'R1', { title: 'Sans impact saisi', proba_x: 3 }, admin);
    await artifacts.create(org, 'RSK', 'R2', { title: 'Sans rôle', probability: 2 }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('la recherche expose probabilité, impact et criticité (produit) d’après les rôles, quel que soit le nom des champs', async () => {
    const hits = (await search.search(org, 'RSK', 'type = risk', 'u1', 50, 0)).hits;
    const by = (title: string) => hits.find((h) => h.title === title)!;
    expect((by('Panne du bus') as { risk?: unknown }).risk).toEqual({ probability: 4, impact: 5, criticality: 20 });
    expect((by('Sans impact saisi') as { risk?: unknown }).risk).toEqual({ probability: 3, impact: null, criticality: null });
    expect((by('Sans rôle') as { risk?: unknown }).risk).toBeUndefined(); // le rapport retombe sur le nom du champ
  });

  it('un rôle sur un champ qui n’est pas numérique est refusé', async () => {
    const db = new Db(testDb.pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await expect(trackers.createTracker(org, spec('R3', [{ key: 'p', label: 'P', type: 'text', semanticRole: 'probability' }]), admin)).rejects.toMatchObject({ code: 'validation' });
  });
});
