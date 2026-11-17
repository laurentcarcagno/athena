import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { UsageService, usageRole } from './usage.service';

const suite = pgUp ? describe : describe.skip;

describe('rôle d’usage', () => {
  it('retient un seul rôle PPM, le plus élevé, jamais la liste', () => {
    expect(usageRole(['athena-team-member', 'athena-pm', 'athena-admin'])).toBe('admin');
    expect(usageRole(['athena-director', 'athena-team-member'])).toBe('director');
    expect(usageRole(['athena-manager'])).toBe('manager');
    expect(usageRole(['athena-team-member'])).toBe('other');
  });
});

suite('journal d’usage agrégé (B26)', () => {
  let testDb: TestDb;
  let db: Db;
  let usage: UsageService;
  const org = crypto.randomUUID();
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_usage');
    db = new Db(testDb.pool);
    usage = new UsageService(db);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'us','us')", [org]));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('un compteur par jour, rôle et route ; plusieurs accès s’additionnent', async () => {
    const day = new Date('2026-11-17T10:00:00Z');
    await usage.hit(org, ['athena-director'], 'health', day);
    await usage.hit(org, ['athena-director', 'athena-team-member'], 'health', day);
    await usage.hit(org, ['athena-pmo'], 'health_csv', day);
    const rows = await db.tx(org, async (c) => (await c.query("select to_char(usage_day, 'YYYY-MM-DD') as day, role, route, hits from portfolio_usage order by role, route")).rows);
    expect(rows).toEqual([{ day: '2026-11-17', role: 'director', route: 'health', hits: 2 }, { day: '2026-11-17', role: 'pmo', route: 'health_csv', hits: 1 }]);
  });

  it('la table ne contient aucune colonne d’identité, de projet ou de contenu', async () => {
    const columns = (await testDb.pool.query("select column_name from information_schema.columns where table_name = 'portfolio_usage' order by 1")).rows.map((r) => r.column_name);
    expect(columns).toEqual(['hits', 'organization_id', 'role', 'route', 'usage_day']);
  });

  it('le rapport lit les jours récents', async () => {
    await usage.hit(org, ['athena-admin'], 'list');
    const report = await usage.report(org, 30);
    expect(report.some((r) => r.role === 'admin' && r.route === 'list' && r.hits === 1)).toBe(true);
    expect(report.every((r) => !('subject' in r))).toBe(true);
  });
});
