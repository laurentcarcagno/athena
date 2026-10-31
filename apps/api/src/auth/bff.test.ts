import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SESSION_STORE, TOKEN_VERIFIER } from './auth.tokens';
import { safeReturnTo } from './bff.controller';
import { MemorySessionStore, csrfToken, parseCookies, sign, unsign } from './session';
import { TokenVerifier } from './token-verifier';

const SECRET = 'x'.repeat(40);
const WEB = 'http://localhost:3000';

describe('utilitaires de session', () => {
  it('signe et vérifie, refuse la falsification', () => {
    const signed = sign(SECRET, 'valeur');
    expect(unsign(SECRET, signed)).toBe('valeur');
    expect(unsign(SECRET, `${signed}x`)).toBeNull();
    expect(unsign('autre'.repeat(10), signed)).toBeNull();
    expect(unsign(SECRET, 'sans-signature')).toBeNull();
  });
  it('lie le jeton CSRF à la session', () => {
    expect(csrfToken(SECRET, 'a')).toBe(csrfToken(SECRET, 'a'));
    expect(csrfToken(SECRET, 'a')).not.toBe(csrfToken(SECRET, 'b'));
  });
  it('limite returnTo aux chemins relatifs', () => {
    expect(safeReturnTo('/projets/ARI?x=1')).toBe('/projets/ARI?x=1');
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil', 'evil', undefined, '/a\r\nSet-Cookie: x=1']) expect(safeReturnTo(bad)).toBe('/');
  });
  it('analyse les cookies', () => {
    expect(parseCookies('a=1; b=deux%20mots')).toEqual({ a: '1', b: 'deux mots' });
  });
  it('expire les sessions mémoire', async () => {
    const store = new MemorySessionStore();
    const id = await store.create({ subject: 's', username: 'u', roles: [], groups: [] }, 60);
    expect(await store.get(id)).not.toBeNull();
    const short = await store.create({ subject: 's', username: 'u', roles: [], groups: [] }, -1);
    expect(await store.get(short)).toBeNull();
    await store.deleteBySubject('s');
    expect(await store.get(id)).toBeNull();
  });
});

