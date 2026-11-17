import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { runAs } from '../core/request-context';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ExportMarker } from '../core/export-marking';
import { HealthService, healthCsv } from './health.service';
import { LifecycleService } from './lifecycle.service';
import { parseHealthFilter } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { StatusNoteInput, StatusNoteService } from './status-note.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };
const pm: Actor = { id: 'sub-pm', roles: ['athena-team-member', 'athena-pm'] };

describe('filtre du tableau de santé', () => {
  it('ignore les valeurs inconnues et n’inclut les projets clos que sur demande', () => {
    expect(parseHealthFilter({})).toEqual({ includeClosed: false });
    expect(parseHealthFilter({ state: 'active,nope,suspended', health: 'critical', phase: 'pdr', sponsor: 'Sam', includeClosed: '1' })).toEqual({
      categories: ['active', 'suspended'], health: 'critical', phase: 'pdr', sponsor: 'Sam', includeClosed: true,
    });
    expect(parseHealthFilter({ health: 'rouge' })).toEqual({ includeClosed: false });
  });
});

suite('tableau de santé (intégration)', () => {
  let testDb: TestDb;
  let health: HealthService;
  let access: AccessService;
  const org = crypto.randomUUID();
  const kpis = {
    async kpis(_o: string, project: string) {
      const bad = project === 'HB';
      return {
        project: { key: project, name: `Projet ${project}`, createdAt: '2026-01-01T00:00:00.000Z', members: 2, managers: ['Chef'] },
        progress: { total: 10, done: bad ? 2 : 8, inProgress: 1, todo: 1, percent: bad ? 20 : 80 },
        late: bad ? 4 : 0, blocked: bad ? 3 : 0, dueSoon: 1, open: bad ? 8 : 2, workload: [],
        velocity: { average: 0, forecast: 0, sprints: 0 }, sprint: null, health: { state: 'ok' as const, reasons: [] },
      };
    },
  };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_health');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    const portfolios = new PortfolioService(db, kpis);
    access = new AccessService(db);
    health = new HealthService(db, portfolios, new LifecycleService(db));
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'hl','hl')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-sp','sp','Sam Sponsor','s@example.test'), ($1,'sub-admin','admin.dev','Admin Dev','a@example.test')", [org]);
    });
    for (const k of ['HA', 'HB', 'HC']) await trackers.createProject(org, k, `Projet ${k}`, admin);
    await portfolios.create(org, { key: 'sante', name: 'Santé' }, admin);
    for (const k of ['HA', 'HB', 'HC']) await portfolios.setProject(org, 'sante', k, {}, admin);
    await db.tx(org, async (c) => {
      await c.query("update project set lifecycle_state = 'completed' where key = 'HC'");
      await c.query("update project set current_phase = 'pdr' where key = 'HB'");
      await c.query("insert into project_meta (organization_id, project_id, planned_start, planned_end, sponsor_subject, updated_by) select $1, id, '2026-01-05', '2026-12-18', 'sub-sp', 'x' from project where key = 'HB'", [org]);
      await c.query("insert into project_phase (organization_id, project_id, phase, review_planned_on, updated_by) select $1, id, 'pdr', '2026-12-01', 'x' from project where key = 'HB'", [org]);
    });
    // HA est calculé « ok » mais déclaré critique : un écart
    await new StatusNoteService(db).write(org, 'HA', StatusNoteInput.parse({ schedule: 'ok', scope: 'ok', risk: 'critical' }), pm);
    // un risque noté 4 × 5 dans HB
    await trackers.createTracker(org, {
      projectKey: 'HB', key: 'RSK', name: 'Risques', typeKey: 'risk',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'p', label: 'Probabilité', type: 'number', semanticRole: 'probability' }, { key: 'i', label: 'Impact', type: 'number', semanticRole: 'impact' },
      ],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'closed', name: 'Clos', category: 'done' }],
      transitions: [{ name: 'Clore', from: 'open', to: 'closed' }, { name: 'Rouvrir', from: null, to: 'open' }],
    }, admin);
    await artifacts.create(org, 'HB', 'RSK', { title: 'Lanceur', p: 4, i: 5 }, admin);
    const closed = await artifacts.create(org, 'HB', 'RSK', { title: 'Levé', p: 5, i: 5 }, admin);
    await artifacts.transition(org, 'HB', closed.key, 'Clore', closed.version, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('une ligne par projet actif, du plus au moins à risque ; les projets terminés sont exclus par défaut et comptés', async () => {
    const h = await health.health(org, 'sante', admin);
    expect(h.rows.map((r) => r.key)).toEqual(['HB', 'HA']);
    expect(h.hiddenByState).toBe(1);
    expect(h.totals).toMatchObject({ projects: 2, gaps: 1 });
    expect((await health.health(org, 'sante', admin, { includeClosed: true })).rows.map((r) => r.key)).toEqual(['HB', 'HA', 'HC']);
  });

  it('calculée, déclarée, écart, dates, phase, prochaine revue, sponsor et risque maximal (un risque clos ne compte pas)', async () => {
    const h = await health.health(org, 'sante', admin);
    const hb = h.rows.find((r) => r.key === 'HB')!;
    expect(hb).toMatchObject({ computedHealth: 'critical', health: 'critical', declaredHealth: null, gap: false, plannedEnd: '2026-12-18', sponsor: 'Sam Sponsor', phase: 'pdr', nextReview: '2026-12-01', maxRisk: 20 });
    const ha = h.rows.find((r) => r.key === 'HA')!;
    expect(ha).toMatchObject({ computedHealth: 'ok', declaredHealth: 'critical', gap: true, maxRisk: null, lifecycle: { category: 'active' } });
  });

  it('filtres : catégorie, phase, santé, sponsor', async () => {
    const keys = async (f: Parameters<HealthService['health']>[3]) => (await health.health(org, 'sante', admin, f)).rows.map((r) => r.key);
    expect(await keys({ phase: 'pdr' })).toEqual(['HB']);
    expect(await keys({ health: 'ok' })).toEqual(['HA']);
    expect(await keys({ sponsor: 'Sam Sponsor' })).toEqual(['HB']);
    expect(await keys({ categories: ['closed'], includeClosed: true })).toEqual(['HC']);
  });

  it('B19 : un lecteur hors liste d’ayants droit ne trouve aucune trace du projet masqué, ni ligne, ni total, ni nombre', async () => {
    await runAs('sub-admin', () => access.set(org, 'HB', { members: ['sub-admin'] }, admin));
    const full = await runAs('sub-admin', () => health.health(org, 'sante', admin));
    const restricted = await runAs('sub-dir', () => health.health(org, 'sante', director));
    expect(full.rows.map((r) => r.key)).toEqual(['HB', 'HA']);
    expect(restricted.rows.map((r) => r.key)).toEqual(['HA']);
    expect(restricted.portfolio.projects).toBe(2); // HA et HC : HB n'est pas compté
    expect(restricted.totals).toMatchObject({ projects: 1, byHealth: { ok: 1, attention: 0, critical: 0 }, late: 0, blocked: 0, open: 2 });
    const json = JSON.stringify(restricted);
    for (const trace of ['HB', 'Lanceur', 'Sam Sponsor', '2026-12-18', '2026-12-01', 'pdr']) expect(json).not.toContain(trace);
    expect(restricted.hiddenByState).toBe(1); // HC (terminé) reste visible du lecteur et exclu par défaut ; HB n'est compté nulle part
    await runAs('sub-admin', () => access.remove(org, 'HB', null, admin)); // lève la restriction
    expect((await runAs('sub-dir', () => health.health(org, 'sante', director))).rows.map((r) => r.key)).toEqual(['HB', 'HA']);
  });

  it('B22 : le CSV a exactement les lignes de la vue, porte le marquage et ne contient rien d’un projet masqué', async () => {
    const view = await runAs('sub-admin', () => health.health(org, 'sante', admin));
    const csv = healthCsv(view);
    const lines = csv.replace(/^﻿/, '').trimEnd().split('\n');
    expect(lines[0]).toBe('projet,nom,etat,sante,sante_calculee,sante_forcee,sante_declaree,ecart,phase,prochaine_revue,debut_prevu,fin_prevue,avancement_pct,tickets_ouverts,en_retard,bloques,risque_max,sponsor');
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(view.rows.map((r) => r.key));
    expect(lines[1]).toContain('HB,Projet HB,En cours,critical,critical,non,,non,pdr,2026-12-01,2026-01-05,2026-12-18,20,8,4,3,20,Sam Sponsor');
    const marked = new ExportMarker('DIFFUSION RESTREINTE').csv(csv);
    expect(marked.split('\n')[0]).toContain('DIFFUSION RESTREINTE');
    expect(marked.trimEnd().split('\n').at(-1)).toContain('DIFFUSION RESTREINTE');
    expect(marked.startsWith('﻿')).toBe(true);
    // lecteur restreint : aucune trace de HB, filtres appliqués à l'export comme à la vue
    await runAs('sub-admin', () => access.set(org, 'HB', { members: ['sub-admin'] }, admin));
    const restricted = healthCsv(await runAs('sub-dir', () => health.health(org, 'sante', director)));
    for (const trace of ['HB', 'Lanceur', 'Sam Sponsor', '2026-12-18']) expect(restricted).not.toContain(trace);
    await runAs('sub-admin', () => access.remove(org, 'HB', null, admin));
    expect(healthCsv(await health.health(org, 'sante', admin, { health: 'ok' })).trimEnd().split('\n')).toHaveLength(2);
  });

  it('neutralise les formules et échappe virgules et guillemets', () => {
    const row = { key: 'X', name: '=2+2, "piégé"', lifecycle: { key: 'a', name: 'Actif', category: 'active' as const }, health: 'ok' as const, computedHealth: 'ok' as const, overridden: false, declaredHealth: null, declaredAt: null, gap: false, reasons: [], note: '', plannedStart: null, plannedEnd: null, sponsor: '@cmd', phase: null, nextReview: null, progress: 0, open: 0, late: 0, blocked: 0, dueSoon: 0, maxRisk: null };
    const out = healthCsv({ portfolio: { key: 'p', name: 'p', description: '', owner: null, projects: 1 }, rows: [row], totals: { projects: 1, byHealth: { ok: 1, attention: 0, critical: 0 }, gaps: 0, late: 0, blocked: 0, open: 0, progress: 0 }, hiddenByState: 0 });
    expect(out).toContain(`X,"'=2+2, ""piégé""",Actif`);
    expect(out).toContain(",'@cmd\n");
  });
});
