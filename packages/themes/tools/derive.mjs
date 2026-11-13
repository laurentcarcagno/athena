// Dérive un thème complet (contrat d'Athena) depuis une palette communautaire (ADR-0004, T-0136).
// Les teintes de la palette sont conservées ; la clarté des rôles de texte, d'action et d'état est ajustée jusqu'au seuil
// de contraste du contrat (4,5 pour le texte, 3 pour les contours et repères). Usage : node tools/derive.mjs <palette.json>…
// Chaque palette produit <dossier>/theme.json à côté d'elle ; relancer après modification d'une palette.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast } from '@nuance/theming';

const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Mélange de `a` (part `p`) et `b`. */
const mix = (a, b, p) => hex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
/** Rapproche `fg` du noir ou du blanc (le plus contrasté avec `bg`) jusqu'au seuil. */
function ensure(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg;
  const toward = contrast('#000000', bg) > contrast('#FFFFFF', bg) ? '#000000' : '#FFFFFF';
  for (let p = 0.96; p >= 0; p -= 0.02) {
    const candidate = mix(fg, toward, p);
    if (contrast(candidate, bg) >= min) return candidate;
  }
  return toward;
}
/** Fond d'action : le plus proche de la teinte qui porte son texte (clair ou sombre) à 4,5. */
function actionPair(color, light, dark, min = 4.5) {
  const fg = contrast(light, color) >= contrast(dark, color) ? light : dark;
  return { bg: ensure(color, fg, min), fg };
}
const tok = (v) => ({ $value: v });
const group = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' ? group(v) : tok(v)]));

/** Teintes de référence des statuts (T-0138), claires et sombres ; un thème peut les remplacer (palette.json → hues). */
export const HUE_BASE = {
  light: { gray: '#6B7280', slate: '#64748B', blue: '#2563EB', sky: '#0284C7', teal: '#0D9488', green: '#16A34A', lime: '#65A30D', yellow: '#CA8A04', orange: '#EA580C', red: '#DC2626', pink: '#DB2777', purple: '#9333EA' },
  dark: { gray: '#9CA3AF', slate: '#94A3B8', blue: '#60A5FA', sky: '#38BDF8', teal: '#2DD4BF', green: '#4ADE80', lime: '#A3E635', yellow: '#FACC15', orange: '#FB923C', red: '#F87171', pink: '#F472B6', purple: '#C084FC' },
};
/** Palette de données (T-0139) : huit séries distinctes, prises parmi les teintes (bordure ≥ 3:1 sur la carte), jamais l'action ni un signal. */
export const DATA_SERIES = ['blue', 'orange', 'teal', 'purple', 'pink', 'lime', 'sky', 'yellow'];
export const dataOf = (hueSet) => Object.fromEntries(DATA_SERIES.map((name, i) => [String(i + 1), hueSet[name].border]));
/** Surface des couches flottantes (menus, panneaux) : la carte en clair, un cran plus claire en sombre. */
export const raisedOf = (surface, text, dark) => (dark ? mix(text, surface, 0.07) : surface);

/** Fond, texte et bordure de chaque teinte sur la surface d'un mode : texte ≥ seuil sur son fond et sur la carte, bordure ≥ 3. */
export function hues(surface, dark, overrides = {}, min = 4.5) {
  const base = { ...HUE_BASE[dark ? 'dark' : 'light'], ...overrides };
  return Object.fromEntries(Object.entries(base).map(([name, hue]) => {
    const bg = mix(hue, surface, dark ? 0.24 : 0.14);
    return [name, { bg, fg: ensure(ensure(hue, bg, min), surface, min), border: ensure(hue, surface, 3) }];
  }));
}

