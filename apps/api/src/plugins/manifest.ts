import { createHash, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';

export const PERMISSIONS = ['storage', 'artifacts:read'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){1,4}$/, 'identifiant de la forme com.exemple.nom'),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  athena: z.string().max(50),
  publisher: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  permissions: z.array(z.enum(PERMISSIONS)).max(10),
  contributes: z.object({
    fieldTypes: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,40}$/)).max(20).default([]),
    hooks: z.array(z.enum(['artifact.created', 'artifact.updated', 'artifact.transitioned'])).max(10).default([]),
    /** Actions de workflow appelables à la demande (API ou automatisation). */
    actions: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,40}$/)).max(20).default([]),
    /** Widgets de tableau de bord : renvoient un modèle de données, jamais du HTML. */
    widgets: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,40}$/)).max(20).default([]),
    /** Connecteurs : transforment une charge externe en artefacts à créer (le plugin n'a aucun accès réseau). */
    connectors: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,40}$/)).max(20).default([]),
  }),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export interface PluginPackage {
  manifest: unknown;
  code: string;
  /** Signature Ed25519 (base64) de la somme de contrôle du manifeste et du code. */
  signature: string;
}

const MAX_CODE_BYTES = 256 * 1024;

/** Représentation canonique signée : empreinte du manifeste (clés triées) et du code. */
export function packageDigest(manifest: unknown, code: string): Buffer {
  const canonical = JSON.stringify(sortKeys(manifest));
  return createHash('sha256').update(canonical).update('\n').update(code).digest();
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}

export function signPackage(manifest: unknown, code: string, privateKey: KeyObject): string {
  return sign(null, packageDigest(manifest, code), privateKey).toString('base64');
}

export interface Trust {
  /** Éditeur → clé publique Ed25519 (PEM). */
  publishers: Record<string, string>;
}

export type VerifyResult = { ok: true; manifest: Manifest } | { ok: false; reason: string };

/** Vérifie forme, taille, éditeur de confiance et signature. Aucun code n'est exécuté ici. */
export function verifyPackage(pkg: PluginPackage, trust: Trust): VerifyResult {
  if (Buffer.byteLength(pkg.code) > MAX_CODE_BYTES) return { ok: false, reason: 'code trop volumineux' };
  const parsed = ManifestSchema.safeParse(pkg.manifest);
  if (!parsed.success) return { ok: false, reason: `manifeste invalide : ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}` };
  const pem = trust.publishers[parsed.data.publisher];
  if (!pem) return { ok: false, reason: `éditeur non reconnu : ${parsed.data.publisher}` };
  let valid = false;
  try {
    valid = verify(null, packageDigest(pkg.manifest, pkg.code), createPublicKey(pem), Buffer.from(pkg.signature, 'base64'));
  } catch {
    valid = false;
  }
  return valid ? { ok: true, manifest: parsed.data } : { ok: false, reason: 'signature invalide' };
}
