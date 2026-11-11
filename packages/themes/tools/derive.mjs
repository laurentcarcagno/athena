// Dérive un thème complet (contrat d'Athena) depuis une palette communautaire (ADR-0004, T-0136).
// Les teintes de la palette sont conservées ; la clarté des rôles de texte, d'action et d'état est ajustée jusqu'au seuil
// de contraste du contrat (4,5 pour le texte, 3 pour les contours et repères). Usage : node tools/derive.mjs <palette.json>…
// Chaque palette produit <dossier>/theme.json à côté d'elle ; relancer après modification d'une palette.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

function mode(p) {
  const s = p.surface;
  const T = p.aaa ? 7 : 4.5; // seuil du texte : AAA pour le thème Contraste élevé
  const ink = ensure(p.text, s, p.aaa ? 7 : 4.5);
  const secondary = ensure(p.subtext, s, p.aaa ? 7 : 4.5);
  const mute = ensure(p.mute, p.app, p.aaa ? 7 : 4.5);
  const link = ensure(ensure(p.accent, s, T), p.app, T);
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
  return {
    surface: { app: p.app, default: s, hover: p.hover, muted: p.muted, selected: p.selected, inverse: p.inverse, scrim: p.dark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)' },
    text: { default: ink, secondary, mute, 'mute-aa': mute, 'on-inverse': inverseText, 'on-action': primary.fg, link, 'link-aa': link, heading: ensure(p.heading ?? p.text, p.app, p.aaa ? 7 : 4.5) },
    border: { default: p.line, strong: ensure(p.strong ?? p.subtext, s, 3), focus, danger: ensure(p.danger, s, 3), control },
    action: {
      primary: primary,
      deep: deep,
      ghost: { bg: 'transparent', fg: ensure(p.heading ?? p.text, s, T), border: ensure(p.heading ?? p.text, s, 3) },
      danger: { bg: 'transparent', fg: ensure(p.danger, s, T), border: ensure(p.danger, s, 3) },
    },
    state: { success: state(p.success), warning: state(p.warning), danger: state(p.danger), info: state(p.accent), neutral: { bg: s, fg: secondary, 'fg-aa': secondary, border: control } },
    focus: { ring: focus, 'ring-on-inverse': ensure(p.onInverse, p.inverse, 3) },
    inverse: {
      selected: `rgba(${rgb(focus).join(', ')}, 0.22)`,
      'text-secondary': ensure(mix(inverseText, p.inverse, 0.75), p.inverse, T),
      'text-nav': ensure(mix(inverseText, p.inverse, 0.7), p.inverse, T),
      'text-mute': ensure(mix(inverseText, p.inverse, 0.65), p.inverse, T),
    },
  };
}

for (const file of process.argv.slice(2)) {
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
