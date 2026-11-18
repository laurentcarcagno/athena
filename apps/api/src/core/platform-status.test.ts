import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES_KEY, withUserRole } from '../auth/auth.guard';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db } from './db';
import { PlatformStatusController } from './platform-status.controller';
import { PlatformStatusService } from './platform-status.service';

// Carte « État de la plateforme » (lot 27, N9) : des comptes pour l'administrateur, rien d'autre.

describe('droits', () => {
  it('l’administrateur seul lit l’état de la plateforme', () => {
    const required = Reflect.getMetadata(ROLES_KEY, PlatformStatusController.prototype.get) as string[];
    expect(required.some((r) => withUserRole(['athena-admin'], 'GET').includes(r))).toBe(true);
    for (const role of ['athena-pmo', 'athena-pm', 'athena-director', 'athena-finance', 'athena-team-member']) expect(required.some((r) => withUserRole([role], 'GET').includes(r)), role).toBe(false);
  });
});

const suite = pgUp ? describe : describe.skip;
suite('état de la plateforme (intégration)', () => {
  let testDb: TestDb; let db: Db; let status: PlatformStatusService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_platform_status');
    db = new Db(testDb.pool);
    status = new PlatformStatusService(db);
    for (const [id, key] of [[org, 'ps'], [other, 'ps2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('compte l’historique en retard, les webhooks, les plugins et les jetons proches de l’échéance, par organisation', async () => {
    expect(await status.status(org)).toEqual({ history: { pending: 0, oldestMinutes: null, reconcileErrors: 0 }, webhooks: { failed: 0, late: 0 }, plugins: { installed: 0, disabled: 0 }, tokens: { expiring: 0 } });
    await db.tx(org, async (c) => {
      await c.query("insert into outbox_event (organization_id, aggregate_type, aggregate_id, type, payload, created_at) values ($1,'artifact',gen_random_uuid(),'artifact.updated','{}', now() - interval '20 minutes'), ($1,'artifact',gen_random_uuid(),'artifact.created','{}', now() - interval '1 minute')", [org]);
      await c.query("insert into plugin_installation (organization_id, plugin_id, version, manifest, code, signature, installed_by, enabled) values ($1,'a','1','{}','','s','x',true), ($1,'b','1','{}','','s','x',false)", [org]);
      await c.query("insert into personal_access_token (organization_id, subject, username, roles, groups, name, scope, token_prefix, token_hash, expires_at) values ($1,'s','u','{}','{}','proche','read','p1','h1', now() + interval '5 days'), ($1,'s','u','{}','{}','loin','read','p2','h2', now() + interval '200 days')", [org]);
    }, { system: true });
    const s = await status.status(org);
    expect(s.history.pending).toBe(1); // seul l'événement vieux de vingt minutes compte
    expect(s.history.oldestMinutes).toBeGreaterThanOrEqual(19);
    expect(s.plugins).toEqual({ installed: 2, disabled: 1 });
    expect(s.tokens.expiring).toBe(1);
    expect((await status.status(other)).plugins.installed).toBe(0); // isolation d'organisation
  });
});
