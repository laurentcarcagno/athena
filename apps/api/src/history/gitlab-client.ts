export interface CommitAction {
  action: 'create' | 'update';
  file_path: string;
  content: string;
}

export interface CommitInput {
  branch: string;
  message: string;
  authorName: string;
  authorEmail: string;
  actions: CommitAction[];
}

export class GitLabError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Client minimal de l'API GitLab v4 pour l'historique (le jeton ne doit jamais apparaître dans les journaux). */
export class GitLabClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v4${path}`, {
      method,
      headers: { 'PRIVATE-TOKEN': this.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    return response;
  }

  private async json<T>(response: Response, what: string): Promise<T> {
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      throw new GitLabError(`GitLab ${what} : HTTP ${response.status} ${text}`, response.status);
    }
    return (await response.json()) as T;
  }

  /** Retourne l'identifiant du dépôt, en le créant (privé, branche main) s'il n'existe pas. */
  async ensureRepository(namespace: string, name: string): Promise<number> {
    const encoded = encodeURIComponent(`${namespace}/${name}`);
    const existing = await this.request('GET', `/projects/${encoded}`);
    if (existing.ok) return ((await existing.json()) as { id: number }).id;
    if (existing.status !== 404) await this.json(existing, 'lecture du dépôt');
    const namespaceInfo = await this.json<{ id: number }>(
      await this.request('GET', `/namespaces/${encodeURIComponent(namespace)}`),
      'lecture du namespace',
    );
    const created = await this.json<{ id: number }>(
      await this.request('POST', '/projects', {
        name,
        path: name,
        namespace_id: namespaceInfo.id,
        visibility: 'private',
        initialize_with_readme: true,
        default_branch: 'main',
      }),
      'création du dépôt',
    );
    return created.id;
  }

  async fileExists(projectId: number, path: string, ref: string): Promise<boolean> {
    const response = await this.request(
      'HEAD',
      `/projects/${projectId}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (response.status === 404) return false;
    if (!response.ok) throw new GitLabError(`GitLab lecture de fichier : HTTP ${response.status}`, response.status);
    return true;
  }

  async commit(projectId: number, input: CommitInput): Promise<string> {
    const result = await this.json<{ id: string }>(
      await this.request('POST', `/projects/${projectId}/repository/commits`, {
        branch: input.branch,
        commit_message: input.message,
        author_name: input.authorName,
        author_email: input.authorEmail,
        actions: input.actions,
      }),
      'commit',
    );
    return result.id;
  }

  async fileContent(projectId: number, path: string, ref: string): Promise<string> {
    const response = await this.request(
      'GET',
      `/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`,
    );
    if (!response.ok) throw new GitLabError(`GitLab lecture de fichier : HTTP ${response.status}`, response.status);
    return response.text();
  }

  async commits(projectId: number, path: string, ref: string) {
    return this.json<Array<{ id: string; author_name: string; author_email: string; committer_name: string; message: string }>>(
      await this.request('GET', `/projects/${projectId}/repository/commits?path=${encodeURIComponent(path)}&ref_name=${ref}&per_page=100`),
      'liste des commits',
    );
  }
}
