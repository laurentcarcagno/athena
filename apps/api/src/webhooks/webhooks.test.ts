import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { sign, verify } from './signing';
import { isPrivateAddress, safePost } from './ssrf';
import { matches, WebhookService, type SecretStore } from './webhook.service';

describe('signature HMAC', () => {
  const body = '{"a":1}';
  it('accepte une signature valide', () => {
    expect(verify('s3cret', sign('s3cret', body), body)).toBe(true);
  });
  it('refuse un corps modifié, un mauvais secret, un en-tête malformé', () => {
    const header = sign('s3cret', body);
    expect(verify('s3cret', header, '{"a":2}')).toBe(false);
    expect(verify('autre', header, body)).toBe(false);
    expect(verify('s3cret', 'n-importe-quoi', body)).toBe(false);
  });
  it('refuse le rejeu hors tolérance', () => {
    const header = sign('s3cret', body, new Date(Date.now() - 3_600_000));
    expect(verify('s3cret', header, body)).toBe(false);
    expect(verify('s3cret', header, body, 7200)).toBe(true);
  });
});

describe('protection SSRF', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])(
    'refuse %s',
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );
  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111'])('accepte %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );
  it('refuse HTTP et les destinations privées', async () => {
    await expect(safePost('http://example.com/', {}, '{}')).rejects.toThrow(/HTTPS/);
    await expect(safePost('https://127.0.0.1:9/', {}, '{}')).rejects.toThrow(/SSRF/);
    await expect(safePost('https://localhost:9/', {}, '{}')).rejects.toThrow(/SSRF/);
  });
});

describe('filtrage des types', () => {
  it('gère exact, préfixe et joker', () => {
    expect(matches(['artifact.created'], 'artifact.created')).toBe(true);
    expect(matches(['artifact.*'], 'artifact.updated')).toBe(true);
    expect(matches(['artifact.*'], 'comment.created')).toBe(false);
    expect(matches(['*'], 'x.y')).toBe(true);
    expect(matches(['artifact'], 'artifact.created')).toBe(false);
  });
});

const suite = pgUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };

class MemorySecrets implements SecretStore {
  readonly data = new Map<string, Record<string, string>>();
  async put(path: string, data: Record<string, string>) { this.data.set(path, data); }
  async get(path: string) { return this.data.get(path) ?? null; }
}

suite('livraison des webhooks (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let secrets: MemorySecrets;
  let service: WebhookService;
  let server: http.Server;
  let respondWith = 200;
  const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  const org = crypto.randomUUID();
  let url = '';

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (c: Buffer) => chunks.push(c));
      request.on('end', () => {
        received.push({ headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
        response.statusCode = respondWith;
        response.end('ok');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

    testDb = await createTestDb('athena_test_webhooks');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    secrets = new MemorySecrets();
    service = new WebhookService(testDb.pool, secrets, { allowPrivate: true, maxAttempts: 3, backoffMs: () => 0, disableAfterFailures: 1 });
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'hooks']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, bugTemplate('ARI'), actor);
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await testDb?.drop();
  });

  it('valide les abonnements', async () => {
    const strict = new WebhookService(testDb.pool, secrets);
    const error = await strict.createEndpoint(org, { url: 'http://exemple.org/x', eventTypes: ['artifact.*'] }, actor).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).details).toContain('HTTPS obligatoire');
    await expect(service.createEndpoint(org, { url, eventTypes: ['pas valide!'] }, actor)).rejects.toBeInstanceOf(DomainError);
  });

  it('livre un événement signé, une seule fois, selon le filtre', async () => {
    const { endpoint, secret } = await service.createEndpoint(org, { url, eventTypes: ['artifact.*'] }, actor);
    const other = await service.createEndpoint(org, { url, eventTypes: ['comment.*'] }, actor);
    expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(secrets.data.size).toBe(2); // secrets dans le coffre, jamais en base

    await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash', severity: 'majeure' }, actor);
    expect(await service.enqueue(org)).toBe(1);
    expect(await service.deliverDue(org)).toEqual({ delivered: 1, retried: 0, failed: 0 });

    expect(received).toHaveLength(1);
    const hit = received[0]!;
    expect(verify(secret, String(hit.headers['athena-signature']), hit.body)).toBe(true);
    expect(hit.headers['athena-event-type']).toBe('artifact.created');
    const payload = JSON.parse(hit.body);
    expect(payload).toMatchObject({ type: 'artifact.created', version: '1', organization: 'hooks', data: { key: 'BUG-1' } });

    expect(await service.enqueue(org)).toBe(0); // l'événement n'est plus en attente
    expect(await service.deliverDue(org)).toEqual({ delivered: 0, retried: 0, failed: 0 });
    expect((await service.deliveries(org, other.endpoint.id))).toHaveLength(0);
    expect((await service.deliveries(org, endpoint.id))[0]).toMatchObject({ status: 'delivered', attempts: 1, lastStatus: 200 });
  });

  const keepOnly = (id: string) =>
    new Db(testDb.pool).tx(org, (c) => c.query('update webhook_endpoint set active = (id = $1)', [id]));

  it('réessaie, abandonne, désactive le point de terminaison, puis permet le rejeu', async () => {
    const { endpoint } = await service.createEndpoint(org, { url, eventTypes: ['artifact.updated'] }, actor);
    await keepOnly(endpoint.id);
    respondWith = 500;
    await artifacts.update(org, 'ARI', 'BUG-1', { severity: 'bloquante' }, 1, actor);
    await service.enqueue(org);
    expect(await service.deliverDue(org)).toEqual({ delivered: 0, retried: 1, failed: 0 });
    expect(await service.deliverDue(org)).toEqual({ delivered: 0, retried: 1, failed: 0 });
    expect(await service.deliverDue(org)).toEqual({ delivered: 0, retried: 0, failed: 1 });
    const [delivery] = await service.deliveries(org, endpoint.id);
    expect(delivery).toMatchObject({ status: 'failed', attempts: 3, lastStatus: 500, lastError: 'HTTP 500' });
    expect((await service.listEndpoints(org)).find((e) => e.id === endpoint.id)?.active).toBe(false);

    respondWith = 200;
    const before = received.length;
    await service.setActive(org, endpoint.id, true, actor);
    await service.replay(org, delivery!.id, actor);
    expect(await service.deliverDue(org)).toEqual({ delivered: 1, retried: 0, failed: 0 });
    expect(received.length).toBe(before + 1);
    expect((await service.deliveries(org, endpoint.id))[0]).toMatchObject({ status: 'delivered', attempts: 1 });
  });

  it('bloque une destination privée quand allowPrivate est faux', async () => {
    const strict = new WebhookService(testDb.pool, secrets, { maxAttempts: 1 });
    const { endpoint } = await strict.createEndpoint(org, { url: 'https://127.0.0.1:9/hook', eventTypes: ['comment.*'] }, actor);
    await keepOnly(endpoint.id);
    await new Db(testDb.pool).tx(org, (c) =>
      c.query("insert into outbox_event (organization_id, aggregate_type, aggregate_id, type, payload) values ($1,'artifact',gen_random_uuid(),'comment.created','{}')", [org]),
    );
    await strict.enqueue(org);
    const result = await strict.deliverDue(org);
    expect(result.failed).toBe(1);
    expect((await strict.deliveries(org, endpoint.id))[0]!.lastError).toMatch(/SSRF/);
  });
});
