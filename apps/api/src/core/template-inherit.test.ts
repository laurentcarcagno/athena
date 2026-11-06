import { describe, expect, it } from 'vitest';
import { NormativeSchema } from './normative-template';
import { MAX_DEPTH, chainProblems, inheritanceProblems, mergeLayers, resolveLayers, type Layer } from './template-inherit';
import type { TemplateTracker } from './template.service';

const tracker = (key: string, name: string, fields: string[], statuses: string[] = ['open', 'closed']): TemplateTracker => ({
  key, name,
  fields: fields.map((f) => ({ key: f, label: f.toUpperCase(), type: 'text' })),
  statuses: statuses.map((s, i) => ({ key: s, name: s, category: i === statuses.length - 1 ? 'done' : 'todo' })),
  transitions: statuses.slice(1).map((s, i) => ({ name: `vers ${s}`, from: statuses[i]!, to: s })),
});
const layer = (trackers: TemplateTracker[], normative: Record<string, unknown> = {}): Layer => ({ trackers, normative: NormativeSchema.parse(normative) });

const parent = layer([tracker('REQ', 'Exigences', ['title', 'text']), tracker('RID', 'RID', ['title'], ['open', 'answered', 'closed'])], {
  reviews: [{ key: 'pdr', name: 'PDR' }],
  phases: [{ key: 'design', name: 'Conception', review: 'pdr' }],
  rules: [{ key: 'trace', name: 'Traçabilité', fromTracker: 'REQ', linkType: 'refines' }],
  criticality: { label: 'Catégorie', categories: [{ key: 'A', name: 'A' }, { key: 'B', name: 'B' }] },
  parameters: [{ key: 'coverage', label: 'Couverture', byCategory: { A: null, B: null } }],
  mandatory: ['tracker:REQ', 'field:REQ.title', 'status:RID.closed', 'review:pdr', 'phase:design', 'rule:trace', 'category:A'],
});

describe('héritage de gabarits', () => {
  it('fusionne parent et enfant de façon déterministe : le parent d’abord, l’enfant à la suite', () => {
    const child = layer([tracker('REQ', 'Exigences', ['title', 'text', 'asil']), tracker('NCR', 'NCR', ['title'])], {
      reviews: [{ key: 'cdr', name: 'CDR' }], phases: [{ key: 'build', name: 'Réalisation', review: 'cdr' }],
      parameters: [{ key: 'coverage', label: 'Couverture', byCategory: { A: 100 } }],
    });
    const once = mergeLayers(parent, child);
    expect(once.trackers.map((t) => t.key)).toEqual(['REQ', 'RID', 'NCR']);
    expect(once.trackers[0]!.fields.map((f) => f.key)).toEqual(['title', 'text', 'asil']);
    expect(once.normative.phases.map((p) => p.key)).toEqual(['design', 'build']);
    expect(once.normative.reviews.map((r) => r.key)).toEqual(['pdr', 'cdr']);
    expect(once.normative.parameters[0]!.byCategory).toEqual({ A: 100, B: null });
    expect(once.normative.mandatory).toEqual(parent.normative.mandatory);
    expect(JSON.stringify(mergeLayers(parent, child))).toBe(JSON.stringify(once));
    expect(resolveLayers(parent, child).problems).toEqual([]);
  });

  it('l’enfant redéfinit un élément non obligatoire sur place', () => {
    const child = layer([tracker('REQ', 'Exigences', ['title', 'text'])], { rules: [{ key: 'trace', name: 'Traçabilité', fromTracker: 'REQ', linkType: 'satisfies', minCount: 2 }] });
    const merged = mergeLayers(parent, child);
    expect(merged.normative.rules).toHaveLength(1);
    expect(merged.normative.rules[0]).toMatchObject({ linkType: 'satisfies', minCount: 2 });
  });

  it('table de retraits : un élément obligatoire ne peut pas être retiré, les autres oui', () => {
    const table: Array<[string, boolean]> = [
      ['tracker:REQ', false], ['field:REQ.title', false], ['status:RID.closed', false], ['review:pdr', false], ['phase:design', false],
      ['rule:trace', false], ['category:A', false],
      ['field:REQ.text', true], ['status:RID.answered', true], ['category:B', true], ['tracker:RID', true], ['parameter:coverage', true],
    ];
    for (const [path, allowed] of table) {
      const problems = inheritanceProblems(parent, layer([], { remove: [path] }));
      expect(problems.length === 0, `${path}: ${problems.join(';')}`).toBe(allowed);
      if (!allowed) expect(problems).toEqual([`retrait interdit : ${path} est obligatoire dans le gabarit parent`]);
    }
  });

  it('un retrait effectif enlève l’élément et ce qui en dépend (transitions)', () => {
    const merged = mergeLayers(parent, layer([], { remove: ['status:RID.answered', 'category:B'] }));
    const rid = merged.trackers.find((t) => t.key === 'RID')!;
    expect(rid.statuses.map((s) => s.key)).toEqual(['open', 'closed']);
    expect(rid.transitions).toEqual([]);
    expect(merged.normative.criticality!.categories.map((c) => c.key)).toEqual(['A']);
  });

  it('refuse le renommage d’un élément obligatoire, avec la liste des éléments', () => {
    const child = layer([tracker('REQ', 'Exigences renommées', ['title', 'text'])], { reviews: [{ key: 'pdr', name: 'Revue préliminaire' }] });
    const problems = inheritanceProblems(parent, child);
    expect(problems).toEqual(expect.arrayContaining([
      'renommage interdit : tracker:REQ est obligatoire (« Exigences » → « Exigences renommées »)',
      'renommage interdit : review:pdr est obligatoire (« PDR » → « Revue préliminaire »)',
    ]));
    expect(resolveLayers(parent, child).problems).toHaveLength(2);
  });

  it('refuse de retirer un élément inconnu du parent', () => {
    expect(inheritanceProblems(parent, layer([], { remove: ['tracker:ZZZ'] }))).toEqual(['retrait impossible : tracker:ZZZ n’existe pas dans le gabarit parent']);
  });

  it('contrôle la cohérence du résultat fusionné', () => {
    const child = layer([], { phases: [{ key: 'build', name: 'Réalisation', review: 'absente' }] });
    expect(resolveLayers(parent, child).problems).toEqual(['phase build : revue inconnue ou absente (absente)']);
  });

  it('refuse les cycles et limite la profondeur à 5', () => {
    expect(chainProblems(['a', 'b', 'c'])).toEqual([]);
    expect(chainProblems(['a', 'b', 'a'])).toEqual(['cycle d’héritage : a → b → a']);
    expect(chainProblems(['a', 'a'])).toEqual(['cycle d’héritage : a → a']);
    expect(chainProblems(['1', '2', '3', '4', '5'])).toEqual([]);
    expect(MAX_DEPTH).toBe(5);
    expect(chainProblems(['1', '2', '3', '4', '5', '6'])).toEqual(['héritage trop profond : 6 niveaux (maximum 5)']);
  });
});
