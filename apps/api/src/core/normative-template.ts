import { parse, stringify } from 'yaml';
import { z } from 'zod';

/** Modèle normatif d'un gabarit (ADR-0002, Lot 3) : tout est facultatif, un gabarit historique (trackers seuls) reste valide. */
const Key = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/, 'clé en minuscules, chiffres, tiret et tiret bas');
const TrackerRef = z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/);
const StatusRef = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const Percent = z.number().min(0).max(100);
const Text = z.string().trim().min(1).max(200);

export const CriterionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual'), label: Text }),
  /** Tous les items du tracker sont dans l'un des états listés (ex. RID clos avant clôture de revue). */
  z.object({
    kind: z.literal('tracker_status'), tracker: TrackerRef, statuses: z.array(StatusRef).min(1).max(20), label: Text.optional(),
    /** Limite le contrôle aux items dont ce champ vaut cette valeur (ex. les RID de la revue PDR). */
    where: z.object({ field: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), value: z.string().max(100) }).optional(),
    /** Second filtre, cumulé au premier (lot 19, B29) : ex. les RID de la revue PDR ET d'une criticité donnée. Sans `where`, il est refusé. */
    and: z.object({ field: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), value: z.string().max(100) }).optional(),
  }).refine((c) => c.and === undefined || c.where !== undefined, { message: 'and exige where', path: ['and'] }),
]);
export type Criterion = z.infer<typeof CriterionSchema>;

export const NormativeSchema = z.object({
  /** Normes appliquées et leur édition. */
  standards: z.array(z.object({ key: Key, name: Text, edition: Text, date: z.string().max(20).optional(), url: z.string().url().max(500).optional() })).max(30).default([]),
  /** Niveaux de criticité (catégories logicielles A à D, DAL…) qui conditionnent tailoring, règles et livrables. */
  criticality: z.object({ label: Text, categories: z.array(z.object({ key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/), name: Text })).min(1).max(12) }).optional(),
  reviews: z.array(z.object({ key: Key, name: Text })).max(40).default([]),
  /** Jalons du cycle de vie : chaque phase se termine par une revue. */
  phases: z.array(z.object({
    key: Key, name: Text, review: Key,
    entryCriteria: z.array(CriterionSchema).max(20).default([]),
    exitCriteria: z.array(CriterionSchema).max(20).default([]),
    deliverables: z.array(Key).max(40).default([]),
    /** Vrai : l'assurance qualité étatique (`athena-qa`) peut prendre la décision de gate de cette phase, comme le chef de projet. */
    qaDecides: z.boolean().default(false),
  })).max(40).default([]),
  /** Documents attendus ; `document` désigne le modèle StrictDoc, `categories` limite aux catégories concernées (toutes si absent). */
  deliverables: z.array(z.object({ key: Key, name: Text, document: z.string().max(200).optional(), categories: z.array(z.string()).max(12).optional() })).max(60).default([]),
  /** Règles de couverture appliquées au projet à sa création (même forme que `coverage_rule`). */
  rules: z.array(z.object({
    key: Key, name: Text, fromTracker: TrackerRef, linkType: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    direction: z.enum(['in', 'out', 'any']).default('any'), minCount: z.number().int().min(1).max(100).default(1),
    statuses: z.array(StatusRef).max(50).default([]), threshold: z.object({ target: Percent.default(100), warning: Percent.optional() }).default({ target: 100 }),
  })).max(60).default([]),
  /** Paramètres chiffrés par catégorie (ex. couverture de code), à renseigner par le responsable méthodes : `null` = non fixé. */
  parameters: z.array(z.object({ key: Key, label: Text, unit: z.string().max(20).default('%'), byCategory: z.record(z.string(), z.number().min(0).max(100).nullable()).default({}) })).max(30).default([]),
  /** Champs de marquage (mention de protection, contrôle export) : présents dans les trackers, sans effet avant le Lot 4. */
  marking: z.object({ fields: z.array(Key).max(10).default([]) }).default({ fields: [] }),
  /** Éléments qu'un gabarit dérivé ne peut ni retirer ni renommer. Chemins : `tracker:SRS`, `field:SRS.title`, `status:RID.open`, `phase:pdr`… */
  mandatory: z.array(z.string().regex(/^[a-z]+:[A-Za-z0-9_.-]+$/)).max(500).default([]),
  /** Éléments hérités que le dérivé retire (refusé pour un élément obligatoire). */
  remove: z.array(z.string().regex(/^[a-z]+:[A-Za-z0-9_.-]+$/)).max(500).default([]),
});
export type Normative = z.infer<typeof NormativeSchema>;

export const emptyNormative = (): Normative => NormativeSchema.parse({});

export const VERSION = /^[0-9]+(\.[0-9]+)?$/;
export const compareVersions = (a: string, b: string): number => {
  const [a1 = 0, a2 = 0] = a.split('.').map(Number);
  const [b1 = 0, b2 = 0] = b.split('.').map(Number);
  return a1 - b1 || a2 - b2;
};
export const nextMinor = (v: string | null): string => (v === null ? '1.0' : `${v.split('.')[0]}.${Number(v.split('.')[1] ?? 0) + 1}`);

