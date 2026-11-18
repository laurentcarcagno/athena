import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { applyHardening, PgRateStore } from './hardening';

const suite = pgUp ? describe : describe.skip;

async function app(store?: PgRateStore, perMinute = 3) {
  const fastify = Fastify();
  applyHardening(fastify, { apiPerMinute: perMinute, sensitivePerMinute: 2, hsts: false, ...(store ? { store } : {}) });
  fastify.get('/v1/x', async () => ({ ok: true }));
  await fastify.ready();
  return fastify;
}
const call = (f: Awaited<ReturnType<typeof app>>, headers: Record<string, string> = {}, ip = '10.0.0.1') => f.inject({ method: 'GET', url: '/v1/x', headers, remoteAddress: ip }).then((r) => r.statusCode);

describe('limitation par jeton (en mémoire)', () => {
  it('un client qui change d’adresse reste limité par son jeton ; un autre jeton a sa propre limite', async () => {
    const f = await app();
    const bearer = { authorization: 'Bearer athp_jeton-de-test-A' };
    expect([await call(f, bearer, '10.0.0.1'), await call(f, bearer, '10.0.0.2'), await call(f, bearer, '10.0.0.3'), await call(f, bearer, '10.0.0.4')]).toEqual([200, 200, 200, 429]);
    expect(await call(f, { authorization: 'Bearer athp_jeton-de-test-B' }, '10.0.0.5')).toBe(200);
  });
});

suite('limitation partagée entre instances (PostgreSQL)', () => {
  let testDb: TestDb;
  beforeAll(async () => { testDb = await createTestDb('athena_test_rate'); });
  afterAll(async () => { await testDb?.drop(); });

  it('deux instances d’API partagent le même compteur : la limite n’est plus multipliée', async () => {
    const a = await app(new PgRateStore(testDb.pool as never));
    const b = await app(new PgRateStore(testDb.pool as never));
    const codes = [await call(a), await call(b), await call(a), await call(b), await call(a)];
    expect(codes).toEqual([200, 200, 200, 429, 429]); // 3 requêtes par minute au total, quelle que soit l'instance
  });

  it('en cas d’indisponibilité de la base, les requêtes passent (échec ouvert)', async () => {
    const down = { query: async () => { throw new Error('base indisponible'); } };
    const f = await app(new PgRateStore(down as never));
    expect(await call(f)).toBe(200);
  });
});
