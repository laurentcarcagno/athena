import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TemplateService } from '../core/template.service';
import { TemplateUpgradeService } from '../core/template-upgrade.service';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { GovernanceService } from './governance.service';
import { PortfolioService } from './portfolio.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

suite('gouvernance du portefeuille : gates, risques, actions, jalons (B34)', () => {
  let testDb: TestDb;
  let gov: GovernanceService;
  let access: AccessService;
  let upgrades: TemplateUpgradeService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_governance');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    const templates = new TemplateService(db, trackers);
    upgrades = new TemplateUpgradeService(db, trackers, templates);
    gov = new GovernanceService(db, upgrades);
    access = new AccessService(db);
    const portfolios = new PortfolioService(db, { kpis: async () => { throw new Error('inutilisé'); } });
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'gv','gv')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-admin','admin.dev','Admin Dev','a@example.test')", [org]);
    });
    await portfolios.create(org, { key: 'gov', name: 'Gouvernance' }, admin);
    await templates.createProject(org, 'MIS', 'Mission', 'spatial-project', admin); // gate de la phase 0 : MDR
    await templates.createProject(org, 'SEC', 'Secret', 'spatial-project', admin);
    for (const k of ['MIS', 'SEC']) await portfolios.setProject(org, 'gov', k, {}, admin);
    for (const k of ['MIS', 'SEC']) {
      await artifacts.create(org, k, 'RSK', { title: `Risque ${k}`, probability: 4, impact: 5 }, admin);
      await artifacts.create(org, k, 'RSK', { title: `Mineur ${k}`, probability: 1, impact: 2 }, admin);
      await artifacts.create(org, k, 'ACT', { title: `Action en retard ${k}`, due: day(-3) }, admin);
      await artifacts.create(org, k, 'ACT', { title: `Action à venir ${k}`, due: day(10) }, admin);
    }
    const done = await artifacts.create(org, 'MIS', 'ACT', { title: 'Action faite', due: day(-9) }, admin);
    await artifacts.transition(org, 'MIS', done.key, 'Terminer', done.version, admin);
    await upgrades.setPhaseDates(org, 'MIS', 'phase-0', { reviewPlannedOn: '2026-06-01' }, admin);
    await upgrades.setPhaseDates(org, 'MIS', 'phase-0', { reviewPlannedOn: '2026-07-15', plannedEnd: '2026-07-10' }, admin);
    await upgrades.setPhaseDates(org, 'MIS', 'phase-0', { reviewPlannedOn: '2026-09-01' }, admin);
  }, 90_000);
  afterAll(async () => { await testDb?.drop(); });

  it('tableau de passage : gate en cours, revue prévue, critères manuels en attente', async () => {
    const rows = await gov.gates(org, 'gov');
    const mis = rows.find((r) => r.project === 'MIS')!;
    expect(mis).toMatchObject({ phase: 'phase-0', review: 'mdr', reviewPlannedOn: '2026-09-01', canAdvance: false });
    expect(mis.criteria).toMatchObject({ total: 5, manualPending: 4 }); // 4 critères manuels + RID majeurs de la revue + baseline d'entrée suivante
    expect(rows[0]!.project).toBe('MIS'); // les revues datées d'abord
  });

  it('matrice des risques : cases probabilité × impact, dix plus critiques, risques clos exclus', async () => {
    const m = await gov.riskMatrix(org, 'gov', admin);
    expect(m.total).toBe(4);
    expect(m.cells).toHaveLength(25);
    expect(m.cells.find((c) => c.probability === 4 && c.impact === 5)!.count).toBe(2);
    expect(m.cells.find((c) => c.probability === 1 && c.impact === 2)!.count).toBe(2);
    expect(m.top[0]).toMatchObject({ criticality: 20 });
  });

  it('matrice d’un seul projet (carte du tableau de bord) : ses risques seulement ; projet inconnu : 404', async () => {
    const all = await gov.riskMatrix(org, 'gov', admin);
    const one = await gov.projectRiskMatrix(org, 'MIS', admin);
    expect(one.total).toBeGreaterThan(0);
    expect(one.total).toBeLessThanOrEqual(all.total);
    expect(one.top.every((r) => r.project === 'MIS')).toBe(true);
    await expect(gov.projectRiskMatrix(org, 'NOPE', admin)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('suivi des actions : ouvertes, en retard, closes par projet ; la liste des retards', async () => {
    const a = await gov.actions(org, 'gov');
    expect(a.projects.find((p) => p.project === 'MIS')).toEqual({ project: 'MIS', open: 2, late: 1, closed: 1 });
    expect(a.overdue.map((o) => o.project).sort()).toEqual(['MIS', 'SEC']);
  });

  it('courbe de tendance des jalons : chaque modification de la date prévue, avec la date du relevé', async () => {
    const s = await gov.milestoneTrend(org, 'MIS');
    const review = s.find((x) => x.field === 'review_planned_on')!;
    expect(review.points.map((p) => p.planned)).toEqual(['2026-06-01', '2026-07-15', '2026-09-01']);
    expect(s.find((x) => x.field === 'planned_end')!.points.map((p) => p.planned)).toEqual(['2026-07-10']);
    await expect(gov.milestoneTrend(org, 'NOPE')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('un projet masqué au lecteur n’apparaît ni dans les gates, ni dans la matrice, ni dans les actions', async () => {
    await runAs('sub-admin', () => access.set(org, 'SEC', { members: ['sub-admin'] }, admin));
    const seen = await runAs('sub-dir', async () => ({ g: await gov.gates(org, 'gov'), m: await gov.riskMatrix(org, 'gov', director), a: await gov.actions(org, 'gov') }));
    expect(seen.g.map((r) => r.project)).toEqual(['MIS']);
    expect(seen.m.total).toBe(2);
    expect(JSON.stringify(seen)).not.toContain('SEC');
    await runAs('sub-admin', () => access.remove(org, 'SEC', null, admin));
  });
});
