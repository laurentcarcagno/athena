import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../core/db';
import { QualityService } from '../core/quality.service';
import { GitLabClient } from '../history/gitlab-client';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { PipelineService, rateOf, stateOf } from './pipelines';

// T-0175 et T-0176 : pipelines lus dans un GitLab simulé, taux de réussite, cache court ; contrat de qualité « non relié ».

describe('états et taux', () => {
  it('range les états GitLab et ignore les exécutions non terminées dans le taux', () => {
    expect(['success', 'failed', 'running', 'created', 'canceled', 'manual', 'zzz'].map(stateOf)).toEqual(['success', 'failed', 'running', 'pending', 'canceled', 'skipped', 'other']);
    expect(rateOf([{ state: 'success' }, { state: 'success' }, { state: 'failed' }, { state: 'running' }])).toBe(67);
    expect(rateOf([{ state: 'running' }])).toBeNull();
    expect(rateOf([])).toBeNull();
  });
});

describe('qualité du code (contrat)', () => {
  it('sans fournisseur : « non relié », jamais une erreur', async () => {
    expect(await new QualityService().get('o', 'NOVA')).toEqual({ connected: false, provider: null, measures: null });
  });
  it('un fournisseur qui échoue ou ne connaît pas le projet : non relié, mais le fournisseur est nommé', async () => {
    const failing = new QualityService({ name: 'sonar', measures: async () => { throw new Error('boom'); } });
    expect(await failing.get('o', 'NOVA')).toEqual({ connected: false, provider: 'sonar', measures: null });
    const ok = new QualityService({ name: 'sonar', measures: async () => ({ gate: 'passed', coverage: 81.5, bugs: 2, vulnerabilities: 0, smells: 14, debtMinutes: 95, analyzedAt: '2026-11-13T08:00:00Z' }) });
    expect((await ok.get('o', 'NOVA')).measures?.coverage).toBe(81.5);
  });
});

const suite = pgUp ? describe : describe.skip;

suite('pipelines GitLab (simulateur, intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  const org = crypto.randomUUID();
  let calls: string[];
  let clock = 0;
  const statuses = ['running', 'success', 'success', 'failed', 'success'];
  const fake: typeof fetch = (async (url: string) => {
    calls.push(String(url));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (/\/projects\/root%2Fapp$/.test(String(url))) return json({ id: 7 });
    if (/\/projects\/root%2Fgone$/.test(String(url))) return json({}, 404);
    if (/\/projects\/7\/pipelines/.test(String(url))) return json(statuses.map((status, i) => ({ id: 100 - i, status, ref: 'main', web_url: `http://gl/p/${100 - i}`, created_at: '2026-11-13T08:00:00Z', updated_at: '2026-11-13T08:0' + i + ':00Z' })));
    return json({}, 404);
  }) as typeof fetch;

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_pipelines');
    db = new Db(testDb.pool);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'pipe','pipe')", [org]);
      const id = (await c.query("insert into project (organization_id, key, name) values ($1,'NOVA','Nova') returning id", [org])).rows[0].id;
      await c.query("insert into project (organization_id, key, name) values ($1,'LUMEN','Lumen')", [org]);
      for (const path of ['root/app', 'root/gone']) await c.query('insert into code_repo (organization_id, project_id, gitlab_path) values ($1,$2,$3)', [org, id, path]);
    });
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('lit les 12 dernières exécutions par dépôt, le taux et l’exécution en cours ; un dépôt disparu est vide', async () => {
    calls = [];
    const service = new PipelineService(db, new GitLabClient('http://gl', 't', fake), 30_000, () => clock);
    const view = await service.get(org, 'NOVA');
    expect(view.configured).toBe(true);
    const app = view.repos.find((r) => r.repo === 'root/app')!;
    expect(app.runs).toHaveLength(5);
    expect(app.runs[0]).toMatchObject({ id: 100, state: 'running', url: 'http://gl/p/100' });
    expect(app.successRate).toBe(75); // 3 réussites sur 4 terminées
    expect(app.running).toBe(true);
    expect(view.running).toBe(true);
    expect(calls.some((c) => c.includes('per_page=12'))).toBe(true);
    expect(view.repos.find((r) => r.repo === 'root/gone')).toMatchObject({ runs: [], successRate: null, last: null });
  });

  it('garde le résultat 30 secondes, puis relit', async () => {
    calls = [];
    const service = new PipelineService(db, new GitLabClient('http://gl', 't', fake), 30_000, () => clock);
    await service.get(org, 'NOVA');
    const first = calls.length;
    clock += 10_000;
    await service.get(org, 'NOVA');
    expect(calls.length).toBe(first);
    clock += 25_000;
    await service.get(org, 'NOVA');
    expect(calls.length).toBeGreaterThan(first);
  });

  it('projet sans dépôt relié : liste vide ; GitLab non configuré : configured false', async () => {
    const service = new PipelineService(db, new GitLabClient('http://gl', 't', fake));
    expect(await service.get(org, 'LUMEN')).toMatchObject({ configured: true, repos: [], successRate: null, running: false });
    expect(await new PipelineService(db, null).get(org, 'NOVA')).toEqual({ configured: false, repos: [], successRate: null, running: false });
  });
});
