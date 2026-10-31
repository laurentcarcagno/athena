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

export interface Session {
  authenticated: boolean;
  user?: { username: string; name: string; email: string | null; roles: string[]; groups: string[] };
  csrf?: string;
}

let csrf: string | null = null;

export async function loadSession(): Promise<Session> {
  const response = await fetch('/auth/session', { credentials: 'include' });
  const session = (await response.json()) as Session;
  csrf = session.csrf ?? null;
  return session;
}

/** Appel JSON authentifié par le cookie de session. Les écritures portent le jeton CSRF. */
export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(path, { method, headers, credentials: 'include', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; details?: string[] };
  if (!response.ok) throw new ApiError(payload.message ?? 'Erreur.', response.status, payload.error ?? 'error', payload.details ?? []);
  return payload as T;
}

/** Envoie un fichier brut (corps binaire) avec le jeton CSRF. */
export async function upload<T>(path: string, file: File): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/octet-stream', 'X-File-Type': file.type };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`${path}?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers, credentials: 'include', body: file });
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
export interface Hit { key: string; tracker: string; status: string; category: string; values: Record<string, unknown>; version: number; updatedAt: string }
export interface SearchResult { total: number; hits: Hit[] }
export interface Field { id: string; key: string; label: string; type: string; config: Record<string, unknown>; required: boolean; semanticRole: string | null; readRoles?: string[] | null; writeRoles?: string[] | null }
export interface TrackerDefinition {
  key: string; name: string;
  fields: Field[];
  statuses: Array<{ id: string; key: string; name: string; category: string }>;
  transitions: Array<{ id: string; name: string; fromStatusId: string | null; toStatusId: string; conditions?: Array<{ type: string; roles?: string[] }> }>;
}
export interface Artifact { id: string; key: string; trackerKey: string; status: string; values: Record<string, unknown>; version: number }
export interface AttachmentView { id: string; name: string; contentType: string; size: number; sha256: string; uploadedBy: string; createdAt: string }
export interface Revision { version: number; diff: Record<string, { from: unknown; to: unknown }>; gitSha: string | null; at: string; actor: string }
export interface BoardView {
  key: string; name: string; unmapped: number;
  columns: Array<{ name: string; wipLimit: number | null; count: number; overLimit: boolean; cards: Array<{ key: string; tracker: string; title: string; status: string; assignee: string | null; version: number }> }>;
}
