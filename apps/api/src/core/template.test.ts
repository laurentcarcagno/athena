import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { TemplateService } from './template.service';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-user', 'athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message}` : `autre:${(error as Error)?.message}`;
}

suite('templates de projet (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let templates: TemplateService;
  let trackers: TrackerService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_templates');
    db = new Db(testDb.pool);
    trackers = new TrackerService(db, new FieldTypeRegistry());
    templates = new TemplateService(db, trackers);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'tpl']));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  const trackerKeys = async (project: string) => db.tx(org, async (c) => (await c.query('select t.key from tracker t join project p on p.id = t.project_id where p.key = $1 order by t.key', [project])).rows.map((r) => r.key));

  it('propose les templates livrés', async () => {
    expect((await templates.list(org)).map((t) => t.key)).toEqual(expect.arrayContaining(['vide', 'bugs', 'qualite']));
  });

  it('crée un projet avec tous les trackers du template choisi', async () => {
    const result = await templates.createProject(org, 'QUA', 'Qualité', 'qualite', admin);
    expect(result.trackers.sort()).toEqual(['BUG', 'REQ']);
    expect(await trackerKeys('QUA')).toEqual(['BUG', 'REQ']);
  });

  it('crée un projet sans tracker sans template, et refuse un template inconnu sans rien créer', async () => {
    await templates.createProject(org, 'VID', 'Vide', undefined, admin);
    expect(await trackerKeys('VID')).toEqual([]);
    expect(await code(templates.createProject(org, 'ZZ', 'Zz', 'inconnu', admin))).toMatch(/^not_found/);
    expect((await db.tx(org, (c) => c.query("select 1 from project where key = 'ZZ'"))).rowCount).toBe(0);
  });

  it('enregistre un template depuis un projet existant, puis crée un projet identique', async () => {
    const snapshot = await templates.trackersOf(org, 'QUA', ['REQ', 'BUG']);
    await templates.create(org, { key: 'mon-modele', name: 'Mon modèle', description: 'Exigences et bugs', trackers: snapshot }, admin);
    expect((await templates.list(org)).find((t) => t.key === 'mon-modele')?.builtin).toBe(false);
    await templates.createProject(org, 'CPY', 'Copie', 'mon-modele', admin);
    expect(await trackerKeys('CPY')).toEqual(['BUG', 'REQ']);
    const original = await db.tx(org, (c) => trackers.getDefinition(c, 'QUA', 'BUG'));
    const copy = await db.tx(org, (c) => trackers.getDefinition(c, 'CPY', 'BUG'));
    expect(copy.fields.map((f) => [f.key, f.type, f.required])).toEqual(original.fields.map((f) => [f.key, f.type, f.required]));
    expect(copy.statuses.map((s) => s.key)).toEqual(original.statuses.map((s) => s.key));
    expect(copy.transitions.map((t) => t.name).sort()).toEqual(original.transitions.map((t) => t.name).sort());
  });

  it('refuse une clé réservée, un doublon, des trackers dupliqués et un projet sans tracker', async () => {
    const snapshot = await templates.trackersOf(org, 'QUA', ['BUG']);
    expect(await code(templates.create(org, { key: 'bugs', name: 'x', trackers: snapshot }, admin))).toMatch(/^conflict/);
    expect(await code(templates.create(org, { key: 'mon-modele', name: 'x', trackers: snapshot }, admin))).toMatch(/^conflict/);
    expect(await code(templates.create(org, { key: 'dbl', name: 'x', trackers: [...snapshot, ...snapshot] }, admin))).toMatch(/^validation/);
    expect(await code(templates.trackersOf(org, 'VID'))).toMatch(/^validation/);
  });

  it('supprime un template de l’organisation, jamais un template livré', async () => {
    await templates.remove(org, 'mon-modele', admin);
    expect((await templates.list(org)).some((t) => t.key === 'mon-modele')).toBe(false);
    expect(await code(templates.remove(org, 'bugs', admin))).toMatch(/^conflict/);
    expect(await code(templates.remove(org, 'mon-modele', admin))).toMatch(/^not_found/);
  });
});
