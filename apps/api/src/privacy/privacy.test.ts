import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { PatService } from '../auth/pat.service';
import { PrivacyService, pseudonym } from './privacy.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-admin'] };

suite('RGPD : export et effacement (plan § 10)', () => {
  let testDb: TestDb; let db: Db; let svc: PrivacyService;
  const org = crypto.randomUUID();
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_privacy');
    db = new Db(testDb.pool);
    svc = new PrivacyService(db);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'pv','pv')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-eva','eva','Eva Martin','eva@example.test'), ($1,'sub-lou','lou','Lou Durand','lou@example.test')", [org]);
      await c.query("insert into notification_pref (organization_id, subject, event, enabled) values ($1,'sub-eva','mention',false), ($1,'sub-lou','mention',true)", [org]);
      await c.query("insert into user_pin (organization_id, subject, kind, project_key, ref, label, favorite, position) values ($1,'sub-eva','project','ARI','ARI','ARI',true,0)", [org]);
      await c.query("insert into web_session (id_hash, subject, principal, expires_at) values ('h-eva','sub-eva','{}', now() + interval '1 hour'), ('h-lou','sub-lou','{}', now() + interval '1 hour')");
    }, { system: true });
    await new PatService(testDb.pool as never).create(org, { subject: 'sub-eva', username: 'eva', name: 'Eva Martin', email: 'eva@example.test', roles: ['athena-team-member'], groups: ['/org-pv'] }, { name: 'CI', scope: 'read', expiresInDays: 30 }, { id: 'sub-eva', roles: [] });
  });
  afterAll(async () => { await testDb?.drop(); });

  it('l’export contient les données de la personne et rien de celles des autres', async () => {
    const data = await svc.export(org, 'sub-eva') as Record<string, Array<Record<string, unknown>>>;
    expect(data['profile']![0]).toMatchObject({ username: 'eva', display_name: 'Eva Martin', email: 'eva@example.test' });
    expect(data['notificationPreferences']).toEqual([{ event: 'mention', enabled: false }]);
    expect(data['pins']).toHaveLength(1);
    expect(data['accessTokens']![0]).toMatchObject({ name: 'CI', scope: 'read' });
    expect(JSON.stringify(data)).not.toContain('lou@example.test');
    expect(JSON.stringify(data)).not.toMatch(/athp_[A-Za-z0-9_-]{30,}/); // jamais la valeur d'un jeton
  });

  it('l’effacement pseudonymise le profil, supprime préférences, épingles et sessions, révoque les jetons', async () => {
    const r = await svc.erase(org, 'sub-eva', admin);
    expect(r.pseudonym).toBe(pseudonym('sub-eva'));
    expect(r.tokensRevoked).toBe(1);
    const data = await svc.export(org, 'sub-eva') as Record<string, Array<Record<string, unknown>>>;
    expect(data['profile']![0]).toMatchObject({ username: r.pseudonym, display_name: 'Utilisateur effacé', email: null });
    expect(data['notificationPreferences']).toEqual([]);
    expect(data['pins']).toEqual([]);
    expect(data['accessTokens']![0]!['revoked_at']).not.toBeNull();
    const sessions = (await db.tx(org, (c) => c.query('select subject from web_session'), { system: true })).rows.map((x) => x.subject);
    expect(sessions).toEqual(['sub-lou']); // la session de l'autre personne reste
    const lou = await svc.export(org, 'sub-lou') as Record<string, Array<Record<string, unknown>>>;
    expect(lou['profile']![0]).toMatchObject({ display_name: 'Lou Durand', email: 'lou@example.test' });
  });

  it('l’effacement est tracé dans le journal d’audit sans données personnelles ; refusé pour soi-même et pour un inconnu', async () => {
    const rows = (await db.tx(org, (c) => c.query("select target, detail from audit_log where action = 'privacy.erase'"), { system: true })).rows;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('eva@example.test');
    expect(rows[0].target).toBe(`user:${pseudonym('sub-eva')}`);
    await expect(svc.erase(org, 'sub-admin', admin)).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.erase(org, 'sub-inconnu', admin)).rejects.toMatchObject({ code: 'not_found' });
  });
});
