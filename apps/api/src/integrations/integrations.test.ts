import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { sign as hmacSign } from '../webhooks/signing';
import { TOKEN_VERIFIER } from '../auth/auth.guard';
import { TokenVerifier } from '../auth/token-verifier';
import { PG_POOL, SECRET_STORE } from '../core/core.tokens';
import { Db } from '../core/db';
import { bugTemplate } from '../core/templates';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';

const ISSUER = 'http://kc.test/realms/athena';
const suite = pgUp ? describe : describe.skip;

class MemorySecrets {
  readonly data = new Map<string, Record<string, string>>();
  async put(path: string, data: Record<string, string>) { this.data.set(path, data); }
  async get(path: string) { return this.data.get(path) ?? null; }
}

suite('intégrations REST (webhooks, StrictDoc, GitLab)', () => {
  let app: NestFastifyApplication;
  let testDb: TestDb;
  let sign: (claims: Record<string, unknown>) => Promise<string>;
  const orgId = crypto.randomUUID();

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, jwt?: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method, url,
      headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...headers },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  const token = (roles: string[]) =>
    sign({ preferred_username: 'tester', email: 'dev@example.test', name: 'Dev Test', realm_access: { roles }, groups: ['/org-demo'] });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_integrations');
    await new Db(testDb.pool).tx(orgId, (c) => c.query("insert into organization (id, key, name) values ($1, 'demo', 'Démo')", [orgId]));
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1', use: 'sig' };
    sign = (claims) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER).setAudience('athena-api').setSubject('sub-dev').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    process.env['KEYCLOAK_ISSUER'] = ISSUER;
    process.env['DATABASE_URL'] = 'postgres://unused:unused@127.0.0.1:1/none';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_VERIFIER).useValue(new TokenVerifier(ISSUER, 'athena-api', createLocalJWKSet({ keys: [jwk] })))
      .overrideProvider(PG_POOL).useValue(testDb.pool)
      .overrideProvider(SECRET_STORE).useValue(new MemorySecrets())
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { rawBody: true });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const admin = await token(['athena-admin', 'athena-user']);
    await call('POST', '/v1/projects', admin, { key: 'ARI', name: 'Ariane' });
    const { projectKey, ...spec } = bugTemplate('ARI');
    void projectKey;
    await call('POST', '/v1/projects/ARI/trackers', admin, spec);
    await call('POST', '/v1/projects/ARI/trackers/BUG/artifacts', admin, { values: { title: 'Crash', severity: 'majeure', assignee: 'sub-dev' } });
  });
  afterAll(async () => {
    await app?.close();
    await testDb?.drop();
  });

  it('reçoit un webhook GitLab authentifié et applique les règles', async () => {
    const admin = await token(['athena-admin']);
    const integration = await call('POST', '/v1/projects/ARI/integrations/gitlab', admin);
    expect(integration.statusCode).toBe(201);
    const { path, secret } = integration.json();
    expect(path).toBe('/hooks/in/gitlab/demo/ARI');
    expect(secret).toMatch(/^glhook_[0-9a-f]{64}$/);

    // L'utilisateur du jeton est mémorisé à son premier appel authentifié (mapping e-mail → utilisateur).
    await call('GET', '/v1/projects/ARI/artifacts/BUG-1', await token(['athena-user']));

    const push = { object_kind: 'push', ref: 'refs/heads/bugfix/BUG-1-crash', commits: [{ id: 'c'.repeat(40), message: 'Corrige\n\nRefs BUG-1', author: { email: 'dev@example.test' } }] };
    const ok = await call('POST', path, undefined, push, { 'x-gitlab-token': secret });
    expect(ok.statusCode).toBe(202);
    expect(ok.json().results.some((r: { outcome: string }) => r.outcome === 'transitioned')).toBe(true);
    const refs = await call('GET', '/v1/projects/ARI/artifacts/BUG-1/code-refs', await token(['athena-user']));
    expect(refs.json().map((r: { kind: string }) => r.kind).sort()).toEqual(['branch', 'commit']);
    expect((await call('GET', '/v1/projects/ARI/artifacts/BUG-1', await token(['athena-user']))).json().status).toBe('in_progress');

    const ignored = await call('POST', path, undefined, { object_kind: 'tag_push' }, { 'x-gitlab-token': secret });
    expect(ignored.json()).toMatchObject({ accepted: false });
  });

  it('refuse de façon identique jeton absent, faux, organisation ou projet inconnus', async () => {
    const bodies = new Set<string>();
    const attempts: Array<[string, Record<string, string>]> = [
      ['/hooks/in/gitlab/demo/ARI', {}],
      ['/hooks/in/gitlab/demo/ARI', { 'x-gitlab-token': 'faux' }],
      ['/hooks/in/gitlab/inconnue/ARI', { 'x-gitlab-token': 'faux' }],
      ['/hooks/in/gitlab/demo/ZZZ', { 'x-gitlab-token': 'faux' }],
      ['/hooks/in/gitlab/DEMO%20x/ARI', { 'x-gitlab-token': 'faux' }],
    ];
    for (const [url, headers] of attempts) {
      const response = await call('POST', url, undefined, { object_kind: 'push' }, headers);
      expect(response.statusCode).toBe(403);
      bodies.add(response.body);
    }
    expect(bodies.size).toBe(1);
  });

  it("n'accepte pas un jeton valide d'un autre projet", async () => {
    const admin = await token(['athena-admin']);
    await call('POST', '/v1/projects', admin, { key: 'OTH', name: 'Autre' });
    const other = (await call('POST', '/v1/projects/OTH/integrations/gitlab', admin)).json();
    const response = await call('POST', '/hooks/in/gitlab/demo/ARI', undefined, { object_kind: 'push' }, { 'x-gitlab-token': other.secret });
    expect(response.statusCode).toBe(403);
  });

  it('administre les webhooks sortants', async () => {
    const admin = await token(['athena-admin']);
    expect((await call('POST', '/v1/webhooks', await token(['athena-user']), { url: 'https://exemple.org/h', eventTypes: ['artifact.*'] })).statusCode).toBe(403);
    expect((await call('POST', '/v1/webhooks', admin, { url: 'http://exemple.org/h', eventTypes: ['artifact.*'] })).statusCode).toBe(422);
    const created = await call('POST', '/v1/webhooks', admin, { url: 'https://exemple.org/h', eventTypes: ['artifact.*'], description: 'CI' });
    expect(created.statusCode).toBe(201);
    expect(created.json().secret).toMatch(/^whsec_/);
    const list = (await call('GET', '/v1/webhooks', admin)).json();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('whsec_');
    expect((await call('GET', `/v1/webhooks/${list[0].id}/deliveries`, admin)).json()).toEqual([]);
  });

  it('indexe la documentation et expose liens et couverture', async () => {
    const admin = await token(['athena-admin', 'athena-user']);
    const sdoc = '[DOCUMENT]\nTITLE: Spec\n\n[REQUIREMENT]\nUID: SYS-1\nTITLE: Journal\nSTATEMENT: Le système journalise.\n';
    const indexed = await call('POST', '/v1/projects/ARI/docs/spec/index', admin, { files: [{ path: 'spec.sdoc', content: sdoc }], gitSha: 'abc1234' });
    expect(indexed.json()).toMatchObject({ nodes: 1 });
    expect((await call('POST', '/v1/projects/ARI/artifacts/BUG-1/doc-links', admin, { source: 'spec', uid: 'SYS-1' })).statusCode).toBe(204);
    expect((await call('GET', '/v1/projects/ARI/artifacts/BUG-1/doc-links', admin)).json()).toMatchObject([{ uid: 'SYS-1', suspect: false }]);
    expect((await call('GET', '/v1/projects/ARI/docs/spec/coverage?tracker=BUG', admin)).json()).toMatchObject({ covered: 1, total: 1 });
    expect((await call('POST', '/v1/projects/ARI/docs/spec/index', await token(['athena-user']), { files: [{ path: 'x', content: '' }] })).statusCode).toBe(403);
    expect((await call('POST', '/v1/projects/ARI/docs/spec/index', admin, { files: [] })).statusCode).toBe(422);
  });

  it('pilote un board et un sprint par REST', async () => {
    const admin = await token(['athena-admin', 'athena-user']);
    const board = await call('POST', '/v1/projects/ARI/boards', admin, {
      key: 'bugs', name: 'Bugs', trackerKeys: ['BUG'],
      columns: [{ name: 'Ouverts', statuses: ['open'] }, { name: 'En cours', statuses: ['in_progress'], wipLimit: 3 }],
    });
    expect(board.statusCode).toBe(201);
    const view = await call('GET', '/v1/projects/ARI/boards/bugs', admin);
    expect(view.json().columns.map((c: { name: string; count: number }) => [c.name, c.count])).toEqual([['Ouverts', 0], ['En cours', 1]]);
    expect((await call('POST', '/v1/projects/ARI/boards/bugs/cards/BUG-1/move', admin, { column: 'Ouverts', version: 99 })).statusCode).toBe(409); // version périmée

    const sprint = await call('POST', '/v1/projects/ARI/sprints', admin, { name: 'S1', startsOn: '2026-01-01', endsOn: '2026-01-14' });
    expect(sprint.statusCode).toBe(201);
    const id = sprint.json().id;
    expect((await call('POST', `/v1/projects/ARI/sprints/${id}/items`, admin, { artifact: 'BUG-1' })).statusCode).toBe(204);
    expect((await call('POST', `/v1/projects/ARI/sprints/${id}/start`, admin)).statusCode).toBe(204);
    expect((await call('GET', `/v1/projects/ARI/sprints/${id}`, admin)).json()).toMatchObject({ state: 'active', startsOn: '2026-01-01' });
    expect(Array.isArray((await call('GET', `/v1/projects/ARI/sprints/${id}/burndown`, admin)).json())).toBe(true);
    expect((await call('POST', '/v1/projects/ARI/sprints', await token(['athena-user']), { name: 'x', startsOn: '2026-01-01', endsOn: '2026-01-02' })).statusCode).toBe(403);
  });

  it('liste projets et trackers, et expose l’historique d’un artefact', async () => {
    const user = await token(['athena-user']);
    expect((await call('GET', '/v1/projects', user)).json().map((p: { key: string }) => p.key)).toEqual(['ARI', 'OTH']);
    const trackers = (await call('GET', '/v1/projects/ARI/trackers', user)).json();
    expect(trackers).toMatchObject([{ key: 'BUG', artifacts: 1 }]);
    const history = (await call('GET', '/v1/projects/ARI/artifacts/BUG-1/history', user)).json();
    expect(history[0].version).toBeGreaterThan(history[history.length - 1].version);
    expect(history[history.length - 1]).toMatchObject({ version: 1, actor: 'Dev Test' });
  });

  it('restaure une révision par REST et signale l’historique GitLab non configuré (503)', async () => {
    const admin = await token(['athena-admin', 'athena-user']);
    const current = (await call('GET', '/v1/projects/ARI/artifacts/BUG-1', admin)).json();
    await call('PATCH', '/v1/projects/ARI/artifacts/BUG-1', admin, { values: { severity: 'mineure' }, version: current.version });
    const back = await call('POST', '/v1/projects/ARI/artifacts/BUG-1/restore', admin, { version: 1, expectedVersion: current.version + 1 });
    expect(back.statusCode).toBe(200);
    expect(back.json().version).toBe(current.version + 2);
    expect((await call('POST', '/v1/projects/ARI/artifacts/BUG-1/restore', admin, { version: 1, expectedVersion: 1 })).statusCode).toBe(409);
    expect((await call('GET', '/v1/projects/ARI/baselines', admin)).statusCode).toBe(503);
    expect((await call('POST', '/v1/projects/ARI/baselines', await token(['athena-user']), { name: 'v1' })).statusCode).toBe(403);
  });

  it('protège le webhook de l’historique et signale la configuration manquante (503)', async () => {
    const admin = await token(['athena-admin']);
    const hook = (await call('POST', '/v1/projects/ARI/integrations/history', admin)).json();
    expect(hook.path).toBe('/hooks/in/history/demo/ARI');
    expect((await call('POST', hook.path, undefined, { object_kind: 'push' }, { 'x-gitlab-token': 'faux' })).statusCode).toBe(403);
    expect((await call('POST', hook.path, undefined, { object_kind: 'push' }, { 'x-gitlab-token': hook.secret })).statusCode).toBe(503);
    expect((await call('POST', '/v1/projects/ARI/rebuild', admin)).statusCode).toBe(503);
    expect((await call('POST', '/v1/projects/ARI/rebuild', await token(['athena-user']))).statusCode).toBe(403);
  });

  it('administre les automatisations et reçoit un webhook entrant signé sur le corps brut', async () => {
    const admin = await token(['athena-admin', 'athena-user']);
    expect((await call('POST', '/v1/projects/ARI/automations', await token(['athena-user']), { name: 'x' })).statusCode).toBe(403);
    expect((await call('POST', '/v1/projects/ARI/automations', admin, { name: 'x', trigger: 'artifact.created', condition: 'status =', actions: [{ type: 'comment', body: 'a' }] })).statusCode).toBe(422);
    const rule = await call('POST', '/v1/projects/ARI/automations', admin, { name: 'Commentaire auto', trigger: 'artifact.created', actions: [{ type: 'comment', body: 'Reçu.' }] });
    expect(rule.statusCode).toBe(201);
    const id = rule.json().id;
    expect((await call('GET', '/v1/projects/ARI/automations', admin)).json()[0]).toMatchObject({ id, enabled: true });
    expect((await call('POST', `/v1/automations/${id}/disable`, admin)).statusCode).toBe(204);
    expect((await call('GET', `/v1/automations/${id}/runs`, admin)).json()).toEqual([]);

    const source = await call('POST', '/v1/projects/ARI/inbound-sources', admin, {
      name: 'externe', mapping: { action: 'create', tracker: 'BUG', values: { title: '{{$.titre}}', severity: 'mineure' } },
    });
    expect(source.statusCode).toBe(201);
    const { path, secret } = source.json();
    const raw = '{ "titre" :  "Créé par un tiers" }'; // espacement volontaire : la signature porte sur les octets reçus
    const post = (headers: Record<string, string>) => app.inject({ method: 'POST', url: path, headers: { 'content-type': 'application/json', ...headers }, payload: raw });
    expect((await post({})).statusCode).toBe(403);
    expect((await post({ 'athena-signature': hmacSign('mauvais', raw) })).statusCode).toBe(403);
    const ok = await post({ 'athena-signature': hmacSign(secret, raw), 'idempotency-key': 'k-1' });
    expect(ok.statusCode).toBe(202);
    expect(ok.json()).toMatchObject({ duplicate: false, action: 'create' });
    expect((await post({ 'athena-signature': hmacSign(secret, raw), 'idempotency-key': 'k-1' })).json().duplicate).toBe(true);
    const created = await call('GET', `/v1/projects/ARI/artifacts/${ok.json().key}`, admin);
    expect(created.json().values.title).toBe('Créé par un tiers');
    expect((await app.inject({ method: 'POST', url: path, headers: { 'content-type': 'application/json' }, payload: '{pas du json' })).statusCode).toBe(400);
  });

  it('signale GitLab non configuré (503) pour les actions de branche, merge request et synchronisation de documentation', async () => {
    const user = await token(['athena-user']);
    expect((await call('POST', '/v1/projects/ARI/artifacts/BUG-1/branch', user, { type: 'bugfix' })).statusCode).toBe(503);
    expect((await call('POST', '/v1/projects/ARI/artifacts/BUG-1/branch', user, { type: 'autre' })).statusCode).toBe(422);
    expect((await call('POST', '/v1/projects/ARI/code-repos', user, { path: 'a/b' })).statusCode).toBe(403);
    expect((await call('POST', '/v1/projects/ARI/docs/spec/sync', await token(['athena-admin']), { repo: 'a/b' })).statusCode).toBe(503);
  });

  it('administre les plugins : seuls les éditeurs de confiance sont acceptés', async () => {
    const admin = await token(['athena-admin']);
    expect((await call('GET', '/v1/plugins', await token(['athena-user']))).statusCode).toBe(403);
    expect((await call('GET', '/v1/plugins', admin)).json()).toEqual([]);
    const pkg = { manifest: { id: 'com.acme.x', name: 'X', version: '1.0.0', athena: '>=1.0.0', publisher: 'acme', permissions: [], contributes: { fieldTypes: [], hooks: [] } }, code: 'plugin = {};', signature: 'AAAA' };
    const refused = await call('POST', '/v1/plugins', admin, { package: pkg, granted: [] });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().details[0]).toMatch(/éditeur non reconnu/); // aucune clé de confiance configurée
    expect((await call('POST', '/v1/plugins', admin, { package: pkg, granted: ['root'] })).statusCode).toBe(422);
    expect((await call('POST', '/v1/plugins/com.acme.x/enable', admin)).statusCode).toBe(404);
  });
});
