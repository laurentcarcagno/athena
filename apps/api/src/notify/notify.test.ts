import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SavedFilterService } from '../atql/saved-filter.service';
import { AccessService } from '../core/access.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { runAs } from '../core/request-context';
import { requirementTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { NotifyService } from './notify.service';

const suite = pgUp ? describe : describe.skip;
const actor = (id: string): Actor => ({ id, roles: ['athena-user', 'athena-admin'] });
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code}:${e.message}` : e ? `autre:${(e as Error).message}` : 'ok'; };

suite('notifications et abonnements (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let notify: NotifyService;
  let artifacts: ArtifactService;
  let links: LinkService;
  let access: AccessService;
  let filters: SavedFilterService;
  const org = crypto.randomUUID();
  const users = ['alice', 'bob', 'carol', 'dave'];

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_notify');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    notify = new NotifyService(db);
    links = new LinkService(db);
    access = new AccessService(db);
    filters = new SavedFilterService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'ntfy']));
    for (const s of users) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$2)', [org, s]));
    await trackers.createProject(org, 'NTF', 'Notifications', actor('alice'));
    await trackers.createTracker(org, requirementTemplate('NTF'), actor('alice'));
    await trackers.createTracker(org, { ...requirementTemplate('NTF', 'TST'), name: 'Essais' }, actor('alice'));
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  const make = (title: string, by = 'alice', tracker = 'REQ') => artifacts.create(org, 'NTF', tracker, { title, statement: 's' }, actor(by));
  const inbox = (who: string, unread = false) => runAs(who, () => notify.list(org, who, { unread }));
  const kinds = async (who: string) => (await inbox(who)).items.map((n) => `${n.event}:${n.key}`);
  const follow = (who: string, ref: string, scope: 'item' | 'tracker' | 'view' = 'item') => runAs(who, () => notify.subscribe(org, who, 'NTF', { scope, ref }));

  it('le créateur suit son item ; une transition notifie les abonnés sauf l’auteur de l’action', async () => {
    const a = await make('Transition');
    await follow('bob', a.key);
    await artifacts.transition(org, 'NTF', a.key, 'Approuver', 1, actor('bob'));
    expect(await kinds('alice')).toContain(`transition:${a.key}`);
    expect(await kinds('bob')).not.toContain(`transition:${a.key}`);
    const n = (await inbox('alice')).items.find((x) => x.key === a.key)!;
    expect(n).toMatchObject({ event: 'transition', actor: 'bob', read: false });
    expect(n.payload).toMatchObject({ from: 'draft', to: 'approved' });
    expect(JSON.stringify(n.payload)).not.toContain('Transition'); // aucune valeur de champ dans la notification
  });

  it('un commentaire notifie les abonnés de l’item ; le commentateur le suit ensuite', async () => {
    const a = await make('Commentaire');
    await links.addComment(org, 'NTF', a.key, 'Premier avis', actor('carol'));
    expect(await kinds('alice')).toContain(`comment:${a.key}`);
    expect(await kinds('carol')).not.toContain(`comment:${a.key}`);
    await links.addComment(org, 'NTF', a.key, 'Réponse', actor('alice'));
    expect(await kinds('carol')).toContain(`comment:${a.key}`);
  });

  it('modifier la cible d’un lien rend le lien suspect et notifie les abonnés de l’item source', async () => {
    const target = await make('Cible');
    const source = await make('Essai', 'alice', 'TST');
    await links.link(org, 'NTF', source.key, target.key, 'verifies', actor('alice'));
    await artifacts.update(org, 'NTF', target.key, { title: 'Cible modifiée' }, 1, actor('bob'));
    const n = (await inbox('alice')).items.find((x) => x.event === 'suspect' && x.key === source.key);
    expect(n?.payload).toMatchObject({ cause: target.key });
    expect(n?.actor).toBe('bob');
  });

  it('abonnement à un tracker : toute transition de ses items notifie', async () => {
    await follow('dave', 'REQ', 'tracker');
    const a = await make('Via le tracker');
    await artifacts.transition(org, 'NTF', a.key, 'Approuver', 1, actor('alice'));
    expect(await kinds('dave')).toContain(`transition:${a.key}`);
  });

  it('abonnement à une vue enregistrée : seuls les items qui correspondent à la requête notifient', async () => {
    const view = await filters.create(org, 'NTF', { name: 'Brouillons', query: 'status = draft', shared: true, trackerKey: 'REQ' }, actor('alice'));
    await follow('carol', view.id, 'view');
    const a = await make('Dans la vue');
    await links.addComment(org, 'NTF', a.key, 'Avis', actor('alice'));
    expect(await kinds('carol')).toContain(`comment:${a.key}`);
    await artifacts.transition(org, 'NTF', a.key, 'Approuver', 1, actor('alice')); // l’item sort de la vue
    expect(await kinds('carol')).not.toContain(`transition:${a.key}`);
  });

  it('un événement désactivé dans les réglages ne notifie plus ; les autres continuent', async () => {
    await runAs('alice', () => notify.setPref(org, 'alice', 'comment', false));
    const prefs = await runAs('alice', () => notify.prefs(org, 'alice'));
    expect(prefs).toMatchObject({ comment: false, transition: true, mention: true, suspect: true });
    const a = await make('Réglages');
    await links.addComment(org, 'NTF', a.key, 'Silence', actor('bob'));
    await artifacts.transition(org, 'NTF', a.key, 'Approuver', 1, actor('bob'));
    const mine = await kinds('alice');
    expect(mine).not.toContain(`comment:${a.key}`);
    expect(mine).toContain(`transition:${a.key}`);
    await runAs('alice', () => notify.setPref(org, 'alice', 'comment', true));
  });

  it('lu / non lu : marquer, tout marquer, compteur', async () => {
    const before = await inbox('alice', true);
    expect(before.unread).toBeGreaterThan(0);
    const first = before.items[0]!;
    await runAs('alice', () => notify.markRead(org, 'alice', { ids: [first.id] }, true));
    expect((await inbox('alice', true)).unread).toBe(before.unread - 1);
    await runAs('alice', () => notify.markRead(org, 'alice', { ids: [first.id] }, false));
    expect((await inbox('alice', true)).unread).toBe(before.unread);
    await runAs('alice', () => notify.markRead(org, 'alice', { all: true }, true));
    expect((await inbox('alice', true)).unread).toBe(0);
    expect((await inbox('alice')).items.length).toBeGreaterThan(0);
  });

  it('on ne marque pas les notifications d’un autre, ni ne supprime ses abonnements', async () => {
    const mine = await make('Item de Bob', 'bob');
    await links.addComment(org, 'NTF', mine.key, 'Pour Bob', actor('alice'));
    const theirs = (await inbox('bob')).items;
    expect(theirs.length).toBeGreaterThan(0);
    await runAs('alice', () => notify.markRead(org, 'alice', { ids: theirs.map((n) => n.id) }, true));
    expect((await inbox('bob')).unread).toBe(theirs.filter((n) => !n.read).length);
    const subs = await runAs('dave', () => notify.subscriptions(org, 'dave', 'NTF'));
    expect(subs.length).toBeGreaterThan(0);
    expect(await code(runAs('alice', () => notify.unsubscribe(org, 'alice', subs[0]!.id)))).toMatch(/^not_found/);
    expect(await code(runAs('dave', () => notify.unsubscribe(org, 'dave', subs[0]!.id)))).toBe('ok');
  });

  it('se désabonner puis s’abonner de nouveau est idempotent', async () => {
    const a = await make('Idempotence');
    const s1 = await follow('dave', a.key);
    const s2 = await follow('dave', a.key);
    expect(s2.id).toBe(s1.id);
    await runAs('dave', () => notify.unsubscribe(org, 'dave', s1.id));
    expect((await runAs('dave', () => notify.subscriptions(org, 'dave', 'NTF'))).some((s) => s.id === s1.id)).toBe(false);
  });

  it('droits : un abonné qui n’est pas ayant droit du tracker ne reçoit rien, et ne peut ni voir l’item ni s’y abonner', async () => {
    const a = await make('Avant la liste');
    await follow('carol', a.key);
    await access.set(org, 'NTF', { tracker: 'REQ', members: ['alice', 'bob'] }, actor('alice'));
    await links.addComment(org, 'NTF', a.key, 'Secret', actor('bob'));
    expect(await kinds('alice')).toContain(`comment:${a.key}`);
    expect(await kinds('carol')).not.toContain(`comment:${a.key}`);
    expect(await code(follow('carol', a.key))).toMatch(/^not_found/);
  });

  it('droits à la lecture : retirer un ayant droit masque aussi les notifications déjà reçues', async () => {
    const a = await make('Retrait');
    await links.addComment(org, 'NTF', a.key, 'Visible', actor('bob'));
    expect(await kinds('alice')).toContain(`comment:${a.key}`);
    await access.set(org, 'NTF', { tracker: 'REQ', members: ['bob'] }, actor('bob'));
    const after = await inbox('alice');
    expect(after.items.map((n) => n.key)).not.toContain(a.key);
    expect(after.unread).toBe(0);
    await access.remove(org, 'NTF', 'REQ', actor('bob'));
  });

  it('contrôle export : seul un ayant droit du marquage est notifié d’un item marqué', async () => {
    const a = await make('Marqué');
    await follow('bob', a.key);
    await access.setExportMembers(org, 'NTF', { members: ['alice'] }, actor('alice'));
    await access.setMarking(org, 'NTF', a.key, 'ITAR', actor('alice'));
    await links.addComment(org, 'NTF', a.key, 'Contrôlé', actor('carol'));
    expect(await kinds('alice')).toContain(`comment:${a.key}`);
    expect(await kinds('bob')).not.toContain(`comment:${a.key}`);
    await access.setMarking(org, 'NTF', a.key, null, actor('alice'));
  });

  it('mention (émission directe) : respecte l’auteur, les réglages et les droits', async () => {
    const a = await make('Mentions');
    await runAs('carol', () => notify.setPref(org, 'carol', 'mention', false));
    const count = await db.tx(org, (c) => notify.emitIn(c, org, { event: 'mention', artifactId: a.id, actor: 'alice', payload: { commentId: 'x' }, direct: ['bob', 'alice', 'carol'], directOnly: true }));
    expect(count).toBe(1); // bob seul : alice est l’auteur, carol a désactivé les mentions
    expect(await kinds('bob')).toContain(`mention:${a.key}`);
    expect(await kinds('carol')).not.toContain(`mention:${a.key}`);
  });

  it('chaque table est isolée par organisation (politique forcée)', async () => {
    const rows = await db.tx(org, async (c) => (await c.query("select relname from pg_class where relname in ('subscription','notification','notification_pref') and relrowsecurity and relforcerowsecurity")).rows);
    expect(rows).toHaveLength(3);
  });
});
