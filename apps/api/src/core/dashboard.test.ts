import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { DEFAULT_WIDGETS, DashboardService } from './dashboard.service';

// T-0122 : disposition personnelle du tableau de bord, défaut sans réglage, réinitialisation.

const suite = pgUp ? describe : describe.skip;
const alice: Actor = { id: 'alice', roles: ['athena-user'] };
const bob: Actor = { id: 'bob', roles: ['athena-user'] };
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof DomainError ? `${e.code}:${e.message} ${e.details.join(' ')}` : e ? `autre:${(e as Error).message}` : 'ok';
};

suite('tableau de bord personnel (intégration)', () => {
  let testDb: TestDb;
  let dash: DashboardService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_dashboard');
    const db = new Db(testDb.pool);
    dash = new DashboardService(db);
    for (const [id, key] of [[org, 'dash'], [other, 'dash2']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('donne la disposition par défaut sans réglage, six widgets', async () => {
    const d = await dash.get(org, alice);
    expect(d.isDefault).toBe(true);
    expect(d.widgets.map((w) => w.id)).toEqual(['assigned', 'approvals', 'mentions', 'due', 'favorites', 'recents']);
    expect(d.widgets).toEqual([...DEFAULT_WIDGETS]);
  });

  it('enregistre, relit, réordonne, reste personnelle et propre à l’organisation, se réinitialise', async () => {
    const widgets = [{ id: 'mentions', kind: 'mentions' as const }, { id: 'v1', kind: 'search' as const, title: 'Ouverts NOVA', query: 'category != done', projects: ['NOVA'] }];
    expect((await dash.put(org, { widgets }, alice)).isDefault).toBe(false);
    expect(await dash.get(org, alice)).toEqual({ widgets, isDefault: false });
    expect((await dash.get(org, bob)).isDefault).toBe(true);
    expect((await dash.get(other, alice)).isDefault).toBe(true);
    await dash.put(org, { widgets: [widgets[1]!] }, alice); // remplace
    expect((await dash.get(org, alice)).widgets.map((w) => w.id)).toEqual(['v1']);
    await dash.reset(org, alice);
    expect((await dash.get(org, alice)).isDefault).toBe(true);
  });

  it('refuse un identifiant en double, une requête invalide et une requête sur un widget qui n’en a pas', async () => {
    expect(await code(dash.put(org, { widgets: [{ id: 'a', kind: 'mentions' }, { id: 'a', kind: 'recents' }] }, alice))).toMatch(/^validation.*double/);
    expect(await code(dash.put(org, { widgets: [{ id: 'a', kind: 'search', query: 'status =' }] }, alice))).toMatch(/^validation/);
    expect(await code(dash.put(org, { widgets: [{ id: 'a', kind: 'mentions', query: 'x = 1' }] }, alice))).toMatch(/^validation/);
    expect((await dash.get(org, alice)).isDefault).toBe(true);
  });
});
