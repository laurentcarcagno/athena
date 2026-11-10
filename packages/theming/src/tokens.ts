/**
 * Jetons au format W3C Design Tokens (DTCG) : un jeton est un objet portant `$value` ; un groupe est un objet dont les clés
 * sans `$` sont des jetons ou des groupes. Une valeur peut citer un autre jeton : `{surface.default}` (alias complet) ou
 * `1px solid {border.default}` (alias inclus dans une chaîne).
 */
export type TokenValue = string | number;
export interface Token { $value: TokenValue; $type?: string; $description?: string }
export interface TokenGroup { [key: string]: Token | TokenGroup | TokenValue | undefined }

/** Un thème : des jetons communs, des surcharges par mode, un parent facultatif dont il hérite. */
export interface Theme {
  name: string;
  label?: string;
  extends?: string;
  tokens?: TokenGroup;
  modes?: Record<string, TokenGroup>;
  meta?: Record<string, unknown>;
}

export class ThemingError extends Error {
  override name = 'ThemingError';
}

const isToken = (node: unknown): node is Token => typeof node === 'object' && node !== null && '$value' in node;

/** Aplatit un groupe : `{ surface: { app: { $value: '#fff' } } }` donne `surface.app → '#fff'`. */
export function flatten(group: TokenGroup | undefined, prefix = '', into = new Map<string, TokenValue>()): Map<string, TokenValue> {
  for (const [key, node] of Object.entries(group ?? {})) {
    if (key.startsWith('$') || node === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isToken(node)) into.set(path, node.$value);
    else if (typeof node === 'object') flatten(node, path, into);
    else throw new ThemingError(`${path} : un jeton s’écrit { "$value": … }`);
  }
  return into;
}

/** Chaîne d'héritage d'un thème, de l'ancêtre au thème lui-même. */
export function lineage(theme: Theme, registry: ReadonlyMap<string, Theme>): Theme[] {
  const chain: Theme[] = [];
  const seen = new Set<string>();
  for (let t: Theme | undefined = theme; t; t = t.extends ? registry.get(t.extends) : undefined) {
    if (seen.has(t.name)) throw new ThemingError(`héritage circulaire : ${[...seen, t.name].join(' → ')}`);
    seen.add(t.name);
    chain.unshift(t);
    if (t.extends && !registry.has(t.extends)) throw new ThemingError(`${t.name} hérite de ${t.extends}, thème inconnu`);
  }
  return chain;
}

/** Jetons bruts d'un thème dans un mode : pour chaque ancêtre, ses jetons communs puis ceux du mode. */
export function layered(theme: Theme, mode: string, registry: ReadonlyMap<string, Theme>): Map<string, TokenValue> {
  const raw = new Map<string, TokenValue>();
  for (const t of lineage(theme, registry)) {
    flatten(t.tokens, '', raw);
    flatten(t.modes?.[mode], '', raw);
  }
  return raw;
}

const REF = /\{([^{}]+)\}/g;

/** Résout tous les alias. Erreur explicite sur un alias inconnu ou circulaire. */
export function resolve(raw: ReadonlyMap<string, TokenValue>): Map<string, TokenValue> {
  const done = new Map<string, TokenValue>();
  const visit = (path: string, stack: string[]): TokenValue => {
    const known = done.get(path);
    if (known !== undefined) return known;
    if (stack.includes(path)) throw new ThemingError(`alias circulaire : ${[...stack, path].join(' → ')}`);
    const value = raw.get(path);
    if (value === undefined) throw new ThemingError(`alias inconnu : {${path}}${stack.length ? ` (cité par ${stack.at(-1)})` : ''}`);
    let out: TokenValue = value;
    if (typeof value === 'string') {
      const whole = /^\{([^{}]+)\}$/.exec(value);
      out = whole ? visit(whole[1]!, [...stack, path]) : value.replace(REF, (_, ref: string) => String(visit(ref, [...stack, path])));
    }
    done.set(path, out);
    return out;
  };
  for (const path of raw.keys()) visit(path, []);
  return done;
}

/** Jetons résolus d'un thème dans un mode. */
export function resolveTheme(theme: Theme, mode: string, registry: ReadonlyMap<string, Theme>): Map<string, TokenValue> {
  return resolve(layered(theme, mode, registry));
}

export const registryOf = (themes: readonly Theme[]): Map<string, Theme> => {
  const registry = new Map<string, Theme>();
  for (const t of themes) {
    if (registry.has(t.name)) throw new ThemingError(`thème déclaré deux fois : ${t.name}`);
    registry.set(t.name, t);
  }
  return registry;
};
