import { NormativeSchema, normativeProblems, type Normative } from './normative-template';
import type { TemplateTracker } from './template.service';

/**
 * Héritage de gabarits (ADR-0002) : socle d'organisation → gabarit normatif → dérivé. Un enfant ajoute ou redéfinit des
 * éléments ; il ne retire ni ne renomme jamais ce que son parent déclare obligatoire (`normative.mandatory`).
 * Toutes les fonctions sont pures et déterministes : même parent, même enfant, même résultat.
 */
export const MAX_DEPTH = 5;

export interface Layer { trackers: TemplateTracker[]; normative: Normative }

/** Fusionne deux listes par clé : l'ordre du parent est conservé, l'enfant redéfinit sur place ou ajoute à la suite. */
function mergeBy<T>(parent: T[], child: T[], keyOf: (x: T) => string, merge: (p: T, c: T) => T = (_p, c) => c): T[] {
  const out = parent.map((p) => { const c = child.find((x) => keyOf(x) === keyOf(p)); return c ? merge(p, c) : p; });
  for (const c of child) if (!parent.some((p) => keyOf(p) === keyOf(c))) out.push(c);
  return out;
}

function mergeTracker(p: TemplateTracker, c: TemplateTracker): TemplateTracker {
  return {
    ...p, ...c,
    ...(p.description !== undefined || c.description !== undefined ? { description: c.description ?? p.description! } : {}),
    fields: mergeBy(p.fields, c.fields, (f) => f.key),
    statuses: mergeBy(p.statuses, c.statuses, (s) => s.key),
    transitions: mergeBy(p.transitions, c.transitions, (t) => t.name),
  };
}

/** Applique les retraits d'états et de champs, et retire les transitions qui en dépendent. */
function dropRemoved(t: TemplateTracker, removed: Set<string>): TemplateTracker {
  const statuses = t.statuses.filter((s) => !removed.has(`status:${t.key}.${s.key}`));
  const kept = new Set(statuses.map((s) => s.key));
  return {
    ...t, statuses,
    fields: t.fields.filter((f) => !removed.has(`field:${t.key}.${f.key}`)),
    transitions: t.transitions.filter((x) => (x.from === null || kept.has(x.from)) && kept.has(x.to)),
  };
}

/** Fusion parent + enfant : le résultat ne dépend que des deux couches. Les retraits de l'enfant sont appliqués. */
export function mergeLayers(parent: Layer, child: Layer): Layer {
  const removed = new Set(child.normative.remove);
  const dropped = (kind: string, key: string) => removed.has(`${kind}:${key}`);
  const pn = parent.normative, cn = child.normative;
  const trackers = mergeBy(parent.trackers, child.trackers, (t) => t.key, mergeTracker).filter((t) => !dropped('tracker', t.key)).map((t) => dropRemoved(t, removed));
  const categories = mergeBy(pn.criticality?.categories ?? [], cn.criticality?.categories ?? [], (x) => x.key).filter((x) => !dropped('category', x.key));
  const criticality = pn.criticality || cn.criticality ? { label: (cn.criticality ?? pn.criticality)!.label, categories } : undefined;
  const by = <T extends { key: string }>(kind: string, p: T[], c: T[], merge?: (p: T, c: T) => T) => mergeBy(p, c, (x) => x.key, merge).filter((x) => !dropped(kind, x.key));
  const normative: Normative = NormativeSchema.parse({
    standards: by('standard', pn.standards, cn.standards),
    ...(criticality && criticality.categories.length > 0 ? { criticality } : {}),
    reviews: by('review', pn.reviews, cn.reviews),
    phases: by('phase', pn.phases, cn.phases),
    deliverables: by('deliverable', pn.deliverables, cn.deliverables),
    rules: by('rule', pn.rules, cn.rules),
    parameters: by('parameter', pn.parameters, cn.parameters, (p, c) => ({ ...c, byCategory: { ...p.byCategory, ...c.byCategory } })),
    marking: { fields: [...new Set([...pn.marking.fields, ...cn.marking.fields])] },
    mandatory: [...new Set([...pn.mandatory, ...cn.mandatory])],
    remove: [],
  });
  return { trackers, normative };
}

/** Texte comparable de l'identité d'un élément (ce qui ne peut pas changer pour un élément obligatoire). */
function identities(l: Layer): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of l.trackers) {
    m.set(`tracker:${t.key}`, t.name);
    for (const f of t.fields) m.set(`field:${t.key}.${f.key}`, `${f.label}|${f.type}`);
    for (const s of t.statuses) m.set(`status:${t.key}.${s.key}`, `${s.name}|${s.category}`);
  }
  const n = l.normative;
  n.standards.forEach((x) => m.set(`standard:${x.key}`, `${x.name}|${x.edition}`));
  n.criticality?.categories.forEach((x) => m.set(`category:${x.key}`, x.name));
  n.reviews.forEach((x) => m.set(`review:${x.key}`, x.name));
  n.phases.forEach((x) => m.set(`phase:${x.key}`, `${x.name}|${x.review}`));
  n.deliverables.forEach((x) => m.set(`deliverable:${x.key}`, x.name));
  n.rules.forEach((x) => m.set(`rule:${x.key}`, x.name));
  n.parameters.forEach((x) => m.set(`parameter:${x.key}`, x.label));
  return m;
}

/** Éléments obligatoires du parent que l'enfant retire ou renomme : liste vide si l'héritage est respecté. */
export function inheritanceProblems(parent: Layer, child: Layer): string[] {
  const out: string[] = [];
  const mandatory = new Set(parent.normative.mandatory);
  const base = identities(parent);
  const own = identities(child);
  for (const path of child.normative.remove) {
    if (mandatory.has(path)) out.push(`retrait interdit : ${path} est obligatoire dans le gabarit parent`);
    else if (!base.has(path)) out.push(`retrait impossible : ${path} n’existe pas dans le gabarit parent`);
  }
  for (const path of mandatory) {
    const was = base.get(path), is = own.get(path);
    if (was !== undefined && is !== undefined && was !== is) out.push(`renommage interdit : ${path} est obligatoire (« ${was.split('|')[0]} » → « ${is.split('|')[0]} »)`);
  }
  return [...new Set(out)];
}

/** Gabarit résolu (parent fusionné avec l'enfant) et tous les écarts à l'héritage et à la cohérence. */
export function resolveLayers(parent: Layer | null, child: Layer): { resolved: Layer; problems: string[] } {
  if (parent === null) return { resolved: { trackers: child.trackers, normative: { ...child.normative, remove: [] } }, problems: normativeProblems(child.trackers, child.normative) };
  const problems = inheritanceProblems(parent, child);
  const resolved = mergeLayers(parent, child);
  return { resolved, problems: [...problems, ...normativeProblems(resolved.trackers, resolved.normative)] };
}

/** Cycle ou profondeur excessive dans une chaîne `[gabarit, parent, grand-parent…]`. */
export function chainProblems(chain: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [i, k] of chain.entries()) {
    if (seen.has(k)) { out.push(`cycle d’héritage : ${[...chain.slice(chain.indexOf(k), i), k].join(' → ')}`); break; }
    seen.add(k);
  }
  if (out.length === 0 && chain.length > MAX_DEPTH) out.push(`héritage trop profond : ${chain.length} niveaux (maximum ${MAX_DEPTH})`);
  return out;
}
