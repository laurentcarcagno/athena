import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { NormativeSchema, type Normative } from './normative-template';
import { TemplateService, TemplateTrackerSchema, type TemplateTracker } from './template.service';
import { TrackerService } from './tracker.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message}:${error.details.join(" | ")}` : `autre:${(error as Error)?.message}`;
}

export const tracker = (key: string, extra: Partial<TemplateTracker> = {}): TemplateTracker => TemplateTrackerSchema.parse({
  key, name: `Tracker ${key}`,
  fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }],
  statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'closed', name: 'Clos', category: 'done' }],
  transitions: [{ name: 'Clore', from: 'open', to: 'closed' }],
  ...extra,
});

export const normative = (extra: Record<string, unknown> = {}): Normative => NormativeSchema.parse({
  criticality: { label: 'Catégorie', categories: [{ key: 'A', name: 'A' }, { key: 'B', name: 'B' }] },
  reviews: [{ key: 'pdr', name: 'PDR' }],
  deliverables: [{ key: 'sdd', name: 'SDD' }],
  phases: [{ key: 'design', name: 'Conception', review: 'pdr', deliverables: ['sdd'] }],
  rules: [{ key: 'req-verified', name: 'Exigences vérifiées', fromTracker: 'REQ', linkType: 'verifies', direction: 'in' }],
  ...extra,
});

