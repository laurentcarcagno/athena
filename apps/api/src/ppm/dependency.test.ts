import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { ArtifactService } from '../core/artifact.service';
import { CalendarService } from '../core/calendar.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TrackerService } from '../core/tracker.service';
import { ScheduleService } from '../planning/schedule.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { DependencyService } from './dependency.service';
import { PortfolioService } from './portfolio.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return (e as { code?: string })?.code ?? (e ? 'autre' : 'ok'); };

suite('dépendances entre projets (B36, intégration)', () => {
  let testDb: TestDb;
  let svc: DependencyService;
  let access: AccessService;
  const org = crypto.randomUUID();
  const keys: Record<string, string> = {};

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_dependency');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    const calendar = new CalendarService(db);
    svc = new DependencyService(db, new ScheduleService(db, artifacts, calendar), calendar);
    access = new AccessService(db);
    const portfolios = new PortfolioService(db, { kpis: async () => { throw new Error('inutilisé'); } });
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'dp','dp')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-admin','admin.dev','Admin Dev','a@example.test')", [org]);
    });
    await portfolios.create(org, { key: 'dep', name: 'Dépendances' }, admin);
    for (const p of ['AAA', 'BBB', 'CCC']) {
      await trackers.createProject(org, p, `Projet ${p}`, admin);
      await trackers.createTracker(org, {
        projectKey: p, key: 'TSK', name: 'Tâches', typeKey: 'task',
        fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date' }, { key: 'due', label: 'Fin', type: 'date', semanticRole: 'due_date' }],
        statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }],
      }, admin);
      await portfolios.setProject(org, 'dep', p, {}, admin);
    }
    // A finit le vendredi 13/11 ; B démarre le lundi 16/11 (marge 0) et finit le 20/11 ; C démarre le 23/11 (marge 0 après B)
    keys['a'] = (await artifacts.create(org, 'AAA', 'TSK', { title: 'Livraison A', start: '2026-11-09', due: '2026-11-13' }, admin)).key;
    keys['b'] = (await artifacts.create(org, 'BBB', 'TSK', { title: 'Intégration B', start: '2026-11-16', due: '2026-11-20' }, admin)).key;
    keys['c'] = (await artifacts.create(org, 'CCC', 'TSK', { title: 'Recette C', start: '2026-11-23', due: '2026-11-27' }, admin)).key;
  }, 90_000);
  afterAll(async () => { await testDb?.drop(); });

  it('lien entre deux projets : marge calculée, critique si nulle ; même projet, cycle et ticket inconnu refusés', async () => {
    const ab = await svc.add(org, { from: keys['a']!, to: keys['b']!, lagDays: 0 }, admin);
    expect(ab).toMatchObject({ lagDays: 0, slackDays: 0, critical: true, from: { project: 'AAA' }, to: { project: 'BBB' } });
    const bc = await svc.add(org, { from: keys['b']!, to: keys['c']!, lagDays: 2 }, admin);
    expect(bc.slackDays).toBe(-2); // B finit le 20, +2 jours ouvrés = 24/11 ; C démarre le 23 : contrainte violée de 2 jours ouvrés
    expect(bc.critical).toBe(true);
    expect(await code(svc.add(org, { from: keys['c']!, to: keys['a']!, lagDays: 0 }, admin))).toBe('conflict'); // cycle A → B → C → A
    expect(await code(svc.add(org, { from: keys['a']!, to: 'AAA-TSK-9999', lagDays: 0 }, admin))).toBe('not_found');
  });

  it('graphe et matrice du portefeuille', async () => {
    const g = await svc.graph(org, 'dep', admin);
    expect(g.projects).toEqual(['AAA', 'BBB', 'CCC']);
    expect(g.matrix).toEqual([{ from: 'AAA', to: 'BBB', count: 1, critical: 1 }, { from: 'BBB', to: 'CCC', count: 1, critical: 1 }]);
  });

  it('propagation en lecture : un retard de 3 jours ouvrés sur A pousse B puis C, sans rien écrire', async () => {
    const r = await svc.propagate(org, { ticket: keys['a']!, shiftDays: 3 }, admin);
    expect(r.impacts.map((i) => [i.project, i.shiftDays])).toEqual([['BBB', 3], ['CCC', 3]]);
    expect(r.impacts[0]).toMatchObject({ newStart: '2026-11-19', newEnd: '2026-11-25' });
    expect(r.impacts[1]).toMatchObject({ newStart: '2026-11-30' }); // la violation déjà présente (2 jours) est absorbée : l'impact du glissement est de 3 jours
    expect((await svc.propagate(org, { ticket: keys['a']!, shiftDays: 0 }, admin)).impacts).toEqual([]);
    expect((await svc.propagate(org, { ticket: keys['c']!, shiftDays: 5 }, admin)).impacts).toEqual([]); // C n'a pas de successeur
    expect((await svc.graph(org, 'dep', admin)).links[0]!.slackDays).toBe(0); // le planning de B n'a pas bougé
  });

  it('un lecteur qui ne voit pas un projet ne voit ni le lien ni le projet', async () => {
    await runAs('sub-admin', () => access.set(org, 'CCC', { members: ['sub-admin'] }, admin));
    const seen = await runAs('sub-dir', () => svc.graph(org, 'dep', director));
    expect(seen.links.map((l) => l.to.project)).toEqual(['BBB']);
    expect(JSON.stringify(seen)).not.toContain('CCC');
    await runAs('sub-admin', () => access.remove(org, 'CCC', null, admin));
  });

  it('le lien se retire', async () => {
    const g = await svc.graph(org, 'dep', admin);
    await svc.remove(org, g.links[1]!.id, admin);
    expect((await svc.graph(org, 'dep', admin)).links).toHaveLength(1);
    expect(await code(svc.remove(org, g.links[1]!.id, admin))).toBe('not_found');
  });
});
