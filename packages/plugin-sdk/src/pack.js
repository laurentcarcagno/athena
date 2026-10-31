// Emballage et signature des plugins Athena (Ed25519). Indépendant du serveur : la représentation signée
// doit rester strictement identique à celle vérifiée par `apps/api/src/plugins/manifest.ts`.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
};

/** Empreinte signée : manifeste canonique (clés triées), saut de ligne, code. */
export function packageDigest(manifest, code) {
  return createHash('sha256').update(JSON.stringify(sortKeys(manifest))).update('\n').update(code).digest();
}

export function generateKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

const REQUIRED = ['id', 'name', 'version', 'athena', 'publisher', 'permissions', 'contributes'];

export function checkManifest(manifest) {
  const problems = REQUIRED.filter((k) => !(k in manifest)).map((k) => `champ manquant : ${k}`);
  if (typeof manifest.id === 'string' && !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){1,4}$/.test(manifest.id)) problems.push('id invalide (forme com.exemple.nom)');
  if (typeof manifest.version === 'string' && !/^\d+\.\d+\.\d+$/.test(manifest.version)) problems.push('version invalide (x.y.z)');
  return problems;
}

/** Produit le paquet signé `{ manifest, code, signature }`. */
export function pack(manifest, code, privateKeyPem) {
  const problems = checkManifest(manifest);
  if (problems.length) throw new Error(problems.join(' ; '));
  const signature = sign(null, packageDigest(manifest, code), createPrivateKey(privateKeyPem)).toString('base64');
  return { manifest, code, signature };
}

export function verifyPackage(pkg, publicKeyPem) {
  try {
    return verify(null, packageDigest(pkg.manifest, pkg.code), createPublicKey(publicKeyPem), Buffer.from(pkg.signature, 'base64'));
  } catch {
    return false;
  }
}
