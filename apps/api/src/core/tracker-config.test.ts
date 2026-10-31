import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { bugTemplate } from './templates';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('évolution de la configuration d’un tracker', () => {
  let testDb: TestDb;
  let trackers: TrackerService;
  let artifacts: ArtifactService;
  let db: Db;
  const org = crypto.randomUUID();
  const version = async () => Number((await db.tx(org, (c) => c.query("select schema_version v from tracker where key = 'BUG'"))).rows[0].v);

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_trackercfg');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'cfg']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('ajoute champ, statut et transition, incrémente la version de schéma et produit des événements', async () => {
    expect(await version()).toBe(1);
    await trackers.addField(org, 'ARI', 'BUG', { key: 'environment', label: 'Environnement', type: 'select', config: { options: ['dev', 'prod'] } }, admin);
    await trackers.addStatus(org, 'ARI', 'BUG', { key: 'wontfix', name: 'Abandonné', category: 'done' }, admin);
    await trackers.addTransition(org, 'ARI', 'BUG', { name: 'Abandonner', from: 'open', to: 'wontfix' }, admin);
    expect(await version()).toBe(4);
    const events = await db.tx(org, (c) => c.query("select payload->>'change' as change from outbox_event where type = 'tracker.updated' order by created_at"));
    expect(events.rows.map((r) => r.change)).toEqual(['champ environment', 'statut wontfix', 'transition Abandonner']);
  });

  it('rend le nouveau champ et la nouvelle transition immédiatement utilisables', async () => {
    const a = await artifacts.create(org, 'ARI', 'BUG', { title: 'Bug', severity: 'mineure', environment: 'prod' }, admin);
    expect(await code(artifacts.create(org, 'ARI', 'BUG', { title: 'Bug', severity: 'mineure', environment: 'recette' }, admin))).toMatch(/validation.*hors liste/);
    const closed = await artifacts.transition(org, 'ARI', a.key, 'Abandonner', a.version, admin);
    expect(closed.status).toBe('wontfix');
  });

  it('refuse un champ obligatoire sur un tracker non vide, un doublon, un type ou un statut inconnus', async () => {
    expect(await code(trackers.addField(org, 'ARI', 'BUG', { key: 'must', label: 'x', type: 'text', required: true }, admin))).toMatch(/conflict.*obligatoire/);
    expect(await code(trackers.addField(org, 'ARI', 'BUG', { key: 'environment', label: 'x', type: 'text' }, admin))).toMatch(/duplicate/);
    expect(await code(trackers.addField(org, 'ARI', 'BUG', { key: 'x', label: 'x', type: 'inconnu' }, admin))).toMatch(/validation.*inconnu/);
    expect(await code(trackers.addField(org, 'ARI', 'BUG', { key: 'Mauvaise Clé', label: 'x', type: 'text' }, admin))).toMatch(/validation/);
    expect(await code(trackers.addTransition(org, 'ARI', 'BUG', { name: 't', from: 'open', to: 'nulle-part' }, admin))).toMatch(/validation.*cible/);
    expect(await code(trackers.addStatus(org, 'ARI', 'NOPE', { key: 'a', name: 'A', category: 'todo' }, admin))).toMatch(/not_found/);
    expect(await version()).toBe(4); // aucune évolution refusée ne modifie la version
  });

  it('autorise un champ obligatoire sur un tracker vide', async () => {
    await trackers.createTracker(org, { ...bugTemplate('ARI', 'EMPTY'), name: 'Vide' }, admin);
    await trackers.addField(org, 'ARI', 'EMPTY', { key: 'must', label: 'Obligatoire', type: 'text', required: true }, admin);
    expect(await code(artifacts.create(org, 'ARI', 'EMPTY', { title: 't', severity: 'mineure' }, admin))).toMatch(/validation.*must : obligatoire/);
  });
});
