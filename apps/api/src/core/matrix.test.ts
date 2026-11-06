import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { MATRIX_MAX_COLS, MatrixService } from './matrix.service';
import { requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };
const suite = pgUp ? describe : describe.skip;
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as DomainError | null)?.code ?? 'ok';

suite('matrice de traçabilité', () => {
  let testDb: TestDb;
  let matrix: MatrixService;
  let artifacts: ArtifactService;
  let links: LinkService;
  const org = crypto.randomUUID();
  const roles = ['athena-user'];

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_matrix');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    matrix = new MatrixService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'matrix']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, requirementTemplate('ARI'), actor);
    await trackers.createTracker(org, { ...requirementTemplate('ARI', 'TST'), name: 'Tests' }, actor);
    const make = (tracker: string, title: string) => artifacts.create(org, 'ARI', tracker, { title, statement: 's' }, actor);
    for (const n of [1, 2, 3]) await make('REQ', `Exigence ${n}`);
    for (const n of [1, 2]) await make('TST', `Test ${n}`);
    await links.link(org, 'ARI', 'ARI-TST-0001', 'ARI-REQ-0001', 'verifies', actor); // test → exigence
    await links.link(org, 'ARI', 'ARI-TST-0002', 'ARI-REQ-0001', 'verifies', actor);
    await links.link(org, 'ARI', 'ARI-REQ-0002', 'ARI-TST-0002', 'blocks', actor); // autre type : ignoré par « verifies »
  });
  afterAll(async () => { await testDb?.drop(); });

  it('croise deux trackers par un type de lien, dans le sens où le lien a été créé comme dans l’autre', async () => {
    const m = await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles);
    expect(m.type).toEqual({ key: 'verifies', outwardLabel: 'vérifie', inwardLabel: 'est vérifié par' });
    expect(m.rows.map((r) => [r.key, r.linked])).toEqual([['ARI-REQ-0001', true], ['ARI-REQ-0002', false], ['ARI-REQ-0003', false]]);
    expect(m.cols.map((c) => c.key)).toEqual(['ARI-TST-0001', 'ARI-TST-0002']);
    expect(m.links).toEqual(expect.arrayContaining([{ row: 'ARI-REQ-0001', col: 'ARI-TST-0001', suspect: false }, { row: 'ARI-REQ-0001', col: 'ARI-TST-0002', suspect: false }]));
    expect(m.links).toHaveLength(2);
    expect([m.totalRows, m.totalCols, m.uncoveredRows]).toEqual([3, 2, 2]);
    expect(m.rows[0]).toMatchObject({ title: 'Exigence 1', statusName: 'Brouillon', category: 'todo' });
    // Matrice inversée : tests en lignes, exigences en colonnes.
    const inverse = await matrix.matrix(org, 'ARI', 'TST', 'REQ', 'verifies', roles);
    expect(inverse.links).toEqual(expect.arrayContaining([{ row: 'ARI-TST-0001', col: 'ARI-REQ-0001', suspect: false }]));
    expect(inverse.rows.map((r) => r.linked)).toEqual([true, true]);
  });

  it('un autre type de lien donne une autre matrice', async () => {
    const m = await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'blocks', roles);
    expect(m.links).toEqual([{ row: 'ARI-REQ-0002', col: 'ARI-TST-0002', suspect: false }]);
    expect(m.rows.map((r) => r.linked)).toEqual([false, true, false]);
  });

  it('signale un lien suspect dans sa case', async () => {
    await testDb.exec("update artifact_link set suspect = true where from_artifact_id = (select id from artifact where key = 'ARI-TST-0002') and link_type_id in (select id from link_type where key = 'verifies')");
    const m = await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles);
    expect(m.links.find((l) => l.col === 'ARI-TST-0002')).toMatchObject({ suspect: true });
    expect(m.links.find((l) => l.col === 'ARI-TST-0001')).toMatchObject({ suspect: false });
    await testDb.exec('update artifact_link set suspect = false');
  });

  it('pagine les colonnes par fenêtres de 200 et garde l’indicateur « couvert » sur toutes les colonnes', async () => {
    expect(MATRIX_MAX_COLS).toBe(200);
    const window = await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles, { colLimit: 1 });
    expect(window.cols.map((c) => c.key)).toEqual(['ARI-TST-0001']);
    expect(window.totalCols).toBe(2);
    expect(window.links).toHaveLength(1);
    const second = await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles, { colOffset: 1, colLimit: 1 });
    expect(second.cols.map((c) => c.key)).toEqual(['ARI-TST-0002']);
    expect(second.links).toEqual([{ row: 'ARI-REQ-0001', col: 'ARI-TST-0002', suspect: false }]);
    // Fenêtre hors des liens : la ligne reste « couverte » puisqu'elle l'est dans une autre fenêtre.
    expect((await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles, { colOffset: 5 })).rows[0]!.linked).toBe(true);
    expect((await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles, { colLimit: 9999 })).cols).toHaveLength(2); // plafonné à 200
  });

  it('charge les lignes par tuiles : décalage de lignes, totaux inchangés, liens limités aux lignes de la tuile', async () => {
    const tile = await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles, { rowOffset: 1, rowLimit: 1 });
    expect(tile.rows.map((r) => r.key)).toEqual(['ARI-REQ-0002']);
    expect(tile.totalRows).toBe(3);
    expect(tile.uncoveredRows).toBe(2); // calculé sur toutes les lignes, pas sur la tuile
    expect(tile.links).toEqual([]); // R2 n'a pas de lien « verifies »
    const first = await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles, { rowOffset: 0, rowLimit: 1 });
    expect(first.links.map((l) => l.row)).toEqual(['ARI-REQ-0001', 'ARI-REQ-0001']);
    expect((await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles, { rowOffset: 50 })).rows).toEqual([]);
  });

  it('masque les titres restreints, refuse trackers et types inconnus, isole les organisations', async () => {
    await testDb.exec("update field_definition set read_roles = '{qualite}' where key = 'title' and tracker_id = (select id from tracker where key = 'REQ')");
    expect((await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', roles)).rows[0]!.title).toBe('ARI-REQ-0001');
    expect((await matrix.matrix(org, 'ARI', 'REQ', 'TST', 'verifies', ['qualite'])).rows[0]!.title).toBe('Exigence 1');
    await testDb.exec("update field_definition set read_roles = null where key = 'title'");
    expect(await code(matrix.matrix(org, 'ARI', 'NOPE', 'TST', 'verifies', roles))).toBe('not_found');
    expect(await code(matrix.matrix(org, 'ARI', 'REQ', 'NOPE', 'verifies', roles))).toBe('not_found');
    expect(await code(matrix.matrix(org, 'ARI', 'REQ', 'TST', 'inconnu', roles))).toBe('not_found');
    expect(await code(matrix.matrix(crypto.randomUUID(), 'ARI', 'REQ', 'TST', 'verifies', roles))).toBe('not_found');
  });
});
