import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.guard';
import { TokenVerifier } from '../auth/token-verifier';
import { migrate } from '../db/migrate';
import { PG_POOL } from './core.module';
import { bugTemplate } from './templates';

function adminUrl(): string | undefined {
  if (process.env['ATHENA_TEST_ADMIN_URL']) return process.env['ATHENA_TEST_ADMIN_URL'];
  try {
    const env = readFileSync(join(__dirname, '../../../../deploy/dev/.env'), 'utf8');
    const password = /^POSTGRES_PASSWORD=(.+)$/m.exec(env)?.[1];
    if (password) return `postgres://athena:${encodeURIComponent(password.trim())}@127.0.0.1:5432/postgres`;
  } catch { /* pas de .env de dev */ }
  return undefined;
}
const ADMIN = adminUrl();
const reachable =
  ADMIN !== undefined &&
  spawnSync(process.execPath, ['-e', "const {Client}=require('pg');const c=new Client({connectionString:process.env.PROBE_URL,connectionTimeoutMillis:1500});c.connect().then(()=>c.end()).then(()=>process.exit(0),()=>process.exit(1))"],
    { env: { ...process.env, PROBE_URL: ADMIN }, cwd: join(__dirname, '../..'), timeout: 5000 }).status === 0;
if (!reachable && process.env['CI']) throw new Error('PostgreSQL requis en CI');
const suite = reachable ? describe : describe.skip;

// Noms uniques par processus : deux séries qui se chevauchent ne se coupent plus les connexions (drop ... with (force)).
const DB = `athena_test_http_${process.pid.toString(36)}`;
const APP_USER = `athena_app_http_${process.pid.toString(36)}`;
const ISSUER = 'http://kc.test/realms/athena';
const withDb = (database: string, user?: string, password?: string) => {
  const url = new URL(ADMIN!);
  url.pathname = `/${database}`;
  if (user) { url.username = user; url.password = password ?? ''; }
  return url.toString();
};

