import { writeActivity } from '@athena/ui';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly details: string[]) {
    super(message);
  }
  /** Message lisible : cause principale puis détails de validation. */
  get readable(): string {
    return this.details.length ? `${this.message} ${this.details.join(' ; ')}` : this.message;
  }
}

export class UnauthorizedError extends ApiError {
  constructor() {
    super('Session expirée.', 401, 'unauthorized', []);
  }
}

/** Trop de requêtes (429) : jamais une déconnexion ; `retryAfter` en secondes (ADR-0005, T-0142). */
export class RateLimitedError extends ApiError {
  constructor(message: string, readonly retryAfter: number) {
    super(message, 429, 'rate_limited', []);
  }
}

const retryAfterOf = (response: Response) => Math.min(120, Math.max(1, Number(response.headers.get('Retry-After')) || 20));

export interface Session {
  authenticated: boolean;
  user?: { id?: string; username: string; name: string; email: string | null; roles: string[]; groups: string[] };
  csrf?: string;
  /** Niveau de protection de l'instance (absent : aucun bandeau). */
  protectionLevel?: string;
}

let csrf: string | null = null;

export async function loadSession(): Promise<Session> {
  const response = await fetch('/auth/session', { credentials: 'include' });
  if (response.status === 429) throw new RateLimitedError('Trop de requêtes.', retryAfterOf(response));
  const session = (await response.json()) as Session;
  csrf = session.csrf ?? null;
  return session;
}

/** Écritures en cours, par méthode, adresse et corps : un double clic ne produit qu'une requête (audit F-08). */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Appel JSON authentifié par le cookie de session. Les écritures portent le jeton CSRF. Une écriture identique à une écriture encore
 * en cours (même méthode, même adresse, même corps) n'est pas renvoyée : les deux appelants reçoivent la même réponse.
 */
export function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  if (method === 'GET') return send<T>(method, path, body);
  const key = `${method} ${path} ${body === undefined ? '' : JSON.stringify(body)}`;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  writeActivity.begin();
  const call = send<T>(method, path, body).finally(() => { inflight.delete(key); writeActivity.end(); });
  inflight.set(key, call);
  return call;
}

async function send<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(path, { method, headers, credentials: 'include', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 429) throw new RateLimitedError(((await response.json().catch(() => ({}))) as { message?: string }).message ?? 'Trop de requêtes.', retryAfterOf(response));
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; details?: string[] };
  if (!response.ok) throw new ApiError(payload.message ?? 'Erreur.', response.status, payload.error ?? 'error', payload.details ?? []);
  return payload as T;
}

/** Envoie un fichier brut (corps binaire) avec le jeton CSRF. */
export async function upload<T>(path: string, file: File, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/octet-stream', 'X-File-Type': file.type };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`${path}?name=${encodeURIComponent(file.name)}`, { method, headers, credentials: 'include', body: file });
  if (response.status === 401) throw new UnauthorizedError();
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; details?: string[] };
  if (!response.ok) throw new ApiError(payload.message ?? 'Erreur.', response.status, payload.error ?? 'error', payload.details ?? []);
  return payload as T;
}

export async function logout(): Promise<string> {
  const response = await fetch('/auth/logout', { method: 'POST', credentials: 'include', headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
  csrf = null;
  return ((await response.json()) as { logoutUrl: string }).logoutUrl;
}

export const loginUrl = (returnTo: string) => `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

// --- Types de l'API ---
export interface Hit { key: string; project?: string; title?: string; tracker: string; status: string; statusName: string; statusColor?: string | null; category: string; values: Record<string, unknown>; version: number; updatedAt: string }
export interface SearchResult { total: number; totalCapped?: boolean; hits: Hit[] }
export interface Field { id: string; key: string; label: string; type: string; config: Record<string, unknown>; required: boolean; isContent?: boolean; semanticRole: string | null; readRoles?: string[] | null; writeRoles?: string[] | null }
export interface TrackerTypeEntry {
  key: string; name: string; description: string; category: 'engineering' | 'development' | 'verification' | 'management';
  defaultViews: string[]; baseFields: Array<{ key: string; label: string; type: string; required?: boolean; config?: Record<string, unknown>; semanticRole?: string }>;
  builtin: boolean; modified: boolean;
}
export interface TrackerOverview {
  key: string; name: string; typeKey: string | null; category: string; artifacts: number; mine: number; lastActivity: string | null;
  statuses: Array<{ key: string; name: string; category: string; color?: string | null; count: number }>;
}
export interface TrackerDefinition {
  key: string; name: string; typeKey?: string | null; historyMode?: 'direct' | 'merge_request'; layout?: import('./lib/layout').Layout | null;
  fields: Field[];
  statuses: Array<{ id: string; key: string; name: string; category: string; color?: string | null }>;
  transitions: Array<{ id: string; name: string; fromStatusId: string | null; toStatusId: string; conditions?: Array<{ type: string; roles?: string[] }> }>;
}
export interface Artifact { id: string; key: string; trackerKey: string; status: string; values: Record<string, unknown>; version: number; exportControl?: 'ITAR' | 'EAR' | 'dual_use' }
export interface AttachmentView { id: string; name: string; contentType: string; size: number; sha256: string; uploadedBy: string; createdAt: string }
export interface SavedFilter { id: string; name: string; query: string; owner: string; shared: boolean; trackerKey?: string | null; view?: string; columns?: string[] | null; isDefault?: boolean }
export interface Revision { version: number; diff: Record<string, { from: unknown; to: unknown }>; gitSha: string | null; at: string; actor: string }
export interface BoardView {
  key: string; name: string; unmapped: number; trackers?: string[];
  columns: Array<{
    name: string; wipLimit: number | null; count: number; overLimit: boolean; creatable?: boolean;
    cards: Array<{
      key: string; tracker: string; title: string; status: string; statusName: string; statusColor?: string | null; assignee: string | null; version: number;
      trackerName?: string; assigneeName?: string | null; priority?: string | null; priorityLabel?: string | null; due?: string | null; blocked?: boolean;
    }>;
  }>;
}
