import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LayoutSchema, layoutProblems, type Layout } from './layout';
import { TemplateService } from './template.service';
import { bugTemplate } from './templates';
import { TrackerService } from './tracker.service';

const admin: Actor = { id: 'sub-admin', roles: ['athena-user', 'athena-admin'] };

describe('disposition : validation pure', () => {
  const layout: Layout = { sections: [{ title: 'Général', fields: [{ key: 'title', span: 3 }, { key: 'severity', span: 1 }] }, { title: '', fields: [{ key: 'description', span: 2 }] }] };
  it('accepte une disposition cohérente', () => {
    expect(LayoutSchema.safeParse(layout).success).toBe(true);
    expect(layoutProblems(layout, ['title', 'severity', 'description'])).toEqual([]);
  });
  it('refuse un champ inconnu, un champ placé deux fois et une largeur hors 1 à 3', () => {
    expect(layoutProblems({ sections: [{ title: 'A', fields: [{ key: 'x', span: 1 }] }] }, ['title'])).toEqual(['disposition : champ inconnu x']);
    expect(layoutProblems({ sections: [{ title: 'A', fields: [{ key: 'title', span: 1 }] }, { title: 'B', fields: [{ key: 'title', span: 2 }] }] }, ['title'])).toEqual(['disposition : champ placé deux fois title']);
    expect(LayoutSchema.safeParse({ sections: [{ title: 'A', fields: [{ key: 'title', span: 4 }] }] }).success).toBe(false);
    expect(LayoutSchema.safeParse({ sections: [] }).success).toBe(false);
  });
});

const suite = pgUp ? describe : describe.skip;
async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message}` : `autre:${(error as Error)?.message}`;
}

suite('disposition d’un tracker (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let trackers: TrackerService;
  let templates: TemplateService;
  const org = crypto.randomUUID();
  const layout: Layout = { sections: [{ title: 'Résumé', fields: [{ key: 'title', span: 3 }, { key: 'severity', span: 1 }, { key: 'assignee', span: 2 }] }, { title: 'Détail', fields: [{ key: 'description', span: 3 }] }] };
  const definition = (project: string, key: string) => db.tx(org, (c) => trackers.getDefinition(c, project, key));

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_layout');
    db = new Db(testDb.pool);
    trackers = new TrackerService(db, new FieldTypeRegistry());
    templates = new TemplateService(db, trackers);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'lay']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('un tracker créé sans disposition en a une nulle (automatique)', async () => {
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    expect((await definition('ARI', 'BUG')).layout).toBeNull();
  });

  it('crée un tracker avec disposition, qui revient dans la définition', async () => {
    await trackers.createTracker(org, { ...bugTemplate('ARI', 'DEF'), layout }, admin);
    expect((await definition('ARI', 'DEF')).layout).toEqual(layout);
  });

  it('refuse à la création une disposition qui cite un champ inconnu ou deux fois le même', async () => {
    const bad: Layout = { sections: [{ title: 'A', fields: [{ key: 'nope', span: 1 }, { key: 'title', span: 1 }, { key: 'title', span: 2 }] }] };
    const result = await code(trackers.createTracker(org, { ...bugTemplate('ARI', 'BAD'), layout: bad }, admin));
    expect(result).toMatch(/^validation:/);
    expect((await db.tx(org, (c) => c.query("select 1 from tracker where key = 'BAD'"))).rowCount).toBe(0);
  });

  it('modifie la disposition (version du schéma + 1), refuse une disposition invalide, revient à l’automatique', async () => {
    const before = (await definition('ARI', 'BUG')).schemaVersion;
    await trackers.setLayout(org, 'ARI', 'BUG', layout, admin);
    const after = await definition('ARI', 'BUG');
    expect(after.layout).toEqual(layout);
    expect(after.schemaVersion).toBe(before + 1);
    expect(await code(trackers.setLayout(org, 'ARI', 'BUG', { sections: [{ title: 'x', fields: [{ key: 'inconnu', span: 1 }] }] }, admin))).toMatch(/^validation:/);
    expect((await definition('ARI', 'BUG')).layout).toEqual(layout);
    await trackers.setLayout(org, 'ARI', 'BUG', null, admin);
    expect((await definition('ARI', 'BUG')).layout).toBeNull();
    expect(await code(trackers.setLayout(org, 'ARI', 'ABSENT', layout, admin))).toMatch(/^not_found/);
  });

  it('la disposition suit le tracker dans un template de tracker', async () => {
    const [snapshot] = await templates.trackersOf(org, 'ARI', ['DEF']);
    expect(snapshot!.layout).toEqual(layout);
    await templates.createTrackerTemplate(org, { key: 'avec-disposition', name: 'Avec disposition', tracker: snapshot! }, admin);
    const [fromTemplate] = await templates.trackersFromTemplates(org, ['avec-disposition']);
    expect(fromTemplate!.layout).toEqual(layout);
    await templates.createProject(org, 'CPY', 'Copie', undefined, admin);
    await trackers.createTracker(org, { ...fromTemplate!, projectKey: 'CPY' } as never, admin);
    expect((await definition('CPY', 'DEF')).layout).toEqual(layout);
  });
});
