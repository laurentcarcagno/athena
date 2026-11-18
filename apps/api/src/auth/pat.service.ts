import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import type { Principal } from './token-verifier';

export const PAT_PREFIX = 'athp_';
export const PatInput = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.enum(['read', 'write']).default('read'),
  /** Expiration obligatoire : de 1 à 365 jours. */
  expiresInDays: z.number().int().min(1).max(365),
});
export type PatData = z.input<typeof PatInput>;

export interface PatView { id: string; name: string; scope: 'read' | 'write'; prefix: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }
export interface PatPrincipal extends Principal { patScope: 'read' | 'write'; patId: string }

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Jetons d'accès personnels (plan § 7.3 et 14.1) : `athp_` + 256 bits aléatoires, stockés hachés, montrés une seule fois. La portée `read` n'autorise que la lecture ;
 * `write` autorise aussi les écritures, dans la limite des rôles de l'utilisateur au moment de la création. Un jeton ne peut pas en créer un autre.
 */
export class PatService {
  private readonly db: Db;
  constructor(private readonly pool: Pool) { this.db = new Db(pool); }

  async create(organizationId: string, principal: Principal, input: PatData, actor: Actor): Promise<{ token: string; view: PatView }> {
    const data = PatInput.parse(input);
    const token = `${PAT_PREFIX}${randomBytes(32).toString('base64url')}`;
    const row = await this.db.tx(organizationId, async (c) => {
      const active = (await c.query('select count(*)::int n from personal_access_token where subject = $1 and revoked_at is null and expires_at > now()', [principal.subject])).rows[0].n as number;
      if (active >= 20) throw validation(['Vingt jetons actifs au plus : révoquez-en un avant d’en créer un autre.']);
      const r = (await c.query(
        `insert into personal_access_token (organization_id, subject, username, display_name, email, roles, groups, name, scope, token_prefix, token_hash, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() + ($12 || ' days')::interval) returning *`,
        [organizationId, principal.subject, principal.username, principal.name ?? null, principal.email ?? null, principal.roles, principal.groups, data.name, data.scope, token.slice(0, 12), hash(token), String(data.expiresInDays)])).rows[0];
      await audit(c, organizationId, actor, 'pat.create', `pat:${r.id}`, { name: data.name, scope: data.scope, expiresInDays: data.expiresInDays });
      return r;
    }, { system: true });
    return { token, view: this.view(row) };
  }

  async list(organizationId: string, subject: string): Promise<PatView[]> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select * from personal_access_token where subject = $1 order by created_at desc limit 100', [subject])).rows, { system: true });
    return rows.map((r) => this.view(r));
  }

  async revoke(organizationId: string, subject: string, id: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const r = await c.query('update personal_access_token set revoked_at = coalesce(revoked_at, now()) where id = $1 and subject = $2 returning id', [id, subject]);
      if (!r.rowCount) throw notFound('Jeton');
      await audit(c, organizationId, actor, 'pat.revoke', `pat:${id}`, {});
    }, { system: true });
  }

  /** Identité portée par un jeton valide, ou null (inconnu, révoqué, expiré). */
  async verify(token: string): Promise<PatPrincipal | null> {
    if (!token.startsWith(PAT_PREFIX) || token.length < 40 || token.length > 80) return null;
    const row = (await this.pool.query('select * from authenticate_personal_access_token($1)', [hash(token)])).rows[0];
    if (!row) return null;
    return { subject: row.subject, username: row.username, ...(row.display_name ? { name: row.display_name } : {}), ...(row.email ? { email: row.email } : {}), roles: row.roles, groups: row.groups, patScope: row.scope, patId: row.id };
  }

  private view(r: any): PatView {
    return { id: r.id, name: r.name, scope: r.scope, prefix: r.token_prefix, expiresAt: new Date(r.expires_at).toISOString(), lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null, revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null, createdAt: new Date(r.created_at).toISOString() };
  }
}
