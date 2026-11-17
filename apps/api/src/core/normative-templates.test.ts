import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { builtinLinkTypes } from './link-types';
import { CriterionSchema, NormativeSchema, elementPaths, normativeProblems } from './normative-template';
import { TemplateService } from './template.service';
import { TemplateUpgradeService } from './template-upgrade.service';
import { BUILTIN_NORMATIVE, builtinNormative } from './templates/index';
import { builtinTrackerTypes } from './tracker-types';
import { TrackerService } from './tracker.service';

const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const pmActor: Actor = { id: 'sub-pm', roles: ['athena-team-member', 'athena-pm'] };
describe('critère de gate filtré sur deux champs (B29)', () => {
  const base = { kind: 'tracker_status' as const, tracker: 'RID', statuses: ['closed'] };
  it('accepte where seul (rétrocompatible) ou where et and ; refuse and sans where', () => {
    expect(CriterionSchema.safeParse({ ...base, where: { field: 'review', value: 'pdr' } }).success).toBe(true);
    expect(CriterionSchema.safeParse({ ...base, where: { field: 'review', value: 'pdr' }, and: { field: 'originator', value: 'ESA' } }).success).toBe(true);
    expect(CriterionSchema.safeParse({ ...base, and: { field: 'originator', value: 'ESA' } }).success).toBe(false);
    expect(CriterionSchema.safeParse({ kind: 'manual', label: 'Revue tenue' }).success).toBe(true);
  });
});