suite('API REST du noyau', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let sign: (claims: Record<string, unknown>) => Promise<string>;

  const token = (roles: string[], groups: string[] = ['/org-demo']) =>
    sign({ preferred_username: 'tester', realm_access: { roles }, groups });
  const call = async (method: 'GET' | 'POST' | 'PATCH', url: string, jwt?: string, payload?: unknown) =>
    app.inject({
      method, url,
      ...(jwt ? { headers: { authorization: `Bearer ${jwt}` } } : {}),
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  beforeAll(async () => {
    const root = new Client({ connectionString: ADMIN });
    await root.connect();
    await root.query(`drop database if exists ${DB} with (force)`);
    await root.query(`create database ${DB}`);
    await root.end();
    await migrate(withDb(DB));
    const adminPool = new Pool({ connectionString: withDb(DB) });
    await adminPool.query(`drop role if exists ${APP_USER}`).catch(() => undefined);
    await adminPool.query(`create role ${APP_USER} login password 'http-test-only' nosuperuser nobypassrls in role athena_app`);
    await adminPool.query("insert into organization (key, name) values ('demo', 'Démo'), ('autre', 'Autre')");
    await adminPool.end();
    pool = new Pool({ connectionString: withDb(DB, APP_USER, 'http-test-only') });

    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1', use: 'sig' };
    sign = (claims) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER).setAudience('athena-api').setSubject('u-test').setIssuedAt().setExpirationTime('5m').sign(privateKey);

    process.env['KEYCLOAK_ISSUER'] = ISSUER;
    process.env['DATABASE_URL'] = withDb(DB, APP_USER, 'http-test-only');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_VERIFIER).useValue(new TokenVerifier(ISSUER, 'athena-api', createLocalJWKSet({ keys: [jwk] })))
      .overrideProvider(PG_POOL).useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    const root = new Client({ connectionString: ADMIN });
    await root.connect();
    await root.query(`drop database if exists ${DB} with (force)`);
    await root.query(`drop role if exists ${APP_USER}`);
    await root.end();
  });

  it('refuse sans jeton et sans rôle suffisant', async () => {
    expect((await call('POST', '/v1/projects', undefined, { key: 'ARI', name: 'x' })).statusCode).toBe(401);
    expect((await call('POST', '/v1/projects', await token(['athena-user']), { key: 'ARI', name: 'x' })).statusCode).toBe(403);
  });

  it("refuse un compte sans groupe d'organisation", async () => {
    const response = await call('POST', '/v1/projects', await token(['athena-admin'], []), { key: 'ARI', name: 'x' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('forbidden');
  });

  it('valide les corps de requête', async () => {
    const response = await call('POST', '/v1/projects', await token(['athena-admin']), { key: 'mauvaise clé', name: '' });
    expect(response.statusCode).toBe(422);
    expect(response.json().details.length).toBe(2);
  });

  it('parcours complet : projet, trackers multiples, artefact, mise à jour, transitions', async () => {
    const admin = await token(['athena-admin', 'athena-user']);
    expect((await call('POST', '/v1/projects', admin, { key: 'ARI', name: 'Ariane' })).statusCode).toBe(201);
    const { projectKey, ...spec } = bugTemplate('ARI');
    void projectKey;
    expect((await call('POST', '/v1/projects/ARI/trackers', admin, spec)).statusCode).toBe(201);
    expect((await call('POST', '/v1/projects/ARI/trackers', admin, { ...spec, key: 'INC', name: 'Incidents' })).statusCode).toBe(201);
    expect((await call('POST', '/v1/projects/ARI/trackers', admin, spec)).statusCode).toBe(409); // clé de tracker en double

    const user = await token(['athena-user']);
    const created = await call('POST', '/v1/projects/ARI/trackers/BUG/artifacts', user, { values: { title: 'Crash au démarrage', severity: 'majeure' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ key: 'ARI-BUG-0001', status: 'open', version: 1 });

    const patched = await call('PATCH', '/v1/projects/ARI/artifacts/ARI-BUG-0001', user, { values: { assignee: 'u-test' }, version: 1 });
    expect(patched.json().version).toBe(2);
    const stale = await call('PATCH', '/v1/projects/ARI/artifacts/ARI-BUG-0001', user, { values: { assignee: 'x' }, version: 1 });
    expect(stale.statusCode).toBe(409);

    const started = await call('POST', '/v1/projects/ARI/artifacts/ARI-BUG-0001/transitions', user, { name: 'Démarrer', version: 2 });
    expect(started.statusCode).toBe(200);
    expect(started.json().status).toBe('in_progress');
    expect((await call('GET', '/v1/projects/ARI/artifacts/ARI-BUG-0001', user)).json().status).toBe('in_progress');
    expect((await call('GET', '/v1/projects/ARI/artifacts/ARI-BUG-0099', user)).statusCode).toBe(404);
    expect((await call('GET', '/v1/projects/ARI/trackers/INC', user)).json().fields.length).toBeGreaterThan(3);
  });

  it('recherche ATQL via REST, erreurs de syntaxe en 422', async () => {
    const user = await token(['athena-user']);
    const ok = await call('GET', '/v1/projects/ARI/search?q=' + encodeURIComponent('status = in_progress AND tracker = BUG'), user);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().hits.map((h: { key: string }) => h.key)).toEqual(['ARI-BUG-0001']);
    const bad = await call('GET', '/v1/projects/ARI/search?q=' + encodeURIComponent('status ='), user);
    expect(bad.statusCode).toBe(422);
    expect(bad.json().details[0]).toMatch(/Valeur attendue/);
    expect((await call('GET', '/v1/projects/ARI/search?limit=9999', user)).statusCode).toBe(422);
  });

  it("isole les organisations : l'autre organisation ne voit rien", async () => {
    const other = await token(['athena-user'], ['/org-autre']);
    expect((await call('GET', '/v1/projects/ARI/artifacts/ARI-BUG-0001', other)).statusCode).toBe(404);
  });
});
