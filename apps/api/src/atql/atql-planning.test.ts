import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { TrackerService, type TrackerSpec } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { compile } from './compile';
import { AtqlError, parse } from './parser';
import { SearchService } from './search.service';

// T-0165 : ATQL du planning : late(), critical(), startDate (et dueDate).

const ctx = { currentUser: 'u1' };

describe('ATQL : fonctions de planning (analyse et compilation)', () => {
  it('analyse late() et critical(), sans argument, insensibles à la casse', () => {
    expect(parse('late()').where).toEqual({ type: 'late' });
    expect(parse('CRITICAL()').where).toEqual({ type: 'critical' });
    expect(parse('tracker = TSK AND NOT late()').where).toMatchObject({ type: 'and', right: { type: 'not', operand: { type: 'late' } } });
    expect(() => parse('late(1)')).toThrow(AtqlError);
    expect(() => parse('critical(NOVA)')).toThrow(AtqlError);
  });

  it('critical() est refusé sans la liste des tickets critiques, accepté avec elle (paramètre lié)', () => {
    expect(() => compile('critical()', ctx)).toThrow(/indisponible/);
    const c = compile('critical()', { ...ctx, criticalKeys: new Set(['N-1', 'N-2']) });
    expect(c.where).toContain('a.key = any($1::text[])');
    expect(c.params).toEqual([['N-1', 'N-2']]);
  });

  it('startDate compare une date AAAA-MM-JJ liée en paramètre, jamais concaténée', () => {
    const c = compile('startDate >= "2026-11-10" ORDER BY startDate', ctx);
    expect(c.params).toContain('2026-11-10');
    expect(c.where).not.toContain('2026-11-10');
    expect(c.where).toContain("f.semantic_role = 'start_date'");
    expect(() => compile('startDate = "demain"', ctx)).toThrow(/AAAA-MM-JJ/);
    expect(() => compile('startDate ~ "2026"', ctx)).toThrow(AtqlError);
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-user', 'athena-admin'] };

const spec = (project: string, key: string, withDates: boolean): TrackerSpec => ({
  projectKey: project, key, name: key, typeKey: 'task',
  fields: [
    { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
    ...(withDates ? [
      { key: 'begin', label: 'Début', type: 'date', semanticRole: 'start_date' as const },
      { key: 'end', label: 'Fin', type: 'date', semanticRole: 'due_date' as const },
    ] : []),
  ],
  statuses: [{ key: 'todo', name: 'À faire', category: 'todo' as const }, { key: 'done', name: 'Fait', category: 'done' as const }],
  transitions: [{ name: 'Terminer', from: 'todo', to: 'done' }, { name: 'Rouvrir', from: null, to: 'todo' }],
});

suite('ATQL du planning (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let search: SearchService;
  const org = crypto.randomUUID();
  const hits = async (q: string, project = 'NOVA') => (await search.search(org, project, q, 'u1', 50, 0)).hits.map((h) => h.key).sort();
  const keys: Record<string, string> = {};

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_atql_planning');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    search = new SearchService(db, async (_org, project) => (project === 'NOVA' ? [keys['crit1']!, keys['crit2']!] : []));
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'atqlp','atqlp')", [org]));
    await trackers.createProject(org, 'NOVA', 'Nova', admin);
    await trackers.createTracker(org, spec('NOVA', 'TSK', true), admin);
    await trackers.createTracker(org, spec('NOVA', 'BUG', false), admin); // sans rôle de date
    const make = async (name: string, values: Record<string, unknown>, tracker = 'TSK') => { keys[name] = (await artifacts.create(org, 'NOVA', tracker, { title: name, ...values }, admin)).key; };
    await make('past', { begin: '2020-01-06', end: '2020-01-10' });
    await make('pastDone', { begin: '2020-01-06', end: '2020-01-10' });
    await make('future', { begin: '2999-01-04', end: '2999-01-08' });
    await make('nodate', {});
    await make('crit1', { begin: '2026-11-09', end: '2026-11-10' });
    await make('crit2', { begin: '2026-11-11', end: '2026-11-12' });
    await make('bug', {}, 'BUG');
    const done = await artifacts.get(org, 'NOVA', keys['pastDone']!);
    await artifacts.transition(org, 'NOVA', keys['pastDone']!, 'Terminer', done.version, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('late() : échéance dépassée et ticket non terminé, jamais un ticket sans date ni sans rôle', async () => {
    const late = await hits('late()');
    expect(late).toContain(keys['past']);
    expect(late).not.toContain(keys['pastDone']); // terminé
    expect(late).not.toContain(keys['future']);
    expect(late).not.toContain(keys['nodate']);
    expect(late).not.toContain(keys['bug']); // tracker sans rôle d'échéance
    expect(await hits('NOT late() AND tracker = BUG')).toEqual([keys['bug']]);
  });

  it('critical() : seulement les tickets que le moteur de dates déclare critiques', async () => {
    expect(await hits('critical()')).toEqual([keys['crit1'], keys['crit2']].sort());
    expect(await hits('critical() AND startDate >= "2026-11-10"')).toEqual([keys['crit2']]);
    expect(await hits('NOT critical() AND tracker = TSK AND startDate < "2026-01-01"')).toEqual([keys['past'], keys['pastDone']].sort());
  });

  it('startDate : comparaison de dates, absence de date, tri ; un ticket sans rôle n’a jamais de date', async () => {
    expect(await hits('startDate > "2999-01-01"')).toEqual([keys['future']]);
    expect(await hits('startDate = "2026-11-09"')).toEqual([keys['crit1']]);
    expect(await hits('tracker = TSK AND startDate IS EMPTY')).toEqual([keys['nodate']]);
    expect(await hits('startDate IS NOT EMPTY AND tracker = BUG')).toEqual([]);
    const ordered = (await search.search(org, 'NOVA', 'tracker = TSK AND startDate IS NOT EMPTY ORDER BY startDate DESC', 'u1', 50, 0)).hits.map((h) => h.key);
    expect(ordered).toEqual([keys['future'], keys['crit2'], keys['crit1'], keys['past'], keys['pastDone']]);
  });

  it('dueDate se comporte comme startDate', async () => {
    expect(await hits('dueDate = "2999-01-08"')).toEqual([keys['future']]);
    expect(await hits('dueDate <= "2020-12-31" AND category != done')).toEqual([keys['past']]);
  });

  it('une requête sans critical() n’appelle pas le moteur de dates', async () => {
    let calls = 0;
    const counting = new SearchService(new Db(testDb.pool), async () => { calls++; return []; });
    await counting.search(org, 'NOVA', 'late()', 'u1', 5, 0);
    expect(calls).toBe(0);
    await counting.search(org, 'NOVA', 'critical()', 'u1', 5, 0);
    expect(calls).toBe(1);
  });

  it('la recherche d’organisation résout le chemin critique de chaque projet', async () => {
    const all = await search.searchOrganization(org, 'critical()', 'u1', {});
    expect(all.hits.map((h) => h.key).sort()).toEqual([keys['crit1'], keys['crit2']].sort());
  });
});
