import type { PoolClient } from 'pg';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { outbox } from '../core/tracker.service';
import { extractKeyActions, keysFromBranch, type Action } from './refs';

export interface Rules {
  /** Transition tentée après un déploiement réussi en production (le workflow reste maître). */
  onDeploy?: string | null;
  /** Transition tentée au premier commit/branche référençant l'artefact (statut de catégorie « todo »). */
  onStart: string | null;
  onMrOpened: string | null;
  /** Appliquée à la fusion d'une MR portant `Fixes`/`Closes`/`Implements`. */
  onMrMergedResolves: string | null;
}

export const defaultRules: Rules = { onStart: 'Démarrer', onMrOpened: 'Soumettre à revue', onMrMergedResolves: 'Résoudre', onDeploy: 'Livrer' };

export type Outcome = 'linked' | 'transitioned' | 'blocked' | 'unknown_artifact' | 'ignored';
export interface Result {
  key: string;
  outcome: Outcome;
  detail?: string;
}

interface PushEvent {
  object_kind: 'push';
  ref: string;
  commits?: Array<{ id: string; message: string; url?: string; author?: { email?: string } }>;
}
interface MergeRequestEvent {
  object_kind: 'merge_request';
  user?: { email?: string };
  object_attributes: {
    iid: number; title: string; description?: string; state: string; action?: string; url?: string; source_branch: string;
    target_branch?: string; merge_commit_sha?: string | null; merged_at?: string | null;
  };
}
interface PipelineEvent {
  object_kind: 'pipeline';
  object_attributes: { status: string };
  merge_request?: { iid: number };
}
interface DeploymentEvent {
  object_kind: 'deployment';
  status: string;
  environment: string;
  short_sha?: string;
  status_changed_at?: string;
}
export type GitLabEvent = PushEvent | MergeRequestEvent | PipelineEvent | DeploymentEvent;

/**
 * Traite les événements GitLab des dépôts de code. Règles de sécurité :
 * - une transition est faite au nom de l'utilisateur Athena correspondant à l'e-mail du commit, avec le
 *   rôle minimal ; sans correspondance, seul le lien est créé ;
 * - les validateurs et conditions du workflow s'appliquent toujours : un message de commit ne contourne rien.
 */
export class GitCodeService {
  constructor(
    private readonly db: Db,
    private readonly artifacts: ArtifactService,
    private readonly rules: Rules = defaultRules,
  ) {}

  async handle(organizationId: string, projectKey: string, event: GitLabEvent): Promise<Result[]> {
    switch (event.object_kind) {
      case 'push': return this.push(organizationId, projectKey, event);
      case 'merge_request': return this.mergeRequest(organizationId, projectKey, event);
      case 'pipeline': return this.pipeline(organizationId, projectKey, event);
      case 'deployment': return this.deployment(organizationId, projectKey, event);
      default: return [];
    }
  }

