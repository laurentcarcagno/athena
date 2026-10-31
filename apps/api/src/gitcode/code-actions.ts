import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit, outbox } from '../core/tracker.service';
import { GitLabClient, GitLabError } from '../history/gitlab-client';
import { branchName } from './refs';

export interface CodeRepoView {
  path: string;
  defaultBranch: string;
}

/**
 * Actions d'écriture vers les dépôts de code, limitées à deux : créer une branche et ouvrir une merge request
 * depuis un artefact (plan § 17.4). Jamais d'écriture sur une branche protégée ou par défaut.
 */
export class CodeActions {
  constructor(
    private readonly db: Db,
    private readonly gitlab: GitLabClient,
  ) {}

  async addRepo(organizationId: string, projectKey: string, path: string, defaultBranch: string, actor: Actor): Promise<CodeRepoView> {
    const id = await this.gitlab.findRepository(path);
    if (id === null) throw validation([`dépôt GitLab introuvable ou inaccessible : ${path}`]);
    await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      await c.query('insert into code_repo (organization_id, project_id, gitlab_path, default_branch) values ($1,$2,$3,$4)', [organizationId, project.id, path, defaultBranch]);
      await audit(c, organizationId, actor, 'code_repo.add', `project:${projectKey}`, { path });
    });
    return { path, defaultBranch };
  }

  async repos(organizationId: string, projectKey: string): Promise<CodeRepoView[]> {
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select r.gitlab_path, r.default_branch from code_repo r join project p on p.id = r.project_id where p.key = $1 order by r.gitlab_path', [projectKey])).rows.map(
        (r) => ({ path: r.gitlab_path, defaultBranch: r.default_branch }),
      ),
    );
  }

  /** Crée `bugfix/<CLÉ>-<résumé>` ou `feature/<CLÉ>-<résumé>` depuis la branche par défaut et le lie à l'artefact. */
  async createBranch(organizationId: string, projectKey: string, artifactKey: string, type: 'bugfix' | 'feature', repoPath: string | undefined, actor: Actor) {
    const { repo, artifact } = await this.context(organizationId, projectKey, artifactKey, repoPath);
    const name = branchName(type, artifactKey, artifact.title);
    const id = await this.repoId(repo.path);
    try {
      const created = await this.gitlab.createBranch(id, name, repo.defaultBranch);
      await this.record(organizationId, artifact.id, 'branch', name, name, created.webUrl, '', actor, artifactKey);
      return { branch: name, url: created.webUrl, repo: repo.path };
    } catch (error) {
      if (error instanceof GitLabError && error.status === 400 && /already exists/i.test(error.message)) throw conflict(`La branche « ${name} » existe déjà.`);
      throw error;
    }
  }

  /** Ouvre une merge request (la clé est dans le titre et la description : les transitions se feront au merge). */
  async createMergeRequest(organizationId: string, projectKey: string, artifactKey: string, branch: string, repoPath: string | undefined, actor: Actor) {
    if (!/^(bugfix|feature)\/[A-Z][A-Z0-9]{1,9}-\d+(-[a-z0-9-]*)?$/.test(branch) || !branch.includes(artifactKey)) {
      throw validation(['la branche doit être celle créée pour cet artefact (bugfix/ ou feature/ suivi de la clé)']);
    }
    const { repo, artifact } = await this.context(organizationId, projectKey, artifactKey, repoPath);
    const id = await this.repoId(repo.path);
    const mr = await this.gitlab.createMergeRequest(id, {
      source: branch, target: repo.defaultBranch, title: `Draft: ${artifactKey}: ${artifact.title}`.slice(0, 200),
      description: `Refs ${artifactKey}\n\nOuverte depuis Athena par ${actor.id}.`,
    });
    await this.record(organizationId, artifact.id, 'mr', String(mr.iid), `${artifactKey}: ${artifact.title}`, mr.webUrl, 'opened', actor, artifactKey);
    return { iid: mr.iid, url: mr.webUrl, repo: repo.path };
  }

  private async context(organizationId: string, projectKey: string, artifactKey: string, repoPath: string | undefined) {
    return this.db.tx(organizationId, async (c) => {
      const artifact = (
        await c.query(
          `select a.id, a."values" as values,
                  (select f.key from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'title') as title_field
           from artifact a join project p on p.id = a.project_id where p.key = $1 and a.key = $2`,
          [projectKey, artifactKey],
        )
      ).rows[0];
      if (!artifact) throw notFound(`Artefact ${artifactKey}`);
      const repos = (await c.query('select r.gitlab_path, r.default_branch from code_repo r join project p on p.id = r.project_id where p.key = $1 order by r.gitlab_path', [projectKey])).rows;
      const repo = repoPath ? repos.find((r) => r.gitlab_path === repoPath) : repos.length === 1 ? repos[0] : undefined;
      if (!repo) throw validation([repos.length === 0 ? 'aucun dépôt de code configuré pour ce projet' : 'dépôt à préciser (plusieurs dépôts configurés ou dépôt inconnu)']);
      return {
        repo: { path: repo.gitlab_path as string, defaultBranch: repo.default_branch as string },
        artifact: { id: artifact.id as string, title: String(artifact.values[artifact.title_field ?? 'title'] ?? artifactKey) },
      };
    });
  }

  private async repoId(path: string): Promise<number> {
    const id = await this.gitlab.findRepository(path);
    if (id === null) throw notFound(`Dépôt GitLab ${path}`);
    return id;
  }

  private async record(org: string, artifactId: string, kind: 'branch' | 'mr', ref: string, title: string, url: string, state: string, actor: Actor, key: string) {
    await this.db.tx(org, async (c) => {
      await c.query(
        `insert into code_ref (organization_id, artifact_id, kind, ref, title, url, state) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (artifact_id, kind, ref) do update set title = excluded.title, url = excluded.url, state = excluded.state, updated_at = now()`,
        [org, artifactId, kind, ref, title, url, state],
      );
      await outbox(c, org, 'artifact', artifactId, 'code.linked', { key, kind, ref, actor: actor.id });
      await audit(c, org, actor, kind === 'branch' ? 'code.branch_created' : 'code.mr_created', `artifact:${key}`, { ref });
    });
  }
}
