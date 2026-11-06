import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate, requirementTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { DocLinkService } from './doc-link.service';
import { parseSdoc } from './sdoc-parser';

const SAMPLE = `[DOCUMENT]
MID: abc
TITLE: Spécification système
PREFIX: SYS-

[GRAMMAR]
ELEMENTS:
- TAG: REQUIREMENT
  FIELDS:
  - TITLE: UID
    TYPE: String

[[SECTION]]
TITLE: Journalisation

[REQUIREMENT]
UID: SYS-1
STATUS: Active
TITLE: Journal d'audit
STATEMENT: >>>
Le système shall journaliser les actions.
Sur plusieurs lignes.
<<<
ATHENA_REFS: ARI-REQ-0001, ARI-BUG-0009, invalide
RELATIONS:
- TYPE: Parent
  VALUE: SYS-0
- TYPE: File

[REQUIREMENT]
TITLE: Sans UID
STATEMENT: ignoré

[/SECTION]
[REQUIREMENT]
UID: SYS-2
TITLE: Seconde
STATEMENT: Texte court.
`;

describe('analyseur .sdoc', () => {
  it('lit UID, champs multilignes, relations et références Athena', () => {
    const nodes = parseSdoc(SAMPLE);
    expect(nodes.map((n) => n.uid)).toEqual(['SYS-1', 'SYS-2']);
    expect(nodes[0]).toMatchObject({
      type: 'REQUIREMENT', document: 'Spécification système', title: "Journal d'audit", status: 'Active',
      parents: ['SYS-0'], athenaRefs: ['ARI-REQ-0001', 'ARI-BUG-0009'],
    });
    expect(nodes[0]!.statement).toBe('Le système shall journaliser les actions.\nSur plusieurs lignes.');
  });
  it('produit une empreinte sensible au contenu', () => {
    const a = parseSdoc(SAMPLE)[1]!;
    const b = parseSdoc(SAMPLE.replace('Texte court.', 'Texte modifié.'))[1]!;
    expect(a.contentHash).not.toBe(b.contentHash);
    expect(parseSdoc(SAMPLE)[1]!.contentHash).toBe(a.contentHash);
  });
  it('refuse un fichier trop volumineux', () => {
    expect(() => parseSdoc('x'.repeat(5 * 1024 * 1024 + 1))).toThrow(/volumineux/);
  });
  const STRICTDOC = 'C:/projects/AI/STRICTDOC/docs';
  it.runIf(existsSync(STRICTDOC))('lit les vraies exigences de StrictDoc', () => {
    const all = readdirSync(STRICTDOC).filter((f) => /^strictdoc_2\d_.*\.sdoc$/.test(f))
      .flatMap((f) => parseSdoc(readFileSync(join(STRICTDOC, f), 'utf8')));
    const requirements = all.filter((n) => n.type === 'REQUIREMENT');
    expect(requirements.length).toBeGreaterThan(200);
    expect(new Set(requirements.map((r) => r.uid)).size).toBe(requirements.length);
    expect(requirements.filter((r) => r.parents.length > 0).length).toBeGreaterThan(50);
  });
});

const suite = pgUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };

