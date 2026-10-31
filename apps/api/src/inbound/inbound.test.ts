import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { sign } from '../webhooks/signing';
import type { SecretStore } from '../webhooks/webhook.service';
import { InboundService } from './inbound.service';
import { pointer, render, resolveValue, resolveValues } from './mapper';

describe('mappeur déclaratif', () => {
  const payload = { issue: { id: 42, title: 'Crash', priority: 'P1', labels: ['a', 'b'], nested: { ok: true } }, __proto__x: 1 };
  it('extrait des valeurs typées par chemin', () => {
    expect(pointer(payload, '$.issue.id')).toBe(42);
    expect(pointer(payload, '$.issue.labels[1]')).toBe('b');
    expect(pointer(payload, '$.issue.nested.ok')).toBe(true);
    expect(pointer(payload, '$.issue.absent')).toBeUndefined();
    expect(pointer(payload, '$.issue.labels[9]')).toBeUndefined();
  });
  it('refuse chemins invalides et propriétés dangereuses ou héritées', () => {
    expect(() => pointer(payload, 'issue.id')).toThrow(/chemin invalide/);
    expect(() => pointer(payload, '$.a; process.exit()')).toThrow(/chemin invalide/);
    expect(pointer(payload, '$.issue.constructor')).toBeUndefined();
    expect(pointer(payload, '$.__proto__')).toBeUndefined();
    expect(pointer(payload, '$.issue.toString')).toBeUndefined();
  });
  it('interpole, traduit et ignore les valeurs vides', () => {
    expect(render('Ticket {{$.issue.id}} : {{ $.issue.title }} {{$.manquant}}', payload)).toBe('Ticket 42 : Crash ');
    expect(resolveValue({ from: '$.issue.priority', map: { P1: 'bloquante', P2: 'majeure' } }, payload)).toBe('bloquante');
    expect(resolveValue({ from: '$.issue.priority', map: { P9: 'x' }, default: 'mineure' }, payload)).toBe('mineure');
    expect(resolveValue('$.issue.id', payload)).toBe(42);
    expect(resolveValues({ title: '$.issue.title', note: '$.absent', n: 3 }, payload)).toEqual({ title: 'Crash', n: 3 });
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };
class MemorySecrets implements SecretStore {
  readonly data = new Map<string, Record<string, string>>();
  async put(path: string, d: Record<string, string>) { this.data.set(path, d); }
  async get(path: string) { return this.data.get(path) ?? null; }
}

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('webhooks entrants (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let links: LinkService;
  let inbound: InboundService;
  const org = crypto.randomUUID();
  const secrets = new MemorySecrets();
  const secretOf = (name: string) => [...secrets.data.entries()].find(([p]) => p.endsWith(`/${name}`))![1]['secret']!;
  const send = (name: string, body: unknown, options: { signWith?: string; idempotency?: string } = {}) => {
    const raw = JSON.stringify(body);
    return inbound.handle(org, 'ARI', name, raw, sign(options.signWith ?? secretOf(name), raw), options.idempotency);
  };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_inbound');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    inbound = new InboundService(db, artifacts, links, secrets);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'inb']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('valide le mappage à la création, chemins compris', async () => {
    expect(await code(inbound.createSource(org, 'ARI', 'x1', { action: 'inconnue' }, admin))).toMatch(/validation/);
    expect(await code(inbound.createSource(org, 'ARI', 'x2', { action: 'create', tracker: 'BUG', values: { title: '$.a; drop' } }, admin))).toMatch(/chemin invalide/);
    expect(await code(inbound.createSource(org, 'NOPE', 'x3', { action: 'comment', key: 'BUG-1', body: 'x' }, admin))).toMatch(/not_found/);
  });

  it('crée un artefact depuis une charge utile externe, avec traduction de priorité', async () => {
    const created = await inbound.createSource(org, 'ARI', 'sentry', {
      action: 'create', tracker: 'BUG', idempotencyKey: '$.event.id',
      values: { title: '[{{$.project}}] {{$.event.title}}', severity: { from: '$.event.level', map: { fatal: 'bloquante', error: 'majeure' }, default: 'mineure' } },
    }, admin);
    expect(created.path).toBe('/hooks/in/source/inb/ARI/sentry');
    expect(created.secret).toMatch(/^inb_[0-9a-f]{64}$/);
    const body = { project: 'api', event: { id: 'evt-1', title: 'NullPointer', level: 'fatal' } };
    const result = await send('sentry', body);
    expect(result).toEqual({ duplicate: false, action: 'create', key: 'BUG-1' });
    expect(await artifacts.get(org, 'ARI', 'BUG-1')).toMatchObject({ values: { title: '[api] NullPointer', severity: 'bloquante' } });
    const revision = await testDb.pool.query('select 1');
    expect(revision.rowCount).toBe(1);
  });

  it('est idempotent (clé du contenu ou en-tête)', async () => {
    const body = { project: 'api', event: { id: 'evt-1', title: 'NullPointer', level: 'fatal' } };
    expect(await send('sentry', body)).toMatchObject({ duplicate: true });
    expect((await send('sentry', { ...body, event: { ...body.event, id: 'evt-2' } })).duplicate).toBe(false);
    const withHeader = await send('sentry', { project: 'p', event: { id: 'evt-3', title: 'T', level: 'error' } }, { idempotency: 'livraison-9' });
    const again = await send('sentry', { project: 'p', event: { id: 'evt-4', title: 'T', level: 'error' } }, { idempotency: 'livraison-9' });
    expect(withHeader.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
  });

  it('refuse signature absente, fausse ou rejouée hors tolérance, et source inactive ou inconnue', async () => {
    const raw = JSON.stringify({ project: 'api', event: { id: 'evt-9', title: 'T', level: 'error' } });
    expect(await code(inbound.handle(org, 'ARI', 'sentry', raw, undefined, undefined))).toMatch(/forbidden/);
    expect(await code(inbound.handle(org, 'ARI', 'sentry', raw, sign('mauvais-secret', raw), undefined))).toMatch(/forbidden/);
    const old = sign(secretOf('sentry'), raw, new Date(Date.now() - 3_600_000));
    expect(await code(inbound.handle(org, 'ARI', 'sentry', raw, old, undefined))).toMatch(/forbidden/);
    expect(await code(inbound.handle(org, 'ARI', 'inconnue', raw, sign('x', raw), undefined))).toMatch(/forbidden/);
    await testDb.exec("update inbound_source set active = false where name = 'sentry'");
    expect(await code(send('sentry', { project: 'api', event: { id: 'evt-10', title: 'T', level: 'error' } }))).toMatch(/forbidden/);
    await testDb.exec("update inbound_source set active = true where name = 'sentry'");
  });

  it('commente, met à jour et transitionne, sous l’identité de la source et avec le workflow', async () => {
    await inbound.createSource(org, 'ARI', 'ci', { action: 'comment', key: '$.bug', body: 'Pipeline {{$.status}} ({{$.url}})' }, admin);
    await inbound.createSource(org, 'ARI', 'triage', { action: 'update', key: '$.bug', values: { severity: { from: '$.p', map: { high: 'majeure' } }, assignee: '$.owner' } }, admin);
    await inbound.createSource(org, 'ARI', 'flow', { action: 'transition', key: '$.bug', name: 'Démarrer' }, admin);

    await send('ci', { bug: 'BUG-1', status: 'échoué', url: 'http://ci/1' });
    expect((await links.comments(org, 'ARI', 'BUG-1')).map((c) => [c.author, c.body])).toEqual([['inbound:ci', 'Pipeline échoué (http://ci/1)']]);

    expect(await code(send('flow', { bug: 'BUG-1' }))).toMatch(/validation.*assignee/); // validateur du workflow appliqué
    await send('triage', { bug: 'BUG-1', p: 'high', owner: 'sub-dev' });
    expect(await artifacts.get(org, 'ARI', 'BUG-1')).toMatchObject({ values: { severity: 'majeure', assignee: 'sub-dev' } });
    await send('flow', { bug: 'BUG-1' });
    expect((await artifacts.get(org, 'ARI', 'BUG-1')).status).toBe('in_progress');

    expect(await code(send('ci', { bug: 'pas-une-clé', status: 'x', url: 'y' }))).toMatch(/validation.*clé/);
    expect(await code(send('ci', { bug: 'BUG-999', status: 'x', url: 'y' }))).toMatch(/not_found/);
  }, 30_000);
});
