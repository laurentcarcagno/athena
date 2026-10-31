import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { Principal } from './token-verifier';

export interface SessionStore {
  create(principal: Principal, ttlSeconds: number): Promise<string>;
  get(id: string): Promise<Principal | null>;
  delete(id: string): Promise<void>;
  /** Révoque toutes les sessions d'un utilisateur (déconnexion globale, compte désactivé). */
  deleteBySubject(subject: string): Promise<void>;
}

const hash = (id: string) => createHash('sha256').update(id).digest('hex');
export const newSessionId = () => randomBytes(32).toString('base64url');

export class PgSessionStore implements SessionStore {
  constructor(private readonly pool: Pool) {}

  async create(principal: Principal, ttlSeconds: number): Promise<string> {
    const id = newSessionId();
    await this.pool.query(
      "insert into web_session (id_hash, subject, principal, expires_at) values ($1,$2,$3, now() + ($4 || ' seconds')::interval)",
      [hash(id), principal.subject, JSON.stringify(principal), String(ttlSeconds)],
    );
    return id;
  }

  async get(id: string): Promise<Principal | null> {
    const row = (await this.pool.query('select principal from web_session where id_hash = $1 and expires_at > now()', [hash(id)])).rows[0];
    return (row?.principal as Principal | undefined) ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('delete from web_session where id_hash = $1', [hash(id)]);
  }

  async deleteBySubject(subject: string): Promise<void> {
    await this.pool.query('delete from web_session where subject = $1', [subject]);
  }

  /** À appeler périodiquement. */
  async purgeExpired(): Promise<number> {
    return (await this.pool.query('delete from web_session where expires_at <= now()')).rowCount ?? 0;
  }
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { principal: Principal; expires: number }>();
  async create(principal: Principal, ttlSeconds: number): Promise<string> {
    const id = newSessionId();
    this.sessions.set(hash(id), { principal, expires: Date.now() + ttlSeconds * 1000 });
    return id;
  }
  async get(id: string): Promise<Principal | null> {
    const entry = this.sessions.get(hash(id));
    return entry && entry.expires > Date.now() ? entry.principal : null;
  }
  async delete(id: string): Promise<void> {
    this.sessions.delete(hash(id));
  }
  async deleteBySubject(subject: string): Promise<void> {
    for (const [key, entry] of this.sessions) if (entry.principal.subject === subject) this.sessions.delete(key);
  }
}

/** Jeton CSRF lié à la session : HMAC de l'identifiant de session. */
export const csrfToken = (secret: string, sessionId: string): string =>
  createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export function sign(secret: string, value: string): string {
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

export function unsign(secret: string, signed: string): string | null {
  const index = signed.lastIndexOf('.');
  if (index < 1) return null;
  const value = signed.slice(0, index);
  return safeEqual(sign(secret, value), signed) ? value : null;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

export function cookie(name: string, value: string, options: { maxAge?: number; secure: boolean; path?: string }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(options.secure ? ['Secure'] : []),
    ...(options.maxAge !== undefined ? [`Max-Age=${options.maxAge}`] : []),
  ].join('; ');
}
