#!/usr/bin/env node
/**
 * Contrôle « réseau isolé » : aucune URL externe dans le code livré (interface, feuilles de style, HTML, images, chart).
 * Une URL externe est une URL http(s) dont l'hôte n'est ni local ni dans la liste des hôtes de documentation qui ne sont
 * jamais interrogés (espaces de noms XML, textes d'erreur des bibliothèques).
 * Usage : node tools/check-external-urls.mjs [--dist]   (--dist contrôle aussi apps/web/dist s'il existe)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Hôtes autorisés : sans point (services du cluster), locaux, ou espaces de noms et pages de documentation qui ne sont jamais des cibles de requête. */
export const ALLOWED_HOSTS = [/^[^.]+$/, /^localhost$/, /^127\.0\.0\.1$/, /^\[?::1\]?$/, /^www\.w3\.org$/, /^react\.dev$/, /^reactjs\.org$/, /^schemas\.openid\.net$/, /\.(local|lan|internal|svc|example)$/, /^example\.(com|org)$/];
/** Dossiers de données de référence : liens de documentation des normes, affichés mais jamais interrogés. */
export const REFERENCE_DATA = ['apps/api/src/core/templates/'];
const URL_RE = /https?:\/\/[^\s"'`<>)\]{}\\,;]+/g;
const TEXT = /\.(ts|tsx|css|html|svg|json|yaml|yml|js|mjs|cjs|tpl|conf|inc)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'test-results', '.git', 'stories', 'design']);
const isTest = (p) => /\.(test|spec)\.(ts|tsx|mjs)$/.test(p) || p.includes(`${sep}testing${sep}`);

function* walk(dir, { dist = false } = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP_DIR.has(name) && !(dist && name === 'dist')) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, { dist });
    else if (TEXT.test(name)) yield full;
  }
}

export function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}
export const isAllowed = (url) => ALLOWED_HOSTS.some((re) => re.test(hostOf(url)));

/** Retourne les URL externes d'un texte. */
export function externalUrls(text) {
  return [...text.matchAll(URL_RE)]
    .filter((m) => !text.slice(m.index + m[0].length).startsWith('{{')) // modèle Helm : l'hôte est calculé
    .map((m) => m[0].replace(/[.:]+$/, '')).filter((u) => !isAllowed(u));
}

/** Parcourt les fichiers livrés et renvoie `[{ file, url }]`. */
export function scan({ dist = false, root = ROOT } = {}) {
  const targets = [join(root, 'apps/web/src'), join(root, 'apps/web/index.html'), join(root, 'packages/ui/src'), join(root, 'apps/api/src'), join(root, 'deploy/helm'), join(root, 'deploy/docker')];
  if (dist) targets.push(join(root, 'apps/web/dist'), join(root, 'packages/ui/dist'));
  const found = [];
  for (const t of targets) {
    if (!existsSync(t)) continue;
    const files = statSync(t).isDirectory() ? [...walk(t, { dist })] : [t];
    for (const file of files) {
      const rel = relative(root, file).split(sep).join('/');
      if (isTest(file) || REFERENCE_DATA.some((d) => rel.startsWith(d))) continue;
      // dans les fichiers produits, seuls HTML, CSS et SVG sont contrôlés strictement (le JavaScript des bibliothèques contient des textes d'erreur)
      if (rel.includes('/dist/') && !/\.(html|css|svg)$/.test(file)) continue;
      // les valeurs du chart sont des exemples de configuration (.exemple.lan) : l'hôte doit rester interne
      for (const url of externalUrls(readFileSync(file, 'utf8'))) found.push({ file: rel, url });
    }
  }
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = scan({ dist: process.argv.includes('--dist') });
  if (found.length) {
    console.error('URL externes trouvées (interdites en réseau isolé) :');
    for (const f of found) console.error(`  ${f.file} : ${f.url}`);
    process.exit(1);
  }
  console.log('Aucune URL externe.');
}
