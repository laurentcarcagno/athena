import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { BoardService } from './board.service';
import { SprintService } from './sprint.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };
const user: Actor = { id: 'u1', roles: ['athena-user'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('boards et sprints (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let boards: BoardService;
  let sprints: SprintService;
  const org = crypto.randomUUID();
  const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_agile');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    boards = new BoardService(db, trackers, artifacts);
    sprints = new SprintService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'agile']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'STORY', name: 'Stories',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee' },
        { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate' },
      ],
      statuses: [
        { key: 'todo', name: 'À faire', category: 'todo' },
        { key: 'doing', name: 'En cours', category: 'in_progress' },
        { key: 'review', name: 'En revue', category: 'in_progress' },
        { key: 'done', name: 'Terminé', category: 'done' },
      ],
      transitions: [
        { name: 'Démarrer', from: 'todo', to: 'doing' },
        { name: 'Revue', from: 'doing', to: 'review' },
        { name: 'Terminer', from: 'review', to: 'done', conditions: [{ type: 'role', roles: ['athena-admin'] }] },
        { name: 'Reprendre', from: null, to: 'todo' },
      ],
    }, admin);
    for (const [title, points] of [['A', 5], ['B', 3], ['C', 2], ['D', 8]] as const) {
      await artifacts.create(org, 'ARI', 'STORY', { title, points, assignee: 'u1' }, admin);
    }
    await boards.create(org, 'ARI', {
      key: 'kanban', name: 'Kanban', trackerKeys: ['STORY'],
      columns: [
        { name: 'À faire', statuses: ['todo'] },
        { name: 'En cours', statuses: ['doing'], wipLimit: 2 },
        { name: 'Revue', statuses: ['review'] },
        { name: 'Terminé', statuses: ['done'] },
      ],
    }, admin);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('valide la définition du board', async () => {
    const base = { key: 'b2', name: 'x', trackerKeys: ['STORY'] };
    expect(await code(boards.create(org, 'ARI', { ...base, columns: [{ name: 'a', statuses: ['todo'] }, { name: 'b', statuses: ['todo'] }] }, admin))).toMatch(/validation.*deux colonnes/);
    expect(await code(boards.create(org, 'ARI', { ...base, columns: [{ name: 'a', statuses: ['inconnu'] }] }, admin))).toMatch(/validation.*inconnus/);
    expect(await code(boards.create(org, 'ARI', { ...base, columns: [{ name: 'a', statuses: ['todo'], wipLimit: 0 }] }, admin))).toMatch(/WIP/);
  });

  it('affiche les cartes par colonne avec titre et responsable', async () => {
    const view = await boards.view(org, 'ARI', 'kanban');
    expect(view.columns.map((c) => c.count)).toEqual([4, 0, 0, 0]);
    expect(view.columns[0]!.cards[0]).toMatchObject({ key: 'STORY-1', title: 'A', assignee: 'u1', status: 'todo' });
  });

  it('déplace une carte via les transitions du workflow et applique la limite WIP', async () => {
    const m1 = await boards.moveCard(org, 'ARI', 'kanban', 'STORY-1', 'En cours', 1, user);
    expect(m1.status).toBe('doing');
    await boards.moveCard(org, 'ARI', 'kanban', 'STORY-2', 'En cours', 1, user);
    expect(await code(boards.moveCard(org, 'ARI', 'kanban', 'STORY-3', 'En cours', 1, user))).toMatch(/conflict.*WIP/);
    expect(await code(boards.moveCard(org, 'ARI', 'kanban', 'STORY-3', 'Terminé', 1, user))).toMatch(/conflict.*Aucune transition/);
    expect((await boards.moveCard(org, 'ARI', 'kanban', 'STORY-1', 'En cours', 2, user)).status).toBe('doing'); // déjà dans la colonne : sans effet
    const view = await boards.view(org, 'ARI', 'kanban');
    expect(view.columns.map((c) => c.count)).toEqual([2, 2, 0, 0]);
    expect(view.columns[1]!.overLimit).toBe(false);
  });

  it('respecte les conditions de rôle du workflow au déplacement', async () => {
    await boards.moveCard(org, 'ARI', 'kanban', 'STORY-1', 'Revue', 2, user);
    expect(await code(boards.moveCard(org, 'ARI', 'kanban', 'STORY-1', 'Terminé', 3, user))).toMatch(/forbidden/);
    expect((await boards.moveCard(org, 'ARI', 'kanban', 'STORY-1', 'Terminé', 3, admin)).status).toBe('done');
    expect(await code(boards.moveCard(org, 'ARI', 'kanban', 'STORY-1', 'Inconnue', 4, admin))).toMatch(/not_found/);
  });

  it('gère le cycle de vie du sprint et refuse les conflits', async () => {
    const id = await sprints.create(org, 'ARI', { name: 'Sprint 1', goal: 'MVP', startsOn: dayOffset(-3), endsOn: dayOffset(3) }, admin);
    expect(await code(sprints.start(org, id, admin))).toMatch(/validation.*vide/);
    for (const k of ['STORY-1', 'STORY-2', 'STORY-3']) await sprints.addItem(org, id, k, 'ARI', admin);
    const other = await sprints.create(org, 'ARI', { name: 'Sprint 2', startsOn: dayOffset(4), endsOn: dayOffset(10) }, admin);
    expect(await code(sprints.addItem(org, other, 'STORY-2', 'ARI', admin))).toMatch(/conflict.*déjà dans le sprint « Sprint 1 »/);
    await sprints.start(org, id, admin);
    expect(await code(sprints.start(org, other, admin).then(() => sprints.start(org, other, admin)))).toMatch(/conflict|validation/);
    const view = await sprints.get(org, id);
    expect(view).toMatchObject({ state: 'active', totalPoints: 10, donePoints: 5 });
  });

  it('reconstitue le burndown depuis les révisions antidatées', async () => {
    const [sprint] = (await testDb.pool.query('select 1')).rows; // pool applicatif sans org : aucune donnée visible
    void sprint;
    const id = (await new Db(testDb.pool).tx(org, (c) => c.query("select id from sprint where name = 'Sprint 1'"))).rows[0].id as string;
    // Antidate : créations il y a 3 jours, STORY-1 terminé il y a 1 jour.
    await testDb.exec("update artifact_revision set created_at = now() - interval '3 days'");
    await testDb.exec(
      "update artifact_revision r set created_at = now() - interval '1 day' from artifact a where a.id = r.artifact_id and a.key = 'STORY-1' and (r.snapshot ->> 'status') = 'done'",
    );
    const points = await sprints.burndown(org, id);
    expect(points.length).toBeGreaterThanOrEqual(5);
    expect(points[0]).toMatchObject({ date: dayOffset(-3), remaining: 10, ideal: 10 });
    const doneDay = points.find((p) => p.date === dayOffset(-1))!;
    expect(doneDay.remaining).toBe(5);
    expect(points.find((p) => p.date === dayOffset(-2))!.remaining).toBeGreaterThanOrEqual(5);
    expect(points[points.length - 1]!.ideal).toBeLessThan(points[0]!.ideal);
  });

  it('clôt le sprint : le terminé reste, le reste retourne au backlog', async () => {
    const id = (await new Db(testDb.pool).tx(org, (c) => c.query("select id from sprint where name = 'Sprint 1'"))).rows[0].id as string;
    const result = await sprints.close(org, id, admin);
    expect(result).toEqual({ completed: 1, returned: ['STORY-2', 'STORY-3'] });
    expect(await code(sprints.close(org, id, admin))).toMatch(/conflict/);
    const other = (await new Db(testDb.pool).tx(org, (c) => c.query("select id from sprint where name = 'Sprint 2'"))).rows[0].id as string;
    await sprints.addItem(org, other, 'STORY-2', 'ARI', admin); // à nouveau disponible
  });
});
