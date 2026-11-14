import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { CoverageRuleInput, CoverageService, scopeQuery } from './coverage.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-team-member', 'athena-admin'] };
const suite = pgUp ? describe : describe.skip;
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as DomainError | null)?.code ?? 'ok';
const rule = (extra: Record<string, unknown> = {}) => CoverageRuleInput.parse({ name: 'Exigences vérifiées', fromTracker: 'REQ', linkType: 'verifies', ...extra });

suite('règles de couverture', () => {
  let testDb: TestDb;
  let db: Db;
  let coverage: CoverageService;
  let artifacts: ArtifactService;
  let links: LinkService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_coverage');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    coverage = new CoverageService(db);
    for (const [id, key] of [[org, 'cov'], [other, 'cov2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, requirementTemplate('ARI'), actor);
    await trackers.createTracker(org, { ...requirementTemplate('ARI', 'TST'), name: 'Tests' }, actor);
    for (const n of [1, 2, 3, 4]) await artifacts.create(org, 'ARI', 'REQ', { title: `Exigence ${n}`, statement: 's' }, actor);
    await artifacts.create(org, 'ARI', 'TST', { title: 'Test 1', statement: 's' }, actor);
    await artifacts.create(org, 'ARI', 'TST', { title: 'Test 2', statement: 's' }, actor);
    await links.link(org, 'ARI', 'ARI-TST-0001', 'ARI-REQ-0001', 'verifies', actor);
    await links.link(org, 'ARI', 'ARI-TST-0002', 'ARI-REQ-0001', 'verifies', actor);
    await links.link(org, 'ARI', 'ARI-TST-0001', 'ARI-REQ-0002', 'verifies', actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('« toute exigence est vérifiée par au moins un test » : taux, items en défaut et requêtes ATQL', async () => {
    await coverage.create(org, null, 'req-verifiee', rule({ threshold: { target: 100, warning: 50 } }), actor);
    const [r] = await coverage.evaluate(org, 'ARI', ['athena-team-member']);
    expect(r).toMatchObject({ key: 'req-verifiee', scope: 'organization', total: 4, covered: 2, rate: 50, level: 'warning', suspect: 0 });
    expect(r!.gaps).toEqual([{ key: 'ARI-REQ-0003', title: 'Exigence 3' }, { key: 'ARI-REQ-0004', title: 'Exigence 4' }]);
    expect(r!.atql).toEqual({ total: 'tracker = REQ', gaps: 'tracker = REQ AND notLinked("verifies")', suspect: 'tracker = REQ AND suspect()' });
  });

  it('le sens, le nombre minimal et les états changent le calcul ; les niveaux suivent les seuils saisis', async () => {
    await coverage.create(org, 'ARI', 'deux-tests', rule({ name: 'Deux tests', minCount: 2, direction: 'in', threshold: { target: 90, warning: 20 } }), actor);
    await coverage.create(org, 'ARI', 'sens-sortant', rule({ name: 'Sortant', direction: 'out', threshold: { target: 10 } }), actor);
    await coverage.create(org, 'ARI', 'brouillons', rule({ name: 'Brouillons', statuses: ['draft', 'validated'] }), actor);
    const by = Object.fromEntries((await coverage.evaluate(org, 'ARI', ['athena-team-member'])).map((x) => [x.key, x]));
    expect(by['deux-tests']).toMatchObject({ total: 4, covered: 1, rate: 25, level: 'warning' });
    expect(by['deux-tests']!.atql.gaps).toBe('tracker = REQ AND NOT linkCount("verifies", 2, "in")');
    expect(by['sens-sortant']!.atql.gaps).toBe('tracker = REQ AND NOT linkCount("verifies", 1, "out")');
    expect(by['sens-sortant']).toMatchObject({ covered: 0, rate: 0, level: 'critical' }); // les liens vont du test vers l'exigence
    expect(by['brouillons']!.atql.total).toBe('tracker = REQ AND (status = "draft" OR status = "validated")');
    expect(scopeQuery({ fromTracker: 'REQ', statuses: ['draft'] })).toBe('tracker = REQ AND status = "draft"');
  });

  it('une règle de projet remplace la règle d’organisation de même clé ; les règles sont isolées par organisation', async () => {
    await coverage.create(org, 'ARI', 'req-verifiee', rule({ name: 'Version projet', threshold: { target: 40 } }), actor);
    const mine = (await coverage.list(org, 'ARI')).filter((r) => r.key === 'req-verifiee');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ scope: 'project', name: 'Version projet' });
    expect((await coverage.evaluate(org, 'ARI', [])).find((r) => r.key === 'req-verifiee')!.level).toBe('ok');
    expect(await coverage.list(other, null)).toEqual([]);
  });

  it('compte les items à lien suspect, masque les titres restreints, signale tracker ou type inconnu', async () => {
    await testDb.exec('update artifact_link set suspect = true where to_artifact_id = (select id from artifact where key = \'ARI-REQ-0002\')');
    expect((await coverage.evaluate(org, 'ARI', [])).find((r) => r.key === 'brouillons')!.suspect).toBe(1);
    await testDb.exec('update artifact_link set suspect = false');
    await testDb.exec("update field_definition set read_roles = '{qualite}' where key = 'title' and tracker_id = (select id from tracker where key = 'REQ')");
    expect((await coverage.evaluate(org, 'ARI', ['athena-team-member'])).find((r) => r.key === 'brouillons')!.gaps[0]!.title).toBe('ARI-REQ-0003');
    await testDb.exec("update field_definition set read_roles = null where key = 'title'");
    await coverage.create(org, 'ARI', 'sans-tracker', rule({ name: 'x', fromTracker: 'NOPE' }), actor);
    await coverage.create(org, 'ARI', 'sans-type', rule({ name: 'y', linkType: 'inconnu' }), actor);
    const by = Object.fromEntries((await coverage.evaluate(org, 'ARI', [])).map((x) => [x.key, x]));
    expect(by['sans-tracker']).toMatchObject({ level: 'none', rate: null });
    expect(by['sans-tracker']!.error).toContain('NOPE');
    expect(by['sans-type']!.error).toContain('inconnu');
  });

  it('refuse un doublon, un seuil d’alerte au-dessus de l’objectif, un projet inconnu ; supprime une règle', async () => {
    expect(await code(coverage.create(org, 'ARI', 'deux-tests', rule(), actor))).toBe('conflict');
    expect(await code(coverage.create(org, 'ARI', 'incoherent', rule({ threshold: { target: 50, warning: 60 } }), actor))).toBe('validation');
    expect(await code(coverage.create(org, 'NOPE', 'x', rule(), actor))).toBe('not_found');
    expect(CoverageRuleInput.safeParse({ name: 'n', fromTracker: 'req', linkType: 'verifies' }).success).toBe(false);
    await coverage.update(org, 'ARI', 'deux-tests', rule({ name: 'Trois tests', minCount: 3, direction: 'in', threshold: { target: 80 } }), actor);
    const updated = (await coverage.list(org, 'ARI')).find((r) => r.key === 'deux-tests');
    expect(updated).toMatchObject({ name: 'Trois tests', minCount: 3, scope: 'project', threshold: { target: 80 } });
    expect(await code(coverage.update(org, 'ARI', 'deux-tests', rule({ threshold: { target: 50, warning: 60 } }), actor))).toBe('validation');
    expect(await code(coverage.update(org, 'ARI', 'absente', rule(), actor))).toBe('not_found');
    expect(await code(coverage.update(org, null, 'deux-tests', rule(), actor))).toBe('not_found'); // la règle est au niveau projet
    await coverage.remove(org, 'ARI', 'sans-type', actor);
    expect(await code(coverage.remove(org, 'ARI', 'sans-type', actor))).toBe('not_found');
  });

  it('calcule le taux en moins de 2 s sur 100 000 artefacts', async () => {
    await testDb.exec(`
      with t as (select id, organization_id, project_id from tracker where key = 'REQ'), s as (select id from status where tracker_id = (select id from t) and key = 'draft')
      insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by)
      select t.organization_id, t.project_id, t.id, 1000 + g, 'ARI-REQ-' || (1000 + g), s.id, jsonb_build_object('title', 'Charge ' || g), 'load'
      from t, s, generate_series(1, 100000) g`);
    await testDb.exec(`
      insert into artifact_link (organization_id, from_artifact_id, to_artifact_id, link_type_id)
      select r.organization_id, (select id from artifact where key = 'ARI-TST-0001'), r.id, (select id from link_type where key = 'verifies' limit 1)
      from artifact r where r.key like 'ARI-REQ-%' and r.number > 1000 and r.number % 2 = 0 and r.number <= 51000`);
    await testDb.exec('analyze artifact; analyze artifact_link');
    const started = performance.now();
    const result = (await coverage.evaluate(org, 'ARI', ['athena-team-member'])).find((r) => r.key === 'brouillons')!;
    const elapsed = performance.now() - started;
    expect(result.total).toBeGreaterThanOrEqual(100000);
    expect(result.covered).toBeGreaterThan(20000);
    expect(elapsed).toBeLessThan(2000);
  }, 120_000);
});
