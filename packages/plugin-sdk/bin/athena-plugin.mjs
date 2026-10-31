#!/usr/bin/env node
// CLI de développement de plugins Athena.
//   athena-plugin init <dossier>                     crée un plugin d'exemple
//   athena-plugin keygen <préfixe>                   crée <préfixe>.key (privée) et <préfixe>.pub (publique)
//   athena-plugin pack <dossier> --key <fichier>     produit <dossier>/dist/<id>-<version>.athena.json signé
//   athena-plugin verify <paquet> --pub <fichier>    vérifie la signature
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkManifest, generateKeys, pack, verifyPackage } from '../src/pack.js';

const [, , command, target, ...rest] = process.argv;
const option = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const fail = (message) => {
  console.error(`athena-plugin : ${message}`);
  process.exit(1);
};

const TEMPLATE_MANIFEST = {
  id: 'com.exemple.couleurs', name: 'Couleurs', version: '0.1.0', athena: '>=1.0.0', publisher: 'exemple', permissions: [],
  contributes: { fieldTypes: ['hex-color'], hooks: [] },
};
const TEMPLATE_CODE = `plugin = {
  fieldTypes: {
    'hex-color': {
      validate(value) {
        return /^#[0-9a-f]{6}$/i.test(value) ? null : 'couleur #RRGGBB attendue';
      },
    },
  },
};
`;

switch (command) {
  case 'init': {
    if (!target) fail('dossier requis');
    const dir = resolve(target);
    if (existsSync(join(dir, 'manifest.json'))) fail('le dossier contient déjà un plugin');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(TEMPLATE_MANIFEST, null, 2)}\n`);
    writeFileSync(join(dir, 'plugin.js'), TEMPLATE_CODE);
    console.log(`plugin d'exemple créé dans ${dir}`);
    break;
  }
  case 'keygen': {
    if (!target) fail('préfixe requis');
    for (const ext of ['key', 'pub']) if (existsSync(`${target}.${ext}`)) fail(`${target}.${ext} existe déjà (aucun écrasement)`);
    const { publicKey, privateKey } = generateKeys();
    writeFileSync(`${target}.key`, privateKey, { mode: 0o600 });
    try { chmodSync(`${target}.key`, 0o600); } catch { /* Windows */ }
    writeFileSync(`${target}.pub`, publicKey);
    console.log(`clés créées : ${target}.key (secrète, à ne jamais versionner) et ${target}.pub`);
    break;
  }
  case 'pack': {
    const keyFile = option('--key');
    if (!target || !keyFile) fail('usage : pack <dossier> --key <fichier>');
    const dir = resolve(target);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const pkg = pack(manifest, readFileSync(join(dir, 'plugin.js'), 'utf8'), readFileSync(keyFile, 'utf8'));
    mkdirSync(join(dir, 'dist'), { recursive: true });
    const out = join(dir, 'dist', `${manifest.id}-${manifest.version}.athena.json`);
    writeFileSync(out, JSON.stringify(pkg));
    console.log(`paquet signé : ${out}`);
    break;
  }
  case 'verify': {
    const pub = option('--pub');
    if (!target || !pub) fail('usage : verify <paquet> --pub <fichier>');
    const pkg = JSON.parse(readFileSync(target, 'utf8'));
    const problems = checkManifest(pkg.manifest ?? {});
    if (problems.length) fail(problems.join(' ; '));
    if (!verifyPackage(pkg, readFileSync(pub, 'utf8'))) fail('signature invalide');
    console.log('signature valide');
    break;
  }
  default:
    fail('commandes : init, keygen, pack, verify');
}