const suite = pgUp ? describe : describe.skip;
const fail = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code}:${e.details.join(' | ') || e.message}` : 'ok'; };

describe('gabarits livrés : validité du schéma', () => {
  for (const b of BUILTIN_NORMATIVE) {
    for (const v of b.versions) {
      it(`${b.key} ${v.version} est cohérent, complet et sans valeur de seuil imposée`, () => {
        expect(NormativeSchema.safeParse(v.normative).success).toBe(true);
        expect(normativeProblems(v.trackers, v.normative)).toEqual([]);
        const paths = elementPaths(v.trackers, v.normative);
        expect(v.normative.mandatory.filter((m) => !paths.has(m))).toEqual([]); // tout élément obligatoire existe
        const linkTypes = new Set(builtinLinkTypes().map((l) => l.key));
        expect(v.normative.rules.filter((r) => !linkTypes.has(r.linkType))).toEqual([]);
        const types = new Set(builtinTrackerTypes().map((t) => t.key));
        expect(v.trackers.filter((t) => t.typeKey && !types.has(t.typeKey)).map((t) => t.key)).toEqual([]);
        for (const t of v.trackers) expect(t.transitions.every((x) => t.statuses.some((s) => s.key === x.to) && (x.from === null || t.statuses.some((s) => s.key === x.from))), t.key).toBe(true);
        // seuils de couverture de code : paramètres présents, tous vides
        if (v.normative.criticality) { // les gabarits de gestion de projet (ECSS-M-ST-10) n'ont ni catégories ni seuils de code
          const coverage = v.normative.parameters.find((p) => p.key === 'code-coverage')!;
          expect(Object.keys(coverage.byCategory).sort()).toEqual(v.normative.criticality.categories.map((c) => c.key).sort());
          expect(Object.values(coverage.byCategory).every((x) => x === null)).toBe(true);
        }
        expect(v.normative.rules.every((r) => r.threshold.target === 100)).toBe(true);
      });
    }
  }

  it('Spatial : normes, catégories A à D, revues et trackers demandés', () => {
    const v = BUILTIN_NORMATIVE.find((b) => b.key === 'spatial')!.versions[0]!;
    expect(v.normative.standards.map((s) => [s.key, s.edition])).toEqual([['ecss-e-st-40c', 'Rev.1'], ['ecss-q-st-80c', 'Rev.2']]);
    expect(v.normative.criticality!.categories.map((c) => c.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.normative.reviews.map((r) => r.key)).toEqual(expect.arrayContaining(['srr', 'pdr', 'cdr', 'qr', 'ar', 'trr', 'trb']));
    expect(v.normative.phases.map((p) => p.review)).toEqual(['srr', 'pdr', 'cdr', 'qr', 'ar']);
    expect(v.trackers.map((t) => t.key)).toEqual(['NORM', 'SYS', 'SRS', 'ICD', 'SDD', 'VER', 'SPR', 'NCR', 'CR', 'RFD', 'RID', 'TSK']);
    expect(v.trackers.find((t) => t.key === 'RID')!.statuses.map((s) => s.key)).toEqual(['open', 'answered', 'decided', 'action', 'closed']);
    expect(v.normative.rules.map((r) => r.key)).toEqual(['sw-req-traced', 'sw-req-verified']);
    expect(v.normative.phases.every((p) => p.exitCriteria.some((c) => c.kind === 'tracker_status' && c.tracker === 'RID' && c.statuses.includes('closed')))).toBe(true);
  });

  it('Défense : AQAP-2110 et 2210 éd. B, trackers demandés et champs de marquage', () => {
    const v = BUILTIN_NORMATIVE.find((b) => b.key === 'defense')!.versions[0]!;
    expect(v.normative.standards.map((s) => s.key)).toEqual(['aqap-2110', 'aqap-2210']);
    expect(v.trackers.map((t) => t.key)).toEqual(['NORM', 'STB', 'SWR', 'ICD', 'SDD', 'TC', 'PV', 'ACI', 'TF', 'CR', 'DRC', 'RRV', 'TSK']);
    expect(v.normative.marking.fields).toEqual(['mention', 'export_control']);
    for (const t of v.trackers.filter((x) => x.key !== 'NORM')) expect(t.fields.map((f) => f.key), t.key).toEqual(expect.arrayContaining(['mention', 'export_control']));
    expect(v.normative.rules.find((r) => r.key === 'fact-has-ci')).toMatchObject({ fromTracker: 'TF', linkType: 'concerns', minCount: 1 });
    expect(v.normative.reviews.some((r) => v.normative.mandatory.includes(`review:${r.key}`))).toBe(false); // revues paramétrables
  });
});

suite('projets créés depuis les gabarits livrés (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let templates: TemplateService;
  let upgrades: TemplateUpgradeService;
  let artifacts: ArtifactService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_normative_templates');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    templates = new TemplateService(db, trackers);
    upgrades = new TemplateUpgradeService(db, trackers, templates);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'nt']));
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  const project = (key: string) => db.tx(org, async (c) => ({
    row: (await c.query('select template_key, template_version, criticality, current_phase from project where key = $1', [key])).rows[0],
    trackers: (await c.query('select t.key, t.type_key from tracker t join project p on p.id = t.project_id where p.key = $1 order by t.key', [key])).rows,
    rules: (await c.query('select r.key from coverage_rule r join project p on p.id = r.project_id where p.key = $1 order by r.key', [key])).rows.map((r) => r.key),
    transitions: Number((await c.query('select count(*) n from transition tr join tracker t on t.id = tr.tracker_id join project p on p.id = t.project_id where p.key = $1', [key])).rows[0].n),
  }));

  it('liste les gabarits livrés avec leurs versions', async () => {
    const list = await templates.list(org);
    expect(list.find((t) => t.key === 'spatial')).toMatchObject({ builtin: true, version: '1.1', versions: ['1.0', '1.1'], status: 'published' });
    expect(list.find((t) => t.key === 'defense')).toMatchObject({ builtin: true, version: '1.0', versions: ['1.0'] });
    expect((await templates.versions(org, 'spatial')).map((v) => v.version)).toEqual(['1.0', '1.1']);
  });

  it('crée un projet Spatial : trackers, workflows, phases et règles présents', async () => {
    const created = await templates.createProject(org, 'SPA', 'Satellite', 'spatial', admin, { criticality: 'B' });
    expect(created.templateVersion).toBe('1.1');
    const p = await project('SPA');
    expect(p.row).toEqual({ template_key: 'spatial', template_version: '1.1', criticality: 'B', current_phase: 'requirements' });
    expect(p.trackers.map((t) => t.key)).toEqual(['CR', 'ICD', 'NCR', 'NORM', 'RFD', 'RID', 'SDD', 'SPR', 'SRS', 'SYS', 'TSK', 'VER']);
    expect(p.trackers.find((t) => t.key === 'RID')!.type_key).toBe('action');
    expect(p.transitions).toBeGreaterThan(30);
    expect(p.rules).toEqual(['sw-req-designed', 'sw-req-traced', 'sw-req-verified']);
    expect((await upgrades.status(org, 'SPA')).phases.map((x) => x.key)).toEqual(['requirements', 'preliminary-design', 'detailed-design', 'qualification', 'acceptance']);
    expect(await fail(templates.createProject(org, 'BAD', 'Mauvaise', 'spatial', admin, { criticality: 'E' }))).toMatch(/^validation:catégorie de criticité inconnue/);
  });

  it('monte un projet Spatial de la version 1.0 à 1.1 (jeu de test)', async () => {
    await templates.createProject(org, 'SP1', 'Ancien', 'spatial', admin, { version: '1.0', criticality: 'A' });
    expect((await project('SP1')).rules).toEqual(['sw-req-traced', 'sw-req-verified']);
    const status = await upgrades.status(org, 'SP1');
    expect(status).toMatchObject({ version: '1.0', latest: '1.1', upgradable: true, drift: { total: 0 } });
    const report = await upgrades.preview(org, 'SP1');
    expect(report).toMatchObject({ from: '1.0', to: '1.1', blockers: [] });
    expect(report.trackers.map((t) => [t.key, t.action])).toEqual(expect.arrayContaining([['SRS', 'update'], ['NCR', 'update']]));
    expect(report.trackers.find((t) => t.key === 'SRS')!.fieldsAdded.map((f) => f.key)).toEqual(['safety_relevant']);
    expect(report.trackers.find((t) => t.key === 'NCR')!.statusesAdded).toEqual([{ key: 'deferred', name: 'Différée' }]);
    expect(report.rules.added).toEqual(['sw-req-designed']);
    await upgrades.apply(org, 'SP1', undefined, admin);
    expect((await project('SP1')).row.template_version).toBe('1.1');
    expect((await project('SP1')).rules).toEqual(['sw-req-designed', 'sw-req-traced', 'sw-req-verified']);
    expect((await upgrades.status(org, 'SP1')).drift.total).toBe(0);
  });

  it('crée un projet Défense avec ses revues paramétrables et ses champs de marquage', async () => {
    await templates.createProject(org, 'DEF', 'Programme', 'defense', admin, { criticality: 'C' });
    const p = await project('DEF');
    expect(p.row).toEqual({ template_key: 'defense', template_version: '1.0', criticality: 'C', current_phase: 'requirements' });
    expect(p.trackers.map((t) => t.key)).toEqual(['ACI', 'CR', 'DRC', 'ICD', 'NORM', 'PV', 'RRV', 'SDD', 'STB', 'SWR', 'TC', 'TF', 'TSK']);
    expect(p.rules).toEqual(['customer-req-traced', 'customer-req-verified', 'fact-has-ci']);
    const fields = await db.tx(org, async (c) => (await c.query("select f.key from field_definition f join tracker t on t.id = f.tracker_id join project p on p.id = t.project_id where p.key = 'DEF' and t.key = 'TF'")).rows.map((r) => r.key));
    expect(fields).toEqual(expect.arrayContaining(['mention', 'export_control']));
  });

  it('dérive « Défense — DR et ITAR » : ajoute sans rien retirer de l’obligatoire', async () => {
    const own = NormativeSchema.parse({
      deliverables: [{ key: 'dr-plan', name: 'Plan de manipulation DR et ITAR' }],
      phases: [{ key: 'requirements', name: 'Exigences', review: 'srr', deliverables: ['quality-plan', 'software-dev-plan', 'config-plan', 'dr-plan'] }],
    });
    await templates.create(org, { key: 'defense-dr-itar', name: 'Défense — DR et ITAR', trackers: [], normative: own, parent: { key: 'defense' } }, admin);
    const resolved = await templates.resolve(org, 'defense-dr-itar');
    expect(resolved.trackers.map((t) => t.key)).toContain('TF');
    expect(resolved.normative.phases[0]!.deliverables).toContain('dr-plan');
    expect(resolved.normative.mandatory).toContain('field:TF.mention');
    expect(resolved.parent).toEqual({ key: 'defense', version: '1.0' });
    // retirer un tracker ou un champ de marquage obligatoire, ou renommer une norme, est refusé
    const removal = await fail(templates.update(org, 'defense-dr-itar', { name: 'x', trackers: [], normative: NormativeSchema.parse({ remove: ['tracker:TF', 'field:STB.export_control'] }) }, admin));
    expect(removal).toMatch(/retrait interdit : tracker:TF/);
    expect(removal).toMatch(/retrait interdit : field:STB.export_control/);
    expect(await fail(templates.update(org, 'defense-dr-itar', { name: 'x', trackers: [], normative: NormativeSchema.parse({ standards: [{ key: 'aqap-2110', name: 'Autre', edition: 'Éd. D' }] }) }, admin))).toMatch(/renommage interdit : standard:aqap-2110/);
    await templates.publish(org, 'defense-dr-itar', undefined, admin);
    const p = await templates.createProject(org, 'DRI', 'DR ITAR', 'defense-dr-itar', admin);
    expect(p.templateVersion).toBe('1.0');
    expect((await project('DRI')).trackers.map((t) => t.key)).toContain('DRC');
  });

  it('les seuils de couverture par catégorie se saisissent dans un dérivé et sont versionnés avec lui', async () => {
    const set = (a: number | null) => NormativeSchema.parse({ parameters: [{ key: 'code-coverage', label: 'Couverture de code — instructions', byCategory: { A: a } }] });
    await templates.create(org, { key: 'spatial-seuils', name: 'Spatial — seuils', trackers: [], normative: set(null), parent: { key: 'spatial', version: '1.1' } }, admin);
    expect((await templates.resolve(org, 'spatial-seuils')).normative.parameters.find((p) => p.key === 'code-coverage')!.byCategory).toEqual({ A: null, B: null, C: null, D: null });
    await templates.update(org, 'spatial-seuils', { name: 'Spatial — seuils', trackers: [], normative: set(100) }, admin);
    await templates.publish(org, 'spatial-seuils', undefined, admin);
    await templates.update(org, 'spatial-seuils', { name: 'Spatial — seuils', trackers: [], normative: set(90) }, admin);
    await templates.publish(org, 'spatial-seuils', undefined, admin);
    const value = async (v: string) => (await templates.snapshot(org, 'spatial-seuils', v)).normative.parameters.find((p) => p.key === 'code-coverage')!.byCategory['A'];
    expect([await value('1.0'), await value('1.1')]).toEqual([100, 90]);
  });

  it('refuse de modifier, publier ou supprimer un gabarit livré', async () => {
    expect(await fail(templates.update(org, 'spatial', { name: 'x', trackers: [] }, admin))).toMatch(/^conflict:.*dérivé/);
    expect(await fail(templates.publish(org, 'spatial', undefined, admin))).toMatch(/^conflict/);
    expect(await fail(templates.remove(org, 'defense', admin))).toMatch(/^conflict/);
    expect(await fail(templates.create(org, { key: 'spatial', name: 'x', trackers: [] }, admin))).toMatch(/^conflict/);
  });

  it('ne ferme une phase que si ses RID sont clos : « RID clos avant clôture de revue »', async () => {
    await templates.createProject(org, 'PHA', 'Phases', 'spatial', admin, { criticality: 'C' });
    const rid = await artifacts.create(org, 'PHA', 'RID', { title: 'Écart de la SRR', review: 'srr' }, admin);
    await artifacts.create(org, 'PHA', 'RID', { title: 'Écart de la PDR', review: 'pdr' }, admin); // une autre revue ne bloque pas la SRR
    const before = (await upgrades.status(org, 'PHA')).phaseCheck!;
    expect(before).toMatchObject({ key: 'requirements', next: 'preliminary-design', canAdvance: false });
    // Le passage exige la sortie de la phase courante ET l'entrée de la suivante ; un critère manuel n'est rempli qu'une fois confirmé.
    expect(before.criteria).toEqual([
      { label: 'Tous les RID de la revue SRR sont clos', stage: 'exit', phase: 'requirements', manual: false, met: false, remaining: 1 },
      { label: 'Baseline RB approuvée à la SRR', stage: 'entry', phase: 'preliminary-design', manual: true, met: false, remaining: 1 },
    ]);
    expect(await fail(upgrades.advancePhase(org, 'PHA', admin))).toBe('conflict:Tous les RID de la revue SRR sont clos (1 restant(s)) | Baseline RB approuvée à la SRR (1 restant(s))');
    let version = rid.version;
    for (const t of ['Répondre', 'Décider', 'Lancer l’action', 'Clore']) version = (await artifacts.transition(org, 'PHA', rid.key, t, version, admin)).version;
    expect((await upgrades.status(org, 'PHA')).phaseCheck).toMatchObject({ canAdvance: false }); // la confirmation manque encore
    expect(await fail(upgrades.checkCriterion(org, 'PHA', { stage: 'exit', label: 'Tous les RID de la revue SRR sont clos', checked: true }, admin))).toMatch(/^validation:/);
    expect(await fail(upgrades.checkCriterion(org, 'PHA', { stage: 'entry', label: 'Inconnu', checked: true }, admin))).toMatch(/^validation:/);
    let checked = await upgrades.checkCriterion(org, 'PHA', { stage: 'entry', label: 'Baseline RB approuvée à la SRR', checked: true, note: 'PV SRR du 12/11' }, admin);
    expect(checked.criteria[1]).toMatchObject({ met: true, checkedBy: expect.any(String), note: 'PV SRR du 12/11' });
    checked = await upgrades.checkCriterion(org, 'PHA', { stage: 'entry', label: 'Baseline RB approuvée à la SRR', checked: false }, admin);
    expect(checked.canAdvance).toBe(false); // annulée : de nouveau bloquant
    await upgrades.checkCriterion(org, 'PHA', { stage: 'entry', label: 'Baseline RB approuvée à la SRR', checked: true }, admin);
    expect((await upgrades.status(org, 'PHA')).phaseCheck).toMatchObject({ canAdvance: true });
    expect(await upgrades.advancePhase(org, 'PHA', admin)).toEqual({ from: 'requirements', to: 'preliminary-design' }); // décision « go » par défaut
    expect((await project('PHA')).row.current_phase).toBe('preliminary-design');
    expect((await upgrades.status(org, 'PHA')).phaseCheck).toMatchObject({ key: 'preliminary-design', canAdvance: false }); // le RID de la PDR bloque la suite
    expect(await fail(upgrades.advancePhase(org, 'PHA', admin))).toMatch(/^conflict:.*PDR/);
  });

  it('gabarit ECSS-M-ST-10 : 7 phases, 13 revues ; seuls les RID majeurs de la revue bloquent la fin de phase (B29, B30)', async () => {
    await templates.createProject(org, 'ECM', 'Mission', 'spatial-project', admin);
    const st = await upgrades.status(org, 'ECM');
    expect(st.phases.map((p) => p.key)).toEqual(['phase-0', 'phase-a', 'phase-b', 'phase-c', 'phase-d', 'phase-e', 'phase-f']);
    expect(builtinNormative('spatial-project')!.versions[0]!.normative.reviews).toHaveLength(13);
    await db.tx(org, (c) => c.query("update project set current_phase = 'phase-b' where key = 'ECM'"));
    const major = await artifacts.create(org, 'ECM', 'RID', { title: 'Écart majeur', review: 'pdr', class: 'majeur' }, admin);
    await artifacts.create(org, 'ECM', 'RID', { title: 'Écart mineur', review: 'pdr', class: 'mineur' }, admin);
    await artifacts.create(org, 'ECM', 'RID', { title: 'Autre revue', review: 'cdr', class: 'majeur' }, admin);
    const rids = async () => (await upgrades.status(org, 'ECM')).phaseCheck!.criteria.find((c) => c.label.startsWith('Tous les RID majeurs'))!;
    expect(await rids()).toMatchObject({ label: 'Tous les RID majeurs de la revue PDR sont clos', met: false, remaining: 1 });
    let version = major.version;
    for (const t of ['Répondre', 'Décider', 'Lancer l’action', 'Clore']) version = (await artifacts.transition(org, 'ECM', major.key, t, version, admin)).version;
    expect(await rids()).toMatchObject({ met: true, remaining: 0 }); // le mineur et le RID d'une autre revue ne comptent pas
  });

  it('gabarit IM 1618 : 4 phases, 9 revues typées ; la sortie de Réalisation exige prononcé, faits majeurs et remarques closes (B31)', async () => {
    const n = builtinNormative('armement-1618')!.versions[0]!.normative;
    expect(n.phases.map((p) => p.key)).toEqual(['preparation', 'realisation', 'utilisation', 'retrait']);
    expect(n.reviews).toHaveLength(9);
    expect(n.reviews.filter((r) => /étatique majeure/.test(r.name)).map((r) => r.key)).toEqual(['rev-qualification', 'rev-mso']);
    const exit = n.phases.find((p) => p.key === 'realisation')!.exitCriteria;
    expect(exit.map((c) => (c.kind === 'manual' ? c.label : `${c.tracker}:${c.where?.field}=${c.where?.value}`))).toEqual(['Prononcé de qualification obtenu', 'TF:severity=majeure', 'RRV:review=rev-qualification']);
    await templates.createProject(org, 'ARM', 'Opération', 'armement-1618', admin);
    expect((await upgrades.status(org, 'ARM')).phases.map((p) => p.key)).toEqual(['preparation', 'realisation', 'utilisation', 'retrait']);
  });

  it('phases datées : historique des dates prévues, décision de gate, phase hors gabarit', async () => {
    await templates.createProject(org, 'PHB', 'Gates', 'spatial', admin, { criticality: 'C' });
    const lines = (await db.tx(org, (c) => c.query("select phase from project_phase x join project p on p.id = x.project_id where p.key = 'PHB' order by phase"))).rows.map((r) => r.phase as string);
    expect(lines).toEqual((await upgrades.status(org, 'PHB')).phases.map((x) => x.key).sort()); // une ligne par phase du gabarit, dès la création
    expect(lines.length).toBeGreaterThan(3);
    expect(await fail(upgrades.setPhaseDates(org, 'PHB', 'inconnue', { plannedEnd: '2026-03-01' }, admin))).toMatch(/^validation:.*phase inconnue/);
    expect(await fail(upgrades.setPhaseDates(org, 'PHB', 'requirements', { plannedStart: '2026-03-10', plannedEnd: '2026-03-01' }, admin))).toMatch(/^validation:.*précède/);
    await upgrades.setPhaseDates(org, 'PHB', 'requirements', { plannedStart: '2026-01-05', plannedEnd: '2026-03-01', reviewPlannedOn: '2026-03-05' }, admin);
    await upgrades.setPhaseDates(org, 'PHB', 'requirements', { plannedEnd: '2026-04-01' }, pmActor);
    await upgrades.setPhaseDates(org, 'PHB', 'requirements', { plannedStart: '2026-01-12' }, admin); // le début n'est pas historisé
    const status = await upgrades.status(org, 'PHB');
    expect(status.phaseHistory.map((h) => [h.phase, h.field, h.from, h.to])).toEqual([
      ['requirements', 'planned_end', null, '2026-03-01'], ['requirements', 'review_planned_on', null, '2026-03-05'], ['requirements', 'planned_end', '2026-03-01', '2026-04-01'],
    ]);
    expect(status.phaseCheck!.record).toMatchObject({ plannedStart: '2026-01-12', plannedEnd: '2026-04-01', reviewPlannedOn: '2026-03-05', decision: null });

    await upgrades.checkCriterion(org, 'PHB', { stage: 'entry', label: 'Baseline RB approuvée à la SRR', checked: true }, admin);
    expect(await fail(upgrades.advancePhase(org, 'PHB', admin, { decision: 'go_with_reserves' }))).toMatch(/^validation:.*note/);
    expect(await fail(upgrades.advancePhase(org, 'PHB', admin, { decision: 'no_go', note: '  ' }))).toMatch(/^validation:.*note/);
    // no_go : la décision est enregistrée, la phase ne change pas
    expect(await upgrades.advancePhase(org, 'PHB', admin, { decision: 'no_go', note: 'Exigences instables', heldOn: '2026-03-20' })).toEqual({ from: 'requirements', to: 'requirements' });
    expect((await project('PHB')).row.current_phase).toBe('requirements');
    expect((await upgrades.status(org, 'PHB')).phaseCheck!.record).toMatchObject({ decision: 'no_go', reviewHeldOn: '2026-03-20', note: 'Exigences instables' });
    expect(await upgrades.advancePhase(org, 'PHB', pmActor, { decision: 'go_with_reserves', note: 'Deux RID ouverts à lever avant la PDR', heldOn: '2026-04-02' })).toEqual({ from: 'requirements', to: 'preliminary-design' });
    const after = await upgrades.status(org, 'PHB');
    expect(after.phases.find((x) => x.key === 'requirements')!.record).toMatchObject({ decision: 'go_with_reserves', reviewHeldOn: '2026-04-02', decidedAt: expect.any(String), decidedBy: expect.any(String) });
    expect(after.phaseHistory).toHaveLength(3); // décider ne change aucune date prévue

    // la décision de gate par l'assurance qualité n'existe que si le gabarit l'exige : jamais pour Spatial, seulement en fin de cycle pour Défense
    expect(await upgrades.qaDecides(org, 'PHB')).toBe(false);
    const flags = Object.fromEntries(builtinNormative('defense')!.versions.at(-1)!.normative.phases.map((x) => [x.key, x.qaDecides]));
    expect(flags).toEqual({ requirements: false, design: false, build: false, qualification: true, acceptance: true });
    // une phase absente du gabarit garde sa ligne, marquée « hors gabarit »
    await db.tx(org, async (c) => { await c.query("insert into project_phase (organization_id, project_id, phase, planned_end, updated_by) select $1, id, 'ancienne', '2026-01-01', 'x' from project where key = 'PHB'", [org]); });
    expect((await upgrades.status(org, 'PHB')).phases.filter((x) => x.offTemplate).map((x) => x.key)).toEqual(['ancienne']);
  });
});