  async refs(organizationId: string, projectKey: string, key: string) {
    return this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select r.kind, r.ref, r.title, r.url, r.state, r.pipeline from code_ref r
           join artifact a on a.id = r.artifact_id join project p on p.id = a.project_id
           where p.key = $1 and a.id = resolve_artifact(p.id, $2) order by r.created_at, r.ref`,
          [projectKey, key],
        )
      ).rows,
    );
  }

  private async push(org: string, project: string, event: PushEvent): Promise<Result[]> {
    const results: Result[] = [];
    const branch = event.ref.replace(/^refs\/heads\//, '');
    const started = new Set<string>();
    for (const key of keysFromBranch(branch)) {
      results.push(await this.link(org, project, key, 'branch', branch, branch, ''));
      started.add(key);
    }
    for (const commit of event.commits ?? []) {
      const actor = await this.actorByEmail(org, commit.author?.email);
      for (const { key, action } of extractKeyActions(commit.message)) {
        const title = commit.message.split('\n')[0]!.slice(0, 200);
        const linked = await this.link(org, project, key, 'commit', commit.id, title, commit.url ?? '', action === 'reverts' ? 'reverts' : '');
        results.push(linked);
        if (linked.outcome === 'linked') started.add(key);
      }
      for (const key of started) {
        if (actor && this.rules.onStart) results.push(await this.tryTransition(org, project, key, this.rules.onStart, actor, 'todo'));
      }
      started.clear();
    }
    return results;
  }

  private async mergeRequest(org: string, project: string, event: MergeRequestEvent): Promise<Result[]> {
    const a = event.object_attributes;
    const actor = await this.actorByEmail(org, event.user?.email);
    const actions = new Map<string, Action>();
    for (const x of extractKeyActions(`${a.title}\n${a.description ?? ''}`)) actions.set(x.key, x.action);
    for (const key of keysFromBranch(a.source_branch)) if (!actions.has(key)) actions.set(key, 'refs');

    const results: Result[] = [];
    for (const [key, action] of actions) {
      const linked = await this.link(org, project, key, 'mr', String(a.iid), a.title, a.url ?? '', a.state);
      results.push(linked);
      if (a.state === 'merged') await this.recordMerge(org, project, key, a);
      if (linked.outcome === 'unknown_artifact' || !actor) continue; // la MR peut déjà être connue : l'état a changé
      if (a.state === 'opened' && this.rules.onMrOpened) {
        results.push(await this.tryTransition(org, project, key, this.rules.onMrOpened, actor, 'in_progress'));
      } else if (a.state === 'merged' && ['fixes', 'closes', 'implements'].includes(action) && this.rules.onMrMergedResolves) {
        results.push(await this.tryTransition(org, project, key, this.rules.onMrMergedResolves, actor, 'in_progress'));
      }
    }
    return results;
  }

  /** Mémorise la fusion (SHA, date, branche cible) et solde le rétroportage si la cible est une branche de maintenance. */
  private async recordMerge(org: string, project: string, key: string, a: MergeRequestEvent['object_attributes']): Promise<void> {
    await this.db.tx(org, async (c) => {
      const artifact = (await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [project, key])).rows[0];
      if (!artifact) return;
      await c.query(
        `update code_ref set merge_sha = $3, merged_at = coalesce($4::timestamptz, now()), target_branch = $5, updated_at = now()
         where artifact_id = $1 and kind = 'mr' and ref = $2`,
        [artifact.id, String(a.iid), a.merge_commit_sha ?? null, a.merged_at ?? null, a.target_branch ?? null],
      );
      if (a.target_branch && /^release\//.test(a.target_branch)) {
        const done = await c.query("update backport set state = 'done', mr_ref = $3, done_at = now() where artifact_id = $1 and branch = $2 and state = 'pending'", [artifact.id, a.target_branch, String(a.iid)]);
        if (done.rowCount) await outbox(c, org, 'artifact', artifact.id, 'backport.done', { key, branch: a.target_branch });
      }
    });
  }

  /** Déploiement réussi : date et environnement sur les MR fusionnées dont le SHA correspond ; transition configurable en production. */
  private async deployment(org: string, project: string, event: DeploymentEvent): Promise<Result[]> {
    if (event.status !== 'success' || !event.short_sha || !/^[0-9a-f]{7,40}$/.test(event.short_sha)) return [];
    const keys = await this.db.tx(org, async (c) =>
      (
        await c.query(
          `update code_ref r set deployed_at = coalesce($3::timestamptz, now()), environment = $4, updated_at = now()
           from artifact a join project p on p.id = a.project_id
           where r.artifact_id = a.id and p.key = $1 and r.kind = 'mr' and r.merge_sha like $2 || '%' and r.deployed_at is null
           returning a.key`,
          [project, event.short_sha, event.status_changed_at ?? null, event.environment.slice(0, 50)],
        )
      ).rows.map((r) => r.key as string),
    );
    const results: Result[] = [];
    for (const key of [...new Set(keys)]) {
      results.push({ key, outcome: 'linked', detail: `déployé : ${event.environment}` });
      if (event.environment === 'production' && this.rules.onDeploy) {
        results.push(await this.tryTransition(org, project, key, this.rules.onDeploy, { id: 'gitlab:deployment', roles: ['athena-user'] }, 'done'));
      }
    }
    return results;
  }

  private async pipeline(org: string, project: string, event: PipelineEvent): Promise<Result[]> {
    if (!event.merge_request) return [];
    const iid = String(event.merge_request.iid);
    return this.db.tx(org, async (c) => {
      const rows = (
        await c.query(
          `update code_ref r set pipeline = $3, updated_at = now()
           from artifact a join project p on p.id = a.project_id
           where r.artifact_id = a.id and p.key = $1 and r.kind = 'mr' and r.ref = $2 returning a.key`,
          [project, iid, event.object_attributes.status],
        )
      ).rows;
      return rows.map((r) => ({ key: r.key as string, outcome: 'linked' as Outcome, detail: `pipeline ${event.object_attributes.status}` }));
    });
  }

  private async link(
    org: string, project: string, key: string, kind: 'commit' | 'branch' | 'mr', ref: string, title: string, url: string, state = '',
  ): Promise<Result> {
    return this.db.tx(org, async (c) => {
      const artifact = (
        await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [project, key])
      ).rows[0];
      if (!artifact) return { key, outcome: 'unknown_artifact' as Outcome };
      const inserted = await c.query(
        `insert into code_ref (organization_id, artifact_id, kind, ref, title, url, state) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (artifact_id, kind, ref) do update set title = excluded.title, state = excluded.state, updated_at = now()
         returning (xmax = 0) as created`,
        [org, artifact.id, kind, ref, title, url, state],
      );
      if (inserted.rows[0].created) await outbox(c, org, 'artifact', artifact.id, 'code.linked', { key, kind, ref });
      return { key, outcome: (inserted.rows[0].created ? 'linked' : 'ignored') as Outcome };
    });
  }

  private async tryTransition(org: string, project: string, key: string, name: string, actor: Actor, fromCategory: string): Promise<Result> {
    try {
      const current = await this.artifacts.get(org, project, key);
      const category = await this.db.tx(org, async (c: PoolClient) =>
        (await c.query('select s.category from artifact a join status s on s.id = a.status_id join project p on p.id = a.project_id where p.key=$1 and a.id = resolve_artifact(p.id, $2)', [project, key])).rows[0]?.category as string,
      );
      if (category !== fromCategory) return { key, outcome: 'ignored', detail: `statut ${current.status} : transition « ${name} » non applicable` };
      await this.artifacts.transition(org, project, key, name, current.version, actor);
      return { key, outcome: 'transitioned', detail: name };
    } catch (error) {
      if (error instanceof DomainError) return { key, outcome: 'blocked', detail: `${name} : ${error.details.join(', ') || error.message}` };
      throw error;
    }
  }

  private async actorByEmail(org: string, email: string | undefined): Promise<Actor | null> {
    if (!email) return null;
    const row = await this.db.tx(org, async (c) => (await c.query('select subject from user_account where lower(email) = lower($1)', [email])).rows[0]);
    return row ? { id: row.subject as string, roles: ['athena-user'] } : null;
  }
}
