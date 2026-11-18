import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ReconcileService } from './reconcile';
import type { PushPayload } from './reverse-sync';

const suite = pgUp ? describe : describe.skip;

/** GitLab simulé : un seul dépôt, une branche dont on fait avancer le sommet ; `compare` renvoie les commits et fichiers entre deux sommets. */
class FakeGitLab {
  head = 'sha-1';
  commits: Array<{ id: string; message: string; files: string[] }> = [];
  async findRepository(path: string) { return path.endsWith('/athena-history-rec-ari') ? 42 : null; }
  async branchHead() { return this.head; }
  async compare(_id: number, from: string) {
    const start = this.commits.findIndex((c) => c.id === from);
    const range = this.commits.slice(start + 1);
    return { commits: range.map((c) => ({ id: c.id, message: c.message })), diffs: range.flatMap((c) => c.files.map((f) => ({ new_path: f, deleted_file: false }))) };
  }
  push(id: string, message: string, files: string[]) { this.commits.push({ id, message, files }); this.head = id; }
}

suite('réconciliation périodique GitLab (plan § 17.2)', () => {
  let testDb: TestDb; let db: Db;
  const org = crypto.randomUUID(); const ari = crypto.randomUUID(); const other = crypto.randomUUID();
  const gitlab = new FakeGitLab();
  const pushes: Array<{ project: string; payload: PushPayload }> = [];
  const reverse = { handlePush: async (_o: string, project: string, payload: PushPayload) => { pushes.push({ project, payload }); return [{ commit: 'x', path: 'p', outcome: 'imported' as const }]; } };
  let service: ReconcileService;

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_reconcile');
    db = new Db(testDb.pool);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'rec','Rec')", [org]);
      await c.query("insert into project (id, organization_id, key, name) values ($1,$3,'ARI','Ariane'), ($2,$3,'SANS','Sans dépôt')", [ari, other, org]);
    });
    gitlab.commits = [{ id: 'sha-1', message: 'initial', files: [] }];
    service = new ReconcileService(testDb.pool as never, gitlab as never, 'ns', reverse as never);
  });
  afterAll(async () => { await testDb?.drop(); });

  const run = async () => (await service.reconcileOrganization(org)).find((r) => r.project === 'ARI')!;
  const cursor = async () => (await db.tx(org, (c) => c.query('select head_sha, last_result, replayed from history_sync_cursor where project_id = $1', [ari]), { system: true })).rows[0];

  it('premier passage : mémorise le sommet sans rien rejouer ; un projet sans dépôt est ignoré', async () => {
    const all = await service.reconcileOrganization(org);
    expect(all.find((r) => r.project === 'ARI')!.outcome).toBe('initialized');
    expect(all.find((r) => r.project === 'SANS')!.outcome).toBe('no_repository');
    expect(await cursor()).toMatchObject({ head_sha: 'sha-1', last_result: 'initialized' });
    expect(pushes).toHaveLength(0);
  });

  it('sommet inchangé : rien à faire', async () => {
    expect((await run()).outcome).toBe('in_sync');
    expect(pushes).toHaveLength(0);
  });

  it('commits d’Athena seulement : le curseur avance, rien n’est rejoué', async () => {
    gitlab.push('sha-2', 'ARI-BUG-0001: statut\n\nAthena-Event-Id: e1', ['trackers/BUG/artifacts/ARI-BUG-0001.yaml']);
    expect((await run()).outcome).toBe('in_sync');
    expect(pushes).toHaveLength(0);
    expect((await cursor()).head_sha).toBe('sha-2');
  });

  it('commit externe manqué par le webhook : rejoué comme une poussée, une seule fois', async () => {
    gitlab.push('sha-3', 'correction à la main', ['trackers/BUG/artifacts/ARI-BUG-0001.yaml', 'README.md', 'trackers/BUG/tracker.yaml']);
    const r = await run();
    expect(r).toMatchObject({ outcome: 'replayed', files: 1 });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.project).toBe('ARI');
    expect(pushes[0]!.payload.commits![0]).toMatchObject({ id: 'sha-3', message: 'correction à la main', modified: ['trackers/BUG/artifacts/ARI-BUG-0001.yaml'] }); // seuls les tickets sont rejoués
    expect(await cursor()).toMatchObject({ head_sha: 'sha-3', last_result: 'replayed', replayed: 1 });
    expect((await run()).outcome).toBe('in_sync'); // idempotent
    expect(pushes).toHaveLength(1);
  });

  it('une erreur de GitLab n’interrompt pas les autres projets et laisse le curseur intact', async () => {
    const broken = new ReconcileService(testDb.pool as never, { findRepository: async () => { throw new Error('GitLab indisponible'); } } as never, 'ns', reverse as never);
    const all = await broken.reconcileOrganization(org);
    expect(all.every((r) => r.outcome === 'failed')).toBe(true);
    expect((await cursor()).head_sha).toBe('sha-3');
  });
});
