import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { PortfolioService } from './portfolio.service';
import { ScoringService, scoreOf, type ScoringCriterion } from './scoring.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return (e as { code?: string })?.code ?? (e ? 'autre' : 'ok'); };

const criteria: ScoringCriterion[] = [
  { key: 'valeur', label: 'Valeur', weight: 3, scaleMin: 0, scaleMax: 10, direction: 'higher' },
  { key: 'cout', label: 'Coût', weight: 2, scaleMin: 0, scaleMax: 100, direction: 'lower' },
  { key: 'risque', label: 'Risque', weight: 1, scaleMin: 1, scaleMax: 5, direction: 'lower' },
];

describe('score pondéré (calcul pur)', () => {
  it('Σ (poids × valeur normalisée) / Σ poids ; critère « plus bas, mieux » inversé', () => {
    // valeur 8/10 = 0,8 (poids 3) ; coût 20/100 inversé = 0,8 (poids 2) ; risque 3 sur 1..5 = 0,5 inversé 0,5 (poids 1)
    const r = scoreOf(criteria, new Map([['valeur', 8], ['cout', 20], ['risque', 3]]));
    expect(r.score).toBeCloseTo((3 * 0.8 + 2 * 0.8 + 1 * 0.5) / 6 * 100, 2);
    expect(r.completeness).toBe(100);
    expect(r.contributions.map((c) => c.criterion)).toEqual(['valeur', 'cout', 'risque']);
  });
  it('un critère non noté est exclu et la complétude baisse', () => {
    const r = scoreOf(criteria, new Map([['valeur', 10]]));
    expect(r.score).toBe(100); // seul le critère noté compte
    expect(r.completeness).toBe(50); // 3 / 6 du poids
    expect(scoreOf(criteria, new Map()).score).toBeNull();
  });
  it('une valeur hors échelle est ramenée à l’échelle', () => {
    expect(scoreOf(criteria, new Map([['valeur', 99]])).score).toBe(100);
  });
});

suite('modèle de scoring versionné et classement (B41, intégration)', () => {
  let testDb: TestDb;
  let svc: ScoringService;
  const org = crypto.randomUUID();
  const keys: string[] = [];
  const input = (weights: number[]) => ({ criteria: criteria.map((c, i) => ({ ...c, weight: weights[i]! })) });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_scoring');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    svc = new ScoringService(db);
    const portfolios = new PortfolioService(db, { kpis: async () => { throw new Error('inutilisé'); } });
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'sc','sc')", [org]));
    await portfolios.create(org, { key: 'prio', name: 'Priorisation' }, admin);
    await trackers.createProject(org, 'PIL', 'Pilotage', admin);
    await portfolios.setProject(org, 'prio', 'PIL', { kind: 'pilot', purpose: 'Demandes' }, admin);
    await trackers.createTracker(org, { projectKey: 'PIL', key: 'REQ', name: 'Demandes', typeKey: 'request', fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }], statuses: [{ key: 'new', name: 'Nouvelle', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'new' }] }, admin);
    for (const t of ['Capteur stellaire v2', 'Station sol bis', 'Refonte du bus']) keys.push((await artifacts.create(org, 'PIL', 'REQ', { title: t }, admin)).key);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('sans modèle : pas de classement ; un modèle crée la version 1, un changement de poids la version 2', async () => {
    expect((await svc.ranking(org, 'prio')).model).toBeNull();
    expect((await svc.createModel(org, 'prio', input([3, 2, 1]), admin)).version).toBe(1);
    expect(await code(svc.createModel(org, 'prio', { criteria: [criteria[0]!, criteria[0]!] }, admin))).toBe('validation');
  });

  it('notes, classement avec complétude (incomplète sous 70 %), valeur hors échelle refusée', async () => {
    for (const [c, v] of [['valeur', 8], ['cout', 20], ['risque', 3]] as const) await svc.score(org, 'prio', { ticket: keys[0]!, criterion: c, value: v }, admin);
    await svc.score(org, 'prio', { ticket: keys[1]!, criterion: 'valeur', value: 10 }, admin);
    expect(await code(svc.score(org, 'prio', { ticket: keys[1]!, criterion: 'valeur', value: 11 }, admin))).toBe('validation');
    expect(await code(svc.score(org, 'prio', { ticket: keys[1]!, criterion: 'inconnu', value: 1 }, admin))).toBe('validation');
    expect(await code(svc.score(org, 'prio', { ticket: 'PIL-REQ-999', criterion: 'valeur', value: 1 }, admin))).toBe('not_found');
    const r = await svc.ranking(org, 'prio');
    expect(r.requests.map((x) => x.title)).toEqual(['Station sol bis', 'Capteur stellaire v2', 'Refonte du bus']);
    expect(r.requests[0]).toMatchObject({ score: 100, completeness: 50, incomplete: true });
    expect(r.requests[1]).toMatchObject({ completeness: 100, incomplete: false });
    expect(r.requests[2]).toMatchObject({ score: null, completeness: 0, incomplete: true }); // non notée, à la fin
  });

  it('changer les poids crée une version 2 ; les notes de la version 1 restent lisibles', async () => {
    const v2 = await svc.createModel(org, 'prio', input([1, 5, 1]), admin);
    expect(v2.version).toBe(2);
    expect((await svc.ranking(org, 'prio')).requests.every((x) => x.score === null)).toBe(true); // aucune note en version 2
    const v1 = await svc.ranking(org, 'prio', 1);
    expect(v1.model!.version).toBe(1);
    expect(v1.requests[1]!.score).toBeGreaterThan(70);
  });
});
