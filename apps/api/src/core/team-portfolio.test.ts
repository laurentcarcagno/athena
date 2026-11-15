import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { AccessService } from './access.service';
import { runAs } from './request-context';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { PortfolioService } from './portfolio.service';
import { TeamService } from './team.service';
import { bugTemplate } from './templates';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const manager: Actor = { id: 'sub-mgr', roles: ['athena-team-member', 'athena-manager'] };
const otherManager: Actor = { id: 'sub-mgr2', roles: ['athena-team-member', 'athena-manager'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };
const member: Actor = { id: 'sub-ana', roles: ['athena-team-member'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message}` : `autre:${(error as Error)?.message}`;
}

suite('équipes, charge et portefeuilles (intégration)', () => {
  let testDb: TestDb;
  let teams: TeamService;
  let portfolios: PortfolioService;
  let access: AccessService;
  const org = crypto.randomUUID();
  const kpis = {
    async kpis(_o: string, project: string) {
      const bad = project === 'BAD';
      return {
        project: { key: project, name: `Projet ${project}`, createdAt: '2026-01-01T00:00:00.000Z', members: 2, managers: ['Chef'] },
        progress: { total: 10, done: bad ? 2 : 8, inProgress: 1, todo: 1, percent: bad ? 20 : 80 },
        late: bad ? 4 : 0, blocked: bad ? 3 : 0, dueSoon: 1, open: bad ? 8 : 2, workload: [],
        velocity: { average: 0, forecast: 0, sprints: 0 }, sprint: null, health: { state: 'ok' as const, reasons: [] },
      };
    },
  };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_teams');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    teams = new TeamService(db);
    portfolios = new PortfolioService(db, kpis);
    access = new AccessService(db);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'tp']);
      for (const [subject, username, name] of [['sub-admin', 'admin.dev', 'Admin Dev'], ['sub-mgr', 'manager.dev', 'Manager Dev'], ['sub-mgr2', 'manager2.dev', 'Autre Manager'],
        ['sub-ana', 'ana', 'Ana Martin'], ['sub-bob', 'bob', 'Bob Durand']]) {
        await c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$3,$4,$5)', [org, subject, username, name, `${username}@example.test`]);
      }
    });
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createProject(org, 'BAD', 'Projet en péril', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'A', severity: 'majeure', assignee: 'sub-ana' }, admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'B', severity: 'majeure', assignee: 'sub-ana' }, admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'C', severity: 'majeure', assignee: 'bob' }, admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('l’administrateur crée une équipe et nomme un manager ; le manager ne voit que la sienne', async () => {
    await teams.create(org, { key: 'alpha', name: 'Équipe Alpha' }, admin);
    await teams.create(org, { key: 'beta', name: 'Équipe Beta' }, admin);
    await teams.setMember(org, 'alpha', 'sub-mgr', 'manager', admin);
    await teams.setMember(org, 'alpha', 'sub-ana', 'member', admin);
    await teams.setMember(org, 'alpha', 'sub-bob', 'member', admin);
    await teams.setMember(org, 'beta', 'sub-mgr2', 'manager', admin);
    expect((await teams.list(org, manager)).map((t) => t.key)).toEqual(['alpha']);
    expect((await teams.list(org, director)).map((t) => t.key)).toEqual(['alpha', 'beta']);
    expect((await teams.list(org, admin))[0]!.managers).toEqual(['Manager Dev']);
    expect(await code(teams.create(org, { key: 'alpha', name: 'Doublon' }, admin))).toMatch(/^conflict:/);
    expect(await code(teams.create(org, { key: 'Pas Valide', name: 'x' }, admin))).toMatch(/^validation:/);
    expect(await code(teams.setMember(org, 'alpha', 'sub-fantome', 'member', admin))).toMatch(/^validation:/);
  });

  it('la charge compte les tickets ouverts par personne, par identifiant ou nom de compte', async () => {
    const load = await teams.load(org, 'alpha', manager);
    const byName = Object.fromEntries(load.members.map((m) => [m.name, m]));
    expect(byName['Ana Martin']!.open).toBe(2);
    expect(byName['Ana Martin']!.byProject).toEqual([{ project: 'ARI', open: 2 }]);
    expect(byName['Bob Durand']!.open).toBe(1);
    expect(byName['Manager Dev']!.open).toBe(0);
    expect(load.totals.open).toBe(3);
    expect(load.average).toBe(1);
    expect(load.members[0]!.name).toBe('Ana Martin'); // la plus chargée d’abord
  });

  it('un manager ne lit pas la charge d’une équipe qu’il ne dirige pas ; le directeur lit toutes', async () => {
    expect(await code(teams.load(org, 'alpha', otherManager))).toMatch(/^forbidden:/);
    expect(await code(teams.get(org, 'alpha', member))).toMatch(/^forbidden:/);
    await expect(teams.load(org, 'alpha', director)).resolves.toBeDefined();
  });

  it('retire un membre, puis supprime l’équipe', async () => {
    await teams.removeMember(org, 'beta', 'sub-mgr2', admin);
    expect((await teams.get(org, 'beta', admin)).members).toEqual([]);
    expect(await code(teams.removeMember(org, 'beta', 'sub-mgr2', admin))).toMatch(/^not_found:/);
    await teams.remove(org, 'beta', admin);
    expect((await teams.list(org, admin)).map((t) => t.key)).toEqual(['alpha']);
  });

  it('un portefeuille consolide la santé, l’avancement et les retards de ses projets ; les plus à risque d’abord', async () => {
    await portfolios.create(org, { key: 'spatial', name: 'Programmes spatiaux', owner: 'sub-dir' }, admin);
    await portfolios.setProject(org, 'spatial', 'ARI', {}, admin);
    await portfolios.setProject(org, 'spatial', 'BAD', { note: 'Fournisseur en retard' }, admin);
    const s = await portfolios.summary(org, 'spatial', director);
    expect(s.projects.map((p) => [p.key, p.health])).toEqual([['BAD', 'critical'], ['ARI', 'ok']]);
    expect(s.projects[0]!.note).toBe('Fournisseur en retard');
    expect(s.totals).toMatchObject({ projects: 2, progress: 50, late: 4, blocked: 3, open: 10, byHealth: { ok: 1, attention: 0, critical: 1 } });
  });

  it('la santé peut être forcée, puis rendue au calcul', async () => {
    await portfolios.setProject(org, 'spatial', 'BAD', { health: 'attention' }, admin);
    let bad = (await portfolios.summary(org, 'spatial', director)).projects.find((p) => p.key === 'BAD')!;
    expect(bad).toMatchObject({ health: 'attention', computedHealth: 'critical', overridden: true, note: 'Fournisseur en retard' });
    await portfolios.setProject(org, 'spatial', 'BAD', { health: null }, admin);
    bad = (await portfolios.summary(org, 'spatial', director)).projects.find((p) => p.key === 'BAD')!;
    expect(bad).toMatchObject({ health: 'critical', overridden: false });
  });

  it('un projet masqué par une liste d’ayants droit n’apparaît ni dans la synthèse ni dans le nombre de projets', async () => {
    await runAs('sub-admin', () => access.set(org, 'BAD', { members: ['sub-admin'] }, admin));
    const asDirector = <T>(fn: () => Promise<T>) => runAs('sub-dir', fn);
    expect((await asDirector(() => portfolios.list(org)))[0]).toMatchObject({ key: 'spatial', projects: 1 });
    const s = await asDirector(() => portfolios.summary(org, 'spatial', director));
    expect(s.projects.map((p) => p.key)).toEqual(['ARI']);
    expect(s.totals).toMatchObject({ projects: 1, late: 0, blocked: 0 });
    expect((await asDirector(() => portfolios.summaries(org, director)))[0]!.portfolio.projects).toBe(1);
    expect((await runAs('sub-admin', () => portfolios.list(org)))[0]!.projects).toBe(2); // l’ayant droit voit tout
    await runAs('sub-admin', () => access.set(org, 'BAD', { members: [] }, admin));
  });

  it('liste, retire un projet, met à jour et supprime le portefeuille ; refuse un projet inconnu', async () => {
    expect((await portfolios.list(org))[0]).toMatchObject({ key: 'spatial', owner: 'sub-dir', projects: 2 });
    expect(await code(portfolios.setProject(org, 'spatial', 'NOPE', {}, admin))).toMatch(/^not_found:/);
    await portfolios.removeProject(org, 'spatial', 'ARI', admin);
    expect((await portfolios.summaries(org, director))[0]!.projects.map((p) => p.key)).toEqual(['BAD']);
    expect((await portfolios.update(org, 'spatial', { name: 'Spatial', owner: null }, admin))).toMatchObject({ name: 'Spatial', owner: null });
    await portfolios.remove(org, 'spatial', admin);
    expect(await portfolios.list(org)).toEqual([]);
  });
});
