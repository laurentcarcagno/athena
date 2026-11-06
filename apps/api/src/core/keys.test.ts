import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { ADMIN_URL, pgUp, urlFor } from '../testing/harness';
import { SearchService } from '../atql/search.service';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { FieldTypeRegistry } from './field-types';
import { ARTIFACT_FILE, formatKey, isCanonicalKey, isItemKey, isLegacyKey, itemKeyScanner, parseKey } from './key';
import { LinkService } from './link.service';
import { TrackerService } from './tracker.service';

describe('clés d’item', () => {
  it('formate avec 4 chiffres minimum, sans plafond', () => {
    expect(formatKey('SAT1', 'REQ', 42)).toBe('SAT1-REQ-0042');
    expect(formatKey('SAT1', 'REQ', 9999)).toBe('SAT1-REQ-9999');
    expect(formatKey('SAT1', 'REQ', 10000)).toBe('SAT1-REQ-10000');
  });

  it('distingue clé canonique, ancienne clé et texte quelconque', () => {
    expect(isCanonicalKey('SAT1-REQ-0042')).toBe(true);
    expect(isCanonicalKey('SAT1-REQ-42')).toBe(false); // moins de 4 chiffres : pas une clé canonique
    expect(isLegacyKey('REQ-42')).toBe(true);
    expect(isLegacyKey('SAT1-REQ-0042')).toBe(false);
    expect(isItemKey('REQ-42') && isItemKey('SAT1-REQ-0042')).toBe(true);
    expect(isItemKey('req-42') || isItemKey('REQ-') || isItemKey('REQ-42 ')).toBe(false);
    expect(parseKey('SAT1-REQ-0042')).toEqual({ project: 'SAT1', tracker: 'REQ', number: 42 });
    expect(parseKey('REQ-42')).toBeNull();
  });

  it('extrait les clés d’un texte sans lire REQ-0042 à l’intérieur de SAT1-REQ-0042', () => {
    const found = (text: string) => text.match(itemKeyScanner()) ?? [];
    expect(found('Fixes SAT1-BUG-0012, REQ-3 et UTF-8')).toEqual(['SAT1-BUG-0012', 'REQ-3', 'UTF-8']);
    expect(found('bugfix/SAT1-BUG-0012-resume')).toEqual(['SAT1-BUG-0012']);
    expect(found('(SAT1-REQ-10000)')).toEqual(['SAT1-REQ-10000']);
    expect(found('Voir sat1-req-0042')).toEqual([]);
  });

  it('reconnaît les fichiers d’historique des deux formats', () => {
    expect(ARTIFACT_FILE.exec('trackers/REQ/artifacts/SAT1-REQ-0042.yaml')?.[1]).toBe('SAT1-REQ-0042');
    expect(ARTIFACT_FILE.exec('trackers/REQ/artifacts/REQ-42.yaml')?.[1]).toBe('REQ-42');
    expect(ARTIFACT_FILE.test('trackers/REQ/artifacts/REQ-42.yamlx')).toBe(false);
    expect(ARTIFACT_FILE.test('trackers/REQ/tracker.yaml')).toBe(false);
  });
});

const suite = pgUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };

