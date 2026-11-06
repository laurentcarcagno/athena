import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { ADMIN_URL, createTestDb, pgUp, urlFor, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { LinkTypeService } from './link-type.service';
import { builtinLinkTypes } from './link-types';
import { bugTemplate, requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof DomainError ? `${e.code}: ${e.message} ${e.details.join(' ')}` : `autre: ${(e as Error)?.message}`;
};

describe('types de liens livrés', () => {
  it('sont les six de la spécification, avec libellé inverse', () => {
    const types = builtinLinkTypes();
    expect(types.map((t) => t.key)).toEqual(['refines', 'satisfies', 'verifies', 'implements', 'blocks', 'duplicates']);
    expect(types.every((t) => t.outwardLabel && t.inwardLabel)).toBe(true);
    expect(types.find((t) => t.key === 'refines')!.hierarchical).toBe(true);
    expect(types.find((t) => t.key === 'blocks')!.pairs).toEqual([]);
  });
});

const suite = pgUp ? describe : describe.skip;
suite('types de liens d’organisation', () => {
  let testDb: TestDb;
  let links: LinkService;
  let types: LinkTypeService;
  let artifacts: ArtifactService;
  let trackers: TrackerService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_linktypes');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    types = new LinkTypeService(db);
    for (const [id, key] of [[org, 'lt-a'], [other, 'lt-b']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createProject(org, 'OTH', 'Autre', actor);
    await trackers.createTracker(org, { ...requirementTemplate('ARI'), typeKey: 'requirement' }, actor);
    await trackers.createTracker(org, { ...bugTemplate('ARI', 'TST'), typeKey: 'test' }, actor);
    await trackers.createTracker(org, { ...bugTemplate('ARI'), typeKey: 'bug' }, actor);
    await trackers.createTracker(org, bugTemplate('ARI', 'NOTE'), actor); // sans type
    await trackers.createTracker(org, requirementTemplate('OTH'), actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  const make = (project: string, tracker: string, values: Record<string, unknown>) => artifacts.create(org, project, tracker, values, actor);

  it('liste les types livrés d’une organisation neuve, utilisables sans création préalable', async () => {
    const list = await types.list(other);
    expect(list.map((t) => t.key)).toEqual(['blocks', 'duplicates', 'implements', 'refines', 'satisfies', 'verifies']);
    expect(list.every((t) => t.builtin && !t.modified)).toBe(true);
    expect((await links.listTypes(other, 'ARI').catch(() => null))).toBeNull(); // projet inexistant dans cette organisation
  });

  it('un type d’organisation est utilisable dans tous les projets, un type de projet de même clé le surcharge', async () => {
    const req = await make('ARI', 'REQ', { title: 'R1', statement: 's' });
    const req2 = await make('ARI', 'REQ', { title: 'R2', statement: 's' });
    await links.link(org, 'ARI', req.key, req2.key, 'refines', actor); // type livré, écrit au premier usage, entre exigences
    const oth = await make('OTH', 'REQ', { title: 'O1', statement: 's' });
    const oth2 = await make('OTH', 'REQ', { title: 'O2', statement: 's' });
    await links.link(org, 'OTH', oth.key, oth2.key, 'refines', actor); // le même type, dans un autre projet
    expect((await types.list(org)).find((t) => t.key === 'refines')).toMatchObject({ builtin: true, modified: false });
    // Surcharge : « blocks » du projet OTH, avec d'autres libellés, n'a pas de paires ; celui de l'organisation reste intact ailleurs.
    await links.createLinkType(org, 'OTH', { key: 'blocks', outwardLabel: 'empêche', inwardLabel: 'est empêché par' }, actor);
    expect((await links.listTypes(org, 'OTH')).find((t) => t.key === 'blocks')).toMatchObject({ outwardLabel: 'empêche', scope: 'project' });
    expect((await links.listTypes(org, 'ARI')).find((t) => t.key === 'blocks')).toMatchObject({ outwardLabel: 'bloque', scope: 'organization' });
    await links.link(org, 'OTH', oth.key, oth2.key, 'blocks', actor);
    expect((await links.list(org, 'OTH', oth.key)).find((l) => l.type === 'blocks')).toMatchObject({ label: 'empêche' });
  });

  it('refuse un lien hors des paires de types, nomme la paire, et n’impose rien sans type ou sans paire', async () => {
    const req = await make('ARI', 'REQ', { title: 'Exigence', statement: 's' });
    const test = await make('ARI', 'TST', { title: 'Test', severity: 'mineure' });
    const bug = await make('ARI', 'BUG', { title: 'Bug', severity: 'majeure' });
    const note = await make('ARI', 'NOTE', { title: 'Note', severity: 'mineure' });
    await links.link(org, 'ARI', test.key, req.key, 'verifies', actor); // test → exigence : autorisé
    const refused = await code(links.link(org, 'ARI', req.key, test.key, 'verifies', actor)); // sens inverse : pas une paire
    expect(refused).toMatch(/^validation: .*verifies.*requirement à test.*test → requirement/);
    expect(await code(links.link(org, 'ARI', bug.key, req.key, 'verifies', actor))).toMatch(/^validation: .*bug à requirement/);
    await links.link(org, 'ARI', note.key, req.key, 'verifies', actor); // tracker sans type : jamais contraint
    await links.link(org, 'ARI', req.key, note.key, 'refines', actor);
    await links.link(org, 'ARI', bug.key, req.key, 'blocks', actor); // type sans paire : aucune restriction
  });

  it('applique la détection de cycle aux types hiérarchiques d’organisation', async () => {
    const a = await make('ARI', 'REQ', { title: 'A', statement: 's' });
    const b = await make('ARI', 'REQ', { title: 'B', statement: 's' });
    await links.link(org, 'ARI', a.key, b.key, 'refines', actor);
    expect(await code(links.link(org, 'ARI', b.key, a.key, 'refines', actor))).toMatch(/^conflict/);
  });

  it('crée, modifie (y compris un type livré) et supprime un type, avec ses paires', async () => {
    await types.create(org, 'tests', { outwardLabel: 'teste', inwardLabel: 'est testé par', hierarchical: false, pairs: [{ from: 'test', to: 'design' }] }, actor);
    expect(await code(types.create(org, 'tests', { outwardLabel: 'x', inwardLabel: 'y', hierarchical: false, pairs: [] }, actor))).toMatch(/^conflict/);
    expect(await code(types.create(org, 'verifies', { outwardLabel: 'x', inwardLabel: 'y', hierarchical: false, pairs: [] }, actor))).toMatch(/^conflict/);
    expect(await code(types.create(org, 'autre', { outwardLabel: 'x', inwardLabel: 'y', hierarchical: false, pairs: [{ from: 'inconnu', to: 'test' }] }, actor))).toMatch(/^validation: .*inconnu/);
    expect((await types.list(org)).find((t) => t.key === 'tests')).toMatchObject({ builtin: false, pairs: [{ from: 'test', to: 'design' }] });

    await types.update(org, 'blocks', { outwardLabel: 'bloque (org)', inwardLabel: 'est bloqué par', hierarchical: false, pairs: [{ from: 'bug', to: 'bug' }] }, actor);
    expect((await types.list(org)).find((t) => t.key === 'blocks')).toMatchObject({ builtin: true, modified: true, outwardLabel: 'bloque (org)' });
    const a = await make('ARI', 'BUG', { title: 'x', severity: 'mineure' });
    const r = await make('ARI', 'REQ', { title: 'y', statement: 's' });
    expect(await code(links.link(org, 'ARI', a.key, r.key, 'blocks', actor))).toMatch(/^validation: .*bug à requirement/); // les nouvelles paires s'appliquent

    expect(await code(types.update(org, 'inconnu', { outwardLabel: 'x', inwardLabel: 'y', hierarchical: false, pairs: [] }, actor))).toMatch(/^not_found/);
    await types.remove(org, 'tests', actor);
    expect((await types.list(org)).some((t) => t.key === 'tests')).toBe(false);
  });

  it('refuse de supprimer ou de rendre hiérarchique un type qui porte des liens, et rétablit un type livré inutilisé', async () => {
    expect(await code(types.remove(org, 'refines', actor))).toMatch(/^conflict: .*lien/);
    expect(await code(types.update(org, 'refines', { outwardLabel: 'raffine', inwardLabel: 'est raffiné par', hierarchical: false, pairs: [] }, actor))).toMatch(/^conflict: .*hiérarchique/);
    await types.update(org, 'duplicates', { outwardLabel: 'copie', inwardLabel: 'copie', hierarchical: false, pairs: [] }, actor);
    expect((await types.list(org)).find((t) => t.key === 'duplicates')).toMatchObject({ outwardLabel: 'copie', modified: true });
    await types.remove(org, 'duplicates', actor); // réinitialisation
    expect((await types.list(org)).find((t) => t.key === 'duplicates')).toMatchObject({ outwardLabel: 'duplique', modified: false });
    expect(await code(types.remove(org, 'duplicates', actor))).toMatch(/^conflict: .*livré/);
  });

  it('isole les types et leurs paires entre organisations', async () => {
    expect((await types.list(other)).find((t) => t.key === 'blocks')).toMatchObject({ outwardLabel: 'bloque', modified: false });
    expect((await types.list(other)).some((t) => t.key === 'tests')).toBe(false);
  });
});

suite('migration 034 : types de projet existants', () => {
  const database = `athena_test_lt034_${process.pid.toString(36)}`;
  it('garde les types et les liens par projet intacts', async () => {
    const root = new Client({ connectionString: ADMIN_URL });
    await root.connect();
    await root.query(`drop database if exists ${database} with (force)`);
    await root.query(`create database ${database}`);
    await root.end();
    const all = join(__dirname, '../db/migrations');
    const before = mkdtempSync(join(tmpdir(), 'athena-mig-'));
    for (const f of readdirSync(all).filter((x) => x.endsWith('.sql') && x < '034')) copyFileSync(join(all, f), join(before, f));
    await migrate(urlFor(database), before);
    const owner = new Client({ connectionString: urlFor(database) });
    await owner.connect();
    try {
      const org = crypto.randomUUID();
      await owner.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'mig']);
      const project = (await owner.query('insert into project (organization_id, key, name) values ($1,$2,$2) returning id', [org, 'ARI'])).rows[0].id;
      const tracker = (await owner.query('insert into tracker (organization_id, project_id, key, name) values ($1,$2,$3,$3) returning id', [org, project, 'REQ'])).rows[0].id;
      const status = (await owner.query("insert into status (organization_id, tracker_id, key, name, category) values ($1,$2,'open','Ouvert','todo') returning id", [org, tracker])).rows[0].id;
      const ids: string[] = [];
      for (const n of [1, 2]) ids.push((await owner.query('insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', [org, project, tracker, n, `ARI-REQ-000${n}`, status, '{}', 'u'])).rows[0].id);
      const type = (await owner.query("insert into link_type (organization_id, project_id, key, outward_label, inward_label) values ($1,$2,'parent','parent de','enfant de') returning id", [org, project])).rows[0].id;
      await owner.query('insert into artifact_link (organization_id, from_artifact_id, to_artifact_id, link_type_id) values ($1,$2,$3,$4)', [org, ids[0], ids[1], type]);
      await migrate(urlFor(database));
      const rows = (await owner.query('select t.key, t.project_id is not null as per_project, count(l.id)::int as links from link_type t left join artifact_link l on l.link_type_id = t.id group by t.id')).rows;
      expect(rows).toEqual([{ key: 'parent', per_project: true, links: 1 }]);
      await owner.query("insert into link_type (organization_id, project_id, key, outward_label, inward_label) values ($1,null,'parent','x','y')", [org]); // même clé au niveau organisation : autorisé
      await expect(owner.query("insert into link_type (organization_id, project_id, key, outward_label, inward_label) values ($1,null,'parent','x','y')", [org])).rejects.toThrow(/link_type_org_key/); // mais une seule fois
    } finally {
      await owner.end();
      const cleanup = new Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${database} with (force)`);
      await cleanup.end();
    }
  }, 60_000);
});
