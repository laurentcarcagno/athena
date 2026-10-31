import type { Actor } from '../core/db';
import { validation } from '../core/errors';
import { GitLabClient } from '../history/gitlab-client';
import type { DocLinkService, IndexResult } from './doc-link.service';

const MAX_FILES = 500;

/**
 * Récupère les fichiers `.sdoc` d'un dépôt GitLab (lecture seule, SHA de la référence enregistré) et les
 * indexe. Les fichiers sont des entrées non fiables : nombre borné ici, taille bornée par l'analyseur.
 */
export class DocFetcher {
  constructor(
    private readonly gitlab: GitLabClient,
    private readonly docs: DocLinkService,
  ) {}

  async sync(organizationId: string, projectKey: string, sourceName: string, repoPath: string, ref: string, subPath: string | undefined, actor: Actor): Promise<IndexResult & { files: number; sha: string }> {
    const repo = await this.gitlab.findRepository(repoPath);
    if (repo === null) throw validation([`dépôt de documentation introuvable : ${repoPath}`]);
    const prefix = subPath ? `${subPath.replace(/^\/+|\/+$/g, '')}/` : '';
    if (prefix.includes('..')) throw validation(['chemin invalide']);
    const sha = await this.gitlab.branchHead(repo, ref);
    const paths = (await this.gitlab.tree(repo, sha)).filter((p) => p.endsWith('.sdoc') && p.startsWith(prefix));
    if (paths.length > MAX_FILES) throw validation([`trop de fichiers .sdoc (${MAX_FILES} au plus)`]);
    const files = await Promise.all(paths.map(async (path) => ({ path, content: await this.gitlab.fileContent(repo, path, sha) })));
    const result = await this.docs.index(organizationId, projectKey, sourceName, files, sha, actor);
    return { ...result, files: files.length, sha };
  }
}