/** Forme minimale d'un tracker pour contrôler la cohérence (compatible avec `TemplateTracker`). */
export interface TrackerShape {
  key: string; name: string;
  fields: Array<{ key: string; label: string; type: string }>;
  statuses: Array<{ key: string; name: string; category: string }>;
}

/** Incohérences d'un gabarit résolu : phase sans revue, livrable inconnu, règle ou critère sur un tracker ou un état inconnu… */
export function normativeProblems(trackers: TrackerShape[], n: Normative): string[] {
  const out: string[] = [];
  const dup = (what: string, keys: string[]) => { for (const k of new Set(keys.filter((x, i) => keys.indexOf(x) !== i))) out.push(`${what} en double : ${k}`); };
  const reviews = new Set(n.reviews.map((r) => r.key));
  const deliverables = new Set(n.deliverables.map((d) => d.key));
  const categories = new Set(n.criticality?.categories.map((c) => c.key) ?? []);
  const byTracker = new Map(trackers.map((t) => [t.key, t]));
  dup('standard', n.standards.map((s) => s.key)); dup('revue', n.reviews.map((r) => r.key)); dup('phase', n.phases.map((p) => p.key));
  dup('livrable', n.deliverables.map((d) => d.key)); dup('règle', n.rules.map((r) => r.key)); dup('catégorie', n.criticality?.categories.map((c) => c.key) ?? []);
  dup('tracker', trackers.map((t) => t.key));
  const checkCriterion = (where: string, c: Criterion) => {
    if (c.kind !== 'tracker_status') return;
    const t = byTracker.get(c.tracker);
    if (!t) return void out.push(`${where} : tracker inconnu ${c.tracker}`);
    for (const s of c.statuses) if (!t.statuses.some((x) => x.key === s)) out.push(`${where} : état inconnu ${c.tracker}.${s}`);
  };
  for (const p of n.phases) {
    if (!reviews.has(p.review)) out.push(`phase ${p.key} : revue inconnue ou absente (${p.review})`);
    for (const d of p.deliverables) if (!deliverables.has(d)) out.push(`phase ${p.key} : livrable inconnu ${d}`);
    p.entryCriteria.forEach((c) => checkCriterion(`phase ${p.key} (entrée)`, c));
    p.exitCriteria.forEach((c) => checkCriterion(`phase ${p.key} (sortie)`, c));
  }
  for (const d of n.deliverables) for (const c of d.categories ?? []) if (!categories.has(c)) out.push(`livrable ${d.key} : catégorie inconnue ${c}`);
  for (const r of n.rules) {
    const t = byTracker.get(r.fromTracker);
    if (!t) { out.push(`règle ${r.key} : tracker inconnu ${r.fromTracker}`); continue; }
    for (const s of r.statuses) if (!t.statuses.some((x) => x.key === s)) out.push(`règle ${r.key} : état inconnu ${r.fromTracker}.${s}`);
  }
  for (const p of n.parameters) for (const c of Object.keys(p.byCategory)) if (!categories.has(c)) out.push(`paramètre ${p.key} : catégorie inconnue ${c}`);
  return out;
}

/** Chemins de tous les éléments d'un gabarit résolu (base de la liste des éléments obligatoires). */
export function elementPaths(trackers: TrackerShape[], n: Normative): Set<string> {
  const paths = new Set<string>();
  for (const t of trackers) {
    paths.add(`tracker:${t.key}`);
    for (const f of t.fields) paths.add(`field:${t.key}.${f.key}`);
    for (const s of t.statuses) paths.add(`status:${t.key}.${s.key}`);
  }
  n.standards.forEach((x) => paths.add(`standard:${x.key}`));
  n.criticality?.categories.forEach((x) => paths.add(`category:${x.key}`));
  n.reviews.forEach((x) => paths.add(`review:${x.key}`));
  n.phases.forEach((x) => paths.add(`phase:${x.key}`));
  n.deliverables.forEach((x) => paths.add(`deliverable:${x.key}`));
  n.rules.forEach((x) => paths.add(`rule:${x.key}`));
  n.parameters.forEach((x) => paths.add(`parameter:${x.key}`));
  return paths;
}

/** Définition propre d'un gabarit, telle qu'échangée en YAML. */
export interface TemplateDefinition {
  key: string; name: string; description: string;
  parent?: { key: string; version?: string };
  trackers: unknown[]; normative: Normative;
}

export function templateToYaml(def: TemplateDefinition): string {
  return stringify({ athenaTemplate: 1, ...def }, { lineWidth: 0, sortMapEntries: false });
}

export const TemplateYamlSchema = z.object({
  athenaTemplate: z.literal(1),
  key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  parent: z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), version: z.string().regex(VERSION).optional() }).optional(),
  trackers: z.array(z.unknown()).max(30).default([]),
  normative: NormativeSchema.default(emptyNormative()),
});

export function yamlToTemplate(text: string): z.infer<typeof TemplateYamlSchema> {
  let raw: unknown;
  try { raw = parse(text); } catch (e) { throw new Error(`YAML invalide : ${(e as Error).message}`); }
  const result = TemplateYamlSchema.safeParse(raw);
  if (!result.success) throw new Error(`gabarit invalide : ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`);
  return result.data;
}
