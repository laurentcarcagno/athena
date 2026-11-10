import { composite, contrast, parseColor } from './color.js';
import { registryOf, resolveTheme, ThemingError, type Theme, type TokenValue } from './tokens.js';

/**
 * Contrat d'un produit : les modes qu'un thème doit fournir, les jetons qu'il doit définir dans chacun,
 * et les paires de contraste qu'il doit tenir (seuils WCAG : 4,5 texte, 3 objets graphiques et grand texte, 7 pour AAA).
 */
export interface Contract {
  modes: string[];
  defaultMode: string;
  required: string[];
  /** `over` : surface opaque sous un fond translucide (le fond y est composé avant le calcul). */
  contrast: Array<{ fg: string; bg: string; over?: string; min: number; label?: string }>;
}

export interface Issue {
  theme: string;
  mode?: string;
  kind: 'missing' | 'contrast' | 'error';
  message: string;
}

/** Vérifie chaque thème dans chaque mode du contrat. Une liste vide signifie : tous conformes. */
export function check(themes: readonly Theme[], contract: Contract, only?: readonly string[]): Issue[] {
  const issues: Issue[] = [];
  let registry: Map<string, Theme>;
  try {
    registry = registryOf(themes);
  } catch (e) {
    return [{ theme: '*', kind: 'error', message: (e as Error).message }];
  }
  for (const theme of themes) {
    if (only && !only.includes(theme.name)) continue;
    for (const mode of contract.modes) {
      let tokens: Map<string, TokenValue>;
      try {
        tokens = resolveTheme(theme, mode, registry);
      } catch (e) {
        if (!(e instanceof ThemingError)) throw e;
        issues.push({ theme: theme.name, mode, kind: 'error', message: e.message });
        continue;
      }
      for (const path of contract.required) {
        if (!tokens.has(path)) issues.push({ theme: theme.name, mode, kind: 'missing', message: `jeton obligatoire absent : ${path}` });
      }
      for (const pair of contract.contrast) {
        const fg = tokens.get(pair.fg);
        const bg = tokens.get(pair.bg);
        const under = pair.over === undefined ? undefined : tokens.get(pair.over);
        if (fg === undefined || bg === undefined || (pair.over !== undefined && under === undefined)) continue; // déjà signalé si obligatoire
        try {
          const ground = under === undefined ? String(bg) : rgb(composite(parseColor(String(bg)), parseColor(String(under))));
          const ratio = contrast(String(fg), ground);
          if (ratio < pair.min) {
            issues.push({ theme: theme.name, mode, kind: 'contrast', message: `${pair.label ?? `${pair.fg} sur ${pair.bg}`} : ${ratio.toFixed(2)}:1, seuil ${pair.min}:1 (${fg} sur ${bg})` });
          }
        } catch (e) {
          if (!(e instanceof ThemingError)) throw e;
          issues.push({ theme: theme.name, mode, kind: 'error', message: `${pair.fg} / ${pair.bg} : ${e.message}` });
        }
      }
    }
  }
  return issues;
}

const rgb = ({ r, g, b }: { r: number; g: number; b: number }): string => `rgb(${r}, ${g}, ${b})`;

export const formatIssues = (issues: readonly Issue[]): string =>
  issues.map((i) => `${i.theme}${i.mode ? ` (${i.mode})` : ''} : ${i.message}`).join('\n');
