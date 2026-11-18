/** Visibilité conditionnelle des champs (plan § 15.2) : copie de `apps/api/src/core/field-visibility.ts`, même règle côté serveur et dans l'interface. */
export interface VisibleWhen { field: string; in: string[] }

export const visibleWhenOf = (config: Record<string, unknown> | undefined | null): VisibleWhen | null => {
  const v = config?.['visibleWhen'] as { field?: unknown; in?: unknown } | undefined;
  return v && typeof v.field === 'string' && Array.isArray(v.in) ? { field: v.field, in: v.in.map(String) } : null;
};

export const isFieldVisible = (field: { config?: Record<string, unknown> | null }, values: Record<string, unknown>): boolean => {
  const when = visibleWhenOf(field.config);
  if (!when) return true;
  const driver = values[when.field];
  const text = Array.isArray(driver) ? driver.map(String) : driver === undefined || driver === null ? [] : [String(driver)];
  return text.some((t) => when.in.includes(t));
};
