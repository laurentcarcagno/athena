/** Source du jeton OpenBao : un jeton fixe (essai) ou une connexion AppRole renouvelée (production hors Kubernetes, plan § 14.2). */
export interface TokenSource { get(): Promise<string>; invalidate(): void }

export class StaticToken implements TokenSource {
  constructor(private readonly token: string) {}
  async get(): Promise<string> { return this.token; }
  invalidate(): void { /* jeton fixe : rien à renouveler */ }
}

/**
 * Connexion AppRole : échange `role_id` et `secret_id` contre un jeton de durée limitée, renouvelé avant l'échéance (au plus tard aux 2/3 de la durée)
 * et reconnecté si OpenBao répond 403. Les deux identifiants ne sont jamais journalisés.
 */
export class AppRoleToken implements TokenSource {
  private current: { token: string; renewAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    private readonly address: string, private readonly roleId: string, private readonly secretId: string,
    private readonly fetchImpl: typeof fetch = fetch, private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<string> {
    if (this.current && this.now() < this.current.renewAt) return this.current.token;
    this.pending ??= this.login().finally(() => { this.pending = null; });
    return this.pending;
  }

  invalidate(): void { this.current = null; }

  private async login(): Promise<string> {
    const response = await this.fetchImpl(`${this.address}/v1/auth/approle/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: this.roleId, secret_id: this.secretId }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new OpenBaoError(`OpenBao AppRole : HTTP ${response.status}`, response.status);
    const body = (await response.json()) as { auth?: { client_token?: string; lease_duration?: number } };
    const token = body.auth?.client_token;
    if (!token) throw new OpenBaoError('OpenBao AppRole : réponse sans jeton', 502);
    // durée 0 = jeton sans échéance : renouvelé une fois par heure par prudence
    const lease = (body.auth?.lease_duration ?? 0) > 0 ? body.auth!.lease_duration! : 3600;
    this.current = { token, renewAt: this.now() + Math.floor((lease * 1000 * 2) / 3) };
    return token;
  }
}

/** Source de jeton selon l'environnement : AppRole si `role_id` et `secret_id` sont fournis, sinon jeton fixe ; nulle si OpenBao n'est pas configuré. */
export function tokenSourceFromEnv(env: { OPENBAO_ADDR?: string; OPENBAO_TOKEN?: string; OPENBAO_ROLE_ID?: string; OPENBAO_SECRET_ID?: string }, fetchImpl: typeof fetch = fetch): TokenSource | null {
  if (!env.OPENBAO_ADDR) return null;
  if (env.OPENBAO_ROLE_ID && env.OPENBAO_SECRET_ID) return new AppRoleToken(env.OPENBAO_ADDR, env.OPENBAO_ROLE_ID, env.OPENBAO_SECRET_ID, fetchImpl);
  if (env.OPENBAO_TOKEN) return new StaticToken(env.OPENBAO_TOKEN);
  return null;
}

export class OpenBaoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Client minimal OpenBao (KV v2 et Transit). Le jeton ne doit jamais être journalisé.
 * Les clés Transit ne quittent jamais OpenBao : Athena ne voit que le texte chiffré.
 */
export class OpenBao {
  private readonly knownKeys = new Set<string>();

  constructor(
    private readonly address: string,
    token: string | TokenSource,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.tokens = typeof token === 'string' ? new StaticToken(token) : token;
  }

  private readonly tokens: TokenSource;

  private async call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T | null> {
    const send = async () => this.fetchImpl(`${this.address}/v1/${path}`, {
      method,
      headers: { 'X-Vault-Token': await this.tokens.get(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    let response = await send();
    if (response.status === 403) { this.tokens.invalidate(); response = await send(); } // jeton expiré ou révoqué : une reconnexion, puis échec franc
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new OpenBaoError(`OpenBao ${method} ${path} : HTTP ${response.status}`, response.status);
    }
    return response.status === 204 ? null : ((await response.json()) as T);
  }

  // --- KV v2 (secrets statiques) ---
  async kvPut(path: string, data: Record<string, string>): Promise<void> {
    await this.call('POST', `secret/data/${path}`, { data });
  }

  async kvGet(path: string): Promise<Record<string, string> | null> {
    const result = await this.call<{ data: { data: Record<string, string> } }>('GET', `secret/data/${path}`);
    return result?.data.data ?? null;
  }

  /** Crée le secret seulement s'il n'existe pas (CAS = 0) ; retourne faux s'il existait déjà. Atomique entre instances. */
  async kvPutIfAbsent(path: string, data: Record<string, string>): Promise<boolean> {
    const response = await this.fetchImpl(`${this.address}/v1/secret/data/${path}`, {
      method: 'POST',
      headers: { 'X-Vault-Token': await this.tokens.get(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: { cas: 0 }, data }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return true;
    if (response.status === 400) return false; // « check-and-set parameter did not match »
    throw new OpenBaoError(`OpenBao POST ${path} : HTTP ${response.status}`, response.status);
  }

  // --- Transit (chiffrement) ---
  /** Crée la clé de l'organisation si elle n'existe pas. Clé dérivée : le contexte est obligatoire et lié au texte chiffré. */
  async ensureKey(name: string): Promise<void> {
    if (this.knownKeys.has(name)) return;
    const existing = await this.call('GET', `transit/keys/${name}`);
    if (existing === null) await this.call('POST', `transit/keys/${name}`, { type: 'aes256-gcm96', derived: true });
    this.knownKeys.add(name);
  }

  async encrypt(keyName: string, plaintext: string, context: string): Promise<string> {
    await this.ensureKey(keyName);
    const result = await this.call<{ data: { ciphertext: string } }>('POST', `transit/encrypt/${keyName}`, {
      plaintext: Buffer.from(plaintext, 'utf8').toString('base64'),
      context: Buffer.from(context, 'utf8').toString('base64'),
    });
    return result!.data.ciphertext;
  }

  async decrypt(keyName: string, ciphertext: string, context: string): Promise<string> {
    const result = await this.call<{ data: { plaintext: string } }>('POST', `transit/decrypt/${keyName}`, {
      ciphertext,
      context: Buffer.from(context, 'utf8').toString('base64'),
    });
    return Buffer.from(result!.data.plaintext, 'base64').toString('utf8');
  }

  /** Rechiffre avec la dernière version de la clé, sans exposer le clair (rotation). */
  async rewrap(keyName: string, ciphertext: string, context: string): Promise<string> {
    const result = await this.call<{ data: { ciphertext: string } }>('POST', `transit/rewrap/${keyName}`, {
      ciphertext,
      context: Buffer.from(context, 'utf8').toString('base64'),
    });
    return result!.data.ciphertext;
  }
}

export const orgKeyName = (organizationKey: string): string => `athena-org-${organizationKey}`;
