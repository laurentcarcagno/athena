import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ProjectMetaInput, ProjectMetaService } from './project-meta.service';

const suite = pgUp ? describe : describe.skip;
const pm: Actor = { id: 'sub-pm', roles: ['athena-team-member', 'athena-pm'] };

describe('méta du projet : validation', () => {
  it('accepte des dates réelles et refuse les autres, une granularité inconnue et une description trop longue', () => {
    expect(ProjectMetaInput.safeParse({ plannedStart: '2026-02-28', plannedEnd: null }).success).toBe(true);
    for (const bad of [{ plannedStart: '2026-02-30' }, { plannedEnd: '28/02/2026' }, { capacityGranularity: 'day' }, { description: 'x'.repeat(2001) }]) expect(ProjectMetaInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

suite('méta du projet (intégration)', () => {
  let testDb: TestDb;
  let meta: ProjectMetaService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_project_meta');
    const db = new Db(testDb.pool);
    meta = new ProjectMetaService(db);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, `m${org.slice(0, 6)}`]);
      await c.query("insert into project (organization_id, key, name) values ($1,'MET','Méta')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name) values ($1,'sub-sponsor','sp','Sam Sponsor')", [org]);
    });
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('un projet sans méta est vide ; un projet inconnu est introuvable', async () => {
    expect(await meta.get(org, 'MET')).toMatchObject({ plannedStart: null, plannedEnd: null, sponsorSubject: null, description: '', capacityGranularity: null });
    await expect(meta.get(org, 'NOPE')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('écrit les champs présents seulement, relit les dates telles quelles et nomme le sponsor', async () => {
    const r = await meta.patch(org, 'MET', { plannedStart: '2026-03-01', plannedEnd: '2026-12-31', sponsorSubject: 'sub-sponsor', description: 'Programme pilote' }, pm);
    expect(r).toMatchObject({ plannedStart: '2026-03-01', plannedEnd: '2026-12-31', sponsorName: 'Sam Sponsor', description: 'Programme pilote' });
    const r2 = await meta.patch(org, 'MET', { capacityGranularity: 'week' }, pm);
    expect(r2).toMatchObject({ plannedStart: '2026-03-01', capacityGranularity: 'week' });
    expect((await meta.patch(org, 'MET', { sponsorSubject: null }, pm)).sponsorName).toBeNull();
  });

  it('refuse une fin avant le début (aussi avec une seule des deux dates envoyée) et un sponsor inconnu', async () => {
    await expect(meta.patch(org, 'MET', { plannedEnd: '2026-02-01' }, pm)).rejects.toMatchObject({ code: 'validation' });
    await expect(meta.patch(org, 'MET', { plannedStart: '2027-01-01' }, pm)).rejects.toMatchObject({ code: 'validation' });
    await expect(meta.patch(org, 'MET', { sponsorSubject: 'sub-ghost' }, pm)).rejects.toMatchObject({ code: 'validation' });
  });

  it('chaque modification est auditée', async () => {
    const n = await new Db(testDb.pool).tx(org, async (c) => (await c.query("select count(*)::int n from audit_log where action = 'project.update'")).rows[0].n);
    expect(n).toBe(3);
  });
});
