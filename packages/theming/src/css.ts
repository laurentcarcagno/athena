import type { Contract } from './check.js';
import { registryOf, resolveTheme, type Theme, type TokenValue } from './tokens.js';

export interface CssOptions {
  /** Préfixe des variables : `ath-` donne `--ath-surface-app` pour le jeton `surface.app`. */
  prefix?: string;
  /** Thème appliqué quand l'élément racine n'a pas d'attribut de thème. */
  defaultTheme?: string;
  /** Attributs posés sur l'élément racine (par défaut `data-theme` et `data-mode`). */
  themeAttribute?: string;
  modeAttribute?: string;
  /** Thèmes à émettre (par défaut : tous ceux qui ne sont pas abstraits, `meta.abstract`). */
  only?: readonly string[];
}

/** Modes que le système d'exploitation sait demander (`prefers-color-scheme`). */
const SCHEMES = new Set(['light', 'dark']);

const indent = (text: string): string => text.split('\n').map((line) => `  ${line}`).join('\n');

export const variableName =(path: string, prefix = ''): string => `--${prefix}${path.replace(/\./g, '-')}`;

const block = (selector: string, vars: ReadonlyMap<string, TokenValue>, prefix: string, scheme?: string): string => {
  const lines = [...vars.keys()].sort().map((path) => `  ${variableName(path, prefix)}: ${vars.get(path)};`);
  if (scheme) lines.unshift(`  color-scheme: ${scheme};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
};

/**
 * CSS des thèmes : un bloc par thème pour le mode par défaut (toutes les variables), puis, pour chaque autre mode,
 * les seules variables qui changent, sous `[data-mode="<mode>"]` et, pour `dark`/`light`, sous la préférence système
 * quand aucun mode n'est imposé. Sortie déterministe (variables triées).
 */
export function emitCss(themes: readonly Theme[], contract: Pick<Contract, 'modes' | 'defaultMode'>, options: CssOptions = {}): string {
  const { prefix = '', defaultTheme, themeAttribute = 'data-theme', modeAttribute = 'data-mode' } = options;
  const registry = registryOf(themes);
  const emitted = themes.filter((t) => (options.only ? options.only.includes(t.name) : t.meta?.['abstract'] !== true));
  const out: string[] = [`/* Généré par @nuance/theming. Ne pas modifier. */`];
  for (const theme of emitted) {
    const root = [`:root[${themeAttribute}="${theme.name}"]`, ...(theme.name === defaultTheme ? [`:root:not([${themeAttribute}])`] : [])];
    const base = resolveTheme(theme, contract.defaultMode, registry);
    const baseScheme = SCHEMES.has(contract.defaultMode) ? contract.defaultMode : undefined;
    out.push(block(root.join(',\n'), base, prefix, baseScheme));
    for (const mode of contract.modes) {
      if (mode === contract.defaultMode) continue;
      const tokens = resolveTheme(theme, mode, registry);
      const changed = new Map([...tokens].filter(([path, value]) => base.get(path) !== value));
      const scheme = SCHEMES.has(mode) ? mode : undefined;
      if (scheme) {
        // Sans mode imposé, la préférence du système choisit ; un mode imposé (même celui par défaut) l'emporte.
        const system = block(root.map((s) => `${s}:not([${modeAttribute}])`).join(',\n'), changed, prefix, scheme);
        out.push(`@media (prefers-color-scheme: ${scheme}) {\n${indent(system)}\n}`);
      }
      out.push(block(root.map((s) => `${s}[${modeAttribute}="${mode}"]`).join(',\n'), changed, prefix, scheme));
    }
  }
  return `${out.join('\n\n')}\n`;
}