suite('gabarits normatifs versionnés (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let templates: TemplateService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_tpl_versions');
    db = new Db(testDb.pool);
    templates = new TemplateService(db, new TrackerService(db, new FieldTypeRegistry()));
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'tplv']));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  const projectRow = (key: string) => db.tx(org, async (c) => (await c.query('select template_key, template_version, criticality, current_phase from project where key = $1', [key])).rows[0]);

  it('refuse un gabarit incohérent à l’enregistrement (phase sans revue, livrable inconnu)', async () => {
    const bad = normative({ phases: [{ key: 'design', name: 'Conception', review: 'cdr', deliverables: ['ghost'] }] });
    const message = await code(templates.create(org, { key: 'incoherent', name: 'X', trackers: [tracker('REQ')], normative: bad }, admin));
    expect(message).toMatch(/^validation/);
    expect(message).toMatch(/revue inconnue ou absente \(cdr\)/);
    expect(message).toMatch(/livrable inconnu ghost/);
    expect((await templates.list(org)).some((t) => t.key === 'incoherent')).toBe(false);
  });

  it('garde valides les gabarits historiques (aucun champ normatif, aucune version)', async () => {
    const view = (await templates.list(org)).find((t) => t.key === 'qualite')!;
    expect(view).toMatchObject({ version: null, status: 'draft', versions: [], parent: null });
    expect(view.normative.phases).toEqual([]);
    await templates.createProject(org, 'LEG', 'Legacy', 'qualite', admin);
    expect(await projectRow('LEG')).toMatchObject({ template_key: 'qualite', template_version: null, criticality: null, current_phase: null });
  });

  it('migre les gabarits existants : une ligne antérieure à la 037 reste lisible', async () => {
    await db.tx(org, (c) => c.query("insert into project_template (organization_id, key, name, description, trackers, created_by) values ($1,'ancien','Ancien','', '[]', 'x')", [org]));
    expect((await templates.list(org)).find((t) => t.key === 'ancien')).toMatchObject({ builtin: false, version: null, status: 'draft', trackers: [] });
  });

  it('publie une version immuable et la numérote 1.0 puis 1.1', async () => {
    await templates.create(org, { key: 'norme', name: 'Norme', trackers: [tracker('REQ')], normative: normative() }, admin);
    expect((await templates.publish(org, 'norme', undefined, admin)).version).toBe('1.0');
    expect((await templates.list(org)).find((t) => t.key === 'norme')).toMatchObject({ version: '1.0', status: 'published', versions: ['1.0'] });
    expect(await code(templates.publish(org, 'norme', '1.0', admin))).toMatch(/^conflict/);
    expect(await code(templates.publish(org, 'norme', 'abc', admin))).toMatch(/^validation/);
    expect((await templates.versions(org, 'norme')).map((v) => v.version)).toEqual(['1.0']);
  });

  it('ne modifie jamais une version publiée : le brouillon change, l’instantané non', async () => {
    const before = await templates.snapshot(org, 'norme', '1.0');
    await templates.update(org, 'norme', { name: 'Norme v2', trackers: [tracker('REQ'), tracker('TST')], normative: normative() }, admin);
    expect((await templates.list(org)).find((t) => t.key === 'norme')).toMatchObject({ status: 'draft', version: '1.0', name: 'Norme v2' });
    expect(await templates.snapshot(org, 'norme', '1.0')).toEqual(before);
    expect(before.trackers.map((t) => t.key)).toEqual(['REQ']);
    expect(await templates.publish(org, 'norme', undefined, admin)).toMatchObject({ version: '1.1', name: 'Norme v2' });
    expect((await templates.snapshot(org, 'norme', '1.0')).name).toBe('Norme');
    // la base elle-même refuse de modifier ou de supprimer un instantané
    const forbidden = await db.tx(org, (c) => c.query("update project_template_version set version = '9.9' where template_key = 'norme'")).then(() => 'permis', (e: Error) => e.message);
    expect(forbidden).toMatch(/permission denied/);
    const deletion = await db.tx(org, (c) => c.query("delete from project_template_version where template_key = 'norme'")).then(() => 'permis', (e: Error) => e.message);
    expect(deletion).toMatch(/permission denied/);
  });

  it('crée un projet rattaché à la version choisie (dernière par défaut), avec sa criticité, sa phase et ses règles', async () => {
    const latest = await templates.createProject(org, 'NR2', 'Dernière', 'norme', admin, { criticality: 'B' });
    expect(latest).toMatchObject({ templateVersion: '1.1', trackers: ['REQ', 'TST'] });
    expect(await projectRow('NR2')).toMatchObject({ template_key: 'norme', template_version: '1.1', criticality: 'B', current_phase: 'design' });
    const old = await templates.createProject(org, 'NR1', 'Ancienne', 'norme', admin, { version: '1.0' });
    expect(old).toMatchObject({ templateVersion: '1.0', trackers: ['REQ'] });
    const rules = await db.tx(org, async (c) => (await c.query('select r.key, r.from_tracker_key from coverage_rule r join project p on p.id = r.project_id where p.key = $1', ['NR1'])).rows);
    expect(rules).toEqual([{ key: 'req-verified', from_tracker_key: 'REQ' }]);
    // un brouillon modifié après publication n'affecte pas les projets suivants tant qu'il n'est pas publié
    await templates.update(org, 'norme', { name: 'Brouillon', trackers: [], normative: normative({ rules: [], phases: [] }) }, admin);
    expect(await templates.createProject(org, 'NR3', 'Troisième', 'norme', admin)).toMatchObject({ templateVersion: '1.1', trackers: ['REQ', 'TST'] });
  });

  it('refuse une version ou une criticité inconnue sans rien créer', async () => {
    expect(await code(templates.createProject(org, 'NR4', 'Quatre', 'norme', admin, { version: '7.0' }))).toMatch(/^not_found/);
    expect(await code(templates.createProject(org, 'NR4', 'Quatre', 'norme', admin, { criticality: 'Z' }))).toMatch(/^validation/);
    expect((await db.tx(org, (c) => c.query("select 1 from project where key = 'NR4'"))).rowCount).toBe(0);
  });

  it('exporte et importe un gabarit en YAML, à l’identique', async () => {
    await templates.update(org, 'norme', { name: 'Norme', trackers: [tracker('REQ')], normative: normative() }, admin);
    const text = await templates.exportYaml(org, 'norme');
    await templates.remove(org, 'norme', admin);
    expect(await templates.importYaml(org, text, admin)).toEqual({ key: 'norme', created: true });
    expect(await templates.exportYaml(org, 'norme')).toBe(text);
    expect(await templates.importYaml(org, text, admin)).toEqual({ key: 'norme', created: false });
    expect(await code(templates.importYaml(org, 'athenaTemplate: 1\nkey: x1\nname: X\nnormative:\n  phases:\n    - key: p\n      name: P\n      review: absente\n', admin))).toMatch(/^validation/);
    expect(await code(templates.importYaml(org, 'pas du yaml: [', admin))).toMatch(/^validation/);
  });

  it('dérive d’un gabarit publié : fusion, version du parent épinglée, retrait obligatoire refusé', async () => {
    await templates.create(org, { key: 'socle', name: 'Socle', trackers: [tracker('REQ')], normative: normative({ mandatory: ['tracker:REQ', 'field:REQ.title', 'review:pdr', 'phase:design'] }) }, admin);
    expect(await code(templates.create(org, { key: 'fils0', name: 'Fils', trackers: [], parent: { key: 'socle' } }, admin))).toMatch(/pas de version publiée/);
    await templates.publish(org, 'socle', undefined, admin);
    await templates.create(org, { key: 'fils', name: 'Fils', trackers: [tracker('NCR')], normative: NormativeSchema.parse({ reviews: [{ key: 'cdr', name: 'CDR' }], phases: [{ key: 'build', name: 'Réalisation', review: 'cdr' }] }), parent: { key: 'socle' } }, admin);
    const resolved = await templates.resolve(org, 'fils');
    expect(resolved.trackers.map((t) => t.key)).toEqual(['REQ', 'NCR']);
    expect(resolved.normative.phases.map((p) => p.key)).toEqual(['design', 'build']);
    expect(resolved.parent).toEqual({ key: 'socle', version: '1.0' });
    // un retrait ou un renommage obligatoire est refusé avec la liste
    const removal = await code(templates.update(org, 'fils', { name: 'Fils', trackers: [tracker('NCR')], normative: NormativeSchema.parse({ remove: ['tracker:REQ', 'phase:design'] }) }, admin));
    expect(removal).toMatch(/retrait interdit : tracker:REQ/);
    expect(removal).toMatch(/retrait interdit : phase:design/);
    const renamed = await code(templates.update(org, 'fils', { name: 'Fils', trackers: [tracker('REQ', { name: 'Autre nom' })] }, admin));
    expect(renamed).toMatch(/renommage interdit : tracker:REQ/);
    // la publication fige le gabarit résolu et la version du parent
    const snap = await templates.publish(org, 'fils', undefined, admin);
    expect(snap).toMatchObject({ version: '1.0', parent: { key: 'socle', version: '1.0' } });
    expect(snap.trackers.map((t) => t.key)).toEqual(['REQ', 'NCR']);
    // une nouvelle version du parent n'altère pas la version déjà publiée du dérivé
    await templates.update(org, 'socle', { name: 'Socle', trackers: [tracker('REQ'), tracker('ADD')], normative: normative({ mandatory: ['tracker:REQ'] }) }, admin);
    await templates.publish(org, 'socle', undefined, admin);
    expect((await templates.snapshot(org, 'fils', '1.0')).trackers.map((t) => t.key)).toEqual(['REQ', 'NCR']);
    expect((await templates.createProject(org, 'FIL', 'Fils', 'fils', admin, { criticality: 'A' })).trackers).toEqual(['REQ', 'NCR']);
  });

  it('refuse un cycle d’héritage et une chaîne de plus de 5 niveaux', async () => {
    await templates.create(org, { key: 'c1', name: 'C1', trackers: [] }, admin);
    await templates.publish(org, 'c1', undefined, admin);
    await templates.create(org, { key: 'c2', name: 'C2', trackers: [], parent: { key: 'c1' } }, admin);
    await templates.publish(org, 'c2', undefined, admin);
    expect(await code(templates.update(org, 'c1', { name: 'C1', trackers: [], parent: { key: 'c2' } }, admin))).toMatch(/cycle d’héritage : c1 → c2 → c1/);
    expect(await code(templates.update(org, 'c1', { name: 'C1', trackers: [], parent: { key: 'c1' } }, admin))).toMatch(/cycle d’héritage/);
    for (const [k, parent] of [['c3', 'c2'], ['c4', 'c3'], ['c5', 'c4']] as const) {
      await templates.create(org, { key: k, name: k, trackers: [], parent: { key: parent } }, admin);
      await templates.publish(org, k, undefined, admin);
    }
    expect(await code(templates.create(org, { key: 'c6', name: 'C6', trackers: [], parent: { key: 'c5' } }, admin))).toMatch(/héritage trop profond : 6 niveaux/);
  });
});
