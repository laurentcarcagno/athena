import { TemplateTrackerSchema, type TemplateTracker } from '../template-tracker';
import { NormativeSchema, type Normative } from '../normative-template';
import { normativeClauseTracker } from '../templates';

/** Gabarit normatif livré : une suite de versions publiées, chacune autonome (trackers + modèle normatif). */
export interface BuiltinVersion { version: string; trackers: TemplateTracker[]; normative: Normative }
export interface BuiltinNormative { key: string; name: string; description: string; versions: BuiltinVersion[] }

type FieldIn = { key: string; label: string; type: string; required?: boolean; config?: Record<string, unknown>; semanticRole?: 'title' | 'description' | 'status' | 'assignee' | 'due_date' | 'estimate'; isContent?: boolean };
export const title: FieldIn = { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' };
export const description = (label = 'Description', key = 'description'): FieldIn => ({ key, label, type: 'richtext', semanticRole: 'description' });
export const select = (key: string, label: string, options: string[], extra: Partial<FieldIn> = {}): FieldIn => ({ key, label, type: 'select', config: { options }, ...extra });
export const text = (key: string, label: string, extra: Partial<FieldIn> = {}): FieldIn => ({ key, label, type: 'text', ...extra });
export const assignee: FieldIn = { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee', isContent: false };

type Cat = 'todo' | 'in_progress' | 'done';
export const statuses = (...s: Array<[string, string, Cat]>) => s.map(([key, name, category]) => ({ key, name, category }));
/** Transitions en chaîne (chaque état vers le suivant) plus « Rouvrir » depuis n'importe quel état vers le premier. */
export const chain = (keys: string[], names: string[], reopen = 'Rouvrir') => [
  ...keys.slice(1).map((to, i) => ({ name: names[i]!, from: keys[i]!, to })),
  { name: reopen, from: null, to: keys[0]! },
];

export function tracker(key: string, name: string, typeKey: string | null, fields: FieldIn[], st: ReturnType<typeof statuses>, transitions: ReturnType<typeof chain>, descr = ''): TemplateTracker {
  return TemplateTrackerSchema.parse({ key, name, ...(typeKey ? { typeKey } : {}), ...(descr ? { description: descr } : {}), fields, statuses: st, transitions });
}

/** Tracker « Exigences normatives » commun aux deux gabarits. */
export const clauseTracker = (): TemplateTracker => {
  const { projectKey: _p, ...rest } = normativeClauseTracker('');
  return TemplateTrackerSchema.parse(rest);
};

export const parseNormative = (n: unknown): Normative => NormativeSchema.parse(n);

/** Valeurs des seuils chiffrés : laissées vides, à fixer par le responsable méthodes (aucune valeur imposée). */
export const emptyThresholds = (categories: string[]) => Object.fromEntries(categories.map((c) => [c, null]));
