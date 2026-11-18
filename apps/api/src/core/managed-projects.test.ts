import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { FieldTypeRegistry } from './field-types';
import { isManagedOnly, runAs } from './request-context';
import { requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

// Migration 092 : un chef de projet ne voit que les projets dont il est responsable ; les autres rôles sont inchangés.

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-team-member', 'athena-admin'] };

describe('qui est limité à ses projets', () => {
  it('le chef de projet seul l’est ; avec l’administration, le PMO ou la direction, non ; un membre d’équipe non plus', () => {
    expect(isManagedOnly(['athena-pm', 'athena-team-member'])).toBe(true);
    expect(isManagedOnly(['athena-pm', 'athena-admin'])).toBe(false);
    expect(isManagedOnly(['athena-pm', 'athena-pmo'])).toBe(false);
    expect(isManagedOnly(['athena-pm', 'athena-director'])).toBe(false);
    expect(isManagedOnly(['athena-team-member'])).toBe(false);
  });
});

suite('chef de projet : la base ne montre que les projets dont il est responsable', () => {
  let testDb: TestDb; let db: Db; let search: SearchService;
  const org = crypto.randomUUID();
  const keys = (rows: Array<{ key: string }>) => rows.map((r) => r.key).sort();
  const projects = (managedOnly: boolean) => runAs('u-lea', () => db.tx(org, async (c) => keys((await c.query('select key from project')).rows)), { managedOnly });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_managed');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    search = new SearchService(db);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'mgd','mgd')", [org]));
    for (const p of ['ALFA', 'BRAVO', 'CHARLIE']) {
      await trackers.createProject(org, p, p, admin);
      await trackers.createTracker(org, requirementTemplate(p), admin);
      await artifacts.create(org, p, 'REQ', { title: `Exigence de ${p}`, statement: 's' }, admin);
    }
    await db.tx(org, async (c) => {
      const id = async (k: string) => (await c.query('select id from project where key = $1', [k])).rows[0].id as string;
      await c.query("insert into project_member (organization_id, project_id, subject, role, added_by) values ($1,$2,'u-lea','manager','x'), ($1,$3,'u-lea','member','x'), ($1,$4,'u-bob','manager','x')", [org, await id('ALFA'), await id('BRAVO'), await id('CHARLIE')]);
    }, { system: true });
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('sans la restriction, tout est visible ; avec elle, seul le projet dont la personne est responsable (membre simple : non)', async () => {
    expect(await projects(false)).toEqual(['ALFA', 'BRAVO', 'CHARLIE']);
    expect(await projects(true)).toEqual(['ALFA']);
  });

  it('les tickets suivent : recherche et lecture directe ne voient que le projet géré', async () => {
    const found = await runAs('u-lea', () => search.searchOrganization(org, '', 'u-lea', { limit: 200 }), { managedOnly: true });
    expect([...new Set(found.hits.map((h) => h.project))]).toEqual(['ALFA']);
    const direct = await runAs('u-lea', () => db.tx(org, async (c) => (await c.query('select count(*)::int n from artifact')).rows[0].n as number), { managedOnly: true });
    expect(direct).toBe(1);
  });

  it('une responsable d’aucun projet ne voit rien (liste vide, pas « tout »)', async () => {
    const none = await runAs('u-nobody', () => db.tx(org, async (c) => (await c.query('select count(*)::int n from project')).rows[0].n as number), { managedOnly: true });
    expect(none).toBe(0);
  });

  it('un traitement système n’est pas limité, et l’écriture hors de ses projets est refusée', async () => {
    expect(await db.tx(org, async (c) => (await c.query('select count(*)::int n from project')).rows[0].n as number, { system: true })).toBe(3);
    const blocked = await runAs('u-lea', () => db.tx(org, (c) => c.query("update project set name = 'x' where key = 'CHARLIE'"), {}), { managedOnly: true });
    expect(blocked.rowCount).toBe(0);
  });
});
