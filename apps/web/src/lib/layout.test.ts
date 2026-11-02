import { describe, expect, it } from 'vitest';
import { addSection, autoLayout, forSave, moveField, moveSection, placeField, removeField, removeSection, renameSection, resolveLayout, sanitize, setSpan, unplaced, type FieldLite, type Layout } from './layout';

const fields: FieldLite[] = [
  { key: 'description', label: 'Description', type: 'richtext' },
  { key: 'severity', label: 'Sévérité', type: 'select' },
  { key: 'title', label: 'Titre', type: 'text', semanticRole: 'title' },
  { key: 'assignee', label: 'Responsable', type: 'user' },
  { key: 'tags', label: 'Étiquettes', type: 'multiselect' },
];
const titles = { general: 'Général', details: 'Détails', others: 'Autres' };
const keys = (l: Layout) => l.sections.map((s) => s.fields.map((f) => f.key));

describe('disposition automatique', () => {
  it('met le titre en tête sur 3 colonnes, les attributs courts sur 1, les textes longs dans « Détails »', () => {
    const l = autoLayout(fields, titles);
    expect(l.sections.map((s) => s.title)).toEqual(['Général', 'Détails']);
    expect(keys(l)).toEqual([['title', 'severity', 'assignee'], ['description', 'tags']]);
    expect(l.sections[0]!.fields.map((f) => f.span)).toEqual([3, 1, 1]);
    expect(l.sections[1]!.fields.map((f) => f.span)).toEqual([3, 3]);
  });
  it('sans texte long, une seule section sans titre', () => {
    const l = autoLayout(fields.filter((f) => f.type !== 'richtext' && f.type !== 'multiselect'), titles);
    expect(l.sections).toHaveLength(1);
    expect(l.sections[0]!.title).toBe('');
  });
  it('sans aucun champ, une section vide (jamais zéro)', () => {
    expect(autoLayout([], titles).sections).toHaveLength(1);
  });
});

describe('résolution pour l’affichage', () => {
  it('sans disposition enregistrée, utilise l’automatique', () => {
    expect(keys(resolveLayout(null, fields, titles))).toEqual([['title', 'severity', 'assignee'], ['description', 'tags']]);
  });
  it('ajoute à la suite un attribut absent de la disposition, et ignore un attribut supprimé', () => {
    const saved: Layout = { sections: [{ title: 'A', fields: [{ key: 'title', span: 3 }, { key: 'supprime', span: 1 }] }] };
    const l = resolveLayout(saved, fields, titles);
    expect(keys(l)).toEqual([['title', 'description', 'severity', 'assignee', 'tags']]);
    expect(l.sections[0]!.fields.find((f) => f.key === 'description')!.span).toBe(3);
    expect(l.sections[0]!.fields.find((f) => f.key === 'severity')!.span).toBe(1);
  });
  it('sanitize retire les clés inconnues et les doublons', () => {
    const l = sanitize({ sections: [{ title: '', fields: [{ key: 'title', span: 1 }, { key: 'title', span: 2 }, { key: 'zzz', span: 1 }] }, { title: '', fields: [{ key: 'title', span: 3 }] }] }, fields);
    expect(keys(l)).toEqual([['title'], []]);
  });
});

describe('opérations de l’éditeur', () => {
  const base: Layout = { sections: [{ title: 'A', fields: [{ key: 'title', span: 3 }, { key: 'severity', span: 1 }] }, { title: 'B', fields: [{ key: 'assignee', span: 2 }] }] };
  it('avance et recule d’une position, puis change de section en bout de course', () => {
    expect(keys(moveField(base, 'severity', -1))).toEqual([['severity', 'title'], ['assignee']]);
    expect(keys(moveField(base, 'severity', 1))).toEqual([['title'], ['severity', 'assignee']]);
    expect(keys(moveField(base, 'assignee', -1))).toEqual([['title', 'severity', 'assignee'], []]);
  });
  it('ne bouge pas au-delà des extrémités', () => {
    expect(moveField(base, 'title', -1)).toBe(base);
    expect(moveField(base, 'assignee', 1)).toBe(base);
  });
  it('place un attribut avant un autre, dans une autre section, en gardant sa largeur', () => {
    expect(keys(placeField(base, 'assignee', 0, 'severity'))).toEqual([['title', 'assignee', 'severity'], []]);
    expect(placeField(base, 'assignee', 0, 'severity').sections[0]!.fields[1]!.span).toBe(2);
  });
  it('place un attribut non placé à la fin d’une section avec une largeur choisie', () => {
    const l = placeField(base, 'tags', 1, undefined, 3);
    expect(keys(l)[1]).toEqual(['assignee', 'tags']);
    expect(l.sections[1]!.fields[1]!.span).toBe(3);
  });
  it('retire un attribut (il devient non placé) et change sa largeur', () => {
    const l = removeField(base, 'severity');
    expect(keys(l)).toEqual([['title'], ['assignee']]);
    expect(unplaced(l, fields).map((f) => f.key)).toEqual(['description', 'severity', 'tags']);
    expect(setSpan(base, 'severity', 2).sections[0]!.fields[1]!.span).toBe(2);
  });
  it('gère les sections : ajout, renommage, déplacement, suppression (au moins une reste)', () => {
    expect(addSection(base, 'C').sections.map((s) => s.title)).toEqual(['A', 'B', 'C']);
    expect(renameSection(base, 1, 'Z').sections[1]!.title).toBe('Z');
    expect(moveSection(base, 1, -1).sections.map((s) => s.title)).toEqual(['B', 'A']);
    expect(moveSection(base, 0, -1)).toBe(base);
    expect(removeSection(base, 0).sections.map((s) => s.title)).toEqual(['B']);
    expect(removeSection({ sections: [{ title: 'Seule', fields: [{ key: 'title', span: 1 }] }] }, 0).sections).toEqual([{ title: 'Seule', fields: [] }]);
  });
  it('plafonne le nombre de sections', () => {
    let l: Layout = { sections: [{ title: '', fields: [] }] };
    for (let i = 0; i < 30; i++) l = addSection(l);
    expect(l.sections).toHaveLength(20);
  });
  it('forSave retire les sections vides sans titre et les clés inconnues', () => {
    const l = forSave({ sections: [{ title: ' A ', fields: [{ key: 'title', span: 1 }, { key: 'x', span: 1 }] }, { title: '', fields: [] }, { title: 'Vide mais titrée', fields: [] }] }, fields);
    expect(l.sections.map((s) => [s.title, s.fields.length])).toEqual([['A', 1], ['Vide mais titrée', 0]]);
  });
});
