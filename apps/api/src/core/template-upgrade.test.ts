import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { NormativeSchema } from './normative-template';
import { TemplateService, type TemplateTracker } from './template.service';
import { TemplateUpgradeService } from './template-upgrade.service';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-user', 'athena-admin'] };

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  const error = await promise.then(() => null, (e: unknown) => e);
  if (!(error instanceof DomainError)) throw new Error(`erreur inattendue : ${(error as Error)?.message}`);
  return error;
}

const req = (extra: Partial<TemplateTracker> = {}): TemplateTracker => ({
  key: 'REQ', name: 'Exigences',
  fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'text', label: 'Énoncé', type: 'richtext' }],
  statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo' }, { key: 'review', name: 'En revue', category: 'in_progress' }, { key: 'done', name: 'Vérifiée', category: 'done' }],
  transitions: [{ name: 'Soumettre', from: 'draft', to: 'review' }, { name: 'Vérifier', from: 'review', to: 'done' }],
  ...extra,
});
const rule = { key: 'verified', name: 'Vérifiées', fromTracker: 'REQ', linkType: 'verifies', direction: 'in' };

suite('montée de version d’un projet (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let templates: TemplateService;
  let upgrades: TemplateUpgradeService;
  let trackers: TrackerService;
  let artifacts: ArtifactService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_tpl_upgrade');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    templates = new TemplateService(db, trackers);
    upgrades = new TemplateUpgradeService(db, trackers, templates);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'upg']));
    await templates.create(org, { key: 'norme', name: 'Norme', trackers: [req()], normative: NormativeSchema.parse({ reviews: [{ key: 'pdr', name: 'PDR' }, { key: 'cdr', name: 'CDR' }], phases: [{ key: 'design', name: 'Conception', review: 'pdr' }, { key: 'build', name: 'Réalisation', review: 'cdr' }], rules: [rule] }) }, admin);
    await templates.publish(org, 'norme', undefined, admin); // 1.0
    await templates.createProject(org, 'UPG', 'Montée', 'norme', admin);
    // le projet ajoute son propre champ et son propre état : c'est la dérive
    await trackers.addField(org, 'UPG', 'REQ', { key: 'owner', label: 'Propriétaire', type: 'text' }, admin);
    await trackers.addStatus(org, 'UPG', 'REQ', { key: 'frozen', name: 'Gelée', category: 'in_progress' }, admin);
    // 1.1 : champ, état, renommage, état supprimé, nouveau tracker, nouvelle règle
    await templates.update(org, 'norme', {
      name: 'Norme',
      trackers: [req({
        fields: [...req().fields, { key: 'asil', label: 'Niveau', type: 'text' }, { key: 'text', label: 'Énoncé', type: 'richtext' }].filter((f, i, a) => a.findIndex((x) => x.key === f.key) === i).map((f) => (f.key === 'text' ? { ...f, label: 'Texte de l’exigence' } : f)),
        statuses: [{ key: 'draft', name: 'Rédaction', category: 'todo' }, { key: 'approved', name: 'Approuvée', category: 'in_progress' }, { key: 'done', name: 'Vérifiée', category: 'done' }],
        transitions: [{ name: 'Approuver', from: 'draft', to: 'approved' }, { name: 'Vérifier', from: 'approved', to: 'done' }],
      }), { key: 'NCR', name: 'NCR', fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }], statuses: [{ key: 'open', name: 'Ouverte', category: 'todo' }, { key: 'closed', name: 'Close', category: 'done' }], transitions: [{ name: 'Clore', from: 'open', to: 'closed' }] }],
      normative: NormativeSchema.parse({ reviews: [{ key: 'pdr', name: 'PDR' }], phases: [{ key: 'design', name: 'Conception', review: 'pdr' }], rules: [rule, { key: 'ncr-closed', name: 'NCR closes', fromTracker: 'NCR', linkType: 'refines' }] }),
    }, admin);
    await templates.publish(org, 'norme', undefined, admin); // 1.1
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  const state = () => db.tx(org, async (c) => ({
    versions: (await c.query("select t.key, t.schema_version from tracker t join project p on p.id = t.project_id where p.key = 'UPG' order by t.key")).rows,
    fields: Number((await c.query("select count(*) n from field_definition f join tracker t on t.id = f.tracker_id join project p on p.id = t.project_id where p.key = 'UPG'")).rows[0].n),
    project: (await c.query("select template_version, current_phase from project where key = 'UPG'")).rows[0],
    events: Number((await c.query("select count(*) n from outbox_event where type = 'tracker.updated'")).rows[0].n),
  }));

  it('calcule la dérive : ce que le projet a ajouté à la version 1.0', async () => {
    const s = await upgrades.status(org, 'UPG');
    expect(s).toMatchObject({ templateKey: 'norme', version: '1.0', latest: '1.1', upgradable: true, phase: 'design', versions: ['1.0', '1.1'] });
    expect(s.phases.map((p) => p.key)).toEqual(['design', 'build']);
    expect(s.drift).toEqual({ trackersAdded: [], trackers: [{ key: 'REQ', name: 'Exigences', fieldsAdded: ['owner'], statusesAdded: ['frozen'], transitionsAdded: [] }], total: 2 });
  });

  it('l’aperçu ne modifie rien et renvoie le rapport d’impact', async () => {
    const item = await artifacts.create(org, 'UPG', 'REQ', { title: 'Exigence A' }, admin);
    const before = await state();
    const report = await upgrades.preview(org, 'UPG');
    expect(await state()).toEqual(before);
    expect(report).toMatchObject({ from: '1.0', to: '1.1', itemsConcerned: 1, blockers: [] });
    const reqReport = report.trackers.find((t) => t.key === 'REQ')!;
    expect(reqReport).toMatchObject({ action: 'update', items: 1 });
    expect(reqReport.fieldsAdded.map((f) => f.key)).toEqual(['asil']);
    expect(reqReport.fieldsRelabeled).toEqual([{ key: 'text', from: 'Énoncé', to: 'Texte de l’exigence' }]);
    expect(reqReport.statusesAdded.map((s) => s.key)).toEqual(['approved']);
    expect(reqReport.statusesRenamed).toEqual([{ key: 'draft', from: 'Brouillon', to: 'Rédaction' }]);
    expect(reqReport.statusesRemoved).toEqual([{ key: 'review', name: 'En revue', items: 0 }]);
    expect(reqReport.transitionsAdded).toEqual(['Approuver']);
    expect(report.trackers.find((t) => t.key === 'NCR')).toMatchObject({ action: 'create' });
    expect(report.rules).toMatchObject({ added: ['ncr-closed'], updated: [], retired: [] });
    expect(report.phases).toMatchObject({ added: [], removed: ['build'], current: 'design', nextCurrent: 'design' });
    expect(item.key).toBe('UPG-REQ-0001');
  });

  it('bloque la montée si un état supprimé porte des items, avec la liste', async () => {
    await db.tx(org, (c) => c.query("update artifact set status_id = (select id from status where tracker_id = artifact.tracker_id and key = 'review')"));
    const report = await upgrades.preview(org, 'UPG');
    expect(report.blockers).toEqual(['REQ : l’état « En revue » (review) est supprimé par le gabarit et porte 1 ticket(s) ; déplacez-les avant la montée']);
    const before = await state();
    const error = await failure(upgrades.apply(org, 'UPG', undefined, admin));
    expect(error).toMatchObject({ code: 'conflict', details: report.blockers });
    expect(await state()).toEqual(before);
  });

  it('applique la montée par les évolutions de tracker : schema_version, historique, règles, version du projet', async () => {
    await db.tx(org, (c) => c.query("update artifact set status_id = (select id from status where tracker_id = artifact.tracker_id and key = 'draft')"));
    const before = await state();
    const report = await upgrades.apply(org, 'UPG', undefined, admin);
    expect(report.to).toBe('1.1');
    const after = await state();
    expect(after.project).toEqual({ template_version: '1.1', current_phase: 'design' });
    const reqVersion = (rows: Array<{ key: string; schema_version: number }>) => rows.find((r) => r.key === 'REQ')!.schema_version;
    expect(reqVersion(after.versions)).toBeGreaterThan(reqVersion(before.versions));
    expect(after.versions.map((r: { key: string }) => r.key)).toEqual(['NCR', 'REQ']);
    expect(after.events).toBeGreaterThan(before.events); // un événement tracker.updated par évolution : un commit de tracker.yaml chacun
    const def = await db.tx(org, (c) => trackers.getDefinition(c, 'UPG', 'REQ'));
    expect(def.fields.map((f) => f.key)).toEqual(['title', 'text', 'owner', 'asil']);
    expect(def.fields.find((f) => f.key === 'text')!.label).toBe('Texte de l’exigence');
    expect(def.statuses.map((s) => [s.key, s.name])).toEqual([['draft', 'Rédaction'], ['done', 'Vérifiée'], ['frozen', 'Gelée'], ['approved', 'Approuvée']]); // « En revue » supprimé, « Gelée » (propre au projet) conservé
    const rules = await db.tx(org, async (c) => (await c.query("select r.key from coverage_rule r join project p on p.id = r.project_id where p.key = 'UPG' order by r.key")).rows.map((r) => r.key));
    expect(rules).toEqual(['ncr-closed', 'verified']);
    // le champ et l'état propres au projet survivent à la montée (dérive conservée)
    expect((await upgrades.status(org, 'UPG')).drift.trackers[0]).toMatchObject({ fieldsAdded: ['owner'], statusesAdded: ['frozen'] });
  });

  it('refuse une montée vers une version non postérieure ou un projet sans gabarit', async () => {
    expect((await failure(upgrades.preview(org, 'UPG'))).details[0]).toMatch(/n’est pas postérieure/);
    await trackers.createProject(org, 'FREE', 'Libre', admin);
    expect((await failure(upgrades.preview(org, 'FREE'))).details[0]).toMatch(/n’est pas rattaché/);
    expect(await upgrades.status(org, 'FREE')).toMatchObject({ templateKey: null, upgradable: false });
  });
});
