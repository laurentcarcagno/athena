/** Disposition de la vue détails : logique pure (sans React), partagée par l'éditeur et la fiche artefact. */
export type Span = 1 | 2 | 3;
export interface LayoutField { key: string; span: Span }
export interface LayoutSection { title: string; fields: LayoutField[] }
export interface Layout { sections: LayoutSection[] }
export interface FieldLite { key: string; label: string; type: string; semanticRole?: string | null }

export const SECTION_LIMIT = 20;
const LONG_TYPES = new Set(['richtext', 'multiselect']);

/**
 * Disposition automatique : le titre en pleine largeur, les attributs courts sur une colonne, puis les textes longs
 * en pleine largeur dans une seconde section. C'est ce que voit l'utilisateur tant qu'il ne personnalise rien.
 */
export function autoLayout(fields: FieldLite[], titles: { general: string; details: string }): Layout {
  const main: LayoutField[] = [];
  const long: LayoutField[] = [];
  for (const f of fields) {
    if (f.semanticRole === 'title') main.unshift({ key: f.key, span: 3 });
    else if (LONG_TYPES.has(f.type)) long.push({ key: f.key, span: 3 });
    else main.push({ key: f.key, span: 1 });
  }
  const sections: LayoutSection[] = [];
  if (main.length) sections.push({ title: long.length ? titles.general : '', fields: main });
  if (long.length) sections.push({ title: titles.details, fields: long });
  return { sections: sections.length ? sections : [{ title: '', fields: [] }] };
}

/** Retire les clés inconnues et les doublons (un attribut supprimé du tracker disparaît de la disposition). */
export function sanitize(layout: Layout, fields: FieldLite[]): Layout {
  const known = new Set(fields.map((f) => f.key));
  const seen = new Set<string>();
  return {
    sections: layout.sections.map((s) => ({
      ...s,
      fields: s.fields.filter((f) => {
        if (!known.has(f.key) || seen.has(f.key)) return false;
        seen.add(f.key);
        return true;
      }),
    })),
  };
}

export const placedKeys = (layout: Layout): Set<string> => new Set(layout.sections.flatMap((s) => s.fields.map((f) => f.key)));
export const unplaced = (layout: Layout, fields: FieldLite[]): FieldLite[] => { const placed = placedKeys(layout); return fields.filter((f) => !placed.has(f.key)); };

/**
 * Disposition à afficher : celle du tracker (ou l'automatique), avec les attributs oubliés ajoutés à la suite
 * pour qu'un champ ajouté après coup ne soit jamais masqué.
 */
export function resolveLayout(layout: Layout | null | undefined, fields: FieldLite[], titles: { general: string; details: string; others: string }): Layout {
  const base = layout ? sanitize(layout, fields) : autoLayout(fields, titles);
  const rest = unplaced(base, fields);
  if (!rest.length) return base;
  const last = base.sections[base.sections.length - 1];
  const extra = rest.map((f) => ({ key: f.key, span: (LONG_TYPES.has(f.type) ? 3 : 1) as Span }));
  if (layout && last) return { sections: [...base.sections.slice(0, -1), { ...last, fields: [...last.fields, ...extra] }] };
  return { sections: [...base.sections, { title: titles.others, fields: extra }] };
}

const clone = (l: Layout): Layout => ({ sections: l.sections.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f })) })) });
const locate = (l: Layout, key: string): { s: number; i: number } | null => {
  for (let s = 0; s < l.sections.length; s++) { const i = l.sections[s]!.fields.findIndex((f) => f.key === key); if (i >= 0) return { s, i }; }
  return null;
};

/** Avance ou recule un attribut d'une position ; en bout de section il passe dans la section voisine. */
export function moveField(layout: Layout, key: string, delta: -1 | 1): Layout {
  const at = locate(layout, key);
  if (!at) return layout;
  const next = clone(layout);
  const [field] = next.sections[at.s]!.fields.splice(at.i, 1);
  const target = at.i + delta;
  if (target >= 0 && target <= next.sections[at.s]!.fields.length) { next.sections[at.s]!.fields.splice(target, 0, field!); return next; }
  const s = at.s + delta;
  if (s < 0 || s >= next.sections.length) { next.sections[at.s]!.fields.splice(at.i, 0, field!); return layout; }
  next.sections[s]!.fields.splice(delta === 1 ? 0 : next.sections[s]!.fields.length, 0, field!);
  return next;
}

/** Place un attribut (déjà placé ou non) dans une section, avant `beforeKey` ou à la fin. */
export function placeField(layout: Layout, key: string, section: number, beforeKey?: string, span?: Span): Layout {
  if (section < 0 || section >= layout.sections.length || key === beforeKey) return layout;
  const next = clone(layout);
  const at = locate(next, key);
  const previous = at ? next.sections[at.s]!.fields.splice(at.i, 1)[0] : undefined;
  const field: LayoutField = { key, span: span ?? previous?.span ?? 1 };
  const list = next.sections[section]!.fields;
  const index = beforeKey ? list.findIndex((f) => f.key === beforeKey) : -1;
  list.splice(index >= 0 ? index : list.length, 0, field);
  return next;
}

export function removeField(layout: Layout, key: string): Layout {
  return { sections: layout.sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f.key !== key) })) };
}

export function setSpan(layout: Layout, key: string, span: Span): Layout {
  return { sections: layout.sections.map((s) => ({ ...s, fields: s.fields.map((f) => (f.key === key ? { ...f, span } : f)) })) };
}

export function renameSection(layout: Layout, index: number, title: string): Layout {
  return { sections: layout.sections.map((s, i) => (i === index ? { ...s, title } : s)) };
}

export function addSection(layout: Layout, title = ''): Layout {
  return layout.sections.length >= SECTION_LIMIT ? layout : { sections: [...layout.sections, { title, fields: [] }] };
}

/** Supprime une section ; ses attributs deviennent « non placés ». Il reste toujours au moins une section. */
export function removeSection(layout: Layout, index: number): Layout {
  if (layout.sections.length <= 1) return { sections: [{ ...layout.sections[0]!, fields: [] }] };
  return { sections: layout.sections.filter((_, i) => i !== index) };
}

export function moveSection(layout: Layout, index: number, delta: -1 | 1): Layout {
  const target = index + delta;
  if (target < 0 || target >= layout.sections.length) return layout;
  const sections = [...layout.sections];
  [sections[index], sections[target]] = [sections[target]!, sections[index]!];
  return { sections };
}

/** Disposition envoyée au serveur : sans clé inconnue, sans section vide sans titre (hors cas unique). */
export function forSave(layout: Layout, fields: FieldLite[]): Layout {
  const clean = sanitize(layout, fields);
  const kept = clean.sections.filter((s) => s.fields.length > 0 || s.title.trim() !== '');
  return { sections: (kept.length ? kept : [{ title: '', fields: [] }]).map((s) => ({ ...s, title: s.title.trim() })) };
}
