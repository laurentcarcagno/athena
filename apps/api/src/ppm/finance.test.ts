import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { FinanceService } from './finance.service';
import { WorklogService } from './worklog.service';
import { CalendarService } from '../core/calendar.service';
import { PpmSettingsService } from './settings.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const finance: Actor = { id: 'sub-fin', roles: ['athena-finance'] };
const pmo: Actor = { id: 'sub-pmo', roles: ['athena-pmo', 'athena-team-member'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };
const member: Actor = { id: 'sub-ana', roles: ['athena-team-member'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return (e as { code?: string })?.code ?? (e ? 'autre' : 'ok'); };
const NOW = new Date('2026-06-15T00:00:00Z');

suite('finances (B37, intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let fin: FinanceService;
  let access: AccessService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_finance');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    fin = new FinanceService(db);
    access = new AccessService(db);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'fi','fi')", [org]);
      for (const s of ['sub-admin', 'sub-fin', 'sub-ana']) await c.query('insert into user_account (organization_id, subject, username, display_name, email) values ($1,$2,$2,$2,$3)', [org, s, `${s}@example.test`]);
    });
    for (const p of ['FIN', 'SEC']) await trackers.createProject(org, p, `Projet ${p}`, admin);
    for (const [key, kind] of [['logiciel', 'internal'], ['prestations', 'service'], ['licences', 'license']] as const) await fin.upsertCategory(org, { key, name: key, kind }, finance);
    void ArtifactService;
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('droits : la finance, le PMO et l’administrateur écrivent ; la direction lit ; un membre d’équipe n’accède à rien', async () => {
    expect(await code(fin.categories(org, member))).toBe('forbidden');
    expect(await code(fin.categories(org, pmo))).toBe('ok');
    expect(await code(fin.categories(org, director))).toBe('ok');
    expect(await code(fin.addBudget(org, { project: 'FIN', category: 'logiciel', kind: 'initial', amount: 1000, reason: '' }, director))).toBe('forbidden');
    expect(await code(fin.rates(org, pmo))).toBe('ok'); // le PMO a les droits de la finance : taux compris
    expect(await code(fin.rates(org, member))).toBe('forbidden');
    expect(await code(fin.rates(org, director))).toBe('forbidden');
    expect(await code(fin.rates(org, finance))).toBe('ok');
  });

  it('budget = initial + avenants + arbitrages ; EAC = réel + prévisions des mois à venir ; alertes de dépassement', async () => {
    await fin.addBudget(org, { project: 'FIN', category: 'logiciel', kind: 'initial', amount: 100_000, reason: 'Budget initial' }, finance);
    await fin.addBudget(org, { project: 'FIN', category: 'logiciel', kind: 'amendment', amount: 10_000, reason: 'Avenant 1' }, finance);
    await fin.addBudget(org, { project: 'FIN', category: 'logiciel', kind: 'arbitration', amount: -5000, reason: 'Arbitrage' }, admin);
    await fin.addBudget(org, { project: 'FIN', category: 'prestations', kind: 'initial', amount: 20_000 }, finance);
    await fin.addCommitment(org, { project: 'FIN', category: 'prestations', amount: 15_000, reference: 'CMD-1', committedOn: '2026-03-01' }, finance);
    await fin.addActual(org, { project: 'FIN', category: 'logiciel', period: '2026-05', amount: 60_000 }, finance);
    await fin.addActual(org, { project: 'FIN', category: 'prestations', period: '2026-05', amount: 22_000 }, finance);
    await fin.setForecast(org, { project: 'FIN', category: 'logiciel', period: '2026-07', amount: 30_000 }, finance);
    await fin.setForecast(org, { project: 'FIN', category: 'logiciel', period: '2026-08', amount: 20_000 }, finance);
    await fin.setForecast(org, { project: 'FIN', category: 'logiciel', period: '2026-04', amount: 99_999 }, finance); // un mois passé n'entre pas dans le reste à dépenser
    const p = await fin.project(org, 'FIN', pmo, NOW);
    expect(p.lines.find((l) => l.category === 'logiciel')).toEqual({ category: 'logiciel', budget: 105_000, committed: 0, actual: 60_000, forecast: 50_000, eac: 110_000, variance: -5000 });
    expect(p.lines.find((l) => l.category === 'prestations')).toMatchObject({ budget: 20_000, committed: 15_000, actual: 22_000, eac: 22_000, variance: -2000 });
    expect(p.totals).toMatchObject({ budget: 125_000, actual: 82_000, eac: 132_000 });
    expect(p.alerts).toEqual([{ kind: 'overrun', category: 'logiciel', excess: 5000 }, { kind: 'exceeded', category: 'prestations', excess: 2000 }].sort((a, b) => 0 * a.excess + (a.category ?? '').localeCompare(b.category ?? '')));
    expect(p.curve.map((x) => [x.period, x.actualCumulative, x.forecastCumulative])).toEqual([['2026-05', 82_000, 82_000], ['2026-07', 82_000, 112_000], ['2026-08', 82_000, 132_000]]);
  });

  it('le budget est en ajout seul : ni modification ni suppression', async () => {
    await expect(db.tx(org, (c) => c.query('update budget_line set amount = 1'))).rejects.toThrow();
    await expect(db.tx(org, (c) => c.query('delete from budget_line'))).rejects.toThrow();
  });

  it('B37 : import de 1 000 lignes dont 3 erronées, 997 enregistrées et 3 rapportées ; le réimport est sans effet', async () => {
    const rows = ['projet;catégorie;période;montant'];
    for (let i = 0; i < 1000; i++) rows.push(`FIN;logiciel;2026-${String((i % 12) + 1).padStart(2, '0')};${(i % 50) + 1},50`);
    rows[10] = 'FIN;inconnue;2026-01;10';
    rows[500] = 'NOPE;logiciel;2026-01;10';
    rows[900] = 'FIN;logiciel;2026-13;10';
    const csv = rows.join('\n');
    const before = (await fin.project(org, 'FIN', admin, NOW)).totals.actual;
    const r = await fin.importActuals(org, 'reels.csv', csv, finance);
    expect(r).toMatchObject({ rows: 1000, imported: 997, alreadyImported: false });
    expect(r.rejected.map((x) => x.line)).toEqual([11, 501, 901]);
    expect(r.rejected[0]!.reason).toContain('catégorie inconnue');
    const after = (await fin.project(org, 'FIN', admin, NOW)).totals.actual;
    expect(after).toBeGreaterThan(before);
    const again = await fin.importActuals(org, 'reels.csv', csv, finance);
    expect(again).toMatchObject({ alreadyImported: true, imported: 997, batchId: r.batchId });
    expect((await fin.project(org, 'FIN', admin, NOW)).totals.actual).toBe(after);
    expect(await code(fin.importActuals(org, 'x.csv', 'FIN;logiciel;2026-01;10', director))).toBe('forbidden');
  });

  it('taux et coût du temps passé : visibles de la finance, du PMO et de l’administrateur ; temps sans taux compté à part', async () => {
    await fin.addRate(org, { subject: 'sub-ana', hourlyRate: 60, validFrom: '2026-01-01' }, finance);
    await fin.addRate(org, { subject: 'sub-ana', hourlyRate: 80, validFrom: '2026-06-01' }, finance);
    expect(await code(fin.addRate(org, { subject: 'sub-ana', roleLabel: 'x', hourlyRate: 1, validFrom: '2026-01-01' }, finance))).toBe('validation');
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    const artifacts = new ArtifactService(db, trackers, new FieldTypeRegistry());
    await trackers.createTracker(org, { projectKey: 'FIN', key: 'TSK', name: 'T', typeKey: 'task', fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }], statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }] }, admin);
    const t = (await artifacts.create(org, 'FIN', 'TSK', { title: 'x' }, admin)).key;
    const wl = new WorklogService(db, new CalendarService(db), new PpmSettingsService(db));
    await wl.add(org, 'FIN', t, { day: '2026-03-10', minutes: 120, comment: '' }, member); // 2 h à 60 €
    await wl.add(org, 'FIN', t, { day: '2026-06-10', minutes: 60, comment: '' }, member); // 1 h à 80 €
    await wl.add(org, 'FIN', t, { day: '2026-03-11', minutes: 30, comment: '' }, admin); // sans taux
    expect(await fin.timeCost(org, 'FIN', finance)).toEqual({ cost: 200, minutes: 210, unpricedMinutes: 30 });
    expect(await code(fin.timeCost(org, 'FIN', pmo))).toBe('ok'); // le PMO a les droits de la finance
    expect(await code(fin.timeCost(org, 'FIN', director))).toBe('forbidden');
  });

  it('un projet masqué au lecteur : ni budget ni réel ; le PMO restreint ne voit rien de ce projet', async () => {
    await runAs('sub-admin', () => access.set(org, 'SEC', { members: ['sub-admin'] }, admin));
    await fin.addBudget(org, { project: 'SEC', category: 'logiciel', kind: 'initial', amount: 777 }, admin).catch(() => undefined);
    await runAs('sub-admin', () => fin.addBudget(org, { project: 'SEC', category: 'logiciel', kind: 'initial', amount: 777 }, admin));
    expect(await code(runAs('sub-dir', () => fin.project(org, 'SEC', director)))).toBe('not_found');
    expect((await runAs('sub-admin', () => fin.project(org, 'SEC', admin))).totals.budget).toBeGreaterThanOrEqual(777);
    await runAs('sub-admin', () => access.remove(org, 'SEC', null, admin));
  });
});