describe('BFF OIDC (fournisseur simulé)', () => {
  let provider: http.Server;
  let issuer = '';
  let app: NestFastifyApplication;
  let privateKey: KeyLike;
  const codes = new Map<string, { challenge: string; nonce: string; nonceOverride?: string }>();
  let breakVerifier = false;

  const idToken = (nonce: string) =>
    new SignJWT({ nonce }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(issuer).setAudience('athena-web').setSubject('sub-1').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const logoutToken = (claims: Record<string, unknown> = {}, audience = 'athena-web') =>
    new SignJWT({ events: { 'http://schemas.openid.net/event/backchannel-logout': {} }, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(issuer).setAudience(audience).setSubject('sub-1').setIssuedAt().sign(privateKey);
  const accessToken = () =>
    new SignJWT({ preferred_username: 'alice', name: 'Alice Martin', email: 'alice@example.test', realm_access: { roles: ['athena-user'] }, groups: ['/org-demo'] })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(issuer).setAudience('athena-api').setSubject('sub-1').setIssuedAt().setExpirationTime('5m').sign(privateKey);

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), alg: 'RS256', kid: 'k1', use: 'sig' };
    provider = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', async () => {
        if (req.url?.endsWith('/token') && req.method === 'POST') {
          const form = new URLSearchParams(Buffer.concat(chunks).toString());
          const entry = codes.get(form.get('code') ?? '');
          const verifier = form.get('code_verifier') ?? '';
          const challenge = createHash('sha256').update(verifier).digest('base64url');
          if (!entry || form.get('client_secret') !== 'web-client-secret' || (challenge !== entry.challenge && !breakVerifier)) {
            res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"invalid_grant"}');
            return;
          }
          codes.delete(form.get('code')!);
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: await accessToken(), id_token: await idToken(entry.nonceOverride ?? entry.nonce) }));
        } else {
          res.writeHead(404).end();
        }
      });
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    issuer = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/realms/athena`;

    Object.assign(process.env, {
      KEYCLOAK_ISSUER: issuer, DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/none', SESSION_SECRET: SECRET,
      KEYCLOAK_WEB_CLIENT_SECRET: 'web-client-secret', COOKIE_SECURE: 'false', WEB_ORIGIN: WEB, PUBLIC_URL: 'http://localhost:3001',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_VERIFIER).useValue(new TokenVerifier(issuer, 'athena-api', createLocalJWKSet({ keys: [jwk] })))
      .overrideProvider(SESSION_STORE).useValue(new MemorySessionStore())
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await new Promise((resolve) => provider.close(resolve));
  });

  const inject = (method: 'GET' | 'POST', url: string, headers: Record<string, string> = {}) => app.inject({ method, url, headers });
  const cookieHeader = (setCookie: string | string[] | undefined) =>
    [setCookie ?? []].flat().map((c) => c.split(';')[0]).filter((c) => !c!.endsWith('=')).join('; ');

  /** Parcourt login → (fournisseur) → callback. */
  async function login(options: { nonceOverride?: string; state?: (s: string) => string; tamperCookie?: boolean } = {}) {
    const start = await inject('GET', '/auth/login?returnTo=/projets/ARI');
    const location = new URL(start.headers['location'] as string);
    const code = `code-${Math.random().toString(16).slice(2)}`;
    codes.set(code, { challenge: location.searchParams.get('code_challenge')!, nonce: location.searchParams.get('nonce')!, ...(options.nonceOverride ? { nonceOverride: options.nonceOverride } : {}) });
    let cookies = cookieHeader(start.headers['set-cookie']);
    if (options.tamperCookie) cookies = cookies.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    const state = options.state ? options.state(location.searchParams.get('state')!) : location.searchParams.get('state')!;
    const callback = await inject('GET', `/auth/callback?code=${code}&state=${encodeURIComponent(state)}`, { cookie: cookies });
    return { start, location, callback };
  }

  it('redirige vers le fournisseur avec PKCE S256, state, nonce et cookie signé HttpOnly', async () => {
    const { start, location } = await login();
    expect(start.statusCode).toBe(302);
    expect(location.origin + location.pathname).toBe(`${issuer}/protocol/openid-connect/auth`);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3001/auth/callback');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(String(start.headers['set-cookie'])).toMatch(/HttpOnly/);
  });

  it('établit une session sans exposer de jeton, et authentifie les lectures', async () => {
    const { callback } = await login();
    expect(callback.statusCode).toBe(302);
    expect(callback.headers['location']).toBe(`${WEB}/projets/ARI`);
    const cookies = [callback.headers['set-cookie']].flat().map(String);
    const session = cookies.find((c) => c.startsWith('athena_session='))!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);

    const jar = cookieHeader(callback.headers['set-cookie']);
    const state = (await inject('GET', '/auth/session', { cookie: jar })).json();
    expect(state).toMatchObject({ authenticated: true, user: { username: 'alice', name: 'Alice Martin', roles: ['athena-user'] } });
    expect(JSON.stringify(state)).not.toMatch(/eyJ/); // aucun jeton
    const me = await inject('GET', '/v1/me', { cookie: jar });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'alice', groups: ['/org-demo'] });
  });

  it('refuse state erroné, cookie falsifié, nonce erroné, PKCE erroné', async () => {
    expect((await login({ state: (s) => `${s}x` })).callback.statusCode).toBe(400);
    expect((await login({ tamperCookie: true })).callback.statusCode).toBe(400);
    expect((await login({ nonceOverride: 'autre-nonce' })).callback.statusCode).toBe(400);
    const sans = await inject('GET', '/auth/callback?code=x&state=y');
    expect(sans.statusCode).toBe(400);
    // PKCE : le fournisseur rejette un verifier qui ne correspond pas au challenge.
    const start = await inject('GET', '/auth/login');
    const location = new URL(start.headers['location'] as string);
    codes.set('c-pkce', { challenge: 'challenge-different', nonce: location.searchParams.get('nonce')! });
    const callback = await inject('GET', `/auth/callback?code=c-pkce&state=${location.searchParams.get('state')}`, { cookie: cookieHeader(start.headers['set-cookie']) });
    expect(callback.statusCode).toBe(400);
  });

  it('protège les écritures par jeton CSRF et contrôle d’origine', async () => {
    const jar = cookieHeader((await login()).callback.headers['set-cookie']);
    const csrf = (await inject('GET', '/auth/session', { cookie: jar })).json().csrf as string;
    const post = (headers: Record<string, string>) => inject('POST', '/v1/projects', { cookie: jar, ...headers });
    expect((await post({})).statusCode).toBe(403);
    expect((await post({ 'x-csrf-token': 'faux' })).statusCode).toBe(403);
    expect((await post({ 'x-csrf-token': csrf, origin: 'http://evil.test' })).statusCode).toBe(403);
    // Jeton valide et origine correcte : la garde laisse passer (le rôle utilisateur suffit à franchir CSRF, pas l'accès admin).
    const allowed = await post({ 'x-csrf-token': csrf, origin: WEB });
    expect(allowed.json().message).toBe('Droits insuffisants.');
  });

  it('refuse un cookie de session forgé ou inconnu', async () => {
    expect((await inject('GET', '/v1/me', { cookie: 'athena_session=forge' })).statusCode).toBe(401);
    expect((await inject('GET', '/auth/session', { cookie: 'athena_session=forge' })).json()).toEqual({ authenticated: false });
  });

  it('se déconnecte (CSRF obligatoire) et révoque la session', async () => {
    const jar = cookieHeader((await login()).callback.headers['set-cookie']);
    const csrf = (await inject('GET', '/auth/session', { cookie: jar })).json().csrf as string;
    expect((await inject('POST', '/auth/logout', { cookie: jar })).statusCode).toBe(403);
    const out = await inject('POST', '/auth/logout', { cookie: jar, 'x-csrf-token': csrf });
    expect(out.statusCode).toBe(200);
    expect(out.json().logoutUrl).toContain('/protocol/openid-connect/logout');
    expect((await inject('GET', '/v1/me', { cookie: jar })).statusCode).toBe(401);
  });

  it('accepte toujours le jeton Bearer', async () => {
    const response = await inject('GET', '/v1/me', { authorization: `Bearer ${await accessToken()}` });
    expect(response.statusCode).toBe(200);
  });

  it('révoque toutes les sessions d’un utilisateur sur déconnexion back-channel signée', async () => {
    const jarA = cookieHeader((await login()).callback.headers['set-cookie']);
    const jarB = cookieHeader((await login()).callback.headers['set-cookie']);
    expect((await inject('GET', '/v1/me', { cookie: jarA })).statusCode).toBe(200);
    const send = async (token: string) => app.inject({ method: 'POST', url: '/auth/backchannel-logout', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `logout_token=${encodeURIComponent(token)}` });
    expect((await send(await logoutToken())).json()).toEqual({ revoked: true });
    expect((await inject('GET', '/v1/me', { cookie: jarA })).statusCode).toBe(401);
    expect((await inject('GET', '/v1/me', { cookie: jarB })).statusCode).toBe(401);
  });

  it('refuse un jeton de déconnexion invalide, mal adressé, sans événement ou avec nonce', async () => {
    const send = async (token: string) => (await app.inject({ method: 'POST', url: '/auth/backchannel-logout', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `logout_token=${encodeURIComponent(token)}` })).statusCode;
    const jar = cookieHeader((await login()).callback.headers['set-cookie']);
    expect(await send('abc.def.ghi')).toBe(400);
    expect(await send('')).toBe(400);
    expect(await send(await logoutToken({}, 'autre-client'))).toBe(400);
    expect(await send(await logoutToken({ nonce: 'x' }))).toBe(400);
    expect(await send(await accessToken())).toBe(400); // un jeton d'accès n'est pas un jeton de déconnexion
    expect((await inject('GET', '/v1/me', { cookie: jar })).statusCode).toBe(200); // la session est intacte
  });
});
