import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { mentionTokens } from './mention';
import { NotifyService } from './notify.service';

const suite = pgUp ? describe : describe.skip;
const actor = (id: string): Actor => ({ id, roles: ['athena-team-member', 'athena-admin'] });

describe('extraction des mentions', () => {
  it('reconnaît @identifiant (points et tirets compris), pas les adresses ni les chemins', () => {
    expect(mentionTokens('Salut @Bob et @user.dev, voir aussi @carol-2.')).toEqual(['bob', 'user.dev', 'carol-2']);
    expect(mentionTokens('(@alice) puis\n@dave')).toEqual(['alice', 'dave']);
    expect(mentionTokens('écrire à bob@exemple.lan ou /home/@bob ou a@@b')).toEqual([]);
    expect(mentionTokens('@bob @BOB @bob')).toEqual(['bob']);
    expect(mentionTokens('@')).toEqual([]);
    expect(mentionTokens('<script>@evil</script>')).toEqual(['evil']);
  });
});

suite('mentions dans les commentaires (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let notify: NotifyService;
  let artifacts: ArtifactService;
  let links: LinkService;
  let access: AccessService;
  const org = crypto.randomUUID();
  const people: Array<[string, string]> = [['alice', 'Alice Martin'], ['bob', 'Bob Durand'], ['carol', 'Carol Petit'], ['dave', 'Dave Roux'], ['user.dev', 'User Dev']];

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_mention');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    notify = new NotifyService(db);
    links = new LinkService(db);
    access = new AccessService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'mention']));
    for (const [s, name] of people) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$3)', [org, s, name]));
    await trackers.createProject(org, 'MEN', 'Mentions', actor('alice'));
    await trackers.createTracker(org, requirementTemplate('MEN'), actor('alice'));
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  const make = (title: string) => artifacts.create(org, 'MEN', 'REQ', { title, statement: 's' }, actor('alice'));
  const mine = (who: string, event?: 'mention' | 'comment') => runAs(who, () => notify.list(org, who, event ? { event } : {})).then((r) => r.items);
  const keys = async (who: string, event: 'mention' | 'comment') => (await mine(who, event)).map((n) => n.key);

  it('une mention notifie la personne mentionnée (même non abonnée), à la place du commentaire', async () => {
    const a = await make('Une mention');
    await runAs('carol', () => notify.subscribe(org, 'carol', 'MEN', { scope: 'item', ref: a.key }));
    const comment = await links.addComment(org, 'MEN', a.key, 'Peux-tu relire, @bob et @carol ?', actor('alice'));
    expect(comment.mentions).toEqual(['bob', 'carol']);
    expect(await keys('bob', 'mention')).toEqual([a.key]);
    expect(await keys('bob', 'comment')).toEqual([]); // pas abonné : seule la mention
    expect(await keys('carol', 'mention')).toEqual([a.key]);
    expect(await keys('carol', 'comment')).toEqual([]); // abonnée, mais la mention remplace le commentaire
    expect((await mine('bob', 'mention'))[0]!.payload).toMatchObject({ commentId: comment.id });
  });

  it('les autres abonnés reçoivent le commentaire ordinaire ; on ne se notifie pas soi-même', async () => {
    const a = await make('Autres abonnés');
    await runAs('dave', () => notify.subscribe(org, 'dave', 'MEN', { scope: 'item', ref: a.key }));
    const c = await links.addComment(org, 'MEN', a.key, 'Note pour moi-même @alice', actor('alice'));
    expect(c.mentions).toEqual([]); // l’auteur n’est pas listé comme mentionné
    expect(await keys('dave', 'comment')).toContain(a.key);
    expect(await keys('alice', 'mention')).not.toContain(a.key);
  });

  it('un utilisateur sans accès à l’item ou inconnu est ignoré sans indication', async () => {
    const a = await make('Confidentiel');
    await access.set(org, 'MEN', { tracker: 'REQ', members: ['alice', 'bob'] }, actor('alice'));
    const c = await links.addComment(org, 'MEN', a.key, '@bob @dave @inconnu', actor('alice'));
    expect(c.mentions).toEqual(['bob']);
    expect(await keys('bob', 'mention')).toContain(a.key);
    expect(await keys('dave', 'mention')).not.toContain(a.key);
    await access.remove(org, 'MEN', 'REQ', actor('alice'));
  });

  it('mentionner la personne qui a désactivé les mentions : elle reçoit le commentaire si elle est abonnée', async () => {
    const a = await make('Réglage');
    await runAs('bob', () => notify.setPref(org, 'bob', 'mention', false));
    await runAs('bob', () => notify.subscribe(org, 'bob', 'MEN', { scope: 'item', ref: a.key }));
    await links.addComment(org, 'MEN', a.key, 'Pour @bob', actor('alice'));
    expect(await keys('bob', 'mention')).not.toContain(a.key);
    expect(await keys('bob', 'comment')).toContain(a.key);
    await runAs('bob', () => notify.setPref(org, 'bob', 'mention', true));
  });

  it('autocomplétion : seulement les personnes qui peuvent lire l’item, par préfixe d’identifiant ou de nom, sans soi-même', async () => {
    const a = await make('Autocomplétion');
    const all = await runAs('alice', () => notify.mentionable(org, 'alice', 'MEN', a.key, ''));
    expect(all.map((u) => u.username)).toEqual(['bob', 'carol', 'dave', 'user.dev']);
    expect((await runAs('alice', () => notify.mentionable(org, 'alice', 'MEN', a.key, 'BO'))).map((u) => u.username)).toEqual(['bob']);
    expect((await runAs('alice', () => notify.mentionable(org, 'alice', 'MEN', a.key, 'Petit'))).map((u) => u.username)).toEqual(['carol']); // prénom ou nom de famille
    expect((await runAs('alice', () => notify.mentionable(org, 'alice', 'MEN', a.key, 'user.'))).map((u) => u.username)).toEqual(['user.dev']);
    expect(await runAs('alice', () => notify.mentionable(org, 'alice', 'MEN', a.key, '%'))).toEqual([]); // le joker n'est pas interprété
    await access.set(org, 'MEN', { tracker: 'REQ', members: ['alice', 'carol'] }, actor('alice'));
    expect((await runAs('alice', () => notify.mentionable(org, 'alice', 'MEN', a.key, ''))).map((u) => u.username)).toEqual(['carol']);
    const hidden = await runAs('dave', () => notify.mentionable(org, 'dave', 'MEN', a.key, '')).then(() => null, (e: unknown) => e);
    expect(hidden).toBeInstanceOf(DomainError); // dave ne voit même plus l’item
    await access.remove(org, 'MEN', 'REQ', actor('alice'));
  });

  it('le texte du commentaire est stocké tel quel (l’interface l’échappe) et les mentions dans du balisage restent des mentions', async () => {
    const a = await make('Assainissement');
    const body = '<img src=x onerror=alert(1)> @bob';
    const c = await links.addComment(org, 'MEN', a.key, body, actor('alice'));
    expect(c.body).toBe(body);
    expect((await links.comments(org, 'MEN', a.key))[0]!.body).toBe(body);
    expect(c.mentions).toEqual(['bob']);
  });
});
