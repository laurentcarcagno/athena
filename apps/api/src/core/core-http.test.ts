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
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, jwt?: string, payload?: unknown) =>
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
    expect((await call('POST', '/v1/projects', await token(['athena-team-member']), { key: 'ARI', name: 'x' })).statusCode).toBe(403);
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
    const admin = await token(['athena-admin', 'athena-team-member']);
    expect((await call('POST', '/v1/projects', admin, { key: 'ARI', name: 'Ariane' })).statusCode).toBe(201);
    const { projectKey, ...spec } = bugTemplate('ARI');
    void projectKey;
    expect((await call('POST', '/v1/projects/ARI/trackers', admin, spec)).statusCode).toBe(201);
    expect((await call('POST', '/v1/projects/ARI/trackers', admin, { ...spec, key: 'INC', name: 'Incidents' })).statusCode).toBe(201);
    expect((await call('POST', '/v1/projects/ARI/trackers', admin, spec)).statusCode).toBe(409); // clé de tracker en double

    const user = await token(['athena-team-member']);
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
    const user = await token(['athena-team-member']);
    const ok = await call('GET', '/v1/projects/ARI/search?q=' + encodeURIComponent('status = in_progress AND tracker = BUG'), user);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().hits.map((h: { key: string }) => h.key)).toEqual(['ARI-BUG-0001']);
    const bad = await call('GET', '/v1/projects/ARI/search?q=' + encodeURIComponent('status ='), user);
    expect(bad.statusCode).toBe(422);
    expect(bad.json().details[0]).toMatch(/Valeur attendue/);
    expect((await call('GET', '/v1/projects/ARI/search?limit=9999', user)).statusCode).toBe(422);
  });

  it('PpmModule : portefeuilles et équipes servis par le module PPM, avec leurs droits', async () => {
    expect((await call('GET', '/v1/portfolios')).statusCode).toBe(401);
    expect((await call('GET', '/v1/portfolios', await token(['athena-team-member']))).statusCode).toBe(403);
    expect((await call('GET', '/v1/teams', await token(['athena-team-member']))).statusCode).toBe(403);
    for (const role of ['athena-admin', 'athena-pmo', 'athena-director']) {
      expect((await call('GET', '/v1/portfolios', await token([role]))).statusCode, role).toBe(200);
      expect((await call('GET', '/v1/teams', await token([role]))).statusCode, role).toBe(200);
    }
    const created = await call('POST', '/v1/portfolios', await token(['athena-pmo']), { key: 'http-pf', name: 'Portefeuille HTTP' });
    expect(created.statusCode).toBe(201);
    expect((await call('POST', '/v1/portfolios', await token(['athena-director']), { key: 'http-pf2', name: 'Refusé' })).statusCode).toBe(403);
    expect((await call('DELETE', '/v1/portfolios/http-pf', await token(['athena-pmo']))).statusCode).toBe(204);
  });

  it('interrupteurs de fonctionnalité : lus par tous, réglés par l’administration ; une route désactivée est introuvable', async () => {
    expect((await call('GET', '/v1/features')).statusCode).toBe(401);
    const initial = (await call('GET', '/v1/features', await token(['athena-team-member']))).json();
    expect(initial).toMatchObject({ 'ppm.portfolios': true, 'ppm.roadmap': true, 'ppm.capacity': false, 'ppm.finance': false });
    expect((await call('PUT', '/v1/admin/features/ppm.portfolios', await token(['athena-pmo']), { enabled: false })).statusCode).toBe(403);
    expect((await call('PUT', '/v1/admin/features/inconnue.cle', await token(['athena-admin']), { enabled: true })).statusCode).toBe(422);
    const off = await call('PUT', '/v1/admin/features/ppm.portfolios', await token(['athena-admin']), { enabled: false });
    expect(off.statusCode).toBe(200);
    expect(off.json()['ppm.portfolios']).toBe(false);
    expect((await call('GET', '/v1/portfolios', await token(['athena-pmo']))).statusCode).toBe(404);
    expect((await call('GET', '/v1/teams', await token(['athena-admin']))).statusCode).toBe(404);
    expect((await call('GET', '/v1/portfolios', await token(['athena-pmo'], ['/org-autre']))).statusCode).toBe(200); // l'autre organisation garde sa valeur par défaut
    await call('PUT', '/v1/admin/features/ppm.portfolios', await token(['athena-admin']), { enabled: true });
    expect((await call('GET', '/v1/portfolios', await token(['athena-pmo']))).statusCode).toBe(200);
  });

  it('réglages PPM : lus par tous, modifiés par l’administration ; valeur hors bornes refusée', async () => {
    expect((await call('GET', '/v1/ppm-settings')).statusCode).toBe(401);
    expect((await call('GET', '/v1/ppm-settings', await token(['athena-team-member']))).json()).toMatchObject({ workdayMinutes: 468, snapshotFrequency: 'weekly', snapshotWeeklyRetentionWeeks: 26, snapshotReviewRetentionMonths: null });
    expect((await call('PUT', '/v1/admin/ppm-settings', await token(['athena-pmo']), { workdayMinutes: 420 })).statusCode).toBe(403);
    expect((await call('PUT', '/v1/admin/ppm-settings', await token(['athena-admin']), { workdayMinutes: 1500 })).statusCode).toBe(422);
    const saved = await call('PUT', '/v1/admin/ppm-settings', await token(['athena-admin']), { workdayMinutes: 420 });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().workdayMinutes).toBe(420);
    expect((await call('GET', '/v1/ppm-settings', await token(['athena-director']))).json().workdayMinutes).toBe(420);
    expect((await call('GET', '/v1/ppm-settings', await token(['athena-director'], ['/org-autre']))).json().workdayMinutes).toBe(468);
    await call('PUT', '/v1/admin/ppm-settings', await token(['athena-admin']), { workdayMinutes: 468 });
  });

  it('calendrier : lu par toute personne connectée, modifié par l’administration seulement', async () => {
    const week = { workDays: [1, 2, 3, 4], holidays: [{ day: '2026-12-25', label: 'Noël' }] };
    expect((await call('GET', '/v1/calendar')).statusCode).toBe(401);
    expect((await call('PUT', '/v1/admin/calendar', await token(['athena-team-member']), week)).statusCode).toBe(403);
    expect((await call('PUT', '/v1/admin/calendar', await token(['athena-pm']), week)).statusCode).toBe(403);
    expect((await call('PUT', '/v1/admin/calendar', await token(['athena-admin']), { workDays: [], holidays: [] })).statusCode).toBe(422);
    const saved = await call('PUT', '/v1/admin/calendar', await token(['athena-admin']), week);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual(week);
    for (const role of ['athena-team-member', 'athena-pm', 'athena-qa']) expect((await call('GET', '/v1/calendar', await token([role]))).json()).toEqual(week);
    expect((await call('GET', '/v1/calendar', await token(['athena-team-member'], ['/org-autre']))).json()).toEqual({ workDays: [1, 2, 3, 4, 5], holidays: [] });
  });

  it('planning : lecture pour les membres, replanification réservée à l’administration et au chef de projet', async () => {
    expect((await call('GET', '/v1/projects/ARI/schedule')).statusCode).toBe(401);
    const read = await call('GET', '/v1/projects/ARI/schedule', await token(['athena-team-member']));
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ tasks: [], links: [], criticalPath: [], projectEnd: null, moved: 0 });
    expect((await call('GET', '/v1/projects/NOPE/schedule', await token(['athena-team-member']))).statusCode).toBe(404);
    expect((await call('POST', '/v1/projects/ARI/schedule/apply', await token(['athena-team-member']))).statusCode).toBe(403);
    const applied = await call('POST', '/v1/projects/ARI/schedule/apply', await token(['athena-admin']));
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toEqual({ moved: 0, keys: [], batch: null });
    const patch = (jwt: string, body: unknown) => call('PATCH', '/v1/projects/ARI/schedule/tasks/ARI-BUG-0001', jwt, body);
    expect((await patch(await token(['athena-team-member']), { duration: 3 })).statusCode).toBe(403);
    expect((await patch(await token(['athena-admin']), {})).statusCode).toBe(422); // aucun champ
    expect((await patch(await token(['athena-admin']), { duration: 3, due: '2026-11-12' })).statusCode).toBe(422); // deux champs
    expect((await patch(await token(['athena-admin']), { duration: 3 })).statusCode).toBe(404); // ARI n’a pas de tâche planifiée
    const lag = (jwt: string, body: unknown) => call('PATCH', '/v1/projects/ARI/schedule/links/00000000-0000-0000-0000-000000000000', jwt, body);
    expect((await lag(await token(['athena-team-member']), { lagDays: 1 })).statusCode).toBe(403);
    expect((await lag(await token(['athena-admin']), { lagDays: 1.5 })).statusCode).toBe(422);
    expect((await lag(await token(['athena-admin']), { lagDays: 1, extra: true })).statusCode).toBe(422);
    expect((await lag(await token(['athena-admin']), { lagDays: 1 })).statusCode).toBe(404); // lien inconnu
  });

  it('configuration du projet : le chef de projet la fait seulement sur un projet dont il est responsable', async () => {
    const pm = await token(['athena-pm']);
    const admin = await token(['athena-admin']);
    const field = { key: 'effort', label: 'Effort', type: 'number' };
    const addField = (jwt: string, key: string) => call('POST', '/v1/projects/ARI/trackers/BUG/fields', jwt, { ...field, key });
    expect((await addField(await token(['athena-team-member']), 'e0')).statusCode).toBe(403); // simple utilisateur
    expect((await addField(pm, 'e1')).statusCode).toBe(403); // chef de projet, mais pas responsable d'ARI
    expect((await call('POST', '/v1/projects/ARI/baselines', pm, { name: 'B1' })).statusCode).toBe(403);
    expect((await call('PUT', '/v1/projects/ARI/members/u-test', admin, { role: 'manager' })).statusCode).toBe(200);
    expect((await addField(pm, 'e2')).statusCode).toBeLessThan(300); // responsable : autorisé
    expect((await call('POST', '/v1/projects/ARI/baselines', pm, { name: 'B1' })).statusCode).toBe(503); // autorisé ; GitLab non configuré dans ce test
    expect((await call('POST', '/v1/projects/ARI/automations', pm, { name: 'r', trigger: 'artifact.created', condition: '', actions: [{ type: 'comment', body: 'x' }] })).statusCode).toBeLessThan(300);
    expect((await call('POST', '/v1/projects/ARI/baselines', await token(['athena-team-member']), { name: 'B2' })).statusCode).toBe(403);
    expect((await call('PUT', '/v1/projects/ARI/members/u-test', admin, { role: 'member' })).statusCode).toBe(200);
    expect((await addField(pm, 'e3')).statusCode).toBe(403); // plus responsable : refusé de nouveau
  });

  it('administrateur de tracker : configure ce tracker seulement, désigné et révoqué par le chef du projet', async () => {
    const member = await token(['athena-team-member']); // même sujet que le chef de projet des essais précédents (u-test)
    const admin = await token(['athena-admin']);
    const addField = (jwt: string, key: string, tracker = 'BUG') => call('POST', `/v1/projects/ARI/trackers/${tracker}/fields`, jwt, { key, label: 'Champ', type: 'text' });
    expect((await addField(member, 'd0')).statusCode).toBe(403); // simple membre : refusé
    expect((await call('PUT', '/v1/projects/ARI/trackers/BUG/admins/u-test', member)).statusCode).toBe(403); // un membre ne désigne personne
    expect((await call('PUT', '/v1/projects/ARI/trackers/BUG/admins/u-test', admin)).statusCode).toBe(204);
    expect((await call('GET', '/v1/projects/ARI/trackers/BUG/admins', member)).json()).toEqual([expect.objectContaining({ subject: 'u-test' })]);
    expect((await addField(member, 'd1')).statusCode).toBeLessThan(300); // administrateur du tracker BUG : autorisé
    expect((await call('PATCH', '/v1/projects/ARI/trackers/BUG/fields/d1', member, { label: 'Renommé' })).statusCode).toBe(204);
    expect((await call('POST', '/v1/projects/ARI/trackers/BUG/statuses', member, { key: 'revu', name: 'Revu', category: 'in_progress' })).statusCode).toBeLessThan(300);
    expect((await call('POST', '/v1/projects/ARI/baselines', member, { name: 'B9' })).statusCode).toBe(403); // pas chef de projet : le reste du projet lui reste fermé
    expect((await call('DELETE', '/v1/projects/ARI/trackers/BUG/admins/u-test', admin)).statusCode).toBe(204);
    expect((await addField(member, 'd2')).statusCode).toBe(403); // révoqué : refusé de nouveau
    expect((await call('PUT', '/v1/projects/ARI/trackers/BUG/admins/inconnu', admin)).statusCode).toBe(404);
  });

  it("isole les organisations : l'autre organisation ne voit rien", async () => {
    const other = await token(['athena-team-member'], ['/org-autre']);
    expect((await call('GET', '/v1/projects/ARI/artifacts/ARI-BUG-0001', other)).statusCode).toBe(404);
  });
});
