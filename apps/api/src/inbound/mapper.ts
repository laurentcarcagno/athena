import { z } from 'zod';

/**
 * Mappage déclaratif d'une charge utile externe vers une commande Athena. Aucune exécution de code :
 * - `"$.a.b[0]"` extrait une valeur (typée) ;
 * - `"Texte {{$.a.b}}"` interpole des valeurs dans une chaîne ;
 * - `{ "from": "$.p", "map": { "a": "b" }, "default": "x" }` traduit une valeur.
 */
export type ValueSpec = string | number | boolean | { from: string; map?: Record<string, string>; default?: string };

export const MappingSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), tracker: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), values: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.object({ from: z.string(), map: z.record(z.string(), z.string()).optional(), default: z.string().optional() })])), idempotencyKey: z.string().optional() }),
  z.object({ action: z.literal('comment'), key: z.string(), body: z.string().max(5000), idempotencyKey: z.string().optional() }),
  z.object({ action: z.literal('transition'), key: z.string(), name: z.string().max(200), idempotencyKey: z.string().optional() }),
  z.object({ action: z.literal('update'), key: z.string(), values: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.object({ from: z.string(), map: z.record(z.string(), z.string()).optional(), default: z.string().optional() })])), idempotencyKey: z.string().optional() }),
]);
export type Mapping = z.infer<typeof MappingSchema>;

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 12;

/** Évalue un chemin `$.a.b[0].c` ; `undefined` si absent. Aucune propriété héritée ou dangereuse n'est lue. */
export function pointer(payload: unknown, path: string): unknown {
  if (!/^\$(\.[A-Za-z_][A-Za-z0-9_-]*|\[\d{1,4}\]){0,12}$/.test(path)) throw new Error(`chemin invalide : ${path}`);
  let current: unknown = payload;
  const parts = path.slice(1).match(/\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\]/g) ?? [];
  if (parts.length > MAX_DEPTH) throw new Error('chemin trop profond');
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    if (part.startsWith('[')) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(part.slice(1, -1))];
    } else {
      const key = part.slice(1);
      if (FORBIDDEN.has(key) || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current;
}

const scalar = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '');

export function render(template: string, payload: unknown): string {
  return template.replace(/\{\{\s*(\$[^}\s]*)\s*\}\}/g, (_m, path: string) => scalar(pointer(payload, path))).slice(0, 5000);
}

export function resolveValue(spec: ValueSpec, payload: unknown): unknown {
  if (typeof spec === 'number' || typeof spec === 'boolean') return spec;
  if (typeof spec === 'string') {
    if (/^\$[^{}\s]*$/.test(spec)) return pointer(payload, spec);
    return render(spec, payload);
  }
  const raw = pointer(payload, spec.from);
  const key = scalar(raw);
  if (spec.map && key in spec.map && Object.prototype.hasOwnProperty.call(spec.map, key)) return spec.map[key];
  return spec.default ?? (raw === undefined ? undefined : raw);
}

export function resolveValues(specs: Record<string, ValueSpec>, payload: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, spec] of Object.entries(specs)) {
    const value = resolveValue(spec, payload);
    if (value !== undefined && value !== '') out[field] = value;
  }
  return out;
}
