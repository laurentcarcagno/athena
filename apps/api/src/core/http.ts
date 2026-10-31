import { ArgumentsHost, Catch, ExceptionFilter, Injectable, HttpException } from '@nestjs/common';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Principal } from '../auth/token-verifier';
import type { Actor } from './db';
import { DomainError, forbidden, validation } from './errors';

const STATUS: Record<DomainError['code'], number> = {
  not_found: 404,
  validation: 422,
  conflict: 409,
  forbidden: 403,
};

interface ReplyLike {
  status(code: number): { send(body: unknown): void };
}

/** Convertit les erreurs de domaine en réponses HTTP normalisées. Les autres erreurs ne fuient pas de détails. */
@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    if (error instanceof DomainError) {
      reply.status(STATUS[error.code]).send({ error: error.code, message: error.message, details: error.details });
    } else if (isPgError(error) && error.code === '23505') {
      reply.status(409).send({ error: 'conflict', message: 'Un élément avec cette clé existe déjà.', details: [] });
    } else if (isPgError(error) && (error.code === '23514' || error.code === '23503' || error.code === '22P02')) {
      reply.status(422).send({ error: 'validation', message: 'Données invalides.', details: [] });
    } else if (isPgError(error) && error.code === '42501') {
      reply.status(403).send({ error: 'forbidden', message: 'Accès refusé.', details: [] });
    } else if (error instanceof HttpException) {
      reply.status(error.getStatus()).send(error.getResponse());
    } else {
      reply.status(500).send({ error: 'internal', message: 'Erreur interne.', details: [] });
    }
  }
}

function isPgError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string';
}

export function parseBody<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw validation(result.error.issues.map((i) => `${i.path.join('.') || 'corps'} : ${i.message}`));
  }
  return result.data;
}

/** Résout l'organisation du jeton : groupe Keycloak `/org-<clé>`. */
@Injectable()
export class OrgResolver {
  private readonly cache = new Map<string, { id: string; until: number }>();
  constructor(private readonly pool: Pool) {}

  async resolve(principal: Principal): Promise<{ organizationId: string; actor: Actor }> {
    const group = principal.groups.find((g) => /^\/org-[a-z0-9][a-z0-9-]{1,38}$/.test(g));
    if (!group) throw forbidden("Aucune organisation associée à ce compte.");
    const key = group.slice('/org-'.length);
    const hit = this.cache.get(key);
    let id = hit && hit.until > Date.now() ? hit.id : undefined;
    if (!id) {
      const row = (await this.pool.query('select organization_id_by_key($1) as id', [key])).rows[0];
      if (!row?.id) throw forbidden('Organisation inconnue.');
      id = row.id as string;
      this.cache.set(key, { id, until: Date.now() + 60_000 });
    }
    await this.upsertUser(id, principal);
    return { organizationId: id, actor: { id: principal.subject, roles: principal.roles } };
  }

  /** Mémorise le profil (nom, e-mail) servant d'auteur Git. Au plus une écriture par minute et utilisateur. */
  private readonly seen = new Map<string, number>();
  private async upsertUser(organizationId: string, principal: Principal): Promise<void> {
    const cacheKey = `${organizationId}:${principal.subject}`;
    if ((this.seen.get(cacheKey) ?? 0) > Date.now()) return;
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true)", [organizationId]);
      await client.query(
        `insert into user_account (organization_id, subject, username, display_name, email)
         values ($1,$2,$3,$4,$5)
         on conflict (organization_id, subject) do update
           set username = excluded.username, display_name = excluded.display_name, email = excluded.email, updated_at = now()`,
        [organizationId, principal.subject, principal.username, principal.name ?? principal.username, principal.email ?? null],
      );
      await client.query('commit');
      this.seen.set(cacheKey, Date.now() + 60_000);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const KeySchema = z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'clé en majuscules, 2 à 10 caractères');
