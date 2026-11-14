import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { TrackerService } from '../core/tracker.service';
import { SearchService } from '../atql/search.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { KPI_QUERIES, KpiService, healthOf } from './kpi.service';
import { ReportService } from './report.service';
import { SprintService } from './sprint.service';

// T-0174 : agrégats de pilotage d'un projet ; les chiffres sont ceux des recherches que les widgets ouvrent.

describe('santé du projet', () => {
  it('vert sans retard ni bloquant, orangé dès un retard ou un bloquant, rouge à 25 % de retard ou 3 bloquants', () => {
    expect(healthOf(10, 0, 0)).toEqual({ state: 'ok', reasons: [] });
    expect(healthOf(10, 1, 0)).toEqual({ state: 'attention', reasons: ['late'] });
    expect(healthOf(10, 0, 1)).toEqual({ state: 'attention', reasons: ['blocked'] });
    expect(healthOf(8, 2, 0).state).toBe('critical');
    expect(healthOf(40, 1, 3).state).toBe('critical');
    expect(healthOf(0, 0, 0).state).toBe('ok');
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

suite('indicateurs de pilotage (intégration)', () => {
  let testDb: TestDb;
  let kpi: KpiService;
  let search: SearchService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_kpi');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    search = new SearchService(db);
    kpi = new KpiService(db, search, new ReportService(db), new SprintService(db));
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'kpi','kpi')", [org]));
    await trackers.createProject(org, 'NOVA', 'Nova', admin);
    await trackers.createTracker(org, {
      projectKey: 'NOVA', key: 'TSK', name: 'Tâches', typeKey: 'task',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'end', label: 'Fin', type: 'date', semanticRole: 'due_date' },
        { key: 'who', label: 'Assigné', type: 'text', semanticRole: 'assignee' },
      ],
      statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'doing', name: 'En cours', category: 'in_progress' }, { key: 'done', name: 'Fait', category: 'done' }],
      transitions: [{ name: 'Démarrer', from: 'todo', to: 'doing' }, { name: 'Terminer', from: 'doing', to: 'done' }],
    }, admin);
    const make = async (title: string, values: Record<string, unknown> = {}) => (await artifacts.create(org, 'NOVA', 'TSK', { title, ...values }, admin)).key;
    const late = await make('en retard', { end: iso(-3), who: 'alice' });
    await make('bientôt', { end: iso(2), who: 'alice' });
    await make('loin', { end: iso(30), who: 'bob' });
    const blocker = await make('bloqueur');
    const done = await make('fini', { end: iso(-9) });
    const a = await artifacts.get(org, 'NOVA', done);
    const started = await artifacts.transition(org, 'NOVA', done, 'Démarrer', a.version, admin);
    await artifacts.transition(org, 'NOVA', done, 'Terminer', started.version, admin);
    await new LinkService(db).link(org, 'NOVA', blocker, late, 'blocks', admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('compte retards, échéances, bloquants et avancement exactement comme les recherches des widgets', async () => {
    const k = await kpi.kpis(org, 'NOVA', admin);
    expect(k.project).toMatchObject({ key: 'NOVA', name: 'Nova' });
    expect(k.progress).toMatchObject({ total: 5, done: 1, percent: 20 });
    expect([k.open, k.late, k.blocked, k.dueSoon]).toEqual([4, 1, 1, 1]);
    for (const [field, q] of [['open', KPI_QUERIES.open], ['late', KPI_QUERIES.late], ['blocked', KPI_QUERIES.blocked], ['dueSoon', KPI_QUERIES.dueSoon]] as const) {
      expect(k[field]).toBe((await search.search(org, 'NOVA', q, admin.id, 1, 0, admin.roles)).total);
    }
    expect(k.health).toEqual({ state: 'critical', reasons: ['blocked', 'late'] }); // 1 retard sur 4 ouverts : 25 %
    expect(k.sprint).toBeNull();
    expect(k.velocity).toEqual({ average: 0, forecast: 0, sprints: 0 });
  });

  it('charge de travail : tickets ouverts par personne', async () => {
    const k = await kpi.kpis(org, 'NOVA', admin);
    expect(k.workload.find((w) => w.assignee === 'alice')?.count).toBe(2);
    expect(k.workload.find((w) => w.assignee === 'bob')?.count).toBe(1);
  });

  it('projet inconnu : introuvable', async () => {
    await expect(kpi.kpis(org, 'NOPE', admin)).rejects.toMatchObject({ code: 'not_found' });
  });
});
