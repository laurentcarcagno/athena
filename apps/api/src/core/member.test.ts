import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SprintService } from '../agile/sprint.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { MemberService } from './member.service';
import { bugTemplate } from './templates';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-user', 'athena-admin'] };
const pm: Actor = { id: 'sub-pm', roles: ['athena-user', 'athena-pm'] };
const user: Actor = { id: 'sub-user', roles: ['athena-user'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message}` : `autre:${(error as Error)?.message}`;
}

suite('acteurs de projet et rôles (intégration)', () => {
  let testDb: TestDb;
  let members: MemberService;
  let sprints: SprintService;
  let links: LinkService;
  let artifacts: ArtifactService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_members');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    members = new MemberService(db);
    sprints = new SprintService(db);
    links = new LinkService(db);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'mb']);
      for (const [subject, username, name] of [['sub-admin', 'admin.dev', 'Admin Dev'], ['sub-pm', 'pm.dev', 'Chef Projet'], ['sub-user', 'user.dev', 'User Dev']]) {
        await c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$3,$4,$5)', [org, subject, username, name, `${username}@example.test`]);
      }
    });
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash', severity: 'majeure' }, user);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('liste les comptes connus de l’organisation', async () => {
    expect((await members.users(org)).map((u) => u.username)).toEqual(['admin.dev', 'pm.dev', 'user.dev']);
  });

  it('l’administrateur nomme un chef de projet ; seul ce chef (ou un administrateur) gère ensuite le projet', async () => {
    expect(await code(members.requireManager(org, 'ARI', pm))).toMatch(/^forbidden:Vous n’êtes pas chef du projet ARI/);
    await members.set(org, 'ARI', 'sub-pm', 'manager', admin);
    await expect(members.requireManager(org, 'ARI', pm)).resolves.toBeUndefined();
    await expect(members.requireManager(org, 'ARI', admin)).resolves.toBeUndefined();
    expect(await code(members.requireManager(org, 'ARI', user))).toMatch(/^forbidden:Réservé aux chefs de projet/);
  });

  it('un rôle chef de projet sans désignation sur le projet n’autorise rien', async () => {
    const other: Actor = { id: 'sub-other', roles: ['athena-user', 'athena-pm'] };
    expect(await code(members.requireManager(org, 'ARI', other))).toMatch(/^forbidden/);
  });

  it('ajoute, change le rôle puis retire un membre ; refuse un compte inconnu', async () => {
    await members.set(org, 'ARI', 'sub-user', 'member', pm);
    await members.set(org, 'ARI', 'sub-user', 'manager', pm);
    expect((await members.members(org, 'ARI')).map((m) => [m.username, m.role]).sort()).toEqual([['pm.dev', 'manager'], ['user.dev', 'manager']]);
    await members.remove(org, 'ARI', 'sub-user', pm);
    expect((await members.members(org, 'ARI')).map((m) => m.username)).toEqual(['pm.dev']);
    expect(await code(members.set(org, 'ARI', 'sub-fantome', 'member', pm))).toMatch(/^validation:/);
    expect(await code(members.remove(org, 'ARI', 'sub-fantome', pm))).toMatch(/^not_found/);
  });

  it('liste les sprints du projet', async () => {
    await sprints.create(org, 'ARI', { name: 'Sprint 1', startsOn: '2026-11-02', endsOn: '2026-11-15' }, pm);
    expect(await sprints.list(org, 'ARI')).toMatchObject([{ name: 'Sprint 1', state: 'planned', startsOn: '2026-11-02', endsOn: '2026-11-15' }]);
  });

  it('affiche le nom de l’auteur d’un commentaire', async () => {
    await links.addComment(org, 'ARI', 'ARI-BUG-0001', 'Reproduit.', user);
    expect((await links.comments(org, 'ARI', 'ARI-BUG-0001'))[0]).toMatchObject({ author: 'sub-user', authorName: 'User Dev' });
  });
});
