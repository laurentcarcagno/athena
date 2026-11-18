import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MetricsController } from './metrics.controller';
import { MetricsRegistry, applyMetrics, traceContext } from './metrics';

describe('registre de métriques Prometheus', () => {
  it('compteurs et histogrammes au format texte, étiquettes triées et échappées', () => {
    const r = new MetricsRegistry();
    r.inc('athena_http_requests_total', { route: '/v1/x', method: 'GET', status: '2xx' });
    r.inc('athena_http_requests_total', { route: '/v1/x', method: 'GET', status: '2xx' });
    r.observe('athena_http_request_duration_seconds', 0.03, { method: 'GET', route: '/v1/x' });
    r.observe('athena_http_request_duration_seconds', 3, { method: 'GET', route: '/v1/x' });
    const text = r.render([{ name: 'athena_outbox_backlog', help: 'File', value: 4 }]);
    expect(text).toContain('# TYPE athena_http_requests_total counter');
    expect(text).toContain('athena_http_requests_total{method="GET",route="/v1/x",status="2xx"} 2');
    expect(text).toContain('athena_http_request_duration_seconds_bucket{method="GET",route="/v1/x",le="0.05"} 1');
    expect(text).toContain('athena_http_request_duration_seconds_bucket{method="GET",route="/v1/x",le="+Inf"} 2');
    expect(text).toContain('athena_http_request_duration_seconds_count{method="GET",route="/v1/x"} 2');
    expect(text).toContain('athena_outbox_backlog 4');
  });

  it('le nombre de séries est borné : une série de plus est ignorée, la mémoire ne croît pas sans fin', () => {
    const r = new MetricsRegistry();
    for (let i = 0; i < 2_500; i++) r.inc('athena_x', { id: String(i) });
    expect(r.render().split('\n').filter((l) => l.startsWith('athena_x{')).length).toBe(2_000);
  });

  it('une valeur d’étiquette hostile ne casse pas le format', () => {
    const r = new MetricsRegistry();
    r.inc('athena_y', { route: 'a"b\nc' });
    expect(r.render()).toContain('athena_y{route="a\\"b\\nc"} 1');
  });
});

describe('trace W3C et mesure des routes', () => {
  it('reprend un traceparent valide, en génère un sinon, refuse l’identifiant nul', () => {
    const ok = traceContext('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(ok.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(ok.spanId).not.toBe('00f067aa0ba902b7'); // un nouveau tronçon par service
    expect(ok.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
    expect(traceContext('n’importe quoi').traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceContext('00-' + '0'.repeat(32) + '-00f067aa0ba902b7-01').traceId).not.toBe('0'.repeat(32));
    expect(traceContext(undefined).traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('le hook compte par motif de route (jamais le chemin reçu), ignore /metrics et /healthz, renvoie la trace', async () => {
    const r = new MetricsRegistry();
    const hooks: Record<string, (req: any, reply: any) => Promise<void>> = {};
    applyMetrics({ addHook: (name: string, fn: any) => { hooks[name] = fn; } } as never, r);
    const headers: Record<string, string> = {};
    const reply = { header: (k: string, v: string) => { headers[k] = v; }, statusCode: 404, elapsedTime: 12 };
    const request = { headers: {}, method: 'GET', routeOptions: { url: '/v1/projects/:project' }, url: '/v1/projects/SECRET-123' };
    await hooks['onRequest']!(request, reply);
    await hooks['onResponse']!(request, reply);
    await hooks['onResponse']!({ ...request, routeOptions: { url: '/metrics' } }, reply);
    await hooks['onResponse']!({ ...request, routeOptions: { url: '/healthz' } }, reply);
    const text = r.render();
    expect(text).toContain('athena_http_requests_total{method="GET",route="/v1/projects/:project",status="4xx"} 1');
    expect(text).not.toContain('SECRET-123');
    expect(text).not.toContain('route="/metrics"');
    expect(headers['traceparent']).toMatch(/^00-/);
    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('GET /metrics', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env['DATABASE_URL'] = 'postgres://x'; process.env['KEYCLOAK_ISSUER'] = 'http://kc/realms/a'; });
  afterEach(() => { process.env = { ...saved }; });
  const failingPool = { query: async () => { throw new Error('base indisponible'); } } as never;

  it('désactivée (404) sans METRICS_TOKEN', async () => {
    delete process.env['METRICS_TOKEN'];
    await expect(new MetricsController(failingPool).scrape('Bearer n-importe-quoi-123456')).rejects.toMatchObject({ status: 404 });
  });
  it('refuse un jeton absent ou faux (401), accepte le bon et signale une base indisponible sans échouer', async () => {
    process.env['METRICS_TOKEN'] = 'jeton-de-test-0123456789';
    const c = new MetricsController(failingPool);
    await expect(c.scrape(undefined)).rejects.toMatchObject({ status: 401 });
    await expect(c.scrape('Bearer faux')).rejects.toMatchObject({ status: 401 });
    const text = await c.scrape('Bearer jeton-de-test-0123456789');
    expect(text).toContain('athena_up 1');
    expect(text).toContain('athena_scrape_errors 1');
  });
});

import { afterAll, beforeAll } from 'vitest';
import { Db } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';

(pgUp ? describe : describe.skip)('GET /metrics : jauges métier (intégration)', () => {
  let testDb: TestDb;
  const org = crypto.randomUUID();
  const saved = { ...process.env };
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_metrics');
    process.env['DATABASE_URL'] = 'postgres://x'; process.env['KEYCLOAK_ISSUER'] = 'http://kc/realms/a'; process.env['METRICS_TOKEN'] = 'jeton-de-test-0123456789';
    const db = new Db(testDb.pool);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'mt','mt')", [org]);
      await c.query("insert into outbox_event (organization_id, aggregate_type, aggregate_id, type, payload, created_at) values ($1,'x',gen_random_uuid(),'t','{}', now() - interval '90 seconds'), ($1,'x',gen_random_uuid(),'t','{}', now())", [org]);
    });
  });
  afterAll(async () => { process.env = { ...saved }; await testDb?.drop(); });

  it('retard de l’outbox : nombre d’événements non publiés et âge du plus ancien', async () => {
    const text = await new MetricsController(testDb.pool as never).scrape('Bearer jeton-de-test-0123456789');
    expect(text).toContain('athena_outbox_backlog 2');
    expect(text).toMatch(/athena_outbox_oldest_age_seconds (9\d|1\d\d)\n/);
    expect(text).toContain('athena_webhook_deliveries{status="failed"} 0');
  });
});
