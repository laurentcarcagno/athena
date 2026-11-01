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

const header = '/* Généré par scripts/build-tokens.mjs depuis design/DESIGN.md. Ne pas modifier. */\n';
writeFileSync(join(root, 'src', 'tokens.generated.css'), `${header}:root {\n${css.join('\n')}\n}\n`);
writeFileSync(
  join(root, 'src', 'tokens.generated.ts'),
  `// Généré par scripts/build-tokens.mjs. Ne pas modifier.\nexport const tokens = ${JSON.stringify(out, null, 2)} as const;\n`,
);
console.log(`tokens: ${Object.keys(out.colors).length} couleurs, ${Object.keys(out.typography).length} styles de texte`);
