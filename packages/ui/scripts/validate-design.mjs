#!/usr/bin/env node
// Valide DESIGN.md et DESIGN.json et les garde synchronisés. Sans dépendance (Node 18+).
//   node scripts/validate-design.mjs                       contrôle
//   node scripts/validate-design.mjs --strict              refuse tout écart de contraste « known-issue »
//   node scripts/validate-design.mjs --write               régénère le registre des tokens de DESIGN.md
//   node scripts/validate-design.mjs --contrast "#fg" "#bg" ratio et niveau WCAG de deux couleurs
//   node scripts/validate-design.mjs --dir <dossier>       dossier contenant DESIGN.md et DESIGN.json (défaut : racine du dépôt ou design/)
//   node scripts/validate-design.mjs --check-css <f.css>   toute couleur hexadécimale du CSS consommateur doit être dans la palette (répétable)
//   node scripts/validate-design.mjs --same-as <dossier>   les fichiers de la charte sont identiques à ceux de l'autre dépôt (copie synchronisée)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));

// --- Contraste (WCAG 2.x) ------------------------------------------------------------------------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
const isHex = (s) => /^#[0-9A-Fa-f]{6}$/.test(s);

if (args[0] === '--contrast') {
  const [fg, bg] = args.slice(1);
  if (!isHex(fg ?? '') || !isHex(bg ?? '')) { console.error('usage : --contrast "#RRGGBB" "#RRGGBB"'); process.exit(2); }
  const r = ratio(fg, bg);
  console.log(`${fg} sur ${bg} : ${r}:1 — texte normal ${r >= 4.5 ? 'AA' : 'échec'}${r >= 7 ? ' (AAA)' : ''}, grand texte et éléments non textuels ${r >= 3 ? 'AA' : 'échec'}`);
  process.exit(0);
}

// --- Fichiers ---------------------------------------------------------------------------------------
const dirArg = args.includes('--dir') ? resolve(args[args.indexOf('--dir') + 1]) : null;
const candidates = [dirArg, join(here, '..'), join(here, '..', 'design')].filter(Boolean);
const dir = candidates.find((d) => existsSync(join(d, 'DESIGN.md')) && existsSync(join(d, 'DESIGN.json')));
if (!dir) { console.error('DESIGN.md et DESIGN.json introuvables'); process.exit(2); }
const mdPath = join(dir, 'DESIGN.md');
const errors = [];
const fail = (m) => errors.push(m);

const mdRaw = readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');
let json;
try { json = JSON.parse(readFileSync(join(dir, 'DESIGN.json'), 'utf8')); } catch (e) { console.error(`DESIGN.json invalide : ${e.message}`); process.exit(1); }

// Lecteur YAML minimal : cartes imbriquées à 2 espaces et scalaires, ce qu'utilise le front matter.
function parseFrontMatter(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`ligne de front matter illisible : ${line}`);
    const indent = m[1].length;
    while (stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    let value = m[3];
    if (value === '') { parent[m[2]] = {}; stack.push({ indent, node: parent[m[2]] }); continue; }
    if (/^".*"$/.test(value)) value = value.slice(1, -1);
    parent[m[2]] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return root;
}
const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(mdRaw);
if (!fmMatch) { console.error('front matter introuvable dans DESIGN.md'); process.exit(1); }
let fm;
try { fm = parseFrontMatter(fmMatch[1]); } catch (e) { console.error(e.message); process.exit(1); }
let body = mdRaw.slice(fmMatch[0].length);

// --- Index des tokens -----------------------------------------------------------------------------
const index = new Map(); // chemin -> { value, status, kind }
const add = (path, info) => index.set(path, info);
const walk = (node, path, cb) => {
  if (node && typeof node === 'object' && !Array.isArray(node) && !('value' in node && 'status' in node)) {
    cb(path, node, false);
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, cb);
  } else cb(path, node, true);
};

for (const ns of ['colors', 'typography', 'rounded', 'spacing', 'components']) {
  for (const [k, v] of Object.entries(fm[ns] ?? {})) {
    add(`${ns}.${k}`, { value: typeof v === 'object' ? '—' : String(v), status: 'stable', group: ns, leaf: typeof v !== 'object' });
    if (typeof v === 'object') for (const [pk, pv] of Object.entries(v)) add(`${ns}.${k}.${pk}`, { value: String(pv), status: 'stable', group: ns, leaf: false });
  }
}
const tokens = json.tokens ?? {};
for (const [ns, group] of Object.entries(tokens.primitive ?? {})) {
  for (const [k, v] of Object.entries(group)) add(`${ns}.${k}`, { value: String(v.value), status: v.status, group: ns, leaf: true, replacement: v.replacement });
}
const themes = tokens.semantic?.themes ?? {};
for (const [name, tree] of Object.entries(themes)) {
  walk(tree, 'semantic', (path, node, leaf) => { if (name === 'light') add(path, { value: leaf ? String(node.value) : '—', status: leaf ? node.status : 'stable', group: 'semantic', leaf }); });
}
for (const [k, v] of Object.entries(tokens.states ?? {})) add(`states.${k}`, { value: '—', status: v.status, group: 'states', leaf: true });
for (const [k, v] of Object.entries(tokens.density ?? {})) if (typeof v === 'object') add(`density.${k}`, { value: `${v.controlHeight}`, status: v.status, group: 'density', leaf: true });
walk(tokens.component ?? {}, 'component', (path, node) => {
  if (path === 'component') return;
  add(path, { value: '—', status: node && typeof node === 'object' && node.status ? node.status : 'stable', group: 'component', leaf: Boolean(node && node.status) });
});

