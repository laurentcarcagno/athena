import type { Trust } from './manifest';

/** Lit les éditeurs de confiance depuis la configuration ; une valeur invalide est refusée (pas de repli ouvert). */
export function parseTrust(raw: string | undefined): Trust {
  if (!raw) return { publishers: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PLUGIN_TRUSTED_KEYS : JSON invalide');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('PLUGIN_TRUSTED_KEYS : objet attendu');
  const publishers: Record<string, string> = {};
  for (const [name, pem] of Object.entries(parsed)) {
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(name) || typeof pem !== 'string' || !pem.includes('BEGIN PUBLIC KEY')) throw new Error(`PLUGIN_TRUSTED_KEYS : entrée invalide (${name})`);
    publishers[name] = pem;
  }
  return { publishers };
}
