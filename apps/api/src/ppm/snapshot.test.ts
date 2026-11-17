import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../core/access.service';
import { Db, type Actor } from '../core/db';
import { runAs } from '../core/request-context';
import { TrackerService } from '../core/tracker.service';
import { FieldTypeRegistry } from '../core/field-types';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { HealthService } from './health.service';
import { LifecycleService } from './lifecycle.service';
import { PortfolioService } from './portfolio.service';
import { ReviewService } from './review.service';
import { SnapshotService, compareLines, periodOf, totalsOf, type SnapshotMetrics } from './snapshot.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const pmo: Actor = { id: 'sub-pmo', roles: ['athena-team-member', 'athena-pmo'] };
const director: Actor = { id: 'sub-dir', roles: ['athena-director', 'athena-team-member'] };
const day = (iso: string) => new Date(`${iso}T10:00:00Z`);

const line = (over: Partial<SnapshotMetrics>): SnapshotMetrics => ({
  key: 'A', name: 'A', lifecycle: 'in_progress', health: 'ok', computedHealth: 'ok', overridden: false, declaredHealth: null, gap: false, phase: null, plannedEnd: null, nextReview: null,
  progress: 50, open: 2, late: 0, blocked: 0, maxRisk: null, ...over,
});

describe('instantanés : calculs purs', () => {
  it('période ISO d’une semaine et d’un mois', () => {
    expect(periodOf('weekly', day('2026-11-17'))).toBe('2026-W47');
    expect(periodOf('weekly', day('2026-01-01'))).toBe('2026-W01');
    expect(periodOf('weekly', day('2027-01-01'))).toBe('2026-W53');
    expect(periodOf('monthly', day('2026-11-17'))).toBe('2026-11');
  });
  it('totaux recalculés sur les lignes données ; comparaison : ajouté, retiré, changé, inchangé', () => {
    expect(totalsOf([line({ key: 'A', late: 2 }), line({ key: 'B', health: 'critical', late: 3, progress: 10 })])).toMatchObject({ projects: 2, byHealth: { ok: 1, attention: 0, critical: 1 }, late: 5, progress: 30 });
    const changes = compareLines([line({ key: 'A' }), line({ key: 'B' }), line({ key: 'C' })], [line({ key: 'A' }), line({ key: 'B', health: 'critical' }), line({ key: 'D' })]);
    expect(Object.fromEntries(changes.map((c) => [c.key, c.change]))).toEqual({ A: 'same', B: 'changed', C: 'removed', D: 'added' });
    expect(changes.find((c) => c.key === 'B')!.health).toEqual({ from: 'ok', to: 'critical' });
  });
});

