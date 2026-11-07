import type { PoolClient } from 'pg';

/** `@identifiant` dans un texte : précédé d'un début de ligne ou d'un séparateur (pas dans une adresse de courriel ni un chemin). */
const MENTION = /(^|[^\w@./-])@([A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?)/g;

/** Identifiants mentionnés dans `body`, en minuscules, sans doublon. */
export function mentionTokens(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(MENTION)) found.add(m[2]!.toLowerCase());
  return [...found];
}

/**
 * Personnes mentionnées qui peuvent lire l'item. Un identifiant inconnu ou sans accès est ignoré en silence : il ne produit ni
 * notification ni indication (pas de déduction de l'existence ou des droits d'un compte).
 */
export async function resolveMentions(c: PoolClient, artifactId: string, body: string): Promise<Array<{ subject: string; username: string }>> {
  const tokens = mentionTokens(body);
  if (tokens.length === 0) return [];
  const rows = (await c.query(
    'select subject, username from user_account where lower(username) = any($1::text[]) and notify_can_see(subject, $2) order by username',
    [tokens, artifactId])).rows;
  return rows.map((r) => ({ subject: r.subject as string, username: r.username as string }));
}
