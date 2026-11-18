import { describe, expect, it } from 'vitest';
import { AppRoleToken, OpenBao, tokenSourceFromEnv, StaticToken } from './openbao';

type Call = { url: string; method: string; token: string | null; body: unknown };

/** OpenBao simulé : l'échange AppRole renvoie un jeton numéroté ; `revoke` rend le jeton courant invalide (403). */
function fakeBao(lease = 300) {
  const calls: Call[] = [];
  let issued = 0;
  let valid = '';
  const fetchImpl = (async (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => {
    const token = init.headers?.['X-Vault-Token'] ?? null;
    calls.push({ url, method: init.method, token, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/v1/auth/approle/login')) {
      const b = JSON.parse(init.body!) as { role_id: string; secret_id: string };
      if (b.role_id !== 'role-1' || b.secret_id !== 'secret-1') return new Response('{}', { status: 400 });
      issued += 1; valid = `tok-${issued}`;
      return new Response(JSON.stringify({ auth: { client_token: valid, lease_duration: lease } }), { status: 200 });
    }
    if (token !== valid) return new Response('{}', { status: 403 });
    return new Response(JSON.stringify({ data: { data: { k: 'v' } } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, revoke: () => { valid = ''; }, logins: () => calls.filter((c) => c.url.endsWith('/login')).length };
}

describe('authentification AppRole auprès d’OpenBao (plan § 14.2)', () => {
  it('échange role_id et secret_id, puis présente le jeton obtenu', async () => {
    const f = fakeBao();
    const bao = new OpenBao('http://bao', new AppRoleToken('http://bao', 'role-1', 'secret-1', f.fetchImpl), f.fetchImpl);
    expect(await bao.kvGet('athena/x')).toEqual({ k: 'v' });
    expect(f.logins()).toBe(1);
    expect(f.calls.at(-1)!.token).toBe('tok-1');
  });

  it('réutilise le jeton tant que les deux tiers de sa durée ne sont pas écoulés, puis se reconnecte', async () => {
    const f = fakeBao(300);
    let now = 1_000_000;
    const source = new AppRoleToken('http://bao', 'role-1', 'secret-1', f.fetchImpl, () => now);
    const bao = new OpenBao('http://bao', source, f.fetchImpl);
    await bao.kvGet('a'); now += 150_000; await bao.kvGet('a');
    expect(f.logins()).toBe(1); // 150 s sur 300 : encore valable
    now += 60_000; // 210 s : au-delà des deux tiers (200 s)
    await bao.kvGet('a');
    expect(f.logins()).toBe(2);
    expect(f.calls.at(-1)!.token).toBe('tok-2');
  });

  it('un 403 (jeton révoqué) provoque une reconnexion et une seule nouvelle tentative', async () => {
    const f = fakeBao();
    const bao = new OpenBao('http://bao', new AppRoleToken('http://bao', 'role-1', 'secret-1', f.fetchImpl), f.fetchImpl);
    await bao.kvGet('a');
    f.revoke();
    expect(await bao.kvGet('a')).toEqual({ k: 'v' });
    expect(f.logins()).toBe(2);
  });

  it('des appels simultanés ne déclenchent qu’une seule connexion', async () => {
    const f = fakeBao();
    const bao = new OpenBao('http://bao', new AppRoleToken('http://bao', 'role-1', 'secret-1', f.fetchImpl), f.fetchImpl);
    await Promise.all([bao.kvGet('a'), bao.kvGet('b'), bao.kvGet('c')]);
    expect(f.logins()).toBe(1);
  });

  it('identifiants refusés : erreur franche sans révéler les identifiants', async () => {
    const f = fakeBao();
    const bao = new OpenBao('http://bao', new AppRoleToken('http://bao', 'role-1', 'mauvais', f.fetchImpl), f.fetchImpl);
    const error = await bao.kvGet('a').then(() => null, (e: Error) => e);
    expect(error?.message).toBe('OpenBao AppRole : HTTP 400');
    expect(error?.message).not.toContain('mauvais');
  });

  it('choix de la source : AppRole si les deux identifiants sont présents, sinon jeton fixe, sinon rien', () => {
    expect(tokenSourceFromEnv({})).toBeNull();
    expect(tokenSourceFromEnv({ OPENBAO_ADDR: 'http://bao' })).toBeNull();
    expect(tokenSourceFromEnv({ OPENBAO_ADDR: 'http://bao', OPENBAO_TOKEN: 't' })).toBeInstanceOf(StaticToken);
    expect(tokenSourceFromEnv({ OPENBAO_ADDR: 'http://bao', OPENBAO_ROLE_ID: 'r', OPENBAO_SECRET_ID: 's' })).toBeInstanceOf(AppRoleToken);
    expect(tokenSourceFromEnv({ OPENBAO_ADDR: 'http://bao', OPENBAO_TOKEN: 't', OPENBAO_ROLE_ID: 'r', OPENBAO_SECRET_ID: 's' })).toBeInstanceOf(AppRoleToken);
    expect(tokenSourceFromEnv({ OPENBAO_ROLE_ID: 'r', OPENBAO_SECRET_ID: 's' })).toBeNull();
  });
});
