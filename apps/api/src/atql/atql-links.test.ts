import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { requirementTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { compile } from './compile';
import { AtqlError, parse } from './parser';
import { SearchService } from './search.service';

const ctx = { currentUser: 'u1' };

describe('ATQL : fonctions de traçabilité (analyse et compilation)', () => {
  it('analyse suspect(), linkedTo() et notLinked(), insensibles à la casse', () => {
    expect(parse('suspect()').where).toEqual({ type: 'suspect' });
    expect(parse('SUSPECT()').where).toEqual({ type: 'suspect' });
    expect(parse('linkedTo(ARI-REQ-0001)').where).toEqual({ type: 'linkedTo', target: 'ARI-REQ-0001' });
    expect(parse('linkedto("ARI-REQ-0001", "verifies")').where).toEqual({ type: 'linkedTo', target: 'ARI-REQ-0001', link: 'verifies' });
    expect(parse('notLinked("verifies")').where).toEqual({ type: 'notLinked', link: 'verifies' });
    expect(parse('notLinked()').where).toEqual({ type: 'notLinked' });
    expect(parse('notLinked(verifies)').where).toEqual({ type: 'notLinked', link: 'verifies' });
  });

  it('analyse linkCount("type", n[, "in"|"out"]) et refuse ses arguments invalides', () => {
    expect(parse('linkCount("verifies", 2)').where).toEqual({ type: 'linkCount', link: 'verifies', min: 2, direction: 'any' });
    expect(parse('NOT linkcount(verifies, 1, "in")').where).toEqual({ type: 'not', operand: { type: 'linkCount', link: 'verifies', min: 1, direction: 'in' } });
    expect(parse('linkCount("verifies", 3, out)').where).toMatchObject({ direction: 'out' });
    for (const bad of ['linkCount()', 'linkCount("verifies")', 'linkCount("verifies", 0)', 'linkCount("verifies", 101)', 'linkCount("verifies", 1.5)', 'linkCount("verifies", 2, "both")', 'linkCount("verifies", 2, "in", 1)', 'linkCount(3, 2)']) {
      expect(() => parse(bad), bad).toThrow(AtqlError);
    }
  });

  it('se combine avec les conditions, la négation et le tri', () => {
    const q = parse('tracker = REQ AND (suspect() OR NOT notLinked("verifies")) ORDER BY key');
    expect(q.where).toMatchObject({ type: 'and', right: { type: 'or', left: { type: 'suspect' }, right: { type: 'not', operand: { type: 'notLinked', link: 'verifies' } } } });
    expect(q.orderBy).toEqual([{ field: 'key', descending: false }]);
  });

  it('refuse les arguments invalides avec une erreur de position', () => {
    for (const bad of ['suspect(1)', 'suspect("x")', 'linkedTo()', 'linkedTo(a, b, c)', 'notLinked(a, b)', 'notLinked("Mauvais type")', 'notLinked("a-b")', 'linkedTo("a b")', 'linkedTo(ARI-REQ-0001, "x y")', 'suspect(', 'linkedTo(ARI-REQ-0001 "verifies")', 'linkedTo(12)']) {
      expect(() => parse(bad), bad).toThrow(AtqlError);
    }
  });

  it('un champ qui ressemble à une fonction reste un champ', () => {
    expect(parse('suspect = x').where).toMatchObject({ type: 'cmp', field: 'suspect' });
  });

  it('compile en sous-requêtes paramétrées, sans concaténer la clé ni le type', () => {
    const compiled = compile('linkedTo(ARI-REQ-0001, "verifies") AND notLinked("refines") AND suspect()', ctx);
    expect(compiled.params).toEqual(expect.arrayContaining(['ARI-REQ-0001', 'verifies', 'refines']));
    expect(compiled.where).not.toMatch(/ARI-REQ|verifies|refines/);
    expect(compiled.where).toContain('resolve_artifact(a.project_id,');
    expect(compiled.where).toContain('l.suspect');
  });
});

const suite = pgUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-team-member', 'athena-admin'] };

suite('ATQL : fonctions de traçabilité (intégration)', () => {
  let testDb: TestDb;
  let search: SearchService;
  const org = crypto.randomUUID();
  const keys = async (q: string, project = 'ARI') => (await search.search(org, project, `${q} ORDER BY key`, 'u1')).hits.map((h) => h.key);

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_atqllinks');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    const links = new LinkService(db);
    search = new SearchService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'atql-links']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createProject(org, 'OTH', 'Autre', actor);
    await trackers.createTracker(org, requirementTemplate('ARI'), actor);
    await trackers.createTracker(org, { ...requirementTemplate('ARI', 'TST'), name: 'Tests' }, actor);
    const make = (tracker: string, title: string) => artifacts.create(org, 'ARI', tracker, { title, statement: 's' }, actor);
    const r1 = await make('REQ', 'R1');
    await make('REQ', 'R2');
    const r3 = await make('REQ', 'R3');
    const t1 = await make('TST', 'T1');
    const t2 = await make('TST', 'T2');
    await links.link(org, 'ARI', t1.key, r1.key, 'verifies', actor);
    const second = await links.link(org, 'ARI', t2.key, r1.key, 'verifies', actor);
    await links.link(org, 'ARI', r3.key, r1.key, 'refines', actor);
    await artifacts.update(org, 'ARI', r1.key, { statement: 'Énoncé modifié' }, 1, actor); // les trois liens vers R1 deviennent suspects
    await links.clearSuspect(org, second, actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('suspect() : items ayant un lien suspect, à l’une ou l’autre extrémité', async () => {
    expect(await keys('suspect()')).toEqual(['ARI-REQ-0001', 'ARI-REQ-0003', 'ARI-TST-0001']); // R1 (cible), R3 et T1 (sources) ; T2 a été acquitté
    expect(await keys('tracker = TST AND suspect()')).toEqual(['ARI-TST-0001']);
    expect(await keys('tracker = REQ AND NOT suspect()')).toEqual(['ARI-REQ-0002']);
  });

  it('notLinked("type") : les exigences sans vérification', async () => {
    expect(await keys('tracker = REQ AND notLinked("verifies")')).toEqual(['ARI-REQ-0002', 'ARI-REQ-0003']); // R3 n'a qu'un lien « refines »
    expect(await keys('notLinked()')).toEqual(['ARI-REQ-0002']); // aucun lien du tout
    expect(await keys('tracker = REQ AND notLinked("blocks")')).toEqual(['ARI-REQ-0001', 'ARI-REQ-0002', 'ARI-REQ-0003']);
  });

  it('linkCount("type", n, sens) : au moins n liens, entrants, sortants ou les deux', async () => {
    expect(await keys('tracker = REQ AND linkCount("verifies", 2)')).toEqual(['ARI-REQ-0001']);
    expect(await keys('tracker = REQ AND linkCount("verifies", 2, "in")')).toEqual(['ARI-REQ-0001']);
    expect(await keys('tracker = REQ AND linkCount("verifies", 1, "out")')).toEqual([]); // les liens vont du test vers l'exigence
    expect(await keys('tracker = TST AND linkCount("verifies", 1, "out")')).toEqual(['ARI-TST-0001', 'ARI-TST-0002']);
    expect(await keys('tracker = REQ AND NOT linkCount("verifies", 2, "in")')).toEqual(['ARI-REQ-0002', 'ARI-REQ-0003']);
  });

  it('linkedTo(CLÉ) et linkedTo(CLÉ, "type") : dans les deux sens', async () => {
    expect(await keys('linkedTo(ARI-REQ-0001)')).toEqual(['ARI-REQ-0003', 'ARI-TST-0001', 'ARI-TST-0002']);
    expect(await keys('linkedTo(ARI-REQ-0001, "verifies")')).toEqual(['ARI-TST-0001', 'ARI-TST-0002']);
    expect(await keys('linkedTo("ARI-REQ-0001", "refines")')).toEqual(['ARI-REQ-0003']);
    expect(await keys('linkedTo(ARI-TST-0001)')).toEqual(['ARI-REQ-0001']); // le lien se lit depuis la cible comme depuis la source
    expect(await keys('linkedTo(ARI-REQ-0009)')).toEqual([]); // clé inconnue : aucun résultat, pas d'erreur
  });

  it('se combine avec les autres conditions', async () => {
    expect(await keys('tracker = REQ AND suspect() AND notLinked("verifies")')).toEqual(['ARI-REQ-0003']);
    expect(await keys('linkedTo(ARI-REQ-0001, "verifies") AND NOT suspect()')).toEqual(['ARI-TST-0002']);
    expect(await keys('suspect() OR notLinked("verifies")')).toEqual(['ARI-REQ-0001', 'ARI-REQ-0002', 'ARI-REQ-0003', 'ARI-TST-0001']);
  });

  it('ne traverse pas les projets ni les organisations', async () => {
    expect(await keys('suspect()', 'OTH')).toEqual([]);
    expect(await keys('linkedTo(ARI-REQ-0001)', 'OTH')).toEqual([]);
    // Une autre organisation ne voit ni les liens ni les items (RLS).
    expect((await search.search(crypto.randomUUID(), 'ARI', 'suspect()', 'u1')).hits).toEqual([]);
  });
});