suite('migration 030 : anciennes clés conservées en alias', () => {
  const database = `athena_test_keys_${process.pid.toString(36)}`;
  const role = `${database}_app`;
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  let owner: Client;
  let pool: Pool;
  let artifacts: ArtifactService;
  let links: LinkService;

  const seed = async (org: string, project: string, tracker: string, count: number) => {
    const p = (await owner.query('insert into project (organization_id, key, name) values ($1,$2,$2) returning id', [org, project])).rows[0].id;
    const t = (await owner.query('insert into tracker (organization_id, project_id, key, name) values ($1,$2,$3,$3) returning id', [org, p, tracker])).rows[0].id;
    const s = (await owner.query("insert into status (organization_id, tracker_id, key, name, category) values ($1,$2,'open','Ouvert','todo') returning id", [org, t])).rows[0].id;
    await owner.query('insert into field_definition (organization_id, tracker_id, key, label, type, required, position, semantic_role) values ($1,$2,$3,$4,$5,true,0,$6)', [org, t, 'title', 'Titre', 'text', 'title']);
    for (let n = 1; n <= count; n += 1) {
      await owner.query('insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [org, p, t, n, `${tracker}-${n}`, s, JSON.stringify({ title: `Ancien ${n}` }), 'u0']);
    }
    await owner.query('insert into tracker_sequence (tracker_id, organization_id, last_number) values ($1,$2,$3)', [t, org, count]);
    return { p, t };
  };

  beforeAll(async () => {
    const root = new Client({ connectionString: ADMIN_URL });
    await root.connect();
    await root.query(`drop database if exists ${database} with (force)`);
    await root.query(`create database ${database}`);
    await root.end();

    // État d'avant la migration 030 : toutes les migrations précédentes seulement.
    const all = join(__dirname, '../db/migrations');
    const before = mkdtempSync(join(tmpdir(), 'athena-mig-'));
    for (const f of readdirSync(all).filter((x) => x.endsWith('.sql') && x < '030')) copyFileSync(join(all, f), join(before, f));
    mkdirSync(before, { recursive: true });
    await migrate(urlFor(database), before);

    owner = new Client({ connectionString: urlFor(database) });
    await owner.connect();
    for (const [org, key] of [[orgA, 'org-a'], [orgB, 'org-b']] as const) await owner.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, key]);
    const alpha = await seed(orgA, 'ARI', 'REQ', 2);
    await seed(orgA, 'OTH', 'REQ', 1); // même ancienne clé REQ-1 dans un autre projet
    await owner.query("insert into import_map (organization_id, project_id, source, external_key, artifact_key) values ($1,$2,'jira','JIRA-7','REQ-2')", [orgA, alpha.p]);

    await migrate(urlFor(database)); // applique 030
    await owner.query(`drop role if exists ${role}`);
    await owner.query(`create role ${role} login password 'keys-test' nosuperuser nobypassrls in role athena_app`);
    pool = new Pool({ connectionString: urlFor(database, role, 'keys-test'), max: 4 });
    const db = new Db(pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    await links.createLinkType(orgA, 'ARI', { key: 'refines', outwardLabel: 'raffine', inwardLabel: 'est raffiné par' }, actor);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await owner?.end();
    const root = new Client({ connectionString: ADMIN_URL });
    await root.connect();
    await root.query(`drop database if exists ${database} with (force)`);
    await root.query(`drop role if exists ${role}`);
    await root.end();
  });

  it('réécrit les clés existantes et garde l’ancienne en alias, par projet', async () => {
    const rows = (await owner.query('select a.key, al.alias, p.key as project from artifact a join artifact_key_alias al on al.artifact_id = a.id join project p on p.id = a.project_id order by a.key')).rows;
    expect(rows).toEqual([
      { key: 'ARI-REQ-0001', alias: 'REQ-1', project: 'ARI' },
      { key: 'ARI-REQ-0002', alias: 'REQ-2', project: 'ARI' },
      { key: 'OTH-REQ-0001', alias: 'REQ-1', project: 'OTH' },
    ]);
    expect((await owner.query("select artifact_key from import_map where external_key = 'JIRA-7'")).rows[0].artifact_key).toBe('ARI-REQ-0002');
  });

  it('résout une ancienne clé dans son projet, pour lire, modifier, transitionner et lier', async () => {
    const byAlias = await artifacts.get(orgA, 'ARI', 'REQ-2');
    expect(byAlias.key).toBe('ARI-REQ-0002');
    expect((await artifacts.get(orgA, 'OTH', 'REQ-1')).key).toBe('OTH-REQ-0001');
    expect((await artifacts.get(orgA, 'ARI', 'ARI-REQ-0002')).values).toEqual(byAlias.values);
    const updated = await artifacts.update(orgA, 'ARI', 'REQ-2', { title: 'Modifié par alias' }, 1, actor);
    expect(updated.key).toBe('ARI-REQ-0002');
    await links.link(orgA, 'ARI', 'REQ-1', 'ARI-REQ-0002', 'refines', actor);
    expect(await links.list(orgA, 'ARI', 'REQ-1')).toMatchObject([{ other: 'ARI-REQ-0002', direction: 'outward' }]);
    await expect(artifacts.get(orgA, 'ARI', 'REQ-9')).rejects.toThrow(/introuvable/);
    await expect(artifacts.get(orgA, 'OTH', 'REQ-2')).rejects.toThrow(/introuvable/); // l'alias d'un autre projet ne fuit pas
  });

  it('trouve par ATQL une ancienne clé ou la clé canonique, et pas l’alias d’un autre projet', async () => {
    const search = new SearchService(new Db(pool));
    const keys = async (project: string, q: string) => (await search.search(orgA, project, q, 'u1', 50, 0, ['athena-admin'])).hits.map((h) => h.key);
    expect(await keys('ARI', 'key = REQ-1')).toEqual(['ARI-REQ-0001']);
    expect(await keys('ARI', 'key = ARI-REQ-0001')).toEqual(['ARI-REQ-0001']);
    expect(await keys('ARI', 'key IN (REQ-1, ARI-REQ-0002)')).toEqual(['ARI-REQ-0001', 'ARI-REQ-0002']);
    expect(await keys('ARI', 'key != REQ-1 AND key ~ "REQ-000"')).toEqual(['ARI-REQ-0002']);
    expect(await keys('OTH', 'key = REQ-2')).toEqual([]);
  });

  it('numérote au nouveau format, y compris au-delà de 9999', async () => {
    // Le tracker REQ d'ARI compte déjà 2 items : le suivant est 0003.
    const next = await artifacts.create(orgA, 'ARI', 'REQ', { title: 'Nouveau' }, actor);
    expect(next.key).toBe('ARI-REQ-0003');
    await owner.query("update tracker_sequence set last_number = 9999 where tracker_id = (select id from tracker t where t.key = 'REQ' and project_id = (select id from project where key = 'ARI'))");
    expect((await artifacts.create(orgA, 'ARI', 'REQ', { title: 'Cinq chiffres' }, actor)).key).toBe('ARI-REQ-10000');
  });

  it('isole les alias entre organisations (RLS) et refuse de renommer un projet qui a des items', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('athena.org_id', $1, true)", [orgB]);
      expect((await client.query('select count(*)::int n from artifact_key_alias')).rows[0].n).toBe(0);
      await client.query('rollback');
    } finally {
      client.release();
    }
    await expect(owner.query("update project set key = 'ZZZ' where key = 'ARI'")).rejects.toThrow(/ne peut plus changer/);
  });
});
