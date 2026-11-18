import { buildSchema, parse, specifiedRules, validate } from 'graphql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { depthLimit, GraphqlService } from './graphql.service';

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-team-member'] };
const admin: Actor = { id: 'root', roles: ['athena-admin'] };

suite('GraphQL en lecture seule (plan § 3.1)', () => {
  let testDb: TestDb; let gql: GraphqlService;
  const org = crypto.randomUUID();
  const run = (query: string, variables?: Record<string, unknown>, actor: Actor = alice) => gql.run({ query, ...(variables ? { variables } : {}) }, { organizationId: org, actor });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_graphql');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    gql = new GraphqlService(db, artifacts, new SearchService(db));
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'gq','gq')", [org]));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createProject(org, 'LUM', 'Lumière', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Fuite du réservoir', severity: 'majeure' }, alice);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Capteur muet', severity: 'mineure' }, alice);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('projets, trackers et tickets en une seule requête, avec le nombre de tickets', async () => {
    const r = await run('{ projects { key name trackers { key artifactCount } } }');
    expect(r.errors).toBeUndefined();
    expect(r.data).toEqual({ projects: [{ key: 'ARI', name: 'Ariane', trackers: [{ key: 'BUG', artifactCount: 2 }] }, { key: 'LUM', name: 'Lumière', trackers: [] }] });
  });

  it('un ticket par clé avec ses valeurs, null s’il n’existe pas', async () => {
    const r = await run('query($k: String!) { artifact(project: "ARI", key: $k) { key tracker status version values } }', { k: 'ARI-BUG-0001' });
    expect(r.errors).toBeUndefined();
    expect((r.data as any).artifact).toMatchObject({ key: 'ARI-BUG-0001', tracker: 'BUG', values: { title: 'Fuite du réservoir' } });
    expect((await run('{ artifact(project: "ARI", key: "ARI-BUG-0099") { key } }')).data).toEqual({ artifact: null });
  });

  it('recherche ATQL : au niveau de l’organisation et depuis un projet', async () => {
    const all = await run('{ search(q: "severity = majeure") { total hits { key title } } }');
    expect((all.data as any).search).toMatchObject({ total: 1, hits: [{ key: 'ARI-BUG-0001', title: 'Fuite du réservoir' }] });
    const inProject = await run('{ project(key: "ARI") { artifacts(tracker: "BUG", query: "severity = mineure", limit: 10) { total hits { key } } } }');
    expect((inProject.data as any).project.artifacts).toMatchObject({ total: 1, hits: [{ key: 'ARI-BUG-0002' }] });
    expect((await run('{ search(q: "status =") { total } }')).errors?.[0]?.message).toMatch(/Valeur attendue/); // erreur de syntaxe ATQL propre
  });

  it('aucune écriture : mutation et abonnement refusés, schéma sans type Mutation', async () => {
    const m = await run('mutation { createArtifact(project: "ARI") { key } }');
    expect(m.errors?.[0]?.message).toMatch(/lecture seule/);
    expect(m.data).toBeUndefined();
    expect((await run('subscription { projects { key } }')).errors?.[0]?.message).toMatch(/lecture seule/);
  });

  it('limites : requête trop longue ou absente ; page plafonnée à 200 sans refus', async () => {
    expect((await gql.run({ query: 'x'.repeat(20_001) }, { organizationId: org, actor: alice })).errors?.[0]?.message).toMatch(/trop longue/);
    expect((await gql.run({}, { organizationId: org, actor: alice })).errors?.[0]?.message).toMatch(/absente/);
    expect((await run('{ search(q: "project = ARI", limit: 100000) { hits { key } } }')).errors).toBeUndefined();
    expect((await run('{ projects { ')).errors?.[0]?.message).toMatch(/Syntax Error/);
    expect((await run('{ champInconnu }')).errors?.[0]?.message).toMatch(/Cannot query field/);
  });

  it('la règle de profondeur refuse une requête qui dépasse la limite (fragments compris) et accepte les introspections', () => {
    const schema = buildSchema('type Query { a: A } type A { b: B } type B { c: C } type C { d: String }');
    const errors = (q: string, max: number) => validate(schema, parse(q), [...specifiedRules, depthLimit(max)]).map((e) => e.message);
    expect(errors('{ a { b { c { d } } } }', 4)).toEqual([]);
    expect(errors('{ a { b { c { d } } } }', 3)[0]).toMatch(/trop profonde : 4 niveaux \(3 au plus\)/);
    expect(errors('fragment F on B { c { d } } { a { b { ...F } } }', 3)[0]).toMatch(/trop profonde/); // le fragment compte
    expect(errors('{ __schema { types { name } } }', 1)).toEqual([]); // l'introspection n'est pas comptée
  });
});
