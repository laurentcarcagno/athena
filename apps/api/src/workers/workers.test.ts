import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PgSessionStore } from '../auth/session';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { WebhookService, type SecretStore } from '../webhooks/webhook.service';
import { WorkerLoop } from './loop';
import { buildWorkers, healthServer, webhookCycle } from './tasks';

describe('boucle de worker', () => {
  it('tolère les erreurs, recule puis revient à la normale', async () => {
    let calls = 0;
    const loop = new WorkerLoop('test', async () => { calls++; if (calls <= 2) throw new Error('panne'); }, { intervalMs: 1000, maxBackoffMs: 4000 });
    await loop.runOnce();
    expect(loop.stats).toMatchObject({ runs: 1, failures: 1, consecutiveFailures: 1, lastError: 'panne' });
    await loop.runOnce();
    expect(loop.stats.consecutiveFailures).toBe(2);
    expect((loop as unknown as { delay(): number }).delay()).toBe(4000); // 1000 × 2², plafonné
    await loop.runOnce();
    expect(loop.stats).toMatchObject({ runs: 3, failures: 2, consecutiveFailures: 0, lastError: null });
    expect((loop as unknown as { delay(): number }).delay()).toBe(1000);
  });

  it('boucle jusqu’à l’arrêt et s’arrête proprement sans attendre l’intervalle', async () => {
    vi.useFakeTimers();
    let runs = 0;
    const loop = new WorkerLoop('periodique', async () => { runs++; }, { intervalMs: 100 });
    loop.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(runs).toBeGreaterThanOrEqual(3);
    const stopped = loop.stop();
    await vi.advanceTimersByTimeAsync(0);
    await stopped;
    const after = runs;
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toBe(after);
    vi.useRealTimers();
  });

  it('expose une sonde de santé qui passe en 503 après des échecs continus', async () => {
    const loop = new WorkerLoop('casse', async () => { throw new Error('x'); }, { intervalMs: 1000 });
    const server = healthServer([loop], 0);
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/healthz`;
    expect((await fetch(url)).status).toBe(200);
    for (let i = 0; i < 5; i++) await loop.runOnce();
    const response = await fetch(url);
    expect(response.status).toBe(503);
    expect((await response.json()).loops[0]).toMatchObject({ name: 'casse', consecutiveFailures: 5 });
    server.close();
  });
});

const suite = pgUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };
class MemorySecrets implements SecretStore {
  readonly data = new Map<string, Record<string, string>>();
  async put(path: string, d: Record<string, string>) { this.data.set(path, d); }
  async get(path: string) { return this.data.get(path) ?? null; }
}

suite('tâches du worker (intégration)', () => {
  let testDb: TestDb;
  let receiver: http.Server;
  const received: string[] = [];
  const orgs = [crypto.randomUUID(), crypto.randomUUID()];
  let service: WebhookService;
  let artifacts: ArtifactService;
  let url = '';

  beforeAll(async () => {
    receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => { received.push(JSON.parse(Buffer.concat(chunks).toString()).organization); res.end('ok'); });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;

    testDb = await createTestDb('athena_test_workers');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    service = new WebhookService(testDb.pool, new MemorySecrets(), { allowPrivate: true, backoffMs: () => 0 });
    for (const [i, org] of orgs.entries()) {
      await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, `org${i}`]));
      await trackers.createProject(org, 'ARI', 'Ariane', actor);
      await trackers.createTracker(org, bugTemplate('ARI'), actor);
      await service.createEndpoint(org, { url, eventTypes: ['artifact.created'] }, actor);
      await artifacts.create(org, 'ARI', 'BUG', { title: `Bug de ${i}`, severity: 'majeure' }, actor);
    }
  }, 60_000);
  afterAll(async () => {
    await new Promise((resolve) => receiver.close(resolve));
    await testDb?.drop();
  });

  it('livre les webhooks de toutes les organisations en un cycle, sans mélange', async () => {
    const result = await webhookCycle(testDb.pool, service);
    expect(result).toEqual({ queued: 2, delivered: 2, failed: 0 });
    expect(received.sort()).toEqual(['org0', 'org1']);
    expect(await webhookCycle(testDb.pool, service)).toEqual({ queued: 0, delivered: 0, failed: 0 });
  });

  it('purge les sessions expirées et conserve les valides', async () => {
    const store = new PgSessionStore(testDb.pool);
    const principal = { subject: 's', username: 'u', roles: [], groups: [] };
    const valid = await store.create(principal, 3600);
    const expired = await store.create(principal, -10);
    const workers = buildWorkers({ pool: testDb.pool }, { historyMs: 1000, webhooksMs: 1000, sessionsMs: 10_000 });
    expect(workers.map((w) => w.name)).toEqual(['sessions']); // historique et webhooks non configurés : non démarrés
    await workers[0]!.runOnce();
    expect(await store.get(valid)).not.toBeNull();
    expect(await store.get(expired)).toBeNull();
    expect((await testDb.pool.query('select count(*)::int n from web_session')).rows[0].n).toBe(1);
  });

  it('assemble les boucles configurées', () => {
    const workers = buildWorkers({ pool: testDb.pool, webhooks: service }, { historyMs: 1000, webhooksMs: 1000, sessionsMs: 10_000 });
    expect(workers.map((w) => w.name)).toEqual(['webhooks', 'sessions']);
  });
});
