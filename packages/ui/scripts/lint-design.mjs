// Lint de conformité Hemeria (plan § 9.2). Interdit : border-radius non nul, box-shadow,
// dégradés, backdrop-filter, couleurs hors palette. Usage : node lint-design.mjs <dossier...>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Palette = couleurs du front matter de DESIGN.md uniquement : écrire un # dans la prose ne l'autorise pas.
const designMd = readFileSync(join(here, '..', 'design', 'DESIGN.md'), 'utf8').replace(/\r\n/g, '\n');
const frontMatter = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? '';
export const palette = new Set(
  [...frontMatter.matchAll(/#[0-9A-Fa-f]{6}\b/g)]
    .map((m) => m[0].toLowerCase())
    .concat(['#ffffff', '#000000']),
);
const RULES = [
  { re: /border-radius\s*:\s*(?=[^;}\s])(?!0(?:px|rem|em)?\s*(?:;|}|$))(?!var\(--ath-radius-none\))[^;}]+/i, msg: 'border-radius non nul interdit' },
  { re: /box-shadow\s*:\s*(?!none\b)[^;}]+/i, msg: 'box-shadow interdit' },
  { re: /(linear|radial|conic)-gradient\s*\(/i, msg: 'dégradé interdit' },
  { re: /backdrop-filter\s*:/i, msg: 'backdrop-filter interdit' },
];

// Feuilles de style (ADR-0004) : un composant ne lit jamais une primitive de thème et n'écrit aucune couleur ; tout passe par les jetons.
const CSS_RULES = [
  { re: /--ath-(color|palette)-[a-z]/, msg: 'primitive de thème lue par un composant (jeton sémantique ou de composant attendu)' },
  { re: /\brgba?\(|\bhsla?\(|color-mix\(/i, msg: 'couleur calculée en dur (jeton attendu)' },
  { re: /#[0-9A-Fa-f]{3,8}\b/, msg: 'couleur hexadécimale en dur (jeton attendu)' },
];

export function lintSource(text, file = '<source>') {
  const problems = [];
  const css = file.endsWith('.css');
  text.split('\n').forEach((line, i) => {
    if (/design-lint-ignore/.test(line)) return;
    for (const { re, msg } of RULES) if (re.test(line)) problems.push(`${file}:${i + 1}: ${msg}`);
    const code = line.replace(/\/\*.*?\*\//g, '');
    if (css) for (const { re, msg } of CSS_RULES) if (re.test(code)) problems.push(`${file}:${i + 1}: ${msg}`);
    for (const m of line.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
      if (!palette.has(m[0].toLowerCase())) problems.push(`${file}:${i + 1}: couleur hors palette ${m[0]}`);
    }
  });
  return problems;
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n === 'dist') return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exts = new Set([".css", ".ts", ".tsx"]);
  const problems = process.argv.slice(2).flatMap((d) =>
    walk(d)
      .filter((f) => exts.has(extname(f)) && !/\.test\.tsx?$/.test(f) && !f.includes('.generated.'))
      .flatMap((f) => lintSource(readFileSync(f, 'utf8'), f)),
  );
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log('lint-design : OK');
}
