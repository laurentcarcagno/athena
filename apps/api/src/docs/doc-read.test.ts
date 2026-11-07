import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { requirementTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { DocLinkService } from './doc-link.service';
import { DocReadService } from './doc-read.service';
import { docIdOf, parseSdoc, parseSdocTree, sanitizeDocText } from './sdoc-parser';

const URD = `[DOCUMENT]
TITLE: Exigences utilisateur

[[SECTION]]
TITLE: Contexte

[TEXT]
STATEMENT: >>>
Texte courant <b>gras</b> <script>alert(1)</script>fin
<<<

[[SECTION]]
UID: URD-SEC-2
TITLE: Connexion

[REQUIREMENT]
UID: URD-1
TITLE: Authentification
STATEMENT: >>>
L'utilisateur doit <img src=x onerror=alert(1)> pouvoir se connecter via <a href="javascript:alert(2)">SSO</a>.
<<<

[[/SECTION]]

[REQUIREMENT]
UID: URD-2
TITLE: Journalisation
STATEMENT: Chaque connexion est journalisée.
RELATIONS:
- TYPE: Parent
  VALUE: URD-1

[[/SECTION]]

[[SECTION]]
TITLE: Exploitation

[REQUIREMENT]
UID: URD-10
TITLE: Supervision
STATEMENT: Le système expose des métriques de supervision.

[[/SECTION]]
`;
const SRS = `[DOCUMENT]
TITLE: Spécification logicielle

[REQUIREMENT]
UID: SRS-1
TITLE: Authentification forte
STATEMENT: Le logiciel implémente l'authentification forte.
`;

describe('analyseur .sdoc : arborescence', () => {
  it('conserve l’ordre de lecture, la profondeur et la section parente, avec des UID synthétiques pour les sections sans UID', () => {
    const doc = docIdOf('urd', 'docs/urd.sdoc');
    expect(doc).toBe('urd.docs-urd');
    const nodes = parseSdocTree(URD, doc);
    expect(nodes.map((n) => [n.position, n.type, n.synthetic ? '(synthétique)' : n.uid, n.depth, n.parentUid])).toEqual([
      [0, 'SECTION', '(synthétique)', 0, null],
      [1, 'TEXT', '(synthétique)', 1, '~urd.docs-urd:0'],
      [2, 'SECTION', 'URD-SEC-2', 1, '~urd.docs-urd:0'],
      [3, 'REQUIREMENT', 'URD-1', 2, 'URD-SEC-2'],
      [4, 'REQUIREMENT', 'URD-2', 1, '~urd.docs-urd:0'],
      [5, 'SECTION', '(synthétique)', 0, null],
      [6, 'REQUIREMENT', 'URD-10', 1, '~urd.docs-urd:5'],
    ]);
    expect(nodes[0]!.uid).toBe('~urd.docs-urd:0');
  });

  it('parseSdoc ne retient que les nœuds à UID déclaré, dans l’ordre du document (comportement existant)', () => {
    expect(parseSdoc(URD).map((n) => n.uid)).toEqual(['URD-SEC-2', 'URD-1', 'URD-2', 'URD-10']);
    expect(parseSdoc(URD).find((n) => n.uid === 'URD-2')!.parents).toEqual(['URD-1']);
  });

  it('déplacer une exigence ne change pas son empreinte ; la modifier la change', () => {
    const moved = URD.replace('[REQUIREMENT]\nUID: URD-10', '[REQUIREMENT]\nUID: URD-10').replace('TITLE: Exploitation', 'TITLE: Exploitation et supervision');
    const hash = (src: string, uid: string) => parseSdocTree(src).find((n) => n.uid === uid)!.contentHash;
    expect(hash(moved, 'URD-10')).toBe(hash(URD, 'URD-10'));
    expect(hash(URD.replace('métriques', 'mesures'), 'URD-10')).not.toBe(hash(URD, 'URD-10'));
  });

  it('assainit les textes : balises, scripts, gestionnaires d’événements, commentaires HTML et schémas javascript', () => {
    expect(sanitizeDocText('a <b>gras</b> <script>alert(1)</script>b')).toBe('a gras b');
    expect(sanitizeDocText('<img src=x onerror=alert(1)>ok')).toBe('ok');
    expect(sanitizeDocText('<<b>script>alert(1)<</b>/script>x')).not.toMatch(/<|script/i);
    expect(sanitizeDocText('x<!-- caché -->y')).toBe('xy');
    expect(sanitizeDocText('lien javascript:alert(1)')).not.toMatch(/javascript:/);
    expect(sanitizeDocText('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeDocText('1 < 2 et 3 > 2')).toBe('1 < 2 et 3 > 2'); // une comparaison n'est pas une balise
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? e.code : e ? `autre:${(e as Error).message}` : 'ok'; };

suite('consultation des documents (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let docs: DocLinkService;
  let read: DocReadService;
  let artifacts: ArtifactService;
  let access: AccessService;
  const org = crypto.randomUUID();
  const files = [{ path: 'docs/urd.sdoc', content: URD }];

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_doc_read');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    docs = new DocLinkService(db);
    read = new DocReadService(db, 'https://gitlab.interne.lan');
    access = new AccessService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'docread']));
    for (const s of ['u-admin', 'u-alice', 'u-bob']) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$2)', [org, s]));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, requirementTemplate('ARI'), admin);
    await artifacts.create(org, 'ARI', 'REQ', { title: 'Mise en œuvre SSO', statement: 's' }, admin);
    await artifacts.create(org, 'ARI', 'REQ', { title: 'Journal', statement: 's' }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('liste les documents d’une source, avec leur titre, leurs compteurs et le lien vers la source', async () => {
    const first = await docs.index(org, 'ARI', 'urd', files, 'sha1', admin, { repoPath: 'docs/urd', ref: 'main', subPath: 'docs' });
    expect(first).toMatchObject({ nodes: 7, written: 7, removed: 0 });
    await docs.index(org, 'ARI', 'srs', [{ path: 'srs.sdoc', content: SRS }], 'sha9', admin);
    const list = await read.documents(org, 'ARI');
    expect(list.map((d) => [d.id, d.title, d.nodes, d.requirements])).toEqual([['srs.srs', 'Spécification logicielle', 1, 1], ['urd.docs-urd', 'Exigences utilisateur', 7, 3]]);
    expect(list[1]!.sourceUrl).toBe('https://gitlab.interne.lan/docs/urd/-/blob/main/docs/urd.sdoc');
    expect(list[0]!.sourceUrl).toBeNull(); // source indexée sans dépôt connu
    expect(await code(read.documents(org, 'NOP'))).toBe('not_found');
  });

  it('renvoie l’arborescence dans l’ordre de lecture, sans UID affichable pour les sections non numérotées', async () => {
    const tree = await read.tree(org, 'ARI', 'urd.docs-urd');
    expect(tree.truncated).toBe(false);
    expect(tree.nodes.map((n) => [n.position, n.type, n.uid, n.depth, n.parentUid])).toEqual([
      [0, 'SECTION', null, 0, null], [1, 'TEXT', null, 1, '~urd.docs-urd:0'], [2, 'SECTION', 'URD-SEC-2', 1, '~urd.docs-urd:0'],
      [3, 'REQUIREMENT', 'URD-1', 2, 'URD-SEC-2'], [4, 'REQUIREMENT', 'URD-2', 1, '~urd.docs-urd:0'], [5, 'SECTION', null, 0, null], [6, 'REQUIREMENT', 'URD-10', 1, '~urd.docs-urd:5'],
    ]);
    expect(await code(read.tree(org, 'ARI', 'urd.inconnu'))).toBe('not_found');
  });

  it('assainit les énoncés avant renvoi (XSS)', async () => {
    const tree = await read.tree(org, 'ARI', 'urd.docs-urd');
    const all = JSON.stringify(tree.nodes);
    expect(all).not.toMatch(/<script|<img|onerror|<b>|javascript:/i);
    expect(tree.nodes.find((n) => n.uid === 'URD-1')!.statement).toBe('L\'utilisateur doit  pouvoir se connecter via SSO.');
    expect(tree.nodes[1]!.statement).toBe('Texte courant gras fin');
    expect((await read.node(org, 'ARI', 'URD-1')).statement).not.toMatch(/</);
  });

  it('cherche par UID exact, par préfixe puis par texte, UID exact d’abord', async () => {
    expect((await read.search(org, 'ARI', 'urd-1')).map((h) => [h.uid, h.match])).toEqual([['URD-1', 'uid'], ['URD-10', 'prefix']]);
    expect((await read.search(org, 'ARI', 'URD-')).map((h) => h.uid).sort()).toEqual(['URD-1', 'URD-10', 'URD-2', 'URD-SEC-2']);
    const text = await read.search(org, 'ARI', 'authentification');
    expect(text.map((h) => [h.uid, h.match])).toEqual(expect.arrayContaining([['URD-1', 'text'], ['SRS-1', 'text']]));
    expect(await read.search(org, 'ARI', 'authentification', 'srs.srs').then((r) => r.map((h) => h.uid))).toEqual(['SRS-1']);
    expect((await read.search(org, 'ARI', 'supervision'))[0]).toMatchObject({ uid: 'URD-10', docId: 'urd.docs-urd', document: 'Exigences utilisateur' });
    expect(await read.search(org, 'ARI', 'zzzinconnu')).toEqual([]);
    expect(await read.search(org, 'ARI', '100%_')).toEqual([]); // les jokers LIKE sont neutralisés
    expect(await code(read.search(org, 'ARI', '   '))).toBe('validation');
  });

  it('ré-indexation incrémentale : seuls les nœuds modifiés sont écrits, les supprimés disparaissent', async () => {
    const same = await docs.index(org, 'ARI', 'urd', files, 'sha1', admin);
    expect(same).toMatchObject({ nodes: 7, written: 0, removed: 0 });
    const edited = await docs.index(org, 'ARI', 'urd', [{ path: 'docs/urd.sdoc', content: URD.replace('métriques', 'mesures') }], 'sha2', admin);
    expect(edited).toMatchObject({ written: 1, removed: 0 });
    const shorter = await docs.index(org, 'ARI', 'urd', [{ path: 'docs/urd.sdoc', content: URD.replace(/\[\[SECTION\]\]\nTITLE: Exploitation[\s\S]*$/, '') }], 'sha3', admin);
    expect(shorter.removed).toBe(2);
    expect((await read.search(org, 'ARI', 'URD-10'))).toEqual([]);
    await docs.index(org, 'ARI', 'urd', files, 'sha4', admin);
  });

  it('aucun point d’écriture de consultation : le contrôleur ne déclare que des GET, hors l’acquittement d’un lien', () => {
    const source = readFileSync(join(__dirname, 'doc.controller.ts'), 'utf8');
    const verbs = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)].map((m) => m[1]);
    expect(verbs.filter((v) => v !== 'Get')).toEqual(['Post']);
    expect(source).toMatch(/@Post\('artifacts\/:key\/doc-links\/:source\/:uid\/acknowledge'\)/);
  });

  it('citations : artefacts, état, lien suspect ; visibles selon les droits et les listes d’ayants droit', async () => {
    await docs.link(org, 'ARI', 'ARI-REQ-0001', 'urd', 'URD-1', admin);
    await docs.link(org, 'ARI', 'ARI-REQ-0002', 'urd', 'URD-1', admin);
    expect(await read.citations(org, 'ARI', 'URD-1')).toEqual([
      expect.objectContaining({ key: 'ARI-REQ-0001', tracker: 'REQ', title: 'Mise en œuvre SSO', status: 'Brouillon', category: 'todo', suspect: false, origin: 'athena' }),
      expect.objectContaining({ key: 'ARI-REQ-0002', suspect: false }),
    ]);
    expect((await read.tree(org, 'ARI', 'urd.docs-urd')).nodes.find((n) => n.uid === 'URD-1')!.citations).toBe(2);
    // l'exigence change : les deux liens deviennent suspects
    await docs.index(org, 'ARI', 'urd', [{ path: 'docs/urd.sdoc', content: URD.replace('Authentification\n', 'Authentification renforcée\n') }], 'sha5', admin);
    expect((await read.citations(org, 'ARI', 'URD-1')).map((c) => c.suspect)).toEqual([true, true]);
    // liste d'ayants droit du tracker REQ : un non-membre ne voit aucune citation, ni dans le compteur
    await access.set(org, 'ARI', { tracker: 'REQ', members: ['u-alice'] }, admin);
    expect(await runAs('u-bob', () => read.citations(org, 'ARI', 'URD-1'))).toEqual([]);
    expect((await runAs('u-bob', () => read.tree(org, 'ARI', 'urd.docs-urd'))).nodes.find((n) => n.uid === 'URD-1')!.citations).toBe(0);
    expect((await runAs('u-alice', () => read.citations(org, 'ARI', 'URD-1'))).length).toBe(2);
    await access.remove(org, 'ARI', 'REQ', admin);
    // liste d'ayants droit du projet : la lecture des documents elle-même est refusée
    await access.set(org, 'ARI', { members: ['u-alice'] }, admin);
    expect(await runAs('u-bob', () => code(read.documents(org, 'ARI')))).toBe('not_found');
    expect(await runAs('u-bob', () => code(read.search(org, 'ARI', 'URD')))).toBe('not_found');
    expect((await runAs('u-alice', () => read.documents(org, 'ARI'))).length).toBe(2);
    await access.remove(org, 'ARI', null, admin);
  });

  it('émet un événement link.suspect par lien rendu suspect (webhooks) et l’acquittement est audité', async () => {
    const events = await db.tx(org, async (c) => (await c.query("select payload from outbox_event where type = 'link.suspect' order by created_at")).rows.map((r) => r.payload), { system: true });
    expect(events).toEqual([
      expect.objectContaining({ artifact: 'ARI-REQ-0001', uid: 'URD-1', source: 'urd', kind: 'document' }),
      expect.objectContaining({ artifact: 'ARI-REQ-0002', uid: 'URD-1', source: 'urd' }),
    ]);
    await docs.acknowledge(org, 'ARI', 'ARI-REQ-0001', 'urd', 'URD-1', admin);
    expect((await read.citations(org, 'ARI', 'URD-1')).map((c) => c.suspect)).toEqual([false, true]);
    const audit = await db.tx(org, async (c) => (await c.query("select actor, target from audit_log where action = 'doc.acknowledge'")).rows, { system: true });
    expect(audit).toEqual([{ actor: 'u-admin', target: 'artifact:ARI-REQ-0001' }]);
  });
});
