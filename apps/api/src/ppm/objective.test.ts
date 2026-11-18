import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ObjectiveService } from './objective.service';
import { PortfolioService } from './portfolio.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };

suite('objectifs stratégiques (B41)', () => {
  let testDb: TestDb; let svc: ObjectiveService;
  const org = crypto.randomUUID();
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_objective');
    const db = new Db(testDb.pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    svc = new ObjectiveService(db);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'ob','ob')", [org]));
    const portfolios = new PortfolioService(db, { kpis: async () => { throw new Error('inutile'); } });
    await portfolios.create(org, { key: 'pf', name: 'Portefeuille' }, admin);
    for (const k of ['AAA', 'BBB', 'CCC']) { await trackers.createProject(org, k, `Projet ${k}`, admin); await portfolios.setProject(org, 'pf', k, {}, admin); }
  });
  afterAll(async () => { await testDb?.drop(); });

  it('flux objectifs → projets : liens pondérés, projets sans objectif listés à part', async () => {
    await svc.upsert(org, { key: 'croissance', name: 'Croissance' }, admin);
    await svc.upsert(org, { key: 'conformite', name: 'Conformité' }, admin);
    await svc.link(org, 'croissance', { project: 'AAA', weight: 3 }, admin);
    await svc.link(org, 'conformite', { project: 'AAA', weight: 1 }, admin);
    await svc.link(org, 'conformite', { project: 'BBB', weight: 2 }, admin);
    const f = await svc.flow(org, 'pf');
    expect(f.objectives.map((o) => o.key)).toEqual(['conformite', 'croissance']);
    expect(f.links).toEqual([{ objective: 'conformite', project: 'AAA', weight: 1 }, { objective: 'conformite', project: 'BBB', weight: 2 }, { objective: 'croissance', project: 'AAA', weight: 3 }]);
    expect(f.projects).toEqual(['AAA', 'BBB']);
    expect(f.unlinked).toEqual(['CCC']);
  });
  it('relier à un objectif inconnu est refusé ; relier deux fois met le poids à jour', async () => {
    await expect(svc.link(org, 'inconnu', { project: 'AAA', weight: 1 }, admin)).rejects.toMatchObject({ code: 'not_found' });
    await svc.link(org, 'croissance', { project: 'AAA', weight: 5 }, admin);
    expect((await svc.flow(org, 'pf')).links.find((l) => l.objective === 'croissance')!.weight).toBe(5);
  });
});
