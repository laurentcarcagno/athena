import { describe, expect, it } from 'vitest';
import { AthenaClient, AthenaError } from './client.js';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
const make = (status = 200, payload: unknown = { ok: true }) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: URL, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, ...(init.body ? { body: init.body } : {}) });
    return new Response(status === 204 ? null : JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { client: new AthenaClient({ baseUrl: 'https://athena.test', token: 'athp_secret', fetch: fetchImpl }), calls };
};

describe('SDK TypeScript généré', () => {
  it('appelle une route avec paramètre de chemin, jeton porteur et requête', async () => {
    const { client, calls } = make();
    await client.pat.list();
    expect(calls[0]).toMatchObject({ url: 'https://athena.test/v1/me/tokens', method: 'GET' });
    expect(calls[0]!.headers['Authorization']).toBe('Bearer athp_secret');
    await client.search.search({ q: 'status = Open', limit: 10, vide: undefined });
    expect(calls[1]!.url).toBe('https://athena.test/v1/search?q=status+%3D+Open&limit=10');
  });

  it('envoie un corps JSON typé, encode les paramètres de chemin', async () => {
    const { client, calls } = make(201, { token: 'athp_x' });
    const r = await client.pat.create({ name: 'CI', scope: 'read', expiresInDays: 30 });
    expect(r).toEqual({ token: 'athp_x' });
    expect(calls[0]).toMatchObject({ method: 'POST', body: JSON.stringify({ name: 'CI', scope: 'read', expiresInDays: 30 }) });
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
    await client.pat.revoke({ id: 'a/b c' });
    expect(calls[1]!.url).toBe('https://athena.test/v1/me/tokens/a%2Fb%20c');
    expect(calls[1]!.method).toBe('DELETE');
  });

  it('lève AthenaError avec le statut et le corps pour une réponse non 2xx', async () => {
    const { client } = make(403, { error: 'forbidden', message: 'Droits insuffisants.' });
    const error = await client.pat.list().then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(AthenaError);
    expect((error as AthenaError).status).toBe(403);
    expect((error as AthenaError).body).toMatchObject({ error: 'forbidden' });
  });
});
