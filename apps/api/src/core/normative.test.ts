import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { ProjectOverviewService } from './project-overview.service';
import { NormativeSchema } from './normative-template';
import { NormativeService, TailoringInput, csvCell } from './normative.service';
import { TemplateService, type TemplateTracker } from './template.service';
import { normativeClauseTracker, requirementTemplate } from './templates';
import { TrackerService } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-team-member', 'athena-admin'] };
const suite = pgUp ? describe : describe.skip;
const fail = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code}:${e.details.join('|') || e.message}` : `ok`; };

suite('exigences normatives : import, tailoring, conformité', () => {
  let testDb: TestDb;
  let db: Db;
  let svc: NormativeService;
  let links: LinkService;
  let artifacts: ArtifactService;
  const org = crypto.randomUUID();
  const csv = 'référence,titre,texte\n5.1,Plan de développement,Le fournisseur établit un plan.\n5.2,Revue de conception,Une revue est tenue.\n5.3,Gestion de configuration,Les éléments sont identifiés.\n5.4,Sécurité,Texte sécurité\n';

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_normative');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    svc = new NormativeService(db, artifacts);
    const templates = new TemplateService(db, trackers);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'norm']));
    const clause = (({ projectKey: _p, ...t }) => t)(normativeClauseTracker('')) as unknown as TemplateTracker;
    const proc = (({ projectKey: _p, ...t }) => t)({ ...requirementTemplate('', 'PRO'), name: 'Procédures' }) as unknown as TemplateTracker;
    await templates.create(org, { key: 'cat', name: 'Catégories', trackers: [clause, proc], normative: NormativeSchema.parse({ criticality: { label: 'Catégorie', categories: [{ key: 'A', name: 'A' }, { key: 'B', name: 'B' }] } }) }, actor);
    await templates.publish(org, 'cat', undefined, actor);
    await templates.createProject(org, 'SAT', 'Satellite', 'cat', actor, { criticality: 'B' });
    await trackers.createProject(org, 'NOP', 'Sans clauses', actor);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('importe les clauses avec un rapport ligne par ligne, puis reste idempotent', async () => {
    const first = await svc.importClauses(org, 'SAT', { csv: `${csv}5.1,Doublon,x\n,Sans référence,y\n`, standard: 'ECSS-E-ST-40C' }, actor);
    expect(first).toMatchObject({ created: 4, updated: 0, unchanged: 0, errors: 2 });
    expect(first.lines.filter((l) => l.status === 'error')).toEqual([
      { line: 6, reference: '5.1', status: 'error', message: 'doublon de la ligne 2' },
      { line: 7, reference: '', status: 'error', message: 'référence manquante' },
    ]);
    expect(first.lines.find((l) => l.reference === '5.1')).toMatchObject({ status: 'created', key: 'SAT-NORM-0001' });
    const again = await svc.importClauses(org, 'SAT', { csv, standard: 'ECSS-E-ST-40C' }, actor);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 4, errors: 0 });
    const changed = await svc.importClauses(org, 'SAT', { csv: csv.replace('Une revue est tenue.', 'Deux revues sont tenues.'), standard: 'ECSS-E-ST-40C' }, actor);
    expect(changed).toMatchObject({ created: 0, updated: 1, unchanged: 3 });
    const count = Number((await db.tx(org, (c) => c.query("select count(*) n from artifact a join tracker t on t.id = a.tracker_id where t.key = 'NORM'"))).rows[0].n);
    expect(count).toBe(4);
  });

  it('refuse un fichier illisible et un projet sans tracker d’exigences normatives', async () => {
    expect(await fail(svc.importClauses(org, 'SAT', { csv: 'a,b\n1,2' }, actor))).toMatch(/^validation:colonnes attendues/);
    expect(await fail(svc.importClauses(org, 'NOP', { csv }, actor))).toMatch(/^validation:le projet n’a pas de tracker NORM/);
    expect(await fail(svc.importClauses(org, 'ZZZ', { csv }, actor))).toMatch(/^not_found/);
  });

  it('exige une justification pour « non applicable » et « modifiée », et refuse une clause ou une catégorie inconnue', async () => {
    expect(TailoringInput.safeParse({ clause: '5.4', applicability: 'not_applicable' }).success).toBe(false);
    expect(TailoringInput.safeParse({ clause: '5.4', applicability: 'modified', justification: '  ' }).success).toBe(false);
    expect(TailoringInput.safeParse({ clause: '5.4', applicability: 'applicable' }).success).toBe(true);
    await svc.setTailoring(org, 'SAT', { clause: '5.4', category: 'B', applicability: 'not_applicable', justification: 'Pas de logiciel de sécurité en catégorie B' }, actor);
    expect(await fail(svc.setTailoring(org, 'SAT', { clause: '9.9', category: '*', applicability: 'not_applicable', justification: 'x' }, actor))).toMatch(/^validation:clause inconnue/);
    expect(await fail(svc.setTailoring(org, 'SAT', { clause: '5.4', category: 'Z', applicability: 'not_applicable', justification: 'x' }, actor))).toMatch(/^validation:catégorie inconnue/);
    // la base refuse aussi une ligne sans justification
    const direct = await db.tx(org, (c) => c.query("insert into tailoring (organization_id, project_id, clause_key, category, applicability, justification, updated_by) select organization_id, id, '5.1', 'A', 'not_applicable', '', 'x' from project where key = 'SAT'")).then(() => 'permis', (e: Error) => e.message);
    expect(direct).toMatch(/check/);
    expect((await svc.listTailoring(org, 'SAT')).map((t) => [t.clause, t.category, t.applicability])).toEqual([['5.4', 'B', 'not_applicable']]);
  });

  it('calcule la conformité : clause applicable liée à une preuve, taux, catégorie et clause non applicable écartée', async () => {
    const before = await svc.conformity(org, 'SAT');
    expect(before).toMatchObject({ category: 'B', categories: ['A', 'B'], totals: { clauses: 4, applicable: 3, notApplicable: 1, covered: 0, rate: 0 } });
    expect(before.rows.map((r) => [r.reference, r.applicability])).toEqual([['5.1', 'applicable'], ['5.2', 'applicable'], ['5.3', 'applicable'], ['5.4', 'not_applicable']]);
    await artifacts.create(org, 'SAT', 'PRO', { title: 'Procédure de développement', statement: 's' }, actor);
    await artifacts.create(org, 'SAT', 'PRO', { title: 'Procédure de revue', statement: 's' }, actor);
    await links.link(org, 'SAT', 'SAT-PRO-0001', 'SAT-NORM-0001', 'satisfies', actor);
    await links.link(org, 'SAT', 'SAT-NORM-0002', 'SAT-PRO-0002', 'satisfies', actor).catch(() => links.link(org, 'SAT', 'SAT-PRO-0002', 'SAT-NORM-0002', 'refines', actor));
    const after = await svc.conformity(org, 'SAT');
    expect(after.totals).toMatchObject({ applicable: 3, covered: 2, rate: 66.7 });
    expect(after.rows[0]).toMatchObject({ reference: '5.1', covered: true, evidence: [{ key: 'SAT-PRO-0001', title: 'Procédure de développement', tracker: 'PRO' }] });
    expect(after.rows[2]).toMatchObject({ reference: '5.3', covered: false, evidence: [] });
    // pour la catégorie A, la clause 5.4 reste applicable (le tailoring ne porte que sur B)
    expect((await svc.conformity(org, 'SAT', 'A')).totals).toMatchObject({ applicable: 4, notApplicable: 0, covered: 2, rate: 50 });
    expect(await fail(svc.conformity(org, 'SAT', 'Z'))).toMatch(/^validation:catégorie inconnue/);
  });

  it('le tailoring pour toutes les catégories (*) s’applique sauf si la catégorie a le sien ; « applicable » efface la ligne', async () => {
    await svc.setTailoring(org, 'SAT', { clause: '5.3', category: '*', applicability: 'modified', justification: 'Adapté au programme' }, actor);
    expect((await svc.conformity(org, 'SAT', 'A')).rows.find((r) => r.reference === '5.3')).toMatchObject({ applicability: 'modified', justification: 'Adapté au programme' });
    await svc.setTailoring(org, 'SAT', { clause: '5.3', category: 'A', applicability: 'not_applicable', justification: 'Hors périmètre A' }, actor);
    expect((await svc.conformity(org, 'SAT', 'A')).rows.find((r) => r.reference === '5.3')!.applicability).toBe('not_applicable');
    await svc.setTailoring(org, 'SAT', { clause: '5.3', category: 'A', applicability: 'applicable', justification: '' }, actor);
    await svc.setTailoring(org, 'SAT', { clause: '5.3', category: '*', applicability: 'applicable', justification: '' }, actor);
    expect((await svc.listTailoring(org, 'SAT')).map((t) => t.clause)).toEqual(['5.4']);
  });

  it('exporte la matrice en CSV pour audit, avec BOM et protection contre les formules', async () => {
    await svc.importClauses(org, 'SAT', { csv: 'reference,title,text\n6.1,=HYPERLINK("http://x"),"a,b"\n' }, actor);
    const { filename, csv: out } = await svc.conformityCsv(org, 'SAT');
    expect(filename).toBe('conformite-SAT-B.csv');
    expect(out.startsWith('﻿reference,title,standard,applicability,justification,evidence,covered\n')).toBe(true);
    expect(out).toContain('5.1,Plan de développement,ECSS-E-ST-40C,applicable,,SAT-PRO-0001,yes');
    expect(out).toContain('5.4,Sécurité,ECSS-E-ST-40C,not_applicable,Pas de logiciel de sécurité en catégorie B,,');
    expect(out).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(out.trimEnd().split('\n').pop()).toContain('conformity 50%');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('a;b')).toBe('"a;b"');
  });

  it('active l’onglet Conformité seulement pour un projet qui a des exigences normatives', async () => {
    const overview = new ProjectOverviewService(db);
    expect((await overview.modules(org, 'SAT')).modules).toContain('conformity');
    expect((await overview.modules(org, 'NOP')).modules).not.toContain('conformity');
  });
});
