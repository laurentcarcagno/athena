import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { parseCsv } from './csv';
import { ImportService } from './import.service';
import { JiraConfigSchema, parseJiraCsv, parseTuleapArtifacts, TuleapConfigSchema } from './sources';

describe('lecteur CSV', () => {
  it('gère guillemets, guillemets doublés, retours à la ligne, BOM et séparateur point-virgule', () => {
    expect(parseCsv('﻿a,b,c\r\n1,"x, y","ligne 1\nligne ""2"""\r\n\r\n3,,')).toEqual([['a', 'b', 'c'], ['1', 'x, y', 'ligne 1\nligne "2"'], ['3', '', '']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('refuse un guillemet non fermé et borne la taille', () => {
    expect(() => parseCsv('a,b\n"x,y')).toThrow(/guillemet/);
    expect(() => parseCsv('x'.repeat(21 * 1024 * 1024))).toThrow(/trop volumineux/);
    expect(() => parseCsv(Array.from({ length: 250 }, (_, i) => `c${i}`).join(',') + '\n')).toThrow(/trop de colonnes/);
  });
});

const JIRA_CSV = [
  'Issue key,Summary,Issue Type,Status,Priority,Assignee,Description,Created,Labels,Labels,Custom field (Story Points),Outward issue link (Blocks)',
  'PRJ-1,"Crash au démarrage",Bug,Open,Highest,alice,"Ligne 1\nLigne 2 ""citée""",2026-01-05T10:00:00.000Z,backend,urgent,,PRJ-2',
  'PRJ-2,Lenteur,Bug,In Progress,Low,,,2026-01-06T10:00:00.000Z,,,3,',
  'PRJ-3,Un epic,Epic,Open,Low,,,2026-01-07T10:00:00.000Z,,,,',
  'PRJ-4,Statut inconnu,Bug,Waiting,Low,,,2026-01-08T10:00:00.000Z,,,,',
  'PRJ-5,,Bug,Open,Low,,,2026-01-09T10:00:00.000Z,,,,',
  'PRJ-6,Priorité absente,Bug,Open,,,,2026-01-10T10:00:00.000Z,,,,',
].join('\n');

const jiraConfig = JiraConfigSchema.parse({
  trackerByType: { Bug: 'BUG' },
  statusMap: {},
  fieldMap: { Summary: 'title', Priority: 'severity', Assignee: 'assignee', Description: 'description' },
  valueMaps: { severity: { Highest: 'bloquante', High: 'majeure', Low: 'mineure' } },
  linkTypes: { Blocks: 'blocks' },
});
const statusMap = { Open: 'open', 'In Progress': 'in_progress' };

describe('analyse des sources', () => {
  it('lit l’export JIRA : colonnes répétées, traductions, liens, dates', () => {
    const { records, errors } = parseJiraCsv(JIRA_CSV, jiraConfig);
    expect(errors).toEqual([{ row: 4, message: expect.stringContaining('type JIRA non associé') }]);
    expect(records.map((r) => r.externalKey)).toEqual(['PRJ-1', 'PRJ-2', 'PRJ-4', 'PRJ-5', 'PRJ-6']);
    expect(records[0]).toMatchObject({
      tracker: 'BUG', status: 'Open', createdAt: '2026-01-05T10:00:00.000Z', links: [{ type: 'blocks', target: 'PRJ-2' }],
      values: { title: 'Crash au démarrage', severity: 'bloquante', assignee: 'alice', description: 'Ligne 1\nLigne 2 "citée"' },
    });
  });
  it('refuse un fichier sans colonnes obligatoires', () => {
    expect(parseJiraCsv('A,B\n1,2', jiraConfig).errors[0]!.message).toMatch(/colonnes obligatoires/);
    expect(parseJiraCsv('', jiraConfig).errors[0]!.message).toBe('fichier vide');
  });
  it('lit les artefacts de l’API REST Tuleap (listes, valeurs simples, traductions)', () => {
    const config = TuleapConfigSchema.parse({
      tracker: 'BUG', statusMap: { New: 'open' }, fieldMap: { Summary: 'title', Severity: 'severity', Component: 'tags' },
      valueMaps: { severity: { Critical: 'bloquante' } }, externalKeyField: 'tuleap_id',
    });
    const json = [{ id: 4821, status: 'New', submitted_on: '2025-12-01T08:00:00+01:00', values: [
      { label: 'Summary', value: 'Erreur 500' },
      { label: 'Severity', bind_value_objects: [{ label: 'Critical' }] },
      { label: 'Component', bind_value_objects: [{ label: 'api' }, { label: 'db' }] },
      { label: 'Ignoré', value: 'x' },
    ] }, { title: 'sans identifiant' }];
    const { records, errors } = parseTuleapArtifacts(json, config);
    expect(errors).toEqual([{ row: 2, message: 'identifiant Tuleap absent' }]);
    expect(records[0]).toMatchObject({ externalKey: '4821', status: 'New', values: { title: 'Erreur 500', severity: 'bloquante', tags: ['api', 'db'], tuleap_id: '4821' } });
    expect(parseTuleapArtifacts({ collection: [] }, config).errors[0]!.message).toMatch(/aucun artefact/);
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-admin'] };

suite('import JIRA et Tuleap (intégration)', () => {
  let testDb: TestDb;
  let importer: ImportService;
  let artifacts: ArtifactService;
  let links: LinkService;
  let db: Db;
  const org = crypto.randomUUID();
  const parsed = () => parseJiraCsv(JIRA_CSV, jiraConfig).records;

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_import');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    importer = new ImportService(db, trackers, registry);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'imp']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    await links.createLinkType(org, 'ARI', { key: 'blocks', outwardLabel: 'bloque', inwardLabel: 'bloqué par' }, admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('simule sans rien écrire et signale les écarts de correspondance', async () => {
    const report = await importer.run(org, 'ARI', 'jira', parsed(), { dryRun: true, statusMap }, admin);
    expect(report).toMatchObject({ dryRun: true, total: 5, created: 2, skipped: 0, unmappedStatuses: ['Waiting'] });
    expect(report.errors.map((e) => [e.key, e.message])).toEqual([
      ['PRJ-4', 'statut non associé : « Waiting »'],
      ['PRJ-5', 'title : obligatoire'],
      ['PRJ-6', 'severity : obligatoire'],
    ]);
    expect((await db.tx(org, (c) => c.query('select count(*)::int n from artifact'))).rows[0].n).toBe(0);
  });

  it('importe les artefacts valides avec statut, date d’origine et liens, sans bloquer sur les erreurs', async () => {
    const report = await importer.run(org, 'ARI', 'jira', parsed(), { dryRun: false, statusMap }, admin);
    expect(report).toMatchObject({ created: 2, linked: 1, skipped: 0 });
    expect(report.errors).toHaveLength(3);
    const first = await artifacts.get(org, 'ARI', 'BUG-1');
    expect(first).toMatchObject({ status: 'open', version: 1, values: { title: 'Crash au démarrage', severity: 'bloquante', description: 'Ligne 1\nLigne 2 "citée"' } });
    expect((await artifacts.get(org, 'ARI', 'BUG-2')).status).toBe('in_progress');
    const meta = (await db.tx(org, (c) => c.query("select created_by, created_at from artifact where key = 'BUG-1'"))).rows[0];
    expect(meta.created_by).toBe('import:jira');
    expect(meta.created_at.toISOString()).toBe('2026-01-05T10:00:00.000Z');
    expect(await links.list(org, 'ARI', 'BUG-1')).toMatchObject([{ label: 'bloque', other: 'BUG-2' }]);
    const events = await db.tx(org, (c) => c.query("select count(*)::int n from outbox_event where type = 'artifact.created' and payload->>'actor' = 'import:jira'"));
    expect(events.rows[0].n).toBe(2); // l'historique Git recevra l'import comme n'importe quelle création
  });

  it('est idempotent : un second import ne recrée rien', async () => {
    const report = await importer.run(org, 'ARI', 'jira', parsed(), { dryRun: false, statusMap }, admin);
    expect(report).toMatchObject({ created: 0, skipped: 2, linked: 0 });
    expect((await db.tx(org, (c) => c.query('select count(*)::int n from artifact'))).rows[0].n).toBe(2);
  });

  it('importe un lot ultérieur et résout les liens vers des artefacts déjà importés', async () => {
    const csv = [
      'Issue key,Summary,Issue Type,Status,Priority,Outward issue link (Blocks)',
      'PRJ-9,Nouveau bug,Bug,Open,High,PRJ-1',
      'PRJ-10,Lien vers un inconnu,Bug,Open,High,PRJ-404',
    ].join('\n');
    const { records } = parseJiraCsv(csv, jiraConfig);
    const report = await importer.run(org, 'ARI', 'jira', records, { dryRun: false, statusMap }, admin);
    expect(report).toMatchObject({ created: 2, linked: 1 });
    expect(report.warnings.join(' ')).toMatch(/PRJ-10 → PRJ-404 ignoré/);
    expect(await links.list(org, 'ARI', 'BUG-3')).toMatchObject([{ other: 'BUG-1', direction: 'outward' }]);
  });

  it('importe depuis Tuleap avec la clé d’origine conservée dans un champ', async () => {
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await trackers.addField(org, 'ARI', 'BUG', { key: 'tuleap_id', label: 'Identifiant Tuleap', type: 'text' }, admin);
    const config = TuleapConfigSchema.parse({ tracker: 'BUG', statusMap: {}, fieldMap: { Summary: 'title', Severity: 'severity' }, valueMaps: { severity: { Critical: 'bloquante' } }, externalKeyField: 'tuleap_id' });
    const { records } = parseTuleapArtifacts([{ id: 4821, status: 'New', values: [{ label: 'Summary', value: 'Erreur 500' }, { label: 'Severity', bind_value_objects: [{ label: 'Critical' }] }] }], config);
    const report = await importer.run(org, 'ARI', 'tuleap', records, { dryRun: false, statusMap: { New: 'open' } }, admin);
    expect(report.created).toBe(1);
    expect((await artifacts.get(org, 'ARI', 'BUG-5')).values).toMatchObject({ title: 'Erreur 500', tuleap_id: '4821' });
  });

  it('refuse un projet inconnu', async () => {
    await expect(importer.run(org, 'NOPE', 'jira', [], { dryRun: true, statusMap }, admin)).rejects.toMatchObject({ code: 'not_found' });
  });
});