function mode(p) {
  const s = p.surface;
  const T = p.aaa ? 7 : 4.5; // seuil du texte : AAA pour le thème Contraste élevé
  // Lisibles sur toutes les surfaces où ils se posent (carte, page, ligne survolée ou sélectionnée).
  const over = (color, min) => [s, p.app, p.hover, p.selected, p.muted].reduce((c, bg) => ensure(c, bg, min), color);
  const ink = over(p.text, T);
  const heading = over(p.heading ?? p.text, T);
  const secondary = over(p.subtext, T);
  const mute = over(p.mute, T);
  const link = over(p.accent, T);
  const control = ensure(p.control ?? p.mute, s, 3);
  // Repère d'accent : lisible sur toutes les surfaces où il se pose (carte, page, en-tête de tableau, sélection).
  const focus = [s, p.app, p.muted, p.selected].reduce((c, bg) => ensure(c, bg, 3), p.accent);
  const primary = actionPair(p.accent, p.onDark, p.onLight, T);
  const deep = actionPair(p.deep, p.onDark, p.onLight, T);
  const state = (hue) => {
    const bg = mix(hue, s, p.dark ? 0.22 : 0.14);
    const fg = ensure(ensure(hue, bg, T), s, T);
    return { bg, fg, 'fg-aa': fg, border: ensure(hue, s, 3) };
  };
  const inverseText = ensure(p.onInverse, p.inverse, 7);
  const hueSet = hues(s, p.dark, p.hues, T);
  return {
    surface: { app: p.app, default: s, raised: raisedOf(s, p.text, p.dark), hover: p.hover, muted: p.muted, selected: p.selected, inverse: p.inverse, scrim: p.dark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)' },
    text: { default: ink, secondary, mute, 'mute-aa': mute, 'on-inverse': inverseText, 'on-action': primary.fg, link, 'link-aa': link, heading },
    border: { default: p.line, strong: ensure(p.strong ?? p.subtext, s, 3), focus, danger: ensure(p.danger, s, 3), control },
    action: {
      primary: primary,
      deep: deep,
      ghost: { bg: 'transparent', fg: ensure(p.heading ?? p.text, s, T), border: ensure(p.heading ?? p.text, s, 3) },
      danger: { bg: 'transparent', fg: ensure(p.danger, s, T), border: ensure(p.danger, s, 3) },
    },
    state: { success: state(p.success), warning: state(p.warning), danger: state(p.danger), info: state(p.accent), merged: state(p.merged ?? p.hues?.purple ?? p.accent), draft: state(p.draft ?? p.mute), neutral: { bg: s, fg: secondary, 'fg-aa': secondary, border: control } },
    focus: { ring: focus, 'ring-on-inverse': ensure(p.onInverse, p.inverse, 3) },
    hue: hueSet,
    data: dataOf(hueSet),
    inverse: {
      selected: `rgba(${rgb(focus).join(', ')}, 0.22)`,
      'text-secondary': ensure(mix(inverseText, p.inverse, 0.75), p.inverse, T),
      'text-nav': ensure(mix(inverseText, p.inverse, 0.7), p.inverse, T),
      'text-mute': ensure(mix(inverseText, p.inverse, 0.65), p.inverse, T),
    },
  };
}

// Lancé directement : écrit les thèmes ; importé (hues.mjs) : fournit seulement les fonctions.
const direct = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
for (const file of direct ? process.argv.slice(2) : []) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const theme = {
    $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
    name: spec.name,
    label: spec.label,
    extends: 'base',
    meta: { description: spec.description, source: spec.source, license: spec.license, derivedBy: 'packages/themes/tools/derive.mjs', ...(spec.aaa ? { aaa: true } : {}) },
    tokens: {
      palette: group(spec.palette),
      brand: group({ primary: spec.brand.primary, accent: spec.brand.accent }),
      radius: group(spec.radius),
      elevation: group(spec.elevation),
    },
    modes: { light: group(mode({ ...spec.modes.light, dark: false, aaa: spec.aaa })), dark: group(mode({ ...spec.modes.dark, dark: true, aaa: spec.aaa })) },
  };
  writeFileSync(join(dirname(file), 'theme.json'), `${JSON.stringify(theme, null, 2)}\n`);
  console.log(`${spec.name} : theme.json écrit`);
}
