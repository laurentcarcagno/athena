import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { ArtifactService } from './artifact.service';
import { LinkService } from './link.service';
import { bugTemplate, requirementTemplate } from './templates';
import { PROJECT_MODULES, ProjectOverviewService } from './project-overview.service';
import { TrackerService } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };
const suite = pgUp ? describe : describe.skip;

suite('modules actifs d’un projet', () => {
  let testDb: TestDb;
  let overview: ProjectOverviewService;
  let links: LinkService;
  let artifacts: ArtifactService;
  let trackerSvc: TrackerService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_modules');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    trackerSvc = trackers;
    artifacts = new ArtifactService(db, trackers, registry);
    overview = new ProjectOverviewService(db);
    links = new LinkService(db);
    for (const [id, key] of [[org, 'mod-a'], [other, 'mod-b']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createProject(org, 'OTH', 'Autre', actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('garde l’ordre fixe des huit onglets', () => {
    expect(PROJECT_MODULES).toEqual(['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members']);
  });

  it('un projet neuf n’a ni traçabilité, ni documents, ni code : les autres onglets ne bougent pas', async () => {
    expect((await overview.modules(org, 'ARI')).modules).toEqual(['overview', 'trackers', 'planning', 'activity', 'members']);
  });

  it('active chaque module quand ses données existent, toujours dans le même ordre, sans effet sur les autres projets', async () => {
    await links.createLinkType(org, 'ARI', { key: 'verifies', outwardLabel: 'vérifie', inwardLabel: 'est vérifié par' }, actor);
    expect((await overview.modules(org, 'ARI')).modules).toEqual(['overview', 'trackers', 'planning', 'traceability', 'activity', 'members']);
    await testDb.exec("insert into code_repo (organization_id, project_id, gitlab_path) select organization_id, id, 'groupe/depot' from project where key = 'ARI'");
    expect((await overview.modules(org, 'ARI')).modules).toEqual(['overview', 'trackers', 'planning', 'traceability', 'code', 'activity', 'members']);
    await testDb.exec("insert into doc_source (organization_id, project_id, name) select organization_id, id, 'urd' from project where key = 'ARI'");
    expect((await overview.modules(org, 'ARI')).modules).toEqual([...PROJECT_MODULES]);
    expect((await overview.modules(org, 'OTH')).modules).toEqual(['overview', 'trackers', 'planning', 'activity', 'members']);
  });

  it('refuse un projet inconnu ou d’une autre organisation', async () => {
    for (const [o, key] of [[org, 'NOPE'], [other, 'ARI']] as const) {
      const error = await overview.modules(o, key).then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('not_found');
    }
  });

  it('résume les trackers : compteurs par statut, éléments à moi, catégorie du type, dernière activité', async () => {
    await trackerSvc.createTracker(org, { ...bugTemplate('OTH'), typeKey: 'bug' }, actor);
    await trackerSvc.createTracker(org, requirementTemplate('OTH'), actor); // sans type
    const a = await artifacts.create(org, 'OTH', 'BUG', { title: 'Un', severity: 'majeure', assignee: 'alice' }, actor);
    await artifacts.create(org, 'OTH', 'BUG', { title: 'Deux', severity: 'mineure', assignee: 'bob' }, actor);
    await artifacts.create(org, 'OTH', 'BUG', { title: 'Trois', severity: 'mineure' }, actor);
    await artifacts.update(org, 'OTH', a.key, { assignee: 'alice', root_cause: 'x' }, 1, actor);
    const { trackers } = await overview.overview(org, 'OTH', 'alice');
    expect(trackers.map((t) => t.key)).toEqual(['BUG', 'REQ']);
    const bug = trackers[0]!;
    expect(bug).toMatchObject({ typeKey: 'bug', category: 'development', artifacts: 3, mine: 1 });
    expect(bug.statuses.find((s) => s.key === 'open')).toMatchObject({ count: 3, category: 'todo' });
    expect(bug.statuses.every((s) => typeof s.name === 'string')).toBe(true);
    expect(bug.lastActivity).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(trackers[1]).toMatchObject({ typeKey: null, category: 'other', artifacts: 0, mine: 0, lastActivity: null });
    expect((await overview.overview(org, 'OTH', 'bob')).trackers[0]!.mine).toBe(1);
    await trackerSvc.setType(org, 'OTH', 'REQ', 'requirement', actor);
    expect((await overview.overview(org, 'OTH', 'alice')).trackers[1]!.category).toBe('engineering');
  });
});
