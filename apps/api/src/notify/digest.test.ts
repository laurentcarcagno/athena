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
import { composeDigest, DigestService, localHour, type DigestItem } from './digest';
import { NotifyService } from './notify.service';
import type { Mail, Mailer } from './smtp';

const suite = pgUp ? describe : describe.skip;
const actor = (id: string): Actor => ({ id, roles: ['athena-user', 'athena-admin'] });
const item = (over: Partial<DigestItem> = {}): DigestItem => ({ event: 'comment', project: 'DIG', key: 'DIG-REQ-0001', actorName: 'Bob', payload: {}, ...over });

describe('composition du résumé', () => {
  it('regroupe par projet, liens canoniques, aucune valeur de champ', () => {
    const { subject, text } = composeDigest([
      item(), item({ event: 'transition', key: 'DIG-REQ-0002', payload: { from: 'draft', to: 'approved', title: 'SECRET' } }),
      item({ project: 'ZED', key: 'ZED-REQ-0001', event: 'suspect', payload: { cause: 'ZED-REQ-0009' } }),
    ], { locale: 'fr', name: 'Alice', baseUrl: 'https://athena.interne.lan/' });
    expect(subject).toBe('Athena : 3 notifications non lues');
    expect(text).toContain('Bonjour Alice,');
    expect(text.indexOf('DIG\n')).toBeLessThan(text.indexOf('ZED\n'));
    expect(text).toContain('  - DIG-REQ-0001 : Bob a commenté l’item\n    https://athena.interne.lan/p/DIG/a/DIG-REQ-0001');
    expect(text).toContain('Bob a fait passer l’item de draft à approved');
    expect(text).toContain('lien suspect : Bob a modifié ZED-REQ-0009');
    expect(text).not.toContain('SECRET'); // la charge utile peut porter n’importe quoi : seules les clés prévues sont reprises
  });

  it('anglais, singulier, et plafond de 100 lignes', () => {
    expect(composeDigest([item()], { locale: 'en', name: 'Alice', baseUrl: 'http://x' }).subject).toBe('Athena: 1 unread notification');
    const many = Array.from({ length: 130 }, (_, i) => item({ key: `DIG-REQ-${String(i + 1).padStart(4, '0')}` }));
    const { text, subject } = composeDigest(many, { locale: 'fr', name: 'A', baseUrl: 'http://x' });
    expect(subject).toBe('Athena : 130 notifications non lues');
    expect(text.match(/ : Bob a commenté/g)).toHaveLength(100);
    expect(text).toContain('… et 30 autre(s) dans Athena.');
  });
});

describe('heure locale', () => {
  it('suit le fuseau et l’heure d’été', () => {
    expect(localHour(new Date('2026-11-07T07:00:00Z'), 'Europe/Paris')).toBe(8); // hiver : UTC+1
    expect(localHour(new Date('2026-07-07T06:00:00Z'), 'Europe/Paris')).toBe(8); // été : UTC+2
    expect(localHour(new Date('2026-11-07T07:00:00Z'), 'UTC')).toBe(7);
    expect(localHour(new Date('2026-11-07T00:30:00Z'), 'Asia/Tokyo')).toBe(9);
  });
});

class Outbox implements Mailer {
  sent: Mail[] = [];
  failNext = 0;
  async send(mail: Mail): Promise<void> {
    if (this.failNext > 0) { this.failNext--; throw new Error('SMTP : indisponible'); }
    this.sent.push(mail);
  }
}

