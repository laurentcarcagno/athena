// Génère les jetons de design Athena depuis design/DESIGN.md (front matter YAML, charte Hemeria).
// Sorties : src/tokens.generated.css et src/tokens.generated.ts. Ne pas modifier à la main.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(root, 'design', 'DESIGN.md'), 'utf8').replace(/\r\n/g, '\n');
const match = /^---\n([\s\S]*?)\n---/.exec(md);
if (!match) throw new Error('Front matter introuvable dans DESIGN.md');
const spec = parse(match[1]);

const css = [];
const out = { colors: {}, spacing: {}, radius: {}, typography: {} };
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

for (const [name, value] of Object.entries(spec.colors ?? {})) {
  out.colors[name] = String(value);
  css.push(`  --ath-color-${name}: ${value};`);
}
for (const [name, value] of Object.entries(spec.spacing ?? {})) {
  out.spacing[name] = String(value);
  css.push(`  --ath-space-${name}: ${value};`);
}
for (const [name, value] of Object.entries(spec.rounded ?? {})) {
  out.radius[name] = String(value);
  css.push(`  --ath-radius-${name}: ${value};`);
}
for (const [style, props] of Object.entries(spec.typography ?? {})) {
  out.typography[style] = {};
  for (const [prop, value] of Object.entries(props)) {
    out.typography[style][prop] = value;
    css.push(`  --ath-type-${style}-${kebab(prop)}: ${value};`);
  }
}
css.push('  --ath-motion-default: 120ms linear;');

// Couche sémantique (DESIGN.json) : une variable par token, pour les deux thèmes. Le thème clair part des primitives, le thème sombre
// de ses valeurs propres ; la réaffectation des primitives en thème sombre (darkPrimitiveMap) est émise avec lui.
const design = JSON.parse(readFileSync(join(root, 'design', 'DESIGN.json'), 'utf8'));
const themes = design.tokens.semantic.themes;
const overlays = design.tokens.primitive.overlays ?? {};
const resolveToken = (value) => {
  const colour = /^\{colors\.([a-z0-9-]+)\}$/.exec(value);
  // Les couleurs du front matter sont des variables ; les variantes dérivées (DESIGN.json seul) sont écrites en clair.
  if (colour) return out.colors[colour[1]] ? `var(--ath-color-${colour[1]})` : design.tokens.primitive.colors[colour[1]].value;
  const overlay = /^\{overlays\.([a-z0-9-]+)\}$/.exec(value);
  if (overlay) return overlays[overlay[1]].value;
  if (/^\{/.test(value)) throw new Error(`Référence sémantique non résolue : ${value}`);
  return value;
};
const semanticVars = (theme) => {
  const lines = [];
  const walk = (node, path) => {
    for (const [key, child] of Object.entries(node)) {
      if (child && typeof child === 'object' && 'value' in child) lines.push(`  --ath-${[...path, key].join('-')}: ${resolveToken(child.value)};`);
      else walk(child, [...path, key]);
    }
  };
  walk(themes[theme], []);
  return lines;
};
const semanticRef = (ref) => {
  const m = /^\{semantic\.([a-z0-9.-]+)\}$/.exec(ref);
  if (!m) throw new Error(`Réaffectation invalide : ${ref}`);
  return `var(--ath-${m[1].replace(/\./g, '-')})`;
};
const darkMap = design.tokens.semantic.darkPrimitiveMap?.map ?? {};
const darkLines = [
  '  color-scheme: dark;',
  ...semanticVars('dark'),
  ...Object.entries(darkMap).map(([primitive, ref]) => `  --ath-color-${primitive}: ${semanticRef(ref)};`),
];
css.push('  color-scheme: light;', ...semanticVars('light'));
const darkBlocks = [
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${darkLines.map((l) => `  ${l}`).join('\n')}\n  }\n}`,
  `:root[data-theme="dark"] {\n${darkLines.join('\n')}\n}`,
].join('\n');

const header = '/* Généré par scripts/build-tokens.mjs depuis design/DESIGN.md et DESIGN.json. Ne pas modifier. */\n';
writeFileSync(join(root, 'src', 'tokens.generated.css'), `${header}:root {\n${css.join('\n')}\n}\n${darkBlocks}\n`);
writeFileSync(
  join(root, 'src', 'tokens.generated.ts'),
  `// Généré par scripts/build-tokens.mjs. Ne pas modifier.\nexport const tokens = ${JSON.stringify(out, null, 2)} as const;\n`,
);
console.log(`tokens: ${Object.keys(out.colors).length} couleurs, ${Object.keys(out.typography).length} styles de texte`);
