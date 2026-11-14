import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReportService } from '../agile/report.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { AccessService } from './access.service';
import { ApprovalService, approvalState } from './approval.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { runAs } from './request-context';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-team-member', 'athena-admin'] };
const qaActor: Actor = { id: 'u-qa', roles: ['athena-qa'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code}:${e.message}` : e ? `autre:${(e as Error).message}` : 'ok'; };

describe('état d’approbation', () => {
  it('un refus l’emporte, une approbation suffit sinon, « en attente » seulement si requise', () => {
    expect(approvalState(false, [])).toBe('not_required');
    expect(approvalState(true, [])).toBe('pending');
    expect(approvalState(true, [{ decision: 'approved' }])).toBe('approved');
    expect(approvalState(true, [{ decision: 'approved' }, { decision: 'rejected' }])).toBe('rejected');
    expect(approvalState(false, [{ decision: 'approved' }])).toBe('approved');
  });
});

suite('approbation des jalons et baselines (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let approvals: ApprovalService;
  let reports: ReportService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_approval');
    db = new Db(testDb.pool);
    approvals = new ApprovalService(db);
    reports = new ReportService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'qa']));
    for (const s of ['u-admin', 'u-qa', 'u-qa2']) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$2)', [org, s]));
    await new TrackerService(db, new FieldTypeRegistry()).createProject(org, 'DEF', 'Défense', admin);
    await reports.createRelease(org, 'DEF', { name: 'CDR', startsOn: '2026-01-01', endsOn: '2026-02-01' }, admin);
    await db.tx(org, (c) => c.query("insert into baseline (organization_id, project_id, name, git_tag, git_sha, created_by) select organization_id, id, 'B1', 'baseline/B1', 'abc1234', 'u-admin' from project where key = 'DEF'"));
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  const state = async (type: 'release' | 'baseline', ref: string) => (await approvals.list(org, 'DEF')).find((o) => o.type === type && o.ref === ref)!;

  it('liste jalons et baselines : approbation non requise par défaut', async () => {
    expect((await approvals.list(org, 'DEF')).map((o) => [o.type, o.ref, o.requiresApproval, o.state])).toEqual([['release', 'CDR', false, 'not_required'], ['baseline', 'B1', false, 'not_required']]);
  });

  it('une baseline qui requiert une approbation reste « en attente » tant que l’assurance qualité n’a pas décidé', async () => {
    await approvals.setRequired(org, 'DEF', 'baseline', 'B1', true, admin);
    expect((await state('baseline', 'B1')).state).toBe('pending');
    const out = await approvals.decide(org, 'DEF', 'baseline', 'B1', { decision: 'approved', comment: 'Conforme au plan qualité' }, { id: 'u-qa', name: 'Aline QA' }, qaActor);
    expect(out.state).toBe('approved');
    expect(out.decisions).toEqual([{ approver: 'u-qa', approverName: 'Aline QA', decision: 'approved', comment: 'Conforme au plan qualité', decidedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }]);
    expect((await state('baseline', 'B1')).state).toBe('approved');
  });

  it('un second approbateur peut refuser : le refus l’emporte ; une nouvelle décision du même remplace la sienne', async () => {
    const qa2 = { id: 'u-qa2', roles: ['athena-qa'] };
    const out = await approvals.decide(org, 'DEF', 'baseline', 'B1', { decision: 'rejected', comment: 'Écarts ouverts' }, { id: 'u-qa2', name: 'Bruno QA' }, qa2);
    expect(out.state).toBe('rejected');
    const back = await approvals.decide(org, 'DEF', 'baseline', 'B1', { decision: 'approved', comment: 'Écarts clos' }, { id: 'u-qa2', name: 'Bruno QA' }, qa2);
    expect(back.state).toBe('approved');
    expect(back.decisions).toHaveLength(2);
  });

  it('un jalon qui requiert une approbation ne se publie qu’avec elle, et un refus bloque', async () => {
    await approvals.setRequired(org, 'DEF', 'release', 'CDR', true, admin);
    const id = (await state('release', 'CDR')).id;
    expect(await code(reports.publish(org, id, admin))).toMatch(/^conflict:.*requiert l’approbation/);
    await approvals.decide(org, 'DEF', 'release', 'CDR', { decision: 'rejected', comment: '' }, { id: 'u-qa', name: 'Aline QA' }, qaActor);
    expect(await code(reports.publish(org, id, admin))).toMatch(/^conflict:.*refusé/);
    await approvals.decide(org, 'DEF', 'release', 'CDR', { decision: 'approved', comment: 'Levé' }, { id: 'u-qa', name: 'Aline QA' }, qaActor);
    expect(await code(reports.publish(org, id, admin))).toBe('ok');
    expect(await code(approvals.decide(org, 'DEF', 'release', 'CDR', { decision: 'rejected', comment: '' }, { id: 'u-qa', name: 'Aline QA' }, qaActor))).toMatch(/^conflict:.*déjà publié/);
  });

  it('chaque exigence et chaque décision est consignée, nominativement, dans le journal d’audit', async () => {
    const rows = await db.tx(org, async (c) => (await c.query("select actor, action, target from audit_log where action like 'approval.%' order by seq")).rows, { system: true });
    expect(rows.map((r) => `${r.actor} ${r.action} ${r.target}`)).toEqual([
      'u-admin approval.required baseline:B1', 'u-qa approval.approved baseline:B1', 'u-qa2 approval.rejected baseline:B1', 'u-qa2 approval.approved baseline:B1',
      'u-admin approval.required release:CDR', 'u-qa approval.rejected release:CDR', 'u-qa approval.approved release:CDR',
    ]);
  });

  it('refuse un objet ou un projet inconnu', async () => {
    expect(await code(approvals.decide(org, 'DEF', 'baseline', 'ZZZ', { decision: 'approved', comment: '' }, { id: 'u-qa', name: 'Q' }, qaActor))).toMatch(/^not_found/);
    expect(await code(approvals.list(org, 'NOP'))).toMatch(/^not_found/);
  });

  it('l’assurance qualité ne lit que ce que sa liste d’ayants droit autorise', async () => {
    const access = new AccessService(db);
    await access.set(org, 'DEF', { members: ['u-admin'] }, admin);
    expect(await runAs('u-qa', () => code(approvals.list(org, 'DEF')))).toMatch(/^not_found/);
    expect(await runAs('u-qa', () => db.tx(org, async (c) => Number((await c.query('select count(*) n from approval')).rows[0].n)))).toBe(0);
    await access.set(org, 'DEF', { members: ['u-admin', 'u-qa'] }, admin);
    expect((await runAs('u-qa', () => approvals.list(org, 'DEF'))).length).toBe(2);
  });
});
