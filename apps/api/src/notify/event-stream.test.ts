import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { EventStreamService, type StreamEvent } from './event-stream';

const suite = pgUp ? describe : describe.skip;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

suite('flux temps réel des notifications (SSE)', () => {
  let testDb: TestDb; let db: Db;
  const org = crypto.randomUUID(); const project = crypto.randomUUID();
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_sse');
    db = new Db(testDb.pool);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'sse','sse')", [org]);
      await c.query("insert into project (id, organization_id, key, name) values ($1,$2,'SSE','Flux')", [project, org]);
    });
  });
  afterAll(async () => { await testDb?.drop(); });

  const notify = (recipient: string, event = 'comment') => db.tx(org, (c) => c.query("insert into notification (organization_id, recipient, event, project_id) values ($1,$2,$3,$4)", [org, recipient, event, project]), { system: true });

  it('émet une notification arrivée après l’ouverture, avec le nombre de non lues, et rien pour une autre personne', async () => {
    const svc = new EventStreamService(db, { intervalMs: 40, heartbeatMs: 10_000 });
    const got: StreamEvent[] = [];
    const sub = svc.stream(org, 'sub-eva').subscribe((e) => got.push(e));
    await wait(120);
    await notify('sub-lou');
    await notify('sub-eva', 'mention');
    await wait(250);
    sub.unsubscribe();
    expect(got.filter((e) => e.type === 'notification').map((e) => e.data['event'])).toEqual(['mention']);
    expect(got.find((e) => e.type === 'unread')?.data).toEqual({ count: 1 });
  });

  it('n’émet pas l’historique existant à l’ouverture', async () => {
    await notify('sub-ana'); // avant l'ouverture
    await wait(30);
    const svc = new EventStreamService(db, { intervalMs: 40, heartbeatMs: 10_000 });
    const got: StreamEvent[] = [];
    const sub = svc.stream(org, 'sub-ana').subscribe((e) => got.push(e));
    await wait(200);
    sub.unsubscribe();
    expect(got).toEqual([]);
  });

  it('bat toutes les heartbeatMs quand rien ne se passe', async () => {
    const svc = new EventStreamService(db, { intervalMs: 30, heartbeatMs: 100 });
    const got: StreamEvent[] = [];
    const sub = svc.stream(org, 'sub-idle').subscribe((e) => got.push(e));
    await wait(350);
    sub.unsubscribe();
    expect(got.filter((e) => e.type === 'heartbeat').length).toBeGreaterThanOrEqual(2);
  });

  it('plafonne à trois flux par personne et libère la place à la fermeture', async () => {
    const svc = new EventStreamService(db, { intervalMs: 1000, maxPerUser: 3 });
    const subs = [1, 2, 3].map(() => svc.stream(org, 'sub-multi').subscribe({ next: () => undefined }));
    expect(svc.connections('sub-multi')).toBe(3);
    const refused = await new Promise<{ code?: string } | null>((resolve) => { svc.stream(org, 'sub-multi').subscribe({ next: () => undefined, error: (e) => resolve(e), complete: () => resolve(null) }); });
    expect(refused?.code).toBe('forbidden');
    expect(svc.connections('sub-multi')).toBe(3); // la tentative refusée ne compte pas
    subs[0]!.unsubscribe();
    expect(svc.connections('sub-multi')).toBe(2);
    const again = svc.stream(org, 'sub-multi').subscribe({ next: () => undefined });
    expect(svc.connections('sub-multi')).toBe(3);
    again.unsubscribe(); subs[1]!.unsubscribe(); subs[2]!.unsubscribe();
    expect(svc.connections('sub-multi')).toBe(0);
  });
});