suite('résumé quotidien (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let notify: NotifyService;
  let digest: DigestService;
  let outbox: Outbox;
  let artifacts: ArtifactService;
  let links: LinkService;
  let access: AccessService;
  const org = crypto.randomUUID();
  const at = (iso: string) => new Date(iso);
  const run = (iso: string) => digest.runDue(org, at(iso));
  const settings = (who: string, over: Partial<{ enabled: boolean; hour: number; timezone: string; locale: 'fr' | 'en' }> = {}) =>
    digest.setSettings(org, who, { enabled: true, hour: 8, timezone: 'Europe/Paris', locale: 'fr', ...over });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_digest');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    notify = new NotifyService(db);
    links = new LinkService(db);
    access = new AccessService(db);
    outbox = new Outbox();
    digest = new DigestService(db, { mailer: outbox, baseUrl: 'https://athena.interne.lan', available: true });
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'digest']));
    const people: Array<[string, string | null]> = [['alice', 'alice@interne.lan'], ['bob', 'bob@interne.lan'], ['carol', null], ['dave', 'dave@interne.lan']];
    for (const [s, email] of people) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$2,$3,$4)', [org, s, s[0]!.toUpperCase() + s.slice(1), email]));
    await trackers.createProject(org, 'DIG', 'Résumé', actor('alice'));
    await trackers.createTracker(org, requirementTemplate('DIG'), actor('alice'));
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  const make = (title: string, by = 'alice') => artifacts.create(org, 'DIG', 'REQ', { title, statement: 's' }, actor(by));
  const reset = () => { outbox.sent = []; outbox.failNext = 0; };

  it('réglage par défaut : désactivé, 8 h, UTC ; un fuseau inconnu est refusé', async () => {
    expect(await digest.settings(org, 'alice')).toEqual({ enabled: false, hour: 8, timezone: 'UTC', locale: 'fr', available: true });
    const e = await digest.setSettings(org, 'alice', { enabled: true, hour: 8, timezone: 'Mars/Olympus', locale: 'fr' }).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(DomainError);
  });

  it('un seul courriel par personne et par jour, à son heure locale, regroupant ses notifications non lues', async () => {
    reset();
    await settings('alice');
    const a = await make('Premier');
    const b = await make('Second');
    await links.addComment(org, 'DIG', a.key, 'Avis', actor('bob'));
    await artifacts.transition(org, 'DIG', b.key, 'Approuver', 1, actor('bob'));
    expect(await run('2026-11-07T08:00:00Z')).toBe(0); // 9 h à Paris : pas l’heure
    expect(outbox.sent).toHaveLength(0);
    expect(await run('2026-11-07T07:00:00Z')).toBe(1);
    expect(outbox.sent).toHaveLength(1);
    const mail = outbox.sent[0]!;
    expect(mail.to).toBe('alice@interne.lan');
    expect(mail.subject).toBe('Athena : 2 notifications non lues');
    expect(mail.text).toContain(`${a.key} : Bob a commenté l’item`);
    expect(mail.text).toContain(`https://athena.interne.lan/p/DIG/a/${b.key}`);
    expect(mail.text).toContain('Bob a fait passer l’item de draft à approved');
    expect(await run('2026-11-07T07:05:00Z')).toBe(0); // même heure, déjà envoyé
    expect(await run('2026-11-08T07:00:00Z')).toBe(0); // lendemain : rien de nouveau, rien d’envoyé
    expect(outbox.sent).toHaveLength(1);
    const c = await make('Troisième');
    await links.addComment(org, 'DIG', c.key, 'Encore', actor('bob'));
    expect(await run('2026-11-09T07:00:00Z')).toBe(1); // seule la nouveauté
    expect(outbox.sent[1]!.subject).toBe('Athena : 1 notification non lue');
  });

  it('chaque personne choisit son heure et sa langue ; les non lues seulement ; sans adresse ou désactivé, rien', async () => {
    reset();
    await settings('bob', { hour: 18, timezone: 'UTC', locale: 'en' });
    await settings('carol'); // pas d’adresse de courriel
    await digest.setSettings(org, 'dave', { enabled: false, hour: 18, timezone: 'UTC', locale: 'fr' });
    const x = await make('Pour Bob', 'bob');
    const y = await make('Lu par Bob', 'bob');
    for (const who of ['carol', 'dave']) await runAs(who, () => notify.subscribe(org, who, 'DIG', { scope: 'item', ref: x.key }));
    await links.addComment(org, 'DIG', x.key, 'Salut', actor('alice'));
    await links.addComment(org, 'DIG', y.key, 'Déjà vu', actor('alice'));
    const seen = (await runAs('bob', () => notify.list(org, 'bob'))).items.find((n) => n.key === y.key)!;
    await runAs('bob', () => notify.markRead(org, 'bob', { ids: [seen.id] }, true));
    expect(await run('2026-11-10T17:00:00Z')).toBe(0); // 18 h à Paris, pas à UTC
    expect(await run('2026-11-10T18:00:00Z')).toBe(1);
    expect(outbox.sent.map((m) => m.to)).toEqual(['bob@interne.lan']);
    expect(outbox.sent[0]!.subject).toBe('Athena: 1 unread notification');
    expect(outbox.sent[0]!.text).toContain('Alice commented on the item');
    expect(outbox.sent[0]!.text).not.toContain(y.key);
  });

  it('aucun contenu hors droits : un item devenu illisible n’entre pas dans le courriel', async () => {
    reset();
    const secret = await make('Confidentiel');
    const open = await make('Public');
    await runAs('bob', () => notify.subscribe(org, 'bob', 'DIG', { scope: 'item', ref: secret.key }));
    await runAs('bob', () => notify.subscribe(org, 'bob', 'DIG', { scope: 'item', ref: open.key }));
    await links.addComment(org, 'DIG', secret.key, 'Sensible', actor('alice'));
    await links.addComment(org, 'DIG', open.key, 'Anodin', actor('alice'));
    await access.setMarking(org, 'DIG', secret.key, 'ITAR', actor('alice')).catch(() => undefined);
    await access.setExportMembers(org, 'DIG', { members: ['alice'] }, actor('alice'));
    await access.setMarking(org, 'DIG', secret.key, 'ITAR', actor('alice'));
    expect(await run('2026-11-11T18:00:00Z')).toBe(1);
    const text = outbox.sent[0]!.text;
    expect(text).toContain(open.key);
    expect(text).not.toContain(secret.key);
    await access.setMarking(org, 'DIG', secret.key, null, actor('alice'));
  });

  it('échec d’envoi : rien n’est marqué envoyé, réessai au cycle suivant', async () => {
    reset();
    await settings('dave', { hour: 6, timezone: 'UTC' });
    const z = await make('Échec');
    await runAs('dave', () => notify.subscribe(org, 'dave', 'DIG', { scope: 'item', ref: z.key }));
    await links.addComment(org, 'DIG', z.key, 'À envoyer', actor('alice'));
    outbox.failNext = 1;
    const logs: string[] = [];
    expect(await digest.runDue(org, at('2026-11-12T06:00:00Z'), (m) => logs.push(m))).toBe(0);
    expect(logs[0]).toMatch(/échec pour dave : SMTP : indisponible/);
    expect(await digest.runDue(org, at('2026-11-12T06:05:00Z'))).toBe(1);
    expect(outbox.sent[0]!.to).toBe('dave@interne.lan');
    expect(outbox.sent[0]!.text).toContain(z.key);
  });

  it('sans messagerie configurée : aucun envoi, le réglage reste visible comme indisponible', async () => {
    const off = new DigestService(db, { mailer: null, baseUrl: 'https://x', available: false });
    expect(await off.runDue(org, at('2026-11-12T08:00:00Z'))).toBe(0);
    expect((await off.settings(org, 'alice')).available).toBe(false);
  });
});
