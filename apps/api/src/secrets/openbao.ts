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
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T | null> {
    const response = await this.fetchImpl(`${this.address}/v1/${path}`, {
      method,
      headers: { 'X-Vault-Token': this.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
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
      headers: { 'X-Vault-Token': this.token, 'Content-Type': 'application/json' },
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
