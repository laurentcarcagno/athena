import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { ReportService } from '../agile/report.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { DeliveryService } from './delivery';
import { GitCodeService } from './gitcode.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-team-member', 'athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('déploiements, rétroportages, DORA et notes de version (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let gitCode: GitCodeService;
  let delivery: DeliveryService;
  let reports: ReportService;
  let trackers: TrackerService;
  const org = crypto.randomUUID();
  const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  const mr = (iid: number, state: string, key: string, extra: Record<string, unknown> = {}) => ({
    object_kind: 'merge_request' as const, user: { email: 'dev@example.test' },
    object_attributes: { iid, title: `Fixes ${key}`, description: '', state, source_branch: `bugfix/${key}-x`, target_branch: 'main', ...extra },
  });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_delivery');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    gitCode = new GitCodeService(db, artifacts);
    delivery = new DeliveryService(db);
    reports = new ReportService(db);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'dlv']);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-dev','dev','Dev','dev@example.test')", [org]);
    });
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    for (const n of [1, 2, 3]) await artifacts.create(org, 'ARI', 'BUG', { title: `Bug ${n}`, severity: 'majeure', assignee: 'sub-dev', root_cause: 'cause' }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('enregistre la fusion puis marque le déploiement de production sur la merge request', async () => {
    await gitCode.handle(org, 'ARI', mr(7, 'opened', 'ARI-BUG-0001'));
    await gitCode.handle(org, 'ARI', mr(7, 'merged', 'ARI-BUG-0001', { merge_commit_sha: SHA, merged_at: new Date().toISOString() }));
    const none = await gitCode.handle(org, 'ARI', { object_kind: 'deployment', status: 'failed', environment: 'production', short_sha: SHA.slice(0, 8) });
    expect(none).toEqual([]);
    const staging = await gitCode.handle(org, 'ARI', { object_kind: 'deployment', status: 'success', environment: 'staging', short_sha: SHA.slice(0, 8) });
    expect(staging).toEqual([{ key: 'ARI-BUG-0001', outcome: 'linked', detail: 'déployé : staging' }]);
    expect(await gitCode.handle(org, 'ARI', { object_kind: 'deployment', status: 'success', environment: 'production', short_sha: SHA.slice(0, 8) })).toEqual([]); // déjà daté par staging : pas de second déploiement
  });

  it('transitionne à la livraison en production seulement si le workflow l’autorise', async () => {
    await gitCode.handle(org, 'ARI', mr(8, 'opened', 'ARI-BUG-0002'));
    await gitCode.handle(org, 'ARI', mr(8, 'merged', 'ARI-BUG-0002', { merge_commit_sha: 'b'.repeat(40) }));
    const results = await gitCode.handle(org, 'ARI', { object_kind: 'deployment', status: 'success', environment: 'production', short_sha: 'bbbbbbbb' });
    expect(results[0]).toMatchObject({ key: 'ARI-BUG-0002', detail: 'déployé : production' });
    // « Livrer » est réservée aux administrateurs : le déploiement, sans cette identité, ne la contourne pas.
    expect(results.some((r) => r.outcome === 'transitioned')).toBe(false);
    expect((await artifacts.get(org, 'ARI', 'ARI-BUG-0002')).status).not.toBe('delivered');
  });

  it('planifie des rétroportages, bloque la transition tant qu’ils sont en attente, puis les solde à la fusion', async () => {
    await trackers.addTransition(org, 'ARI', 'BUG', { name: 'Clore', from: null, to: 'delivered', validators: [{ type: 'backports_done' }] }, admin);
    expect(await code(delivery.planBackports(org, 'ARI', 'ARI-BUG-0003', ['main'], admin))).toMatch(/validation/);
    const planned = await delivery.planBackports(org, 'ARI', 'ARI-BUG-0003', ['release/1.2', 'release/1.1'], admin);
    expect(planned.map((b) => [b.branch, b.state])).toEqual([['release/1.1', 'pending'], ['release/1.2', 'pending']]);
    const art = await artifacts.get(org, 'ARI', 'ARI-BUG-0003');
    expect(await code(artifacts.transition(org, 'ARI', 'ARI-BUG-0003', 'Clore', art.version, admin))).toMatch(/validation.*rétroportages en attente : release\/1\.1, release\/1\.2/);

    await gitCode.handle(org, 'ARI', mr(21, 'opened', 'ARI-BUG-0003', { target_branch: 'release/1.2' }));
    await gitCode.handle(org, 'ARI', mr(21, 'merged', 'ARI-BUG-0003', { target_branch: 'release/1.2', merge_commit_sha: 'c'.repeat(40) }));
    expect((await delivery.backports(org, 'ARI', 'ARI-BUG-0003')).find((b) => b.branch === 'release/1.2')).toMatchObject({ state: 'done', mr: '21' });
    await delivery.cancelBackport(org, 'ARI', 'ARI-BUG-0003', 'release/1.1', admin); // branche non concernée, abandon audité
    expect(await code(delivery.cancelBackport(org, 'ARI', 'ARI-BUG-0003', 'release/1.2', admin))).toMatch(/conflict/); // déjà terminé
    const closed = await artifacts.transition(org, 'ARI', 'ARI-BUG-0003', 'Clore', art.version, admin);
    expect(closed.status).toBe('delivered');
  });

  it('calcule fréquence de déploiement, délai, taux d’échec et temps de rétablissement', async () => {
    await testDb.exec("update code_ref set created_at = deployed_at - interval '10 hours' where deployed_at is not null");
    await testDb.exec("update code_ref set environment = 'production' where deployed_at is not null");
    await gitCode.handle(org, 'ARI', { object_kind: 'push', ref: 'refs/heads/main', commits: [{ id: 'd'.repeat(40), message: 'Revert du correctif\n\nReverts ARI-BUG-0001', author: { email: 'dev@example.test' } }] });
    const dora = await delivery.dora(org, 'ARI', 30, 'BUG');
    expect(dora).toMatchObject({ windowDays: 30, deployments: 2, deploymentFrequency: 0.07, leadTimeHours: 10, changeFailureRate: 0.5 });
    expect(dora.mttrHours).not.toBeNull();
    expect(await code(delivery.dora(org, 'ARI', 0))).toMatch(/validation/);
  });

  it('génère des notes de version déterministes depuis une release', async () => {
    const release = await reports.createRelease(org, 'ARI', { name: '1.2', startsOn: '2026-10-01', endsOn: '2026-10-31' }, admin);
    for (const k of ['ARI-BUG-0003', 'ARI-BUG-0001', 'ARI-BUG-0002']) await reports.assign(org, 'ARI', release, k, admin);
    const notes = await delivery.releaseNotes(org, 'ARI', release);
    expect(notes).toBe(
      ['# Notes de version — 1.2', '', 'Période : 2026-10-01 → 2026-10-31 · état : planned', '', '## Bugs', '',
        '- ARI-BUG-0001 — Bug 1 _(En cours)_', '- ARI-BUG-0002 — Bug 2 _(Ouvert)_', '- ARI-BUG-0003 — Bug 3', ''].join('\n'),
    );
    expect(await delivery.releaseNotes(org, 'ARI', release)).toBe(notes);
    expect(await code(delivery.releaseNotes(org, 'ARI', crypto.randomUUID()))).toMatch(/not_found/);
  });
});
