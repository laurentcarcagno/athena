import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Somme SHA-256 d'un fichier, lue en flux (les archives d'images dépassent la mémoire raisonnable). */
export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

/** Nom de fichier d'archive pour une référence d'image (`registry/ns/nom:tag` → `registry_ns_nom_tag.tar`). */
export const imageFile = (ref) => `${ref.replace(/[^A-Za-z0-9.-]+/g, '_')}.tar`;

/** Contenu du fichier SHA256SUMS (format `sha256sum -c`) à partir de `[{ path, sha256 }]`. */
export const formatSums = (entries) => entries.map((e) => `${e.sha256}  ${e.path}`).join('\n') + '\n';

export function parseSums(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const m = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!m) throw new Error(`ligne de somme invalide : ${line}`);
    return { sha256: m[1], path: m[2] };
  });
}

/** Vérifie les sommes d'un dossier de lot. Renvoie la liste des écarts (vide si le lot est intact). */
export async function verifyBundle(dir) {
  const sumsFile = join(dir, 'SHA256SUMS');
  if (!existsSync(sumsFile)) return ['SHA256SUMS absent'];
  const problems = [];
  for (const { path, sha256 } of parseSums(readFileSync(sumsFile, 'utf8'))) {
    const full = join(dir, path);
    if (!existsSync(full)) { problems.push(`${path} : fichier absent`); continue; }
    if ((await sha256File(full)) !== sha256) problems.push(`${path} : somme différente`);
  }
  return problems;
}

/** Écrit manifest.json et SHA256SUMS pour les fichiers donnés (chemins relatifs au dossier du lot). */
export async function writeManifest(dir, { version, images, chart, extra = [] }) {
  const entries = [];
  const described = [];
  for (const { ref, file } of images) {
    const sha256 = await sha256File(join(dir, file));
    entries.push({ path: file, sha256 });
    described.push({ ref, file, sha256, size: statSync(join(dir, file)).size });
  }
  for (const file of [chart, ...extra].filter(Boolean)) entries.push({ path: file, sha256: await sha256File(join(dir, file)) });
  const manifest = { name: 'athena-isolated-bundle', version, images: described, chart };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  entries.push({ path: 'manifest.json', sha256: await sha256File(join(dir, 'manifest.json')) });
  writeFileSync(join(dir, 'SHA256SUMS'), formatSums(entries));
  return manifest;
}

/** Script de chargement dans un registre interne (docker/podman), produit avec le lot. */
export function loadScript(images) {
  const lines = images.map((i) => `load_and_push "${imageFile(i.ref ?? i)}" "${i.ref ?? i}"`);
  return `#!/bin/sh
# Charge les images du lot dans un registre interne. Usage : REGISTRY=registre.interne.lan/athena sh load-bundle.sh
set -eu
: "\${REGISTRY:?définir REGISTRY (ex. registre.interne.lan/athena)}"
ENGINE="\${ENGINE:-docker}"
cd "$(dirname "$0")"
sha256sum -c SHA256SUMS
load_and_push() {
  "$ENGINE" load -i "images/$1"
  target="$REGISTRY/$(basename "\${2%%:*}"):\${2##*:}"
  "$ENGINE" tag "$2" "$target"
  "$ENGINE" push "$target"
}
${lines.join('\n')}
echo "Images chargées dans $REGISTRY. Installer le chart avec : helm upgrade --install athena chart/athena-*.tgz -f values-isolated.yaml --set image.registry=$REGISTRY"
`;
}