suite('liaison documentaire (intégration)', () => {
  let testDb: TestDb;
  let docs: DocLinkService;
  const org = crypto.randomUUID();
  const file = (content: string) => [{ path: 'docs/spec.sdoc', content }];

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_docs');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    docs = new DocLinkService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'docs']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, requirementTemplate('ARI'), actor);
    await trackers.createTracker(org, bugTemplate('ARI'), actor);
    await artifacts.create(org, 'ARI', 'REQ', { title: 'R1', statement: 's' }, actor);
    await artifacts.create(org, 'ARI', 'REQ', { title: 'R2', statement: 's' }, actor);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'B', severity: 'mineure' }, actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('indexe une source et crée les liens déclarés dans ATHENA_REFS', async () => {
    const result = await docs.index(org, 'ARI', 'spec', file(SAMPLE), 'sha1', actor);
    expect(result).toEqual({ nodes: 2, linksCreated: 1, linksSuspected: 0 }); // ARI-BUG-0009 n'existe pas
    expect(await docs.links(org, 'ARI', 'ARI-REQ-0001')).toMatchObject([{ uid: 'SYS-1', origin: 'document', suspect: false, orphan: false, title: "Journal d'audit" }]);
  });

  it('lie depuis Athena et refuse un nœud inconnu ou un doublon', async () => {
    await docs.link(org, 'ARI', 'ARI-REQ-0002', 'spec', 'SYS-2', actor);
    await expect(docs.link(org, 'ARI', 'ARI-REQ-0002', 'spec', 'SYS-404', actor)).rejects.toBeInstanceOf(DomainError);
    await expect(docs.link(org, 'ARI', 'ARI-REQ-0002', 'spec', 'SYS-2', actor)).rejects.toThrow(/duplicate/);
  });

  it("rend un lien suspect quand l'exigence change, puis acquitte", async () => {
    const changed = await docs.index(org, 'ARI', 'spec', file(SAMPLE.replace('Texte court.', 'Texte révisé.')), 'sha2', actor);
    expect(changed.linksSuspected).toBe(1);
    expect((await docs.links(org, 'ARI', 'ARI-REQ-0002'))[0]).toMatchObject({ uid: 'SYS-2', suspect: true });
    expect((await docs.links(org, 'ARI', 'ARI-REQ-0001'))[0]!.suspect).toBe(false);
    await docs.acknowledge(org, 'ARI', 'ARI-REQ-0002', 'spec', 'SYS-2', actor);
    expect((await docs.links(org, 'ARI', 'ARI-REQ-0002'))[0]!.suspect).toBe(false);
  });

  it("signale orphelin et suspect un lien dont l'exigence a disparu", async () => {
    const result = await docs.index(org, 'ARI', 'spec', file(SAMPLE.split('[REQUIREMENT]\nUID: SYS-2')[0]!), 'sha3', actor);
    expect(result.nodes).toBe(1);
    expect(result.linksSuspected).toBe(1);
    expect((await docs.links(org, 'ARI', 'ARI-REQ-0002'))[0]).toMatchObject({ suspect: true, orphan: true });
  });

  it('calcule la couverture de traçabilité', async () => {
    await docs.index(org, 'ARI', 'spec', file(SAMPLE), 'sha4', actor);
    const coverage = await docs.coverage(org, 'ARI', 'spec', 'REQ');
    expect(coverage).toEqual({ requirementsWithoutArtifact: [], artifactsWithoutRequirement: [], covered: 2, total: 2 });
    const bug = await docs.coverage(org, 'ARI', 'spec', 'BUG');
    expect(bug.artifactsWithoutRequirement).toEqual(['ARI-BUG-0001']);
  });

  it('refuse deux nœuds de même UID', async () => {
    const duplicate = SAMPLE + '\n[REQUIREMENT]\nUID: SYS-2\nTITLE: Doublon\nSTATEMENT: x\n';
    await expect(docs.index(org, 'ARI', 'spec', file(duplicate), null, actor)).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('report des références dans le .sdoc', () => {
  it('insère ATHENA_REFS avant RELATIONS, met à jour une ligne existante et reste idempotent', async () => {
    const { setAthenaRefs } = await import('./doc-writeback');
    const doc = '[REQUIREMENT]\nUID: SYS-1\nTITLE: A\nRELATIONS:\n- TYPE: Parent\n  VALUE: SYS-0\n\n[REQUIREMENT]\nUID: SYS-2\nTITLE: B\n\n[REQUIREMENT]\nUID: SYS-3\nATHENA_REFS: ARI-BUG-0001\n';
    const a = setAthenaRefs(doc, 'SYS-1', ['ARI-BUG-0002', 'ARI-BUG-0001'])!;
    expect(a).toContain('TITLE: A\nATHENA_REFS: ARI-BUG-0001, ARI-BUG-0002\nRELATIONS:');
    expect(setAthenaRefs(a, 'SYS-1', ['ARI-BUG-0001', 'ARI-BUG-0002'])).toBeNull();
    const b = setAthenaRefs(doc, 'SYS-2', ['ARI-REQ-0005'])!;
    expect(b).toContain('TITLE: B\nATHENA_REFS: ARI-REQ-0005\n\n[REQUIREMENT]\nUID: SYS-3');
    expect(setAthenaRefs(doc, 'SYS-3', ['ARI-BUG-0001', 'ARI-BUG-0009'])).toContain('ATHENA_REFS: ARI-BUG-0001, ARI-BUG-0009');
    expect(setAthenaRefs(doc, 'SYS-404', ['ARI-BUG-0001'])).toBeNull();
    expect(setAthenaRefs(doc, 'SYS-2', [])).toBeNull();
    expect(setAthenaRefs(doc.replace(/\n/g, '\r\n'), 'SYS-2', ['ARI-REQ-0005'])).toContain('\r\nATHENA_REFS: ARI-REQ-0005\r\n');
    expect(parseSdoc(b).find((n) => n.uid === 'SYS-2')!.athenaRefs).toEqual(['ARI-REQ-0005']);
  });
});
