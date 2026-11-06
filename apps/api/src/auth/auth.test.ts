import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { loadConfig } from '../config';
import { TOKEN_VERIFIER } from './auth.guard';
import { TokenVerifier } from './token-verifier';

const ISSUER = 'http://kc.test/realms/athena';
const AUD = 'athena-api';

async function makeKeys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1', use: 'sig' };
  const verifier = new TokenVerifier(ISSUER, AUD, createLocalJWKSet({ keys: [jwk] }));
  const sign = (
    claims: Record<string, unknown>,
    opts: { iss?: string; aud?: string; exp?: string } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? AUD)
      .setSubject('u1')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(privateKey);
  return { verifier, sign };
}

describe('TokenVerifier', () => {
  it('accepte un jeton valide et extrait rôles et groupes', async () => {
    const { verifier, sign } = await makeKeys();
    const principal = await verifier.verify(
      await sign({
        preferred_username: 'alice',
        realm_access: { roles: ['athena-user'] },
        groups: ['/org-demo'],
      }),
    );
    expect(principal).toMatchObject({
      subject: 'u1',
      username: 'alice',
      roles: ['athena-user'],
      groups: ['/org-demo'],
    });
  });
  it('refuse un mauvais émetteur', async () => {
    const { verifier, sign } = await makeKeys();
    await expect(verifier.verify(await sign({}, { iss: 'http://evil/realms/x' }))).rejects.toThrow();
  });
  it('refuse une mauvaise audience', async () => {
    const { verifier, sign } = await makeKeys();
    await expect(verifier.verify(await sign({}, { aud: 'autre' }))).rejects.toThrow();
  });
  it('refuse un jeton expiré', async () => {
    const { verifier, sign } = await makeKeys();
    await expect(verifier.verify(await sign({}, { exp: '-1m' }))).rejects.toThrow();
  });
  it('refuse une signature étrangère', async () => {
    const { verifier } = await makeKeys();
    const other = await makeKeys();
    await expect(verifier.verify(await other.sign({}))).rejects.toThrow();
  });
});

describe('configuration', () => {
  it('refuse une configuration sans émetteur', () => {
    expect(() => loadConfig({})).toThrow(/KEYCLOAK_ISSUER/);
  });
  it('applique les valeurs par défaut', () => {
    expect(loadConfig({ KEYCLOAK_ISSUER: ISSUER, DATABASE_URL: 'postgres://x' }).PORT).toBe(3001);
  });
});

describe('garde HTTP', () => {
  let app: NestFastifyApplication;
  let sign: Awaited<ReturnType<typeof makeKeys>>['sign'];

  beforeAll(async () => {
    process.env['KEYCLOAK_ISSUER'] = ISSUER;
    process.env['DATABASE_URL'] = 'postgres://app:unused@127.0.0.1:1/none';
    const keys = await makeKeys();
    sign = keys.sign;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue(keys.verifier)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (url: string, token?: string) =>
    app.inject({
      method: 'GET',
      url,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });

  it('healthz est public', async () => {
    expect((await get('/healthz')).statusCode).toBe(200);
  });
  it('refuse sans jeton', async () => {
    expect((await get('/v1/me')).statusCode).toBe(401);
  });
  it('refuse un jeton invalide', async () => {
    expect((await get('/v1/me', 'abc.def.ghi')).statusCode).toBe(401);
  });
  it('accepte un jeton valide', async () => {
    const token = await sign({ preferred_username: 'bob', realm_access: { roles: ['athena-user'] } });
    const response = await get('/v1/me', token);
    expect(response.statusCode).toBe(200);
    expect(response.json().username).toBe('bob');
  });
  it('refuse un utilisateur simple sur une route admin', async () => {
    const token = await sign({ realm_access: { roles: ['athena-user'] } });
    expect((await get('/v1/admin/ping', token)).statusCode).toBe(403);
  });
  it('accepte un administrateur sur une route admin', async () => {
    const token = await sign({ realm_access: { roles: ['athena-admin'] } });
    expect((await get('/v1/admin/ping', token)).statusCode).toBe(200);
  });

  const send = (url: string, token: string, method: 'POST' | 'PUT' | 'DELETE' = 'POST') => app.inject({ method, url, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, payload: '{}' });

  it('assurance qualité étatique : lit comme un utilisateur, n’écrit rien, et réserve la décision d’approbation à son rôle', async () => {
    const qa = await sign({ preferred_username: 'qa', realm_access: { roles: ['athena-qa'] } });
    expect((await get('/v1/me', qa)).statusCode).toBe(200); // lecture : vaut « utilisateur »
    expect((await get('/v1/admin/ping', qa)).statusCode).toBe(403); // jamais administrateur
    for (const url of ['/v1/projects/ARI/trackers/BUG/artifacts', '/v1/projects/ARI/baselines', '/v1/projects/ARI/releases']) expect((await send(url, qa)).statusCode, url).toBe(403); // aucune écriture
    expect((await send('/v1/projects/ARI/approvals/release/R1/required', qa, 'PUT')).statusCode).toBe(403); // pas d’exigence d’approbation
    const user = await sign({ preferred_username: 'u', realm_access: { roles: ['athena-user'] } });
    expect((await send('/v1/projects/ARI/approvals/release/R1/decision', user)).statusCode).toBe(403); // la décision est réservée au rôle
    const admin = await sign({ preferred_username: 'a', realm_access: { roles: ['athena-admin'] } });
    expect((await send('/v1/projects/ARI/approvals/release/R1/decision', admin)).statusCode).toBe(403); // un administrateur n’approuve pas à la place de l’assurance qualité
  });
});
