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

  it('émet les changements de tickets avec les droits de la personne, sans aucune valeur de champ', async () => {
    const open = crypto.randomUUID(); const closed = crypto.randomUUID();
    const seed = async (pid: string, key: string, restricted: boolean) => db.tx(org, async (c) => {
      await c.query("insert into project (id, organization_id, key, name) values ($1,$2,$3,$3)", [pid, org, key]);
      const t = (await c.query("insert into tracker (organization_id, project_id, key, name) values ($1,$2,$3,$3) returning id", [org, pid, `T${key}`])).rows[0].id;
      const st = (await c.query("insert into status (organization_id, tracker_id, key, name, category) values ($1,$2,'open','Ouvert','todo') returning id", [org, t])).rows[0].id;
      const a = (await c.query(`insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, created_by) values ($1,$2,$3,1,$4,$5,'x') returning id`, [org, pid, t, `${key}-T${key}-0001`, st])).rows[0].id;
      if (restricted) {
        const l = (await c.query("insert into access_list (organization_id, project_id, created_by) values ($1,$2,'x') returning id", [org, pid])).rows[0].id;
        await c.query("insert into access_list_member (access_list_id, organization_id, subject, added_by) values ($1,$2,'sub-in','x')", [l, org]);
      }
      return a as string;
    }, { system: true });
    const artOpen = await seed(open, 'OPN', false);
    const artClosed = await seed(closed, 'CLS', true);
    const emit = (artifact: string, type: string, payload: object) => db.tx(org, (c) => c.query("insert into outbox_event (organization_id, aggregate_type, aggregate_id, type, payload) values ($1,'artifact',$2,$3,$4)", [org, artifact, type, JSON.stringify(payload)]), { system: true });

    const svc = new EventStreamService(db, { intervalMs: 40, heartbeatMs: 10_000 });
    const inside: StreamEvent[] = []; const outside: StreamEvent[] = [];
    const s1 = svc.stream(org, 'sub-in').subscribe((e) => inside.push(e));
    const s2 = svc.stream(org, 'sub-out').subscribe((e) => outside.push(e));
    await wait(150);
    await emit(artOpen, 'artifact.updated', { key: 'OPN-TOPN-0001', changes: { title: { from: 'secret-a', to: 'secret-b' } } });
    await emit(artClosed, 'artifact.transitioned', { key: 'CLS-TCLS-0001', transition: 'go', from: 'open', to: 'done' });
    await wait(300);
    s1.unsubscribe(); s2.unsubscribe();
    const tickets = (list: StreamEvent[]) => list.filter((e) => e.type === 'ticket').map((e) => e.data);
    expect(tickets(inside).map((d) => d['key'])).toEqual(['OPN-TOPN-0001', 'CLS-TCLS-0001']);
    expect(tickets(inside)[0]).toMatchObject({ event: 'artifact.updated', project: 'OPN', fields: ['title'] });
    expect(tickets(outside).map((d) => d['key'])).toEqual(['OPN-TOPN-0001']); // le projet à liste d'ayants droit reste invisible
    expect(JSON.stringify(inside)).not.toContain('secret');
    expect(tickets(inside)).toHaveLength(2); // curseur en texte : aucun rejeu
  });
});
