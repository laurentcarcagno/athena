import { Db, type Actor } from '../core/db';
import { audit } from '../core/tracker.service';
import { notFound, validation } from '../core/errors';
import type { GitLabClient } from '../history/gitlab-client';
import { parseSdoc } from './sdoc-parser';

const MAX_FILES = 500;

/**
 * Remplace ou insère la ligne `ATHENA_REFS:` du nœud `uid`. Retourne le nouveau contenu, ou null si le nœud est
 * absent ou déjà à jour. Le champ est placé avant `RELATIONS:` (ordre de la grammaire StrictDoc) ou en fin de bloc.
 * Le champ doit être déclaré dans la grammaire du document (voir docs/admin/INSTALLATION.md).
 */
export function setAthenaRefs(content: string, uid: string, refs: string[]): string | null {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === `UID: ${uid}`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^\[\[?\/?[A-Z_]+\]?\]$/.test(lines[end]!)) end++;
  const wanted = [...new Set(refs)].sort().join(', ');
  const existing = lines.slice(start, end).findIndex((l) => l.startsWith('ATHENA_REFS:'));
  if (existing >= 0) {
    const current = lines[start + existing]!.slice('ATHENA_REFS:'.length).trim();
    if (current === wanted) return null;
    lines[start + existing] = `ATHENA_REFS: ${wanted}`;
  } else {
    if (wanted === '') return null;
    const relations = lines.slice(start, end).findIndex((l) => l === 'RELATIONS:');
    let at = relations >= 0 ? start + relations : end;
    if (relations < 0) while (at > start + 1 && lines[at - 1] === '') at--; // avant les lignes vides de fin de bloc
    lines.splice(at, 0, `ATHENA_REFS: ${wanted}`);
  }
  return lines.join(eol);
}

export interface WritebackResult {
  files: number;
  updatedNodes: number;
  mergeRequest: { iid: number; webUrl: string } | null;
}

/**
 * Report des liens saisis dans Athena vers les fichiers `.sdoc` : jamais d'écriture directe, toujours une branche
 * dédiée et une merge request (plan § 8), avec l'utilisateur concerné comme auteur du commit.
 */
export class DocWriteback {
  constructor(private readonly db: Db, private readonly gitlab: GitLabClient) {}

  async proposeRefs(
    organizationId: string, projectKey: string, sourceName: string, repoPath: string, ref: string, actor: Actor,
  ): Promise<WritebackResult> {
    const links = await this.db.tx(organizationId, async (c) => {
      const source = (await c.query('select s.id from doc_source s join project p on p.id = s.project_id where p.key = $1 and s.name = $2', [projectKey, sourceName])).rows[0];
      if (!source) throw notFound(`Source documentaire ${sourceName}`);
      const rows = (await c.query('select l.uid, a.key from doc_link l join artifact a on a.id = l.artifact_id where l.source_id = $1', [source.id])).rows as Array<{ uid: string; key: string }>;
      const author = (await c.query('select display_name, email from user_account where subject = $1', [actor.id])).rows[0] as { display_name: string | null; email: string | null } | undefined;
      const byUid = new Map<string, string[]>();
      for (const r of rows) byUid.set(r.uid, [...(byUid.get(r.uid) ?? []), r.key]);
      return { byUid, author };
    });
    const repo = await this.gitlab.findRepository(repoPath);
    if (repo === null) throw validation([`dépôt de documentation introuvable : ${repoPath}`]);
    const sha = await this.gitlab.branchHead(repo, ref);
    const paths = (await this.gitlab.tree(repo, sha)).filter((p) => p.endsWith('.sdoc'));
    if (paths.length > MAX_FILES) throw validation([`trop de fichiers .sdoc (${MAX_FILES} au plus)`]);

    const actions: Array<{ action: 'update'; file_path: string; content: string }> = [];
    let updatedNodes = 0;
    for (const path of paths) {
      let content = await this.gitlab.fileContent(repo, path, sha);
      let changed = false;
      for (const node of parseSdoc(content)) {
        if (!links.byUid.has(node.uid)) continue;
        const wanted = [...new Set([...node.athenaRefs, ...(links.byUid.get(node.uid) ?? [])])];
        const next = setAthenaRefs(content, node.uid, wanted);
        if (next !== null) { content = next; changed = true; updatedNodes++; }
      }
      if (changed) actions.push({ action: 'update', file_path: path, content });
    }
    if (actions.length === 0) return { files: 0, updatedNodes: 0, mergeRequest: null };

    const branch = `athena/doc-refs/${Date.now().toString(36)}`;
    await this.gitlab.createBranch(repo, branch, ref);
    await this.gitlab.commit(repo, {
      branch,
      message: `docs: report des références Athena (${updatedNodes} exigence(s))\n\nAthena-Actor: ${actor.id}`,
      authorName: links.author?.display_name ?? 'Athena', authorEmail: links.author?.email ?? 'athena@localhost',
      actions,
    });
    const mergeRequest = await this.gitlab.createMergeRequest(repo, {
      source: branch, target: ref, title: `Références Athena pour ${updatedNodes} exigence(s)`,
      description: 'Report automatique des liens saisis dans Athena (champ ATHENA_REFS). À relire puis fusionner.',
    });
    await this.db.tx(organizationId, (c) => audit(c, organizationId, actor, 'doc.writeback', `project:${projectKey}/${sourceName}`, { mr: mergeRequest.iid, nodes: updatedNodes }));
    return { files: actions.length, updatedNodes, mergeRequest };
  }

}