suite('instantanés de portefeuille (intégration)', () => {
  let testDb: TestDb;
  let snaps: SnapshotService;
  let reviews: ReviewService;
  let portfolios: PortfolioService;
  let access: AccessService;
  let db: Db;
  const org = crypto.randomUUID();
  const kpis = {
    async kpis(_o: string, project: string) {
      const bad = project === 'SB';
      return {
        project: { key: project, name: `Projet ${project}`, createdAt: '2026-01-01T00:00:00.000Z', members: 2, managers: ['Chef'] },
        progress: { total: 10, done: bad ? 2 : 8, inProgress: 1, todo: 1, percent: bad ? 20 : 80 },
        late: bad ? 4 : 0, blocked: bad ? 3 : 0, dueSoon: 1, open: bad ? 8 : 2, workload: [],
        velocity: { average: 0, forecast: 0, sprints: 0 }, sprint: null, health: { state: 'ok' as const, reasons: [] },
      };
    },
  };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_snapshot');
    db = new Db(testDb.pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    portfolios = new PortfolioService(db, kpis);
    snaps = new SnapshotService(db, new HealthService(db, portfolios, new LifecycleService(db)));
    access = new AccessService(db);
    reviews = new ReviewService(db, snaps);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'sn','sn')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-admin','admin.dev','Admin Dev','a@example.test'), ($1,'sub-pmo','pmo','Pat PMO','p@example.test')", [org]);
    });
    for (const k of ['SA', 'SB']) await trackers.createProject(org, k, `Projet ${k}`, admin);
    await portfolios.create(org, { key: 'snap', name: 'Snap' }, admin);
    for (const k of ['SA', 'SB']) await portfolios.setProject(org, 'snap', k, {}, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('un instantané hebdomadaire est unique par période : le rejouer renvoie l’existant', async () => {
    const first = await snaps.take(org, 'snap', { kind: 'weekly', at: day('2026-11-16') }, admin);
    expect(first).toMatchObject({ created: true, kind: 'weekly', period: '2026-W47', projects: 2 });
    const again = await snaps.take(org, 'snap', { kind: 'weekly', at: day('2026-11-18') }, admin);
    expect(again).toMatchObject({ created: false, id: first.id });
    expect((await snaps.list(org, 'snap')).length).toBe(1);
    const next = await snaps.take(org, 'snap', { kind: 'weekly', at: day('2026-11-23') }, admin);
    expect(next.created).toBe(true);
  });

  it('la lecture fige des valeurs, recalcule les totaux et masque les projets que le lecteur ne voit pas', async () => {
    const manual = await snaps.take(org, 'snap', { kind: 'manual', label: 'Avant la revue', at: day('2026-11-24') }, pmo);
    expect(manual).toMatchObject({ created: true, label: 'Avant la revue', takenBy: 'Pat PMO' });
    const full = await snaps.get(org, 'snap', manual.id);
    expect(full.lines.map((l) => l.key)).toEqual(['SA', 'SB']);
    expect(full.totals).toMatchObject({ projects: 2, late: 4, blocked: 3 });
    await runAs('sub-admin', () => access.set(org, 'SB', { members: ['sub-admin'] }, admin));
    const seen = await runAs('sub-dir', () => snaps.get(org, 'snap', manual.id));
    expect(seen.lines.map((l) => l.key)).toEqual(['SA']);
    expect(seen.totals).toMatchObject({ projects: 1, late: 0, blocked: 0 });
    expect(seen.projects).toBe(1);
    expect(JSON.stringify(seen)).not.toContain('SB');
    expect((await runAs('sub-dir', () => snaps.list(org, 'snap'))).every((s) => s.projects === 1)).toBe(true);
    await runAs('sub-admin', () => access.remove(org, 'SB', null, admin));
    void director;
  });

  it('comparaison entre deux instantanés et dernier instantané avant une date', async () => {
    await db.tx(org, (c) => c.query("update portfolio_project set health_override = 'critical' where project_id = (select id from project where key = 'SA')"));
    const later = await snaps.take(org, 'snap', { kind: 'manual', label: 'Après', at: day('2026-12-01') }, admin);
    const all = await snaps.list(org, 'snap');
    const earlier = all.find((s) => s.label === 'Avant la revue')!;
    const cmp = await snaps.compare(org, 'snap', later.id, earlier.id); // l'ordre des arguments est indifférent
    expect(cmp.from.id).toBe(earlier.id);
    expect(cmp.changes.find((c) => c.key === 'SA')).toMatchObject({ change: 'changed', health: { from: 'ok', to: 'critical' } });
    expect(cmp.changes.find((c) => c.key === 'SB')!.change).toBe('same');
    await expect(snaps.compare(org, 'snap', later.id, later.id)).rejects.toMatchObject({ code: 'validation' });
    expect((await snaps.previous(org, 'snap', day('2026-11-30')))?.id).toBe(earlier.id);
    expect(await snaps.previous(org, 'snap', day('2026-01-01'))).toBeNull();
    const series = await snaps.series(org, 'snap', 6);
    expect(series['SB']!.length).toBe(4);
  });

  it('purge : périodiques et manuels après la rétention, revues jamais par défaut, instantané d’une revue conservé', async () => {
    const review = await snaps.take(org, 'snap', { kind: 'review', label: 'Revue T4', at: day('2026-11-25') }, admin);
    await db.tx(org, (c) => c.query("insert into portfolio_review (organization_id, portfolio_id, held_on, snapshot_id, created_by) select $1, id, '2026-11-25', $2, 'x' from portfolio where key = 'snap'", [org, review.id]));
    const old = await snaps.take(org, 'snap', { kind: 'manual', label: 'Ancien', at: day('2025-01-06') }, admin);
    expect(await snaps.purge(org, { weeks: 26, reviewMonths: null }, admin, day('2026-12-02'))).toBeGreaterThanOrEqual(1);
    const left = (await snaps.list(org, 'snap')).map((s) => s.id);
    expect(left).not.toContain(old.id);
    expect(left).toContain(review.id); // revue : pas de limite par défaut ; et une revue de portefeuille s'y appuie
    expect(await snaps.purge(org, { weeks: 26, reviewMonths: 1 }, admin, day('2027-03-01'))).toBeGreaterThanOrEqual(0);
    expect((await snaps.list(org, 'snap')).map((s) => s.id)).toContain(review.id); // protégé par la revue qui le référence
  });

  it('B33 : le dossier de revue reprend l’instantané figé, pas les données du jour ; une revue tenue n’est plus modifiable', async () => {
    const r = await reviews.create(org, 'snap', { heldOn: '2026-12-10', summary: 'Ordre du jour' }, pmo);
    expect(r).toMatchObject({ state: 'draft', heldOn: '2026-12-10', summary: 'Ordre du jour' });
    const before = await reviews.dossier(org, 'snap', r.id);
    const sb = before.snapshot.lines.find((l) => l.key === 'SB')!;
    expect(sb).toMatchObject({ late: 4, blocked: 3 });
    // le projet change après la revue : le dossier ne bouge pas
    await db.tx(org, (c) => c.query("update portfolio_project set health_override = 'ok' where project_id = (select id from project where key = 'SB')"));
    const after = await reviews.dossier(org, 'snap', r.id);
    expect(after.snapshot.lines.find((l) => l.key === 'SB')!.health).toBe(sb.health);
    expect(after.snapshot.kind).toBe('review');
    expect((await reviews.list(org, 'snap')).map((x) => x.id)).toContain(r.id);
    await reviews.update(org, 'snap', r.id, { summary: 'Compte rendu', state: 'held' }, pmo);
    await expect(reviews.update(org, 'snap', r.id, { summary: 'Retouche' }, pmo)).rejects.toMatchObject({ code: 'conflict' });
    await runAs('sub-admin', () => access.set(org, 'SB', { members: ['sub-admin'] }, admin));
    const hidden = await runAs('sub-dir', () => reviews.dossier(org, 'snap', r.id));
    expect(JSON.stringify(hidden)).not.toContain('SB'); // le dossier relit les lignes visibles du lecteur
    await runAs('sub-admin', () => access.remove(org, 'SB', null, admin));
  });
});
