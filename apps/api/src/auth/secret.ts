import { randomBytes } from 'node:crypto';
import type { OpenBao } from '../secrets/openbao';

export const SESSION_SECRET_PATH = 'athena/platform/session';

/**
 * Secret de signature des cookies et des jetons CSRF. Priorité : variable d'environnement (développement), sinon
 * OpenBao ; au premier démarrage il est généré puis stocké de façon atomique, ce qui garantit que toutes les
 * instances partagent la même valeur même si elles démarrent en même temps.
 */
export async function resolveSessionSecret(fromEnv: string | undefined, bao: OpenBao | null): Promise<string | undefined> {
  if (fromEnv) return fromEnv;
  if (!bao) return undefined;
  const existing = (await bao.kvGet(SESSION_SECRET_PATH))?.['secret'];
  if (existing) return existing;
  const candidate = randomBytes(48).toString('base64url');
  if (await bao.kvPutIfAbsent(SESSION_SECRET_PATH, { secret: candidate })) return candidate;
  const winner = (await bao.kvGet(SESSION_SECRET_PATH))?.['secret']; // une autre instance l'a créé entre-temps
  if (!winner) throw new Error('secret de session introuvable après création concurrente');
  return winner;
}
