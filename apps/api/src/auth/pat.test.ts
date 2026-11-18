import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { PatController } from './pat.controller';
import { PAT_PREFIX, PatService } from './pat.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db } from '../core/db';

const suite = pgUp ? describe : describe.skip;
const alice = { subject: 'sub-alice', username: 'alice', name: 'Alice', email: 'alice@example.test', roles: ['athena-team-member'], groups: ['/org-pat'] };
const actor = { id: alice.subject, roles: alice.roles };

suite('jetons d’accès personnels (plan § 7.3 et 14.1)', () => {
  let testDb: TestDb; let svc: PatService; let db: Db;
  const org = crypto.randomUUID();
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_pat');
    db = new Db(testDb.pool);
    svc = new PatService(testDb.pool as never);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'pat','pat')", [org]));
  });
  afterAll(async () => { await testDb?.drop(); });

  it('crée un jeton montré une seule fois, stocké haché, et retrouve l’identité figée à la création', async () => {
    const { token, view } = await svc.create(org, alice, { name: 'CI', scope: 'read', expiresInDays: 30 }, actor);
    expect(token.startsWith(PAT_PREFIX)).toBe(true);
    expect(view.prefix).toBe(token.slice(0, 12));
    const stored = (await db.tx(org, (c) => c.query('select token_hash from personal_access_token'), { system: true })).rows.map((r) => r.token_hash as string);
    expect(stored).not.toContain(token); // jamais en clair
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
    const principal = await svc.verify(token);
    expect(principal).toMatchObject({ subject: 'sub-alice', username: 'alice', roles: ['athena-team-member'], groups: ['/org-pat'], patScope: 'read' });
    expect(JSON.stringify(await svc.list(org, 'sub-alice'))).not.toContain(token);
  });

  it('refuse un jeton inconnu, mal formé, révoqué ou expiré', async () => {
    expect(await svc.verify('athp_' + 'x'.repeat(43))).toBeNull();
    expect(await svc.verify('pas-un-jeton')).toBeNull();
    const { token, view } = await svc.create(org, alice, { name: 'à révoquer', scope: 'write', expiresInDays: 5 }, actor);
    expect(await svc.verify(token)).not.toBeNull();
    await svc.revoke(org, 'sub-alice', view.id, actor);
    expect(await svc.verify(token)).toBeNull();
    const expired = await svc.create(org, alice, { name: 'expiré', scope: 'read', expiresInDays: 1 }, actor);
    await db.tx(org, (c) => c.query("update personal_access_token set expires_at = now() - interval '1 second', created_at = now() - interval '2 days' where id = $1", [expired.view.id]), { system: true });
    expect(await svc.verify(expired.token)).toBeNull();
  });

  it('l’expiration est obligatoire et bornée à un an ; on ne révoque que ses propres jetons', async () => {
    await expect(svc.create(org, alice, { name: 'x', scope: 'read', expiresInDays: 0 }, actor)).rejects.toThrow();
    await expect(svc.create(org, alice, { name: 'x', scope: 'read', expiresInDays: 400 }, actor)).rejects.toThrow();
    const { view } = await svc.create(org, alice, { name: 'à moi', scope: 'read', expiresInDays: 10 }, actor);
    await expect(svc.revoke(org, 'sub-bob', view.id, { id: 'sub-bob', roles: [] })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('vingt jetons actifs au plus par utilisateur', async () => {
    const bob = { ...alice, subject: 'sub-bob', username: 'bob' };
    for (let i = 0; i < 20; i++) await svc.create(org, bob, { name: `t${i}`, scope: 'read', expiresInDays: 10 }, { id: 'sub-bob', roles: [] });
    await expect(svc.create(org, bob, { name: 'de trop', scope: 'read', expiresInDays: 10 }, { id: 'sub-bob', roles: [] })).rejects.toMatchObject({ code: 'validation' });
  });

  it('le jeton est enregistré dans le journal d’audit sans sa valeur', async () => {
    const rows = (await db.tx(org, (c) => c.query("select detail from audit_log where action = 'pat.create'"), { system: true })).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(PAT_PREFIX);
  });
});

describe('garde : jeton d’accès personnel', () => {
  const pats = {
    verify: async (t: string) => t === 'athp_lecture' + 'x'.repeat(30) ? { ...alice, patScope: 'read', patId: 'p1' }
      : t === 'athp_ecriture' + 'x'.repeat(30) ? { ...alice, patScope: 'write', patId: 'p2' } : null,
  };
  const guard = new AuthGuard(new Reflector(), {} as never, {} as never, {} as never, pats as never);
  const run = (token: string, method: string) => {
    const request: any = { headers: { authorization: `Bearer ${token}` }, method };
    const context: any = { getHandler: () => () => undefined, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => request }) };
    return guard.canActivate(context).then(() => request.principal, (e: { status: number }) => e.status);
  };
  it('la portée lecture autorise GET et refuse les écritures (403)', async () => {
    const read = 'athp_lecture' + 'x'.repeat(30);
    expect(await run(read, 'GET')).toMatchObject({ subject: 'sub-alice', patScope: 'read' });
    expect(await run(read, 'POST')).toBe(403);
    expect(await run(read, 'DELETE')).toBe(403);
  });
  it('la portée écriture autorise les écritures ; un jeton inconnu est refusé (401)', async () => {
    expect(await run('athp_ecriture' + 'x'.repeat(30), 'POST')).toMatchObject({ patScope: 'write' });
    expect(await run('athp_inconnu' + 'x'.repeat(30), 'GET')).toBe(401);
  });
  it('un jeton ne peut pas gérer les jetons (pas d’escalade par chaîne)', async () => {
    const controller = new PatController({} as never, {} as never);
    const request: any = { principal: { ...alice, patId: 'p1', patScope: 'write' } };
    await expect(controller.create(request, { name: 'x', expiresInDays: 5 })).rejects.toMatchObject({ status: 403 });
    await expect(controller.list(request)).rejects.toMatchObject({ status: 403 });
    await expect(controller.revoke(request, 'id')).rejects.toMatchObject({ status: 403 });
  });
});
