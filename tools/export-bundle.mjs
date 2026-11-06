#!/usr/bin/env node
/**
 * Lot transférable pour un déploiement sans accès Internet : archives d'images (docker save), chart Helm, valeurs du
 * mode isolé, script de chargement dans un registre interne, sommes de contrôle SHA-256.
 *
 * Usage :
 *   node tools/export-bundle.mjs --out dist-bundle [--version 0.1.0] [--images a:1,b:2] [--dry-run]
 *   node tools/export-bundle.mjs --verify dist-bundle
 * Le dossier produit est ensuite archivé (tar) puis transféré par le support autorisé.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageFile, loadScript, verifyBundle, writeManifest } from './bundle-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(`--${name}`);

/** Images du déploiement isolé : applications + services d'identité et de secrets locaux (versions à figer avant transfert). */
export const defaultImages = (version) => [
  `athena-api:${version}`, `athena-web:${version}`, 'postgres:16', 'quay.io/keycloak/keycloak:26.0', 'openbao/openbao:2.1',
];

async function main() {
  if (flag('verify')) {
    const dir = arg('verify');
    const problems = await verifyBundle(dir);
    if (problems.length) { console.error(`Lot altéré ou incomplet :\n  ${problems.join('\n  ')}`); process.exit(1); }
    console.log('Lot intact : toutes les sommes de contrôle correspondent.');
    return;
  }
  const out = arg('out', 'dist-bundle');
  const version = arg('version', JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? '0.1.0');
  const images = (arg('images') ? arg('images').split(',') : defaultImages(version)).map((ref) => ({ ref, file: `images/${imageFile(ref)}` }));
  if (flag('dry-run')) { for (const i of images) console.log(`image  ${i.ref} -> ${i.file}`); console.log(`chart  deploy/helm/athena -> chart/athena-${version}.tgz`); return; }

  mkdirSync(join(out, 'images'), { recursive: true });
  mkdirSync(join(out, 'chart'), { recursive: true });
  for (const i of images) {
    const r = spawnSync('docker', ['save', '-o', join(out, i.file), i.ref], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`docker save a échoué pour ${i.ref} (image absente du moteur local ?)`); process.exit(1); }
  }
  const chart = `chart/athena-${version}.tgz`;
  const helm = spawnSync('helm', ['package', join(root, 'deploy/helm/athena'), '--version', version, '--app-version', version, '-d', join(out, 'chart')], { stdio: 'inherit' });
  if (helm.status !== 0) { // sans helm : archive tar du chart (installable avec `helm install ./dossier` après extraction)
    const tar = spawnSync('tar', ['-czf', join(out, chart), '-C', join(root, 'deploy/helm'), 'athena'], { stdio: 'inherit' });
    if (tar.status !== 0) { console.error('ni helm ni tar disponibles pour archiver le chart'); process.exit(1); }
  }
  copyFileSync(join(root, 'deploy/helm/athena/values-isolated.yaml'), join(out, 'values-isolated.yaml'));
  writeFileSync(join(out, 'load-bundle.sh'), loadScript(images));
  cpSync(join(root, 'docs/admin/INSTALLATION.md'), join(out, 'INSTALLATION.md'));
  await writeManifest(out, { version, images, chart, extra: ['values-isolated.yaml', 'load-bundle.sh', 'INSTALLATION.md'] });
  console.log(`Lot écrit dans ${out} (${images.length} images). Vérification : node tools/export-bundle.mjs --verify ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
