import { z } from 'zod';

/** Catégories fixes : c'est sur elles, jamais sur les clés d'états, que le code s'appuie (étude PPM § 2.1 bis). */
export const LIFECYCLE_CATEGORIES = ['pipeline', 'active', 'suspended', 'closed', 'cancelled', 'archived'] as const;
export type LifecycleCategory = (typeof LIFECYCLE_CATEGORIES)[number];
export type LifecycleRole = 'manager' | 'pmo';

export interface LifecycleState { key: string; name: string; category: LifecycleCategory; position: number; hidden: boolean }
export interface LifecycleTransition { from: string; to: string; roles: LifecycleRole[] }
export interface LifecycleConfig { states: LifecycleState[]; transitions: LifecycleTransition[] }

/** État d'un projet qui n'a jamais changé d'état (migration 068). */
export const DEFAULT_LIFECYCLE_STATE = 'in_progress';

const STATES: Array<[string, string, LifecycleCategory]> = [
  ['idea', 'Idée', 'pipeline'], ['proposed', 'Proposé', 'pipeline'], ['evaluation', 'En évaluation', 'pipeline'], ['approved', 'Approuvé', 'pipeline'],
  ['starting', 'En démarrage', 'active'], ['in_progress', 'En cours', 'active'], ['closing', 'En clôture', 'active'],
  ['on_hold', 'Suspendu', 'suspended'], ['awaiting_decision', 'En attente de décision', 'suspended'],
  ['completed', 'Terminé', 'closed'], ['cancelled', 'Annulé', 'cancelled'], ['rejected', 'Refusé', 'cancelled'], ['archived', 'Archivé', 'archived'],
];

/** Les treize états livrés et leurs transitions : le chef conduit les états actifs ; le PMO décide approbation, clôture, annulation et archivage. */
export function defaultLifecycle(): LifecycleConfig {
  const states = STATES.map(([key, name, category], position) => ({ key, name, category, position, hidden: false }));
  const t: LifecycleTransition[] = [];
  const add = (from: string, to: string, roles: LifecycleRole[]) => t.push({ from, to, roles });
  const pipeline = ['idea', 'proposed', 'evaluation', 'approved'];
  pipeline.slice(0, -1).forEach((k, i) => add(k, pipeline[i + 1]!, ['pmo']));
  add('approved', 'starting', ['manager', 'pmo']);
  add('starting', 'in_progress', ['manager', 'pmo']);
  add('in_progress', 'closing', ['manager', 'pmo']);
  add('closing', 'completed', ['pmo']);
  add('completed', 'archived', ['pmo']);
  for (const active of ['starting', 'in_progress', 'closing']) for (const hold of ['on_hold', 'awaiting_decision']) { add(active, hold, ['manager', 'pmo']); add(hold, active, ['manager', 'pmo']); }
  add('on_hold', 'awaiting_decision', ['manager', 'pmo']);
  add('awaiting_decision', 'on_hold', ['manager', 'pmo']);
  for (const k of ['idea', 'proposed', 'evaluation', 'approved', 'starting', 'in_progress', 'closing', 'on_hold', 'awaiting_decision']) add(k, 'cancelled', ['pmo']);
  add('proposed', 'rejected', ['pmo']);
  add('evaluation', 'rejected', ['pmo']);
  return { states, transitions: t };
}

export const LifecycleInput = z.object({
  states: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), name: z.string().trim().min(1).max(60), category: z.enum(LIFECYCLE_CATEGORIES), hidden: z.boolean().default(false),
  })).min(1).max(60),
  transitions: z.array(z.object({ from: z.string(), to: z.string(), roles: z.array(z.enum(['manager', 'pmo'])) })).max(600),
});
export type LifecycleInputData = z.infer<typeof LifecycleInput>;

/** Contrôles de cohérence d'une configuration : retourne la liste des problèmes (vide si valide). */
export function lifecycleProblems(config: LifecycleInputData, usedKeys: string[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const s of config.states) { if (keys.has(s.key)) problems.push(`états : clé en double « ${s.key} »`); keys.add(s.key); }
  for (const c of LIFECYCLE_CATEGORIES) if (!config.states.some((s) => s.category === c)) problems.push(`états : la catégorie « ${c} » doit garder au moins un état`);
  const seen = new Set<string>();
  for (const t of config.transitions) {
    if (!keys.has(t.from) || !keys.has(t.to)) problems.push(`transitions : état inconnu dans « ${t.from} → ${t.to} »`);
    if (t.from === t.to) problems.push(`transitions : « ${t.from} » vers lui-même`);
    const id = `${t.from}>${t.to}`;
    if (seen.has(id)) problems.push(`transitions : « ${t.from} → ${t.to} » en double`);
    seen.add(id);
  }
  for (const k of usedKeys) if (!keys.has(k)) problems.push(`états : « ${k} » est l'état courant d'un projet et ne peut pas disparaître (masquez-le)`);
  return problems;
}
