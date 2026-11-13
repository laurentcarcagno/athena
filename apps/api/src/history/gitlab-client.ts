export type CommitAction =
  | { action: 'create' | 'update'; file_path: string; content: string }
  | { action: 'move'; file_path: string; previous_path: string; content: string }
  | { action: 'delete'; file_path: string };

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

  async branchHead(projectId: number, branch: string): Promise<string> {
    const result = await this.json<{ commit: { id: string } }>(
      await this.request('GET', `/projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`),
      'lecture de la branche',
    );
    return result.commit.id;
  }

  async createTag(projectId: number, tag: string, ref: string, message: string): Promise<void> {
    const query = new URLSearchParams({ tag_name: tag, ref, message });
    await this.json(await this.request('POST', `/projects/${projectId}/repository/tags?${query.toString()}`), 'création du tag');
  }

  async compare(projectId: number, from: string, to: string) {
    const query = new URLSearchParams({ from, to, straight: 'true' });
    return this.json<{ diffs: Array<{ old_path: string; new_path: string; new_file: boolean; deleted_file: boolean }> }>(
      await this.request('GET', `/projects/${projectId}/repository/compare?${query.toString()}`),
      'comparaison',
    );
  }

  /** Liste récursive des fichiers d'une référence (pagination par page de 100). */
  async tree(projectId: number, ref: string): Promise<string[]> {
    const paths: string[] = [];
    for (let page = 1; page <= 200; page++) {
      const entries = await this.json<Array<{ type: string; path: string }>>(
        await this.request('GET', `/projects/${projectId}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${encodeURIComponent(ref)}`),
        "liste de l'arborescence",
      );
      for (const e of entries) if (e.type === 'blob') paths.push(e.path);
      if (entries.length < 100) break;
    }
    return paths;
  }

  /** Identifiant d'un dépôt existant, ou null. Ne crée rien. */
  async findRepository(path: string): Promise<number | null> {
    const response = await this.request('GET', `/projects/${encodeURIComponent(path)}`);
    if (response.status === 404) return null;
    return (await this.json<{ id: number }>(response, 'lecture du dépôt')).id;
  }

  /** Dernières exécutions de pipeline d'un dépôt (les plus récentes d'abord). */
  async pipelines(projectId: number, limit = 12): Promise<Array<{ id: number; status: string; ref: string; webUrl: string; createdAt: string; updatedAt: string }>> {
    const rows = await this.json<Array<{ id: number; status: string; ref: string; web_url: string; created_at: string; updated_at: string }>>(
      await this.request('GET', `/projects/${projectId}/pipelines?per_page=${Math.min(Math.max(limit, 1), 50)}&order_by=id&sort=desc`),
      'liste des pipelines',
    );
    return rows.map((r) => ({ id: r.id, status: r.status, ref: r.ref, webUrl: r.web_url, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async createBranch(projectId: number, branch: string, ref: string): Promise<{ webUrl: string }> {
    const query = new URLSearchParams({ branch, ref });
    const result = await this.json<{ web_url: string }>(await this.request('POST', `/projects/${projectId}/repository/branches?${query.toString()}`), 'création de la branche');
    return { webUrl: result.web_url };
  }

  async branchExists(projectId: number, branch: string): Promise<boolean> {
    const response = await this.request('GET', `/projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`);
    if (response.status === 404) return false;
    if (!response.ok) throw new GitLabError(`GitLab lecture de branche : HTTP ${response.status}`, response.status);
    return true;
  }

  /** Merge request ouverte pour cette branche source, ou null. */
  async openMergeRequest(projectId: number, source: string, target: string): Promise<{ iid: number; webUrl: string } | null> {
    const query = new URLSearchParams({ state: 'opened', source_branch: source, target_branch: target });
    const list = await this.json<Array<{ iid: number; web_url: string }>>(await this.request('GET', `/projects/${projectId}/merge_requests?${query.toString()}`), 'liste des merge requests');
    return list[0] ? { iid: list[0].iid, webUrl: list[0].web_url } : null;
  }

  /** Fusionne une MR. GitLab calcule la fusionnabilité de façon asynchrone : 405/406 sont réessayés quelques secondes. */
  async mergeMergeRequest(projectId: number, iid: number): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.request('PUT', `/projects/${projectId}/merge_requests/${iid}/merge`);
      if (response.ok) return;
      if ((response.status === 405 || response.status === 406) && attempt < 10) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw new GitLabError(`GitLab fusion de la merge request : HTTP ${response.status}`, response.status);
    }
  }

  async createMergeRequest(projectId: number, input: { source: string; target: string; title: string; description: string }): Promise<{ iid: number; webUrl: string }> {
    const result = await this.json<{ iid: number; web_url: string }>(
      await this.request('POST', `/projects/${projectId}/merge_requests`, {
        source_branch: input.source, target_branch: input.target, title: input.title, description: input.description, remove_source_branch: true,
      }),
      'création de la merge request',
    );
    return { iid: result.iid, webUrl: result.web_url };
  }
}
