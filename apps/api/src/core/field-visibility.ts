/**
 * Visibilité conditionnelle d'un champ (plan § 15.2) : `config.visibleWhen = { field, in: [valeurs] }` rend le champ visible seulement si la valeur du champ
 * `field` du même ticket est l'une des valeurs listées. Un champ masqué n'est jamais obligatoire. Une seule profondeur : le champ pilote ne peut pas être lui-même conditionnel.
 * La même règle est évaluée côté serveur (obligation) et dans l'interface (affichage) : `apps/web/src/lib/visibility.ts` en est la copie.
 */
export interface VisibleWhen { field: string; in: string[] }

export const visibleWhenOf = (config: Record<string, unknown> | undefined | null): VisibleWhen | null => {
  const v = config?.['visibleWhen'] as { field?: unknown; in?: unknown } | undefined;
  return v && typeof v.field === 'string' && Array.isArray(v.in) ? { field: v.field, in: v.in.map(String) } : null;
};

/** Vrai si le champ est visible pour ces valeurs (sans condition : toujours visible). */
export const isFieldVisible = (field: { config?: Record<string, unknown> | null }, values: Record<string, unknown>): boolean => {
  const when = visibleWhenOf(field.config);
  if (!when) return true;
  const driver = values[when.field];
  const text = Array.isArray(driver) ? driver.map(String) : driver === undefined || driver === null ? [] : [String(driver)];
  return text.some((t) => when.in.includes(t));
};

/** Contrôle à la création du champ : le champ pilote existe, n'est pas le champ lui-même, n'est pas conditionnel, et la liste de valeurs n'est pas vide. Retourne les problèmes. */
export function checkVisibleWhen(newKey: string, config: Record<string, unknown> | undefined, existing: Array<{ key: string; config?: Record<string, unknown> | null }>): string[] {
  const raw = config?.['visibleWhen'];
  if (raw === undefined) return [];
  const when = visibleWhenOf(config);
  if (!when) return ['visibleWhen : forme attendue { field, in: [valeurs] }'];
  const problems: string[] = [];
  if (when.in.length === 0 || when.in.length > 50) problems.push('visibleWhen.in : de 1 à 50 valeurs');
  if (when.field === newKey) problems.push('visibleWhen : un champ ne peut pas dépendre de lui-même');
  const driver = existing.find((f) => f.key === when.field);
  if (!driver) problems.push(`visibleWhen : le champ ${when.field} n'existe pas dans ce tracker`);
  else if (visibleWhenOf(driver.config)) problems.push(`visibleWhen : ${when.field} est lui-même conditionnel (une seule profondeur)`);
  return problems;
}
