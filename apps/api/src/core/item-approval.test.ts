import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { AccessService } from './access.service';
import { ApprovalService } from './approval.service';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { circuitState, ItemApprovalService, type FlowInput } from './item-approval.service';
import { runAs } from './request-context';
import { requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';
import { NotifyService } from '../notify/notify.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'admin', roles: ['athena-team-member', 'athena-admin'] };
const user = (id: string): Actor => ({ id, roles: ['athena-team-member'] });
const qa: Actor = { id: 'qa', roles: ['athena-qa'] };
const who = (a: Actor) => ({ subject: a.id, name: a.id.toUpperCase(), roles: a.roles });
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code}:${e.message}` : e ? `autre:${(e as Error).message}` : 'ok'; };

describe('état du circuit', () => {
  const steps = [{ id: 's1', minApprovals: 1 }, { id: 's2', minApprovals: 2 }];
  it('première étape non terminée ; un refus l’emporte à son étape ; terminé quand toutes le sont', () => {
    expect(circuitState(steps, []).state).toBe('pending');
    expect(circuitState(steps, [{ stepId: 's1', decision: 'approved' }])).toMatchObject({ state: 'pending', currentIndex: 1, stepStates: ['done', 'current'] });
    expect(circuitState(steps, [{ stepId: 's1', decision: 'approved' }, { stepId: 's2', decision: 'approved' }]).currentIndex).toBe(1); // 2 décisions requises
    expect(circuitState(steps, [{ stepId: 's1', decision: 'approved' }, { stepId: 's2', decision: 'approved' }, { stepId: 's2', decision: 'approved' }]).state).toBe('approved');
    expect(circuitState(steps, [{ stepId: 's1', decision: 'rejected' }])).toMatchObject({ state: 'rejected', currentIndex: 0, stepStates: ['rejected', 'waiting'] });
    expect(circuitState([], []).state).toBe('not_required');
  });
});

suite('circuits d’approbation des items (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let flows: ItemApprovalService;
  let artifacts: ArtifactService;
  let baselines: ApprovalService;
  let access: AccessService;
  let notify: NotifyService;
  const org = crypto.randomUUID();
  const circuit: FlowInput = {
    enabled: true,
    steps: [
      { name: 'Relecture technique', kind: 'review', approvers: ['rita', 'remy'], minApprovals: 1 },
      { name: 'Approbation qualité', kind: 'approval', approvers: [], role: 'athena-qa', minApprovals: 1 },
    ],
  };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_itemappr');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    flows = new ItemApprovalService(db);
    baselines = new ApprovalService(db);
    access = new AccessService(db);
    notify = new NotifyService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'itemappr']));
    for (const s of ['admin', 'rita', 'remy', 'qa', 'paul']) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$3)', [org, s, s.toUpperCase()]));
    await trackers.createProject(org, 'APR', 'Approbations', admin);
    await trackers.createTracker(org, requirementTemplate('APR'), admin);
    await trackers.createTracker(org, { ...requirementTemplate('APR', 'LIB'), name: 'Libre' }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  const make = (title = 'Exigence') => artifacts.create(org, 'APR', 'REQ', { title, statement: 'texte' }, admin);
  const view = (key: string, a: Actor) => flows.get(org, 'APR', key, { subject: a.id, roles: a.roles });
  const decide = (key: string, a: Actor, decision: 'approved' | 'rejected', comment = '') => flows.decide(org, 'APR', key, { decision, comment }, who(a), a);

  it('sans circuit : rien n’est requis ; le circuit se définit sur le tracker et se relit avec les noms', async () => {
    const a = await make();
    expect(await view(a.key, admin)).toMatchObject({ configured: false, state: 'not_required', canDecide: false });
    expect(await flows.getFlow(org, 'APR', 'REQ')).toEqual({ enabled: false, configured: false, steps: [] });
    await flows.setFlow(org, 'APR', 'REQ', circuit, admin);
    const flow = await flows.getFlow(org, 'APR', 'REQ');
    expect(flow.steps.map((s) => [s.position, s.name, s.kind, s.role, s.approvers.map((x) => x.displayName)])).toEqual([[1, 'Relecture technique', 'review', null, ['RITA', 'REMY']], [2, 'Approbation qualité', 'approval', 'athena-qa', []]]);
  });

  it('le circuit déroule ses étapes dans l’ordre ; seules les personnes désignées décident, nominativement et avec horodatage', async () => {
    const a = await make('Parcours');
    expect(await view(a.key, user('rita'))).toMatchObject({ state: 'pending', currentStep: 1, canDecide: true });
    expect((await view(a.key, user('paul'))).canDecide).toBe(false);
    expect(await view(a.key, qa).then((v) => v.canDecide)).toBe(false); // l’étape 2 n’est pas encore ouverte
    expect(await code(decide(a.key, user('paul'), 'approved'))).toMatch(/^forbidden:.*Relecture technique/);
    expect(await code(decide(a.key, qa, 'approved'))).toMatch(/^forbidden/); // pas avant son tour
    const after1 = await decide(a.key, user('rita'), 'approved', 'Relu');
    expect(after1).toMatchObject({ state: 'pending', currentStep: 2 });
    expect(after1.steps[0]!.decisions).toEqual([{ approver: 'rita', approverName: 'RITA', decision: 'approved', comment: 'Relu', decidedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }]);
    expect(await code(decide(a.key, user('rita'), 'approved'))).toMatch(/^forbidden/); // plus son étape
    expect((await view(a.key, qa)).canDecide).toBe(true);
    const done = await decide(a.key, qa, 'approved', 'Conforme');
    expect(done).toMatchObject({ state: 'approved', currentStep: null });
    expect(done.steps.map((s) => s.state)).toEqual(['done', 'done']);
    expect(await code(decide(a.key, qa, 'approved'))).toMatch(/^conflict:.*déjà approuvé/);
  });

  it('un refus arrête le circuit ; la personne peut revenir sur sa décision', async () => {
    const a = await make('Refus');
    expect((await decide(a.key, user('remy'), 'rejected', 'Incomplet')).state).toBe('rejected');
    expect((await view(a.key, user('remy'))).canDecide).toBe(true);
    expect((await decide(a.key, user('remy'), 'approved', 'Corrigé')).state).toBe('pending');
  });

  it('liste les tickets qui attendent ma décision, à l’étape courante seulement, sous mes droits (widget « À approuver »)', async () => {
    const a = await make('À relire');
    const b = await make('Déjà relue');
    await decide(b.key, user('rita'), 'approved');
    const keys = async (x: Actor) => (await runAs(x.id, () => flows.awaiting(org, who(x)))).filter((r) => [a.key, b.key].includes(r.key)).map((r) => `${r.key}:${r.step}`).sort();
    expect(await keys(user('rita'))).toEqual([`${a.key}:Relecture technique`]); // b est passée à l'étape qualité
    expect(await keys(user('remy'))).toEqual([`${a.key}:Relecture technique`]);
    expect(await keys(qa)).toEqual([`${b.key}:Approbation qualité`]);
    expect(await keys(user('paul'))).toEqual([]); // non désigné
    await access.set(org, 'APR', { tracker: 'REQ', members: ['admin', 'qa'] }, admin);
    expect(await keys(user('rita'))).toEqual([]); // la liste d'ayants droit masque le ticket
    expect(await keys(qa)).toEqual([`${b.key}:Approbation qualité`]);
    await access.remove(org, 'APR', 'REQ', admin);
  });

  it('une modification de contenu invalide les décisions, avec message ; un champ hors contenu ou un changement de statut non', async () => {
    const a = await make('Invalidation');
    await decide(a.key, user('rita'), 'approved');
    await decide(a.key, qa, 'approved');
    expect((await view(a.key, admin)).state).toBe('approved');
    await artifacts.update(org, 'APR', a.key, { priority: 'haute' }, 1, admin); // priorité : hors contenu
    expect((await view(a.key, admin)).state).toBe('approved');
    await artifacts.transition(org, 'APR', a.key, 'Approuver', 2, admin);
    expect((await view(a.key, admin))).toMatchObject({ state: 'approved', invalidated: null });
    await artifacts.update(org, 'APR', a.key, { statement: 'texte modifié' }, 3, admin);
    const v = await view(a.key, admin);
    expect(v).toMatchObject({ state: 'pending', currentStep: 1 });
    expect(v.invalidated).toMatchObject({ version: 4, count: 2 });
    expect(v.steps.every((s) => s.decisions.length === 0)).toBe(true);
    // Les anciennes lignes sont conservées (historique), marquées invalidées.
    const kept = await db.tx(org, async (c) => (await c.query("select count(*)::int n from approval where object_type = 'item' and invalidated_at is not null and object_id = (select id from artifact where key = $1)", [a.key])).rows[0].n);
    expect(kept).toBe(2);
    // Le circuit repart : une nouvelle approbation efface le message.
    await decide(a.key, user('rita'), 'approved');
    expect((await view(a.key, admin)).invalidated).toBeNull();
  });

  it('plusieurs décisions requises : l’étape reste ouverte tant qu’il en manque', async () => {
    await flows.setFlow(org, 'APR', 'LIB', { enabled: true, steps: [{ name: 'Double relecture', kind: 'review', approvers: ['rita', 'remy', 'paul'], minApprovals: 2 }] }, admin);
    const a = await artifacts.create(org, 'APR', 'LIB', { title: 'Double', statement: 's' }, admin);
    expect((await decide(a.key, user('rita'), 'approved')).state).toBe('pending');
    expect((await decide(a.key, user('remy'), 'approved')).state).toBe('approved');
  });

  it('transition gardée par le validateur « approval » : refusée tant que le circuit n’est pas terminé', async () => {
    await db.tx(org, (c) => c.query(`update transition set validators = '[{"type":"approval"}]'::jsonb where name = 'Vérifier' and tracker_id = (select id from tracker where key = 'REQ')`));
    const a = await make('Gardée');
    await artifacts.transition(org, 'APR', a.key, 'Approuver', 1, admin);
    const refused = await artifacts.transition(org, 'APR', a.key, 'Vérifier', 2, admin).then(() => null, (e: unknown) => e as DomainError);
    expect(refused).toBeInstanceOf(DomainError);
    expect(refused?.code).toBe('validation');
    expect(refused?.details.join(' ')).toMatch(/approbation requise/);
    await decide(a.key, user('rita'), 'approved');
    await decide(a.key, qa, 'approved');
    expect(await code(artifacts.transition(org, 'APR', a.key, 'Vérifier', 2, admin))).toBe('ok');
  });

  it('circuit désactivé ou modifié : plus rien d’exigé, décisions en cours invalidées ; tout est audité dans la chaîne', async () => {
    const a = await make('Circuit modifié');
    await decide(a.key, user('rita'), 'approved');
    await flows.setFlow(org, 'APR', 'REQ', { ...circuit, enabled: false }, admin);
    expect((await view(a.key, admin)).state).toBe('not_required');
    await flows.setFlow(org, 'APR', 'REQ', circuit, admin);
    expect((await view(a.key, user('rita'))).steps[0]!.decisions).toEqual([]);
    const rows = await db.tx(org, async (c) => (await c.query("select action, hash, prev_hash from audit_log where action like 'approval.%' order by seq")).rows, { system: true });
    expect(rows.map((r) => r.action as string)).toEqual(expect.arrayContaining(['approval.flow_set', 'approval.item.approved', 'approval.item.rejected', 'approval.invalidated']));
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.hash as string))).toBe(true); // entrées chaînées par hachage
    expect(rows.slice(1).every((r) => r.prev_hash !== null)).toBe(true);
  });

  it('validation du circuit : personnes inconnues, étape sans approbateur, minimum trop élevé', async () => {
    const bad = (steps: unknown) => flows.setFlow(org, 'APR', 'REQ', { enabled: true, steps } as FlowInput, admin);
    const failure = await bad([{ name: 'X', kind: 'review', approvers: ['inconnu'], minApprovals: 1 }]).then(() => null, (e: unknown) => e as DomainError);
    expect(failure).toBeInstanceOf(DomainError);
    expect(failure?.details.join(' ')).toMatch(/inconnu/);
    const { FlowInput: schema } = await import('./item-approval.service');
    expect(schema.safeParse({ enabled: true, steps: [{ name: 'X', kind: 'review', approvers: [], minApprovals: 1 }] }).success).toBe(false);
    expect(schema.safeParse({ enabled: true, steps: [{ name: 'X', kind: 'review', approvers: ['rita'], minApprovals: 2 }] }).success).toBe(false);
    expect(schema.safeParse({ enabled: true, steps: [{ name: 'X', kind: 'approval', role: 'athena-qa', minApprovals: 3 }] }).success).toBe(true);
  });

  it('notifications : abonnés avertis des décisions, approbateurs nommés avertis de l’ouverture de leur étape et des invalidations', async () => {
    await flows.setFlow(org, 'APR', 'REQ', { enabled: true, steps: [
      { name: 'Relecture', kind: 'review', approvers: ['rita'], minApprovals: 1 },
      { name: 'Validation', kind: 'approval', approvers: ['remy'], minApprovals: 1 },
    ] }, admin);
    const a = await make('Notifiée');
    await runAs('paul', () => notify.subscribe(org, 'paul', 'APR', { scope: 'item', ref: a.key }));
    await decide(a.key, user('rita'), 'approved', 'ok');
    const inbox = (s: string) => runAs(s, () => notify.list(org, s, { event: 'approval' })).then((r) => r.items.filter((n) => n.key === a.key));
    expect((await inbox('paul')).map((n) => n.payload['decision'])).toContain('approved');
    expect((await inbox('remy')).map((n) => n.payload['opened'])).toEqual(['Validation']);
    await artifacts.update(org, 'APR', a.key, { statement: 'autre' }, 1, admin);
    expect((await inbox('rita')).some((n) => n.payload['invalidated'] === true)).toBe(true);
  });

  it('droits : la liste d’ayants droit du tracker masque le circuit et ses décisions', async () => {
    const a = await make('Confidentielle');
    await decide(a.key, user('rita'), 'approved');
    await access.set(org, 'APR', { tracker: 'REQ', members: ['admin', 'qa'] }, admin);
    expect(await code(runAs('paul', () => flows.get(org, 'APR', a.key, { subject: 'paul', roles: ['athena-team-member'] })))).toMatch(/^not_found/);
    const seen = await runAs('paul', () => db.tx(org, async (c) => (await c.query("select count(*)::int n from approval where object_type = 'item' and object_id = (select id from artifact where key = $1)", [a.key])).rows[0].n));
    expect(seen).toBe(0);
    await access.remove(org, 'APR', 'REQ', admin);
  });

  it('les approbations de baselines et de jalons (T-0080) continuent de fonctionner à côté des items', async () => {
    await db.tx(org, (c) => c.query("insert into baseline (organization_id, project_id, name, git_tag, git_sha, created_by) select organization_id, id, 'B1', 'baseline/B1', 'abc1234', 'admin' from project where key = 'APR'"));
    await baselines.setRequired(org, 'APR', 'baseline', 'B1', true, admin);
    const out = await baselines.decide(org, 'APR', 'baseline', 'B1', { decision: 'approved', comment: 'ok' }, { id: 'qa', name: 'QA' }, qa);
    expect(out.state).toBe('approved');
    const again = await baselines.decide(org, 'APR', 'baseline', 'B1', { decision: 'rejected', comment: 'revu' }, { id: 'qa', name: 'QA' }, qa);
    expect(again.state).toBe('rejected');
    expect(again.decisions).toHaveLength(1); // la décision du même approbateur est remplacée
  });
});