// --- 1. cohérence interne du JSON ---------------------------------------------------------------------
const keysOf = (tree, prefix = '') => Object.entries(tree).flatMap(([k, v]) => (v && typeof v === 'object' && !('value' in v && 'status' in v) ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
if (themes.light && themes.dark) {
  const a = new Set(keysOf(themes.light));
  const b = new Set(keysOf(themes.dark));
  for (const k of a) if (!b.has(k)) fail(`thème sombre : clé sémantique manquante ${k}`);
  for (const k of b) if (!a.has(k)) fail(`thème clair : clé sémantique manquante ${k}`);
}
for (const [k, hex] of Object.entries(fm.colors ?? {})) {
  const p = tokens.primitive?.colors?.[k];
  if (!p) fail(`couleur du front matter absente du JSON : ${k}`);
  else if (String(p.value).toUpperCase() !== String(hex).toUpperCase()) fail(`couleur ${k} : front matter ${hex} ≠ JSON ${p.value}`);
}
for (const k of Object.keys(tokens.primitive?.colors ?? {})) {
  if (!(k in (fm.colors ?? {})) && tokens.primitive.colors[k].status === 'stable') fail(`couleur ${k} : statut stable mais absente du front matter`);
}
for (const c of json.components ?? []) if (c.refersTo && !index.has(`components.${c.refersTo}`)) fail(`composant « ${c.name} » : refersTo ${c.refersTo} absent du front matter`);
for (const [path, info] of index) {
  if (info.status && !['stable', 'proposed', 'deprecated'].includes(info.status)) fail(`${path} : statut inconnu ${info.status}`);
  if (info.status === 'deprecated' && !info.replacement && info.group !== 'components') fail(`${path} : déprécié sans replacement`);
}

// --- 2. tokens cités dans le .md -------------------------------------------------------------------
const REG_START = '<!-- registry:start -->';
const REG_END = '<!-- registry:end -->';
const regRe = new RegExp(`${REG_START}[\\s\\S]*?${REG_END}`);
const prose = body.replace(regRe, '');
const cited = new Set();
for (const m of prose.matchAll(/\{([A-Za-z][\w-]*(?:\.[\w*-]+)+)\}/g)) cited.add(m[1]);
const paths = [...index.keys()];
for (const c of cited) {
  const re = new RegExp(`^${c.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+')}$`);
  if (!paths.some((p) => re.test(p))) fail(`token cité dans DESIGN.md mais absent de DESIGN.json : {${c}}`);
}
for (const m of JSON.stringify(tokens).matchAll(/\{([A-Za-z][\w-]*(?:\.[\w*-]+)+)\}/g)) {
  const c = m[1];
  const re = new RegExp(`^${c.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+')}$`);
  if (!paths.some((p) => re.test(p))) fail(`référence cassée dans DESIGN.json : {${c}}`);
}

// --- 3. registre -----------------------------------------------------------------------------------
const regRows = [];
const order = ['colors', 'overlays', 'fontSizes', 'fontFamilies', 'fontWeights', 'letterSpacings', 'lineHeights', 'typography', 'spacing', 'rounded', 'borderWidths', 'opacities', 'durations', 'easings', 'zIndex', 'sizes', 'breakpoints', 'semantic', 'states', 'density', 'component', 'components'];
for (const g of order) {
  const rows = [...index.entries()].filter(([, i]) => i.group === g && i.leaf).sort(([a], [b]) => a.localeCompare(b));
  if (!rows.length) continue;
  regRows.push(`#### ${g}\n`, '| Token | Valeur | Statut |', '|---|---|---|');
  for (const [p, i] of rows) regRows.push(`| \`{${p}}\` | ${String(i.value).replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${i.status} |`);
  regRows.push('');
}
const registry = `${REG_START}\n${regRows.join('\n')}\n${REG_END}`;
if (!regRe.test(body)) fail(`marqueurs ${REG_START} / ${REG_END} absents de DESIGN.md`);
else if (args.includes('--write')) {
  body = body.replace(regRe, () => registry);
  writeFileSync(mdPath, mdRaw.slice(0, fmMatch[0].length) + body, 'utf8');
  console.log(`registre régénéré : ${[...index.values()].filter((i) => i.leaf).length} tokens`);
} else if (body.match(regRe)[0] !== registry) fail('le registre des tokens de DESIGN.md est périmé : exécuter --write');

// --- 4. palette du .md -------------------------------------------------------------------------------
const palette = new Set([...Object.values(fm.colors ?? {}), '#FFFFFF', '#000000'].map((h) => String(h).toUpperCase()));
for (const m of prose.matchAll(/#[0-9A-Fa-f]{6}\b/g)) if (!palette.has(m[0].toUpperCase())) fail(`couleur hors palette dans DESIGN.md : ${m[0]}`);

// --- 5. contrastes -------------------------------------------------------------------------------------
const colorOf = (theme, ref, depth = 0) => {
  if (depth > 8) throw new Error(`référence circulaire : ${ref}`);
  if (isHex(ref)) return ref;
  const m = /^\{([^}]+)\}$/.exec(ref);
  if (!m) throw new Error(`couleur illisible : ${ref}`);
  const path = m[1].split('.');
  let node;
  if (path[0] === 'colors') node = tokens.primitive.colors[path[1]]?.value;
  else if (path[0] === 'overlays') node = tokens.primitive.overlays[path[1]]?.value;
  else { node = themes[theme]; for (const p of path.slice(1)) node = node?.[p]; node = node?.value; }
  if (node === undefined) throw new Error(`référence introuvable : ${ref} (${theme})`);
  return typeof node === 'string' && node.startsWith('{') ? colorOf(theme, node, depth + 1) : node;
};
const pairs = json.contrast?.pairs ?? [];
let known = 0;
for (const p of pairs) {
  const label = `${p.theme} : ${p.where}`;
  try {
    const fg = colorOf(p.theme, p.fg), bg = colorOf(p.theme, p.bg);
    if (!isHex(fg) || !isHex(bg)) { fail(`${label} : couleur non hexadécimale (${fg} / ${bg})`); continue; }
    const r = ratio(fg, bg);
    const need = { text: 4.5, 'large-text': 3, 'non-text': 3, decorative: 1 }[p.usage];
    if (need === undefined) { fail(`${label} : usage inconnu ${p.usage}`); continue; }
    if (Math.abs(r - p.ratio) > 0.01) fail(`${label} : ratio déclaré ${p.ratio}, calculé ${r}`);
    if (p.required !== need) fail(`${label} : seuil déclaré ${p.required}, attendu ${need}`);
    const pass = r >= need;
    if (pass && p.result !== 'pass') fail(`${label} : ${r}:1 atteint ${need}:1, résultat à passer à « pass »`);
    if (!pass) {
      known += 1;
      if (p.result !== 'known-issue') fail(`${label} : ${r}:1 < ${need}:1 sans « known-issue »`);
      if (!p.remediation && !p.accepted) fail(`${label} : écart sans remediation ni accepted`);
      const rem = p.remediation && /^\{([^}]+)\}$/.exec(p.remediation)?.[1];
      if (rem && !index.has(rem)) fail(`${label} : remediation inconnue ${p.remediation}`);
    }
  } catch (e) { fail(`${label} : ${e.message}`); }
}

if (args.includes('--strict') && known > 0) fail(`--strict : ${known} paire(s) de contraste par défaut sous leur seuil (known-issue)`);

// --- 6. consommateurs : CSS dont les couleurs doivent rester dans la palette ----------------------------
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== '--check-css') continue;
  const file = args[i + 1];
  if (!file || !existsSync(file)) { fail(`--check-css : fichier introuvable ${file ?? ''}`); continue; }
  readFileSync(file, 'utf8').split('\n').forEach((line, n) => {
    if (/design-lint-ignore/.test(line)) return;
    for (const m of line.matchAll(/#[0-9A-Fa-f]{6}\b/g)) if (!palette.has(m[0].toUpperCase())) fail(`${file}:${n + 1} : couleur hors palette ${m[0]}`);
  });
}

// --- 7. copie synchronisée --------------------------------------------------------------------------
if (args.includes('--same-as')) {
  const other = resolve(args[args.indexOf('--same-as') + 1] ?? '');
  const find = (d, f) => [d, join(d, 'design')].map((x) => join(x, f)).find((x) => existsSync(x));
  for (const f of ['DESIGN.md', 'DESIGN.json', 'AUDIT_TEMPLATE.md']) {
    const a = find(dir, f), b = find(other, f);
    if (!a || !b) { fail(`--same-as : ${f} introuvable (${a ? 'autre dossier' : 'ce dossier'})`); continue; }
    const norm = (x) => readFileSync(x, 'utf8').replace(/\r\n/g, '\n');
    if (norm(a) !== norm(b)) fail(`--same-as : ${f} diffère entre ${a} et ${b}`);
  }
}

// --- 8. décisions -------------------------------------------------------------------------------------
for (const d of json.decisions ?? []) if (!prose.includes(d.id)) fail(`décision ${d.id} absente du journal de DESIGN.md`);

if (errors.length) { console.error(`validate-design : ${errors.length} erreur(s)\n${errors.map((e) => ` - ${e}`).join('\n')}`); process.exit(1); }
if (!args.includes('--write')) console.log(`validate-design : OK (${index.size} chemins de tokens, ${cited.size} cités, ${pairs.length} contrastes dont ${known} écarts documentés)`);
