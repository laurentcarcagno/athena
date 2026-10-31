import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';

/**
 * Mesure de performance de la recherche ATQL. Par défaut un jeu réduit (garde-fou de régression, seuils larges) ;
 * avec ATHENA_PERF=1, 100 000 artefacts (ATHENA_PERF_ROWS pour changer) et un rapport détaillé.
 */
const FULL = process.env['ATHENA_PERF'] === '1';
const ROWS = FULL ? Number(process.env['ATHENA_PERF_ROWS'] ?? 100_000) : 5_000;
const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'perf', roles: ['athena-admin'] };

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((p / 100) * values.length))]!;

suite(`performance ATQL (${ROWS} artefacts)`, () => {
  let testDb: TestDb;
  let search: SearchService;
  const org = crypto.randomUUID();
  const report: string[] = [];

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_perf');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    search = new SearchService(db);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'perf']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    const started = Date.now();
    await testDb.exec(
      `insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by, created_at, updated_at)
       select t.organization_id, t.project_id, t.id, g, 'BUG-' || g,
              (select id from status s where s.tracker_id = t.id order by s.position offset (g % 5) limit 1),
              jsonb_build_object('title', 'Bug numéro ' || g, 'severity', (array['mineure','majeure','bloquante'])[1 + g % 3],
                                 'assignee', case when g % 4 = 0 then 'user' || (g % 50) else null end, 'points', g % 13),
              'perf', now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval
       from tracker t, generate_series(1, ${ROWS}) g where t.key = 'BUG'`,
    );
    await testDb.exec("update tracker_sequence set last_number = last_number");
    await testDb.exec('analyze artifact');
    report.push(`jeu de données : ${ROWS} artefacts en ${Date.now() - started} ms`);
  }, 600_000);

  afterAll(async () => {
    if (FULL) writeFileSync(join(process.cwd(), 'perf-report.txt'), `${report.join('\n')}\n`);
    await testDb?.drop();
  });

  const cases: Array<[string, string, number]> = [
    ['statut + tri par date', 'status = open ORDER BY updated DESC', 1000],
    ['champ + nombre + tri numérique', 'severity = majeure AND points > 5 ORDER BY points DESC', 1500],
    ['recherche textuelle (ILIKE)', 'title ~ "numéro 4242"', 3000],
    ['tracker + date', 'tracker = BUG AND created > "2026-01-01"', 1500],
    ['champ vide', 'assignee IS EMPTY', 1500],
    ['clé exacte', 'key = "BUG-4242"', 300],
    ['liste complète, première page', '', 1000],
  ];

  for (const [name, query, budgetMs] of cases) {
    it(`${name} : p95 sous ${budgetMs} ms`, async () => {
      const times: number[] = [];
      let total = 0;
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        total = (await search.search(org, 'ARI', query, 'perf', 50, 0)).total;
        times.push(performance.now() - t0);
      }
      const p50 = percentile(times, 50);
      const p95 = percentile(times, 95);
      report.push(`${name.padEnd(34)} p50 ${p50.toFixed(0).padStart(5)} ms   p95 ${p95.toFixed(0).padStart(5)} ms   (${total} résultats)`);
      expect(p95).toBeLessThan(FULL ? budgetMs : budgetMs * 3);
      expect(total).toBeGreaterThan(0);
    }, 120_000);
  }
});
