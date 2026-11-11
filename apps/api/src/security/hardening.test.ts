import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { applyHardening, RateLimiter } from './hardening';

describe('limiteur de débit', () => {
  it('autorise jusqu’à la limite puis refuse, et repart à la fenêtre suivante', () => {
    const limiter = new RateLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => limiter.hit('a', 0).allowed)).toEqual([true, true, true, false]);
    expect(limiter.hit('a', 500)).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    expect(limiter.hit('a', 1000).allowed).toBe(true);
    expect(limiter.hit('b', 0).allowed).toBe(true); // clients indépendants
  });
  it('borne la mémoire face à de nombreuses clés', () => {
    const limiter = new RateLimiter(5, 1000, 100);
    for (let i = 0; i < 10_000; i++) limiter.hit(`ip-${i}`, 0);
    expect((limiter as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(100);
  });
});

describe('durcissement HTTP', () => {
  async function app(options = { apiPerMinute: 5, sensitivePerMinute: 2, hsts: true }) {
    const fastify = Fastify();
    applyHardening(fastify, options);
    fastify.get('/healthz', async () => ({ ok: true }));
    fastify.get('/v1/x', async () => ({ ok: true }));
    fastify.post('/auth/logout', async () => ({ ok: true }));
    fastify.post('/hooks/in/gitlab/o/P', async () => ({ ok: true }));
    await fastify.ready();
    return fastify;
  }

  it('pose les en-têtes de sécurité sur toutes les réponses', async () => {
    const response = await (await app()).inject({ method: 'GET', url: '/v1/x' });
    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'cross-origin-resource-policy': 'same-origin',
    });
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    const noHsts = await (await app({ apiPerMinute: 5, sensitivePerMinute: 2, hsts: false })).inject({ method: 'GET', url: '/v1/x' });
    expect(noHsts.headers['strict-transport-security']).toBeUndefined();
  });

  it('garde la politique propre à une route (fichier en bac à sable, image en cache) et la complète de frame-ancestors (T-0137)', async () => {
    const fastify = Fastify();
    applyHardening(fastify, { apiPerMinute: 50, sensitivePerMinute: 5, hsts: false });
    fastify.get('/v1/fichier', async (_req, reply) => {
      void reply.header('content-security-policy', "sandbox; default-src 'none'");
      void reply.header('cache-control', 'private, max-age=300');
      return 'x';
    });
    await fastify.ready();
    const response = await fastify.inject({ method: 'GET', url: '/v1/fichier' });
    expect(response.headers['content-security-policy']).toBe("sandbox; default-src 'none'; frame-ancestors 'none'");
    expect(response.headers['cache-control']).toBe('private, max-age=300');
  });

  it('limite l’API, plus strictement les routes d’authentification et de webhooks, jamais la sonde de santé', async () => {
    const fastify = await app();
    const codes = async (method: 'GET' | 'POST', url: string, n: number) => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) out.push((await fastify.inject({ method, url })).statusCode);
      return out;
    };
    expect(await codes('GET', '/v1/x', 7)).toEqual([200, 200, 200, 200, 200, 429, 429]);
    expect(await codes('POST', '/auth/logout', 3)).toEqual([200, 200, 429]);
    expect(await codes('POST', '/hooks/in/gitlab/o/P', 2)).toEqual([429, 429]); // /auth et /hooks partagent le seau « sensible » du client
    const other = await app();
    expect(await Promise.all([1, 2, 3].map(() => other.inject({ method: 'POST', url: '/hooks/in/gitlab/o/P' }).then((r) => r.statusCode)))).toEqual([200, 200, 429]);
    expect((await codes('GET', '/healthz', 20)).every((c) => c === 200)).toBe(true);
    const limited = await fastify.inject({ method: 'GET', url: '/v1/x' });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.json()).toMatchObject({ error: 'rate_limited' });
    expect(limited.headers['x-content-type-options']).toBe('nosniff'); // les réponses 429 portent aussi les en-têtes
  });
});
