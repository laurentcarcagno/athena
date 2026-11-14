import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { ArtifactService } from './artifact.service';
import { LinkService } from './link.service';
import { bugTemplate, normativeClauseTracker, requirementTemplate } from './templates';
import { PROJECT_MODULES, ProjectOverviewService } from './project-overview.service';
import { TrackerService } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-team-member', 'athena-admin'] };
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

  it('garde l’ordre fixe des neuf onglets', () => {
    expect(PROJECT_MODULES).toEqual(['overview', 'trackers', 'planning', 'traceability', 'conformity', 'documents', 'code', 'activity', 'members']);
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
    expect((await overview.modules(org, 'ARI')).modules).not.toContain('conformity');
    await trackerSvc.createTracker(org, normativeClauseTracker('ARI'), actor);
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

  it('flux d’activité : événements récents d’abord, filtres, pagination par curseur et champs restreints', async () => {
    await testDb.exec("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'alice','alice','Alice Martin','a@x.test'), ($1,'bob','bob','Bob Durand','b@x.test')", [org]);
    await trackerSvc.createProject(org, 'ACT', 'Activité', actor);
    await trackerSvc.createTracker(org, bugTemplate('ACT'), actor);
    await trackerSvc.createTracker(org, requirementTemplate('ACT'), actor);
    const alice: Actor = { id: 'alice', roles: ['athena-team-member'] };
    const bob: Actor = { id: 'bob', roles: ['athena-team-member'] };
    const bug = await artifacts.create(org, 'ACT', 'BUG', { title: 'Crash', severity: 'majeure' }, alice);
    const req = await artifacts.create(org, 'ACT', 'REQ', { title: 'Journal', statement: 'Le système journalise.' }, bob);
    await artifacts.update(org, 'ACT', bug.key, { severity: 'bloquante', affected_version: '1.2' }, 1, alice);
    await artifacts.update(org, 'ACT', bug.key, { assignee: 'alice' }, 2, alice);
    await artifacts.transition(org, 'ACT', bug.key, 'Démarrer', 3, alice);
    await links.addComment(org, 'ACT', req.key, 'À relire', bob);

    const all = await overview.activity(org, 'ACT', ['athena-team-member']);
    expect(all.items.map((i) => i.kind)).toEqual(['comment', 'transition', 'updated', 'updated', 'created', 'created']);
    expect(all.next).toBeNull();
    expect(all.items[0]).toMatchObject({ key: req.key, tracker: 'REQ', actor: 'bob', actorName: 'Bob Durand', fields: [] });
    expect(all.items[1]).toMatchObject({ kind: 'transition', key: bug.key, from: 'open', to: 'in_progress', actorName: 'Alice Martin' });
    expect(all.items[3]!.fields).toEqual(['affected_version', 'severity']);
    expect(all.people).toEqual([{ subject: 'alice', name: 'Alice Martin' }, { subject: 'bob', name: 'Bob Durand' }]);

    expect((await overview.activity(org, 'ACT', [], { tracker: 'REQ' })).items.map((i) => i.kind)).toEqual(['comment', 'created']);
    expect((await overview.activity(org, 'ACT', [], { actor: 'bob' })).items.map((i) => i.actor)).toEqual(['bob', 'bob']);
    expect((await overview.activity(org, 'ACT', [], { kind: 'updated' })).items).toHaveLength(2);
    expect((await overview.activity(org, 'ACT', [], { tracker: 'BUG', kind: 'created' })).items.map((i) => i.key)).toEqual([bug.key]);

    // pagination par curseur : pas de doublon ni de trou
    const first = await overview.activity(org, 'ACT', [], { limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.next).toMatch(/\|[0-9a-f-]{36}$/);
    const second = await overview.activity(org, 'ACT', [], { limit: 4, before: first.next! });
    expect([...first.items, ...second.items].map((i) => i.id)).toEqual(all.items.map((i) => i.id));
    expect(second.next).toBeNull();

    // champ à lecture restreinte : retiré du résumé pour un lecteur sans le rôle, visible pour l'administrateur
    await testDb.exec("update field_definition set read_roles = '{qualite}' where key = 'severity'");
    const hidden = (await overview.activity(org, 'ACT', ['athena-team-member'])).items.filter((i) => i.kind === 'updated').map((i) => i.fields);
    expect(hidden).toEqual([['assignee'], ['affected_version']]);
    expect((await overview.activity(org, 'ACT', ['athena-team-member', 'qualite'])).items.find((i) => i.fields.includes('severity'))).toBeDefined();
    expect((await overview.activity(org, 'ACT', ['athena-admin'])).items.find((i) => i.fields.includes('severity'))).toBeDefined();
    await testDb.exec("update field_definition set read_roles = null where key = 'severity'");
  });

  it('flux d’activité : paramètres invalides et isolation entre organisations', async () => {
    for (const filters of [{ kind: 'nope' as never }, { before: 'pas-un-curseur' }, { before: '2026-11-05T10:00:00.000Z|x' }]) {
      const error = await overview.activity(org, 'ACT', [], filters).then(() => null, (e: unknown) => e);
      expect((error as DomainError).code).toBe('validation');
    }
    const foreign = await overview.activity(other, 'ACT', []).then(() => null, (e: unknown) => e);
    expect((foreign as DomainError).code).toBe('not_found');
  });
});
