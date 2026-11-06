import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { WebhookService, type SecretStore } from '../webhooks/webhook.service';
import { AccessService } from './access.service';
import { ArtifactService } from './artifact.service';
import { CoverageService } from './coverage.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { NormativeService } from './normative.service';
import { runAs } from './request-context';
import { requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code}:${e.details.join('|')}` : e ? `autre:${(e as Error).message}` : 'ok'; };
class MemorySecrets implements SecretStore {
  readonly data = new Map<string, Record<string, string>>();
  async put(path: string, data: Record<string, string>) { this.data.set(path, data); }
  async get(path: string) { return this.data.get(path) ?? null; }
}

suite('marquage de contrôle export', () => {
  let testDb: TestDb;
  let db: Db;
  let access: AccessService;
  let artifacts: ArtifactService;
  let search: SearchService;
  let links: LinkService;
  let server: http.Server;
  const received: string[] = [];
  const org = crypto.randomUUID();

  beforeAll(async () => {
    server = http.createServer((req, res) => { const chunks: Buffer[] = []; req.on('data', (c: Buffer) => chunks.push(c)); req.on('end', () => { received.push(`${req.url} ${Buffer.concat(chunks).toString()}`); res.end('ok'); }); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    testDb = await createTestDb('athena_test_export_control');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    access = new AccessService(db);
    search = new SearchService(db);
    links = new LinkService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'ec']));
    for (const s of ['u-admin', 'u-lead', 'u-reader']) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$2)', [org, s]));
    await trackers.createProject(org, 'DEF', 'Défense', admin);
    await trackers.createTracker(org, requirementTemplate('DEF'), admin);
    await trackers.createTracker(org, { ...requirementTemplate('DEF', 'TST'), name: 'Essais' }, admin);
    for (let i = 1; i <= 3; i++) await artifacts.create(org, 'DEF', 'REQ', { title: `Exigence ${i}`, statement: 'texte confidentiel' }, admin);
    await artifacts.create(org, 'DEF', 'TST', { title: 'Essai', statement: 's' }, admin);
    await links.link(org, 'DEF', 'DEF-TST-0001', 'DEF-REQ-0002', 'verifies', admin);
  }, 60_000);
  afterAll(async () => { await new Promise((r) => server.close(r)); await testDb?.drop(); });

  const as = <T>(s: string, fn: () => Promise<T>) => runAs(s, fn);
  const total = (s: string, q = 'tracker = REQ') => as(s, () => search.search(org, 'DEF', q, s)).then((r) => r.total);

  it('exige des ayants droit avant tout marquage, et réserve le marquage aux responsables (route)', async () => {
    expect(await code(access.setMarking(org, 'DEF', 'DEF-REQ-0002', 'ITAR', admin))).toMatch(/^validation:.*ayants droit/);
    await access.setExportMembers(org, 'DEF', { members: ['u-lead'] }, admin);
    expect(await access.exportMembers(org, 'DEF')).toMatchObject({ marked: 0, members: [{ subject: 'u-lead' }] });
    expect(await code(access.setExportMembers(org, 'DEF', { members: ['fantome'] }, admin))).toMatch(/^validation:.*inconnu/);
    // route réservée aux responsables : décorateur de rôles juste avant la route de marquage
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, 'access.controller.ts'), 'utf8');
    expect(source).toMatch(/@Roles\('athena-admin', 'athena-pm'\)\s+@Put\(':project\/artifacts\/:key\/marking'\)/);
  });

  it('marque un item : version, révision, événement et audit ; le marquage est réversible', async () => {
    const out = await as('u-lead', () => access.setMarking(org, 'DEF', 'DEF-REQ-0002', 'ITAR', admin));
    expect(out).toEqual({ key: 'DEF-REQ-0002', exportControl: 'ITAR', version: 2 });
    const rows = await db.tx(org, async (c) => ({
      rev: (await c.query("select diff from artifact_revision r join artifact a on a.id = r.artifact_id where a.key = 'DEF-REQ-0002' and r.version = 2")).rows[0].diff,
      event: (await c.query("select payload from outbox_event where type = 'artifact.marking_changed'")).rows[0].payload,
      audit: (await c.query("select detail from audit_log where action = 'artifact.marking'")).rows[0].detail,
    }), { system: true });
    expect(rows.rev).toEqual({ export_control: { from: null, to: 'ITAR' } });
    expect(rows.event).toMatchObject({ key: 'DEF-REQ-0002', exportControl: 'ITAR', version: 2 });
    expect(rows.audit).toEqual({ from: null, to: 'ITAR', version: 2 });
    expect(await access.exportMembers(org, 'DEF')).toMatchObject({ marked: 1 });
    expect(await code(access.setExportMembers(org, 'DEF', { members: [] }, admin))).toMatch(/^validation:.*ne peut pas être vidée/);
  });

  it('un item marqué n’est lisible que des ayants droit : lecture, recherche, compteurs et plein texte', async () => {
    expect(await as('u-reader', () => code(artifacts.get(org, 'DEF', 'DEF-REQ-0002')))).toBe('not_found:');
    expect((await as('u-lead', () => artifacts.get(org, 'DEF', 'DEF-REQ-0002'))).exportControl).toBe('ITAR');
    expect(await total('u-reader')).toBe(2);
    expect(await total('u-lead')).toBe(3);
    expect(await total('u-reader', 'text ~ "confidentiel"')).toBe(2); // plein texte : l’item marqué n’est pas trouvé
    expect(await total('u-lead', 'text ~ "confidentiel"')).toBe(3);
    expect(await total('u-admin')).toBe(2); // administrateur d’organisation non ayant droit : même règle
    const count = (s: string) => as(s, () => db.tx(org, async (c) => Number((await c.query("select count(*) n from artifact where tracker_id = (select id from tracker where key = 'REQ')")).rows[0].n)));
    expect([await count('u-reader'), await count('u-lead')]).toEqual([2, 3]);
    const coverage = new CoverageService(db);
    await coverage.create(org, 'DEF', 'v', { name: 'V', fromTracker: 'REQ', linkType: 'verifies', direction: 'any', minCount: 1, statuses: [], threshold: { target: 100 } }, admin);
    expect((await as('u-reader', () => coverage.evaluate(org, 'DEF', ['athena-user'])))[0]).toMatchObject({ total: 2 });
    expect((await as('u-lead', () => coverage.evaluate(org, 'DEF', ['athena-user'])))[0]).toMatchObject({ total: 3 });
  });

  it('les items liés affichent « lien vers un item sous contrôle export » sans clé ni titre', async () => {
    const forReader = await as('u-reader', () => links.list(org, 'DEF', 'DEF-TST-0001'));
    expect(forReader).toHaveLength(1);
    expect(forReader[0]).toMatchObject({ type: 'verifies', other: null, restricted: true });
    expect(JSON.stringify(forReader)).not.toMatch(/DEF-REQ-0002|Exigence 2/);
    const forLead = await as('u-lead', () => links.list(org, 'DEF', 'DEF-TST-0001'));
    expect(forLead[0]).toMatchObject({ other: 'DEF-REQ-0002' });
    expect(forLead[0]!.restricted).toBeUndefined();
  });

  it('les exports (conformité, notes) n’incluent pas l’item pour un non-ayant droit', async () => {
    const normative = new NormativeService(db, artifacts);
    expect(normative).toBeDefined();
    const rows = (s: string) => as(s, () => db.tx(org, async (c) => (await c.query("select a.key from artifact a where a.key like 'DEF-REQ-%' order by a.key")).rows.map((r) => r.key as string)));
    expect(await rows('u-reader')).toEqual(['DEF-REQ-0001', 'DEF-REQ-0003']);
    expect(await rows('u-lead')).toEqual(['DEF-REQ-0001', 'DEF-REQ-0002', 'DEF-REQ-0003']);
  });

  it('webhooks sortants : l’événement d’un item marqué ne part que vers un abonnement habilité', async () => {
    const secrets = new MemorySecrets();
    const hooks = new WebhookService(testDb.pool, secrets, { allowPrivate: true, maxAttempts: 2, backoffMs: () => 0, disableAfterFailures: 5 });
    const url = (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}/${path}`;
    await hooks.createEndpoint(org, { url: url('plain'), eventTypes: ['*'] }, admin);
    await hooks.createEndpoint(org, { url: url('cleared'), eventTypes: ['*'], exportControlOk: true }, admin);
    await db.tx(org, (c) => c.query('update outbox_event set published_at = now()'), { system: true }); // repart d’un lot propre
    await as('u-lead', () => artifacts.update(org, 'DEF', 'DEF-REQ-0002', { title: 'Exigence 2 révisée' }, 2, { id: 'u-lead', roles: ['athena-user'] }));
    await artifacts.update(org, 'DEF', 'DEF-REQ-0001', { title: 'Exigence 1 révisée' }, 1, admin);
    await links.link(org, 'DEF', 'DEF-TST-0001', 'DEF-REQ-0003', 'verifies', admin);
    await hooks.enqueue(org);
    const bodies = await db.tx(org, async (c) => (await c.query('select e.url, d.body from webhook_delivery d join webhook_endpoint e on e.id = d.endpoint_id')).rows, { system: true });
    const to = (suffix: string) => bodies.filter((b) => String(b.url).endsWith(suffix)).map((b) => JSON.parse(b.body as string).data);
    expect(to('/plain').map((d) => d.key ?? d.from)).toEqual(['DEF-REQ-0001', 'DEF-TST-0001']); // jamais DEF-REQ-0002
    expect(JSON.stringify(to('/plain'))).not.toMatch(/DEF-REQ-0002|révisée\W+2/);
    expect(to('/cleared').map((d) => d.key ?? d.from)).toEqual(['DEF-REQ-0002', 'DEF-REQ-0001', 'DEF-TST-0001']);
    await hooks.deliverDue(org);
    expect(received.filter((r) => r.startsWith('/plain')).join('')).not.toContain('DEF-REQ-0002');
    expect(received.filter((r) => r.startsWith('/cleared')).join('')).toContain('DEF-REQ-0002');
  });

  it('démarquer redonne l’item à tous ; un tiers ne peut pas le démarquer sans le lire', async () => {
    expect(await as('u-reader', () => code(access.setMarking(org, 'DEF', 'DEF-REQ-0002', null, admin)))).toBe('not_found:');
    await as('u-lead', () => access.setMarking(org, 'DEF', 'DEF-REQ-0002', null, admin));
    expect(await total('u-reader')).toBe(3);
    expect(await access.exportMembers(org, 'DEF')).toMatchObject({ marked: 0 });
    await access.setExportMembers(org, 'DEF', { members: [] }, admin); // plus rien de marqué : la liste peut être vidée
  });
});
