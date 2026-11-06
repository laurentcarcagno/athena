import { describe, expect, it } from 'vitest';
import { NormativeSchema, compareVersions, elementPaths, nextMinor, normativeProblems, templateToYaml, yamlToTemplate, type TrackerShape } from './normative-template';

const trackers: TrackerShape[] = [
  { key: 'SRS', name: 'Exigences logicielles', fields: [{ key: 'title', label: 'Titre', type: 'text' }], statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo' }, { key: 'done', name: 'Vérifiée', category: 'done' }] },
  { key: 'RID', name: 'RID', fields: [], statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'closed', name: 'Clos', category: 'done' }] },
];
const base = () => NormativeSchema.parse({
  criticality: { label: 'Catégorie', categories: [{ key: 'A', name: 'A' }, { key: 'B', name: 'B' }] },
  reviews: [{ key: 'pdr', name: 'PDR' }],
  deliverables: [{ key: 'sdd', name: 'SDD', categories: ['A'] }],
  phases: [{ key: 'design', name: 'Conception', review: 'pdr', deliverables: ['sdd'], exitCriteria: [{ kind: 'tracker_status', tracker: 'RID', statuses: ['closed'] }] }],
  rules: [{ key: 'trace', name: 'Traçabilité', fromTracker: 'SRS', linkType: 'refines' }],
  parameters: [{ key: 'code-coverage', label: 'Couverture de code', byCategory: { A: null, B: null } }],
});

describe('modèle normatif', () => {
  it('accepte un gabarit historique (aucun élément normatif)', () => {
    const n = NormativeSchema.parse({});
    expect(n).toMatchObject({ standards: [], reviews: [], phases: [], rules: [], mandatory: [], remove: [] });
    expect(normativeProblems(trackers, n)).toEqual([]);
  });

  it('accepte un gabarit cohérent et laisse les seuils non fixés', () => {
    expect(normativeProblems(trackers, base())).toEqual([]);
    expect(base().parameters[0]!.byCategory).toEqual({ A: null, B: null });
  });

  it('refuse une phase sans revue', () => {
    expect(() => NormativeSchema.parse({ phases: [{ key: 'design', name: 'Conception' }] })).toThrow();
    const n = base(); n.phases[0]!.review = 'cdr';
    expect(normativeProblems(trackers, n)).toContain('phase design : revue inconnue ou absente (cdr)');
  });

  it('refuse un livrable inconnu, une catégorie inconnue, une règle sur un tracker ou un état inconnu', () => {
    const n = base();
    n.phases[0]!.deliverables.push('nope');
    n.deliverables[0]!.categories = ['Z'];
    n.rules.push({ key: 'r2', name: 'R2', fromTracker: 'XXX', linkType: 'refines', direction: 'any', minCount: 1, statuses: [], threshold: { target: 100 } });
    n.rules.push({ key: 'r3', name: 'R3', fromTracker: 'SRS', linkType: 'refines', direction: 'any', minCount: 1, statuses: ['ghost'], threshold: { target: 100 } });
    n.parameters[0]!.byCategory = { Q: 1 };
    const problems = normativeProblems(trackers, n);
    expect(problems).toEqual(expect.arrayContaining([
      'phase design : livrable inconnu nope', 'livrable sdd : catégorie inconnue Z', 'règle r2 : tracker inconnu XXX',
      'règle r3 : état inconnu SRS.ghost', 'paramètre code-coverage : catégorie inconnue Q',
    ]));
  });

  it('refuse un critère de phase sur un état inconnu et les doublons', () => {
    const n = base();
    n.phases[0]!.exitCriteria = [{ kind: 'tracker_status', tracker: 'RID', statuses: ['ghost'] }];
    n.reviews.push({ key: 'pdr', name: 'Doublon' });
    expect(normativeProblems(trackers, n)).toEqual(expect.arrayContaining(['phase design (sortie) : état inconnu RID.ghost', 'revue en double : pdr']));
  });

  it('liste les chemins des éléments', () => {
    const paths = elementPaths(trackers, base());
    for (const p of ['tracker:SRS', 'field:SRS.title', 'status:RID.closed', 'category:A', 'review:pdr', 'phase:design', 'deliverable:sdd', 'rule:trace', 'parameter:code-coverage']) expect(paths.has(p)).toBe(true);
  });

  it('compare et incrémente les versions numériquement', () => {
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('2', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1')).toBe(0);
    expect(nextMinor(null)).toBe('1.0');
    expect(nextMinor('1.9')).toBe('1.10');
  });
});

describe('YAML', () => {
  it('fait un aller-retour sans perte', () => {
    const def = { key: 'spatial-b', name: 'Spatial — catégorie B', description: 'Dérivé', parent: { key: 'spatial', version: '1.0' }, trackers: [], normative: base() };
    const text = templateToYaml(def);
    expect(text).toContain('athenaTemplate: 1');
    const back = yamlToTemplate(text);
    expect(back).toMatchObject({ key: 'spatial-b', parent: { key: 'spatial', version: '1.0' } });
    expect(back.normative).toEqual(def.normative);
    expect(templateToYaml({ ...back, description: back.description, trackers: back.trackers, normative: back.normative })).toBe(text);
  });

  it('rejette un YAML invalide ou incomplet avec un message clair', () => {
    expect(() => yamlToTemplate(': : :')).toThrow(/YAML invalide/);
    expect(() => yamlToTemplate('name: x')).toThrow(/gabarit invalide/);
    expect(() => yamlToTemplate('athenaTemplate: 1\nkey: a\nname: x')).toThrow(/key/);
  });
});
