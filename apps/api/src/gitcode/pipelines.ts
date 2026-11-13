import { Db } from '../core/db';
import { GitLabClient } from '../history/gitlab-client';

export type RunState = 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'skipped' | 'other';
export interface PipelineRun { id: number; state: RunState; status: string; ref: string; url: string; at: string }
export interface RepoPipelines { repo: string; runs: PipelineRun[]; successRate: number | null; running: boolean; last: RunState | null }
export interface PipelineView { configured: boolean; repos: RepoPipelines[]; successRate: number | null; running: boolean }

const STATES: Record<string, RunState> = {
  success: 'success', passed: 'success', failed: 'failed', running: 'running', pending: 'pending', created: 'pending', waiting_for_resource: 'pending',
  preparing: 'pending', scheduled: 'pending', canceled: 'canceled', canceling: 'canceled', skipped: 'skipped', manual: 'skipped',
};
export const stateOf = (status: string): RunState => STATES[status] ?? 'other';
/** Taux de réussite parmi les exécutions terminées (réussies ou en échec) ; null s'il n'y en a aucune. */
export const rateOf = (runs: ReadonlyArray<{ state: RunState }>): number | null => {
  const finished = runs.filter((r) => r.state === 'success' || r.state === 'failed');
  return finished.length === 0 ? null : Math.round((100 * finished.filter((r) => r.state === 'success').length) / finished.length);
};

/**
 * Pipelines CI/CD (ADR-0007, T-0175) : 12 dernières exécutions de chaque dépôt relié au projet, lues dans GitLab et gardées
 * 30 secondes en mémoire (une carte par utilisateur ne doit pas multiplier les appels). Sans GitLab configuré : `configured: false`.
 */
export class PipelineService {
  private readonly cache = new Map<string, { at: number; value: PipelineView }>();
  constructor(private readonly db: Db, private readonly gitlab: GitLabClient | null, private readonly ttlMs = 30_000, private readonly now: () => number = Date.now) {}

  async get(organizationId: string, projectKey: string): Promise<PipelineView> {
    if (!this.gitlab) return { configured: false, repos: [], successRate: null, running: false };
    const key = `${organizationId}:${projectKey}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const paths = await this.db.tx(organizationId, async (c) =>
      (await c.query('select r.gitlab_path from code_repo r join project p on p.id = r.project_id where p.key = $1 order by r.gitlab_path', [projectKey])).rows.map((r) => r.gitlab_path as string));
    const gitlab = this.gitlab;
    const repos = await Promise.all(paths.map(async (repo): Promise<RepoPipelines> => {
      try {
        const id = await gitlab.findRepository(repo);
        const runs = id === null ? [] : (await gitlab.pipelines(id, 12)).map((r): PipelineRun => ({ id: r.id, state: stateOf(r.status), status: r.status, ref: r.ref, url: r.webUrl, at: r.updatedAt }));
        return { repo, runs, successRate: rateOf(runs), running: runs.some((r) => r.state === 'running'), last: runs[0]?.state ?? null };
      } catch { return { repo, runs: [], successRate: null, running: false, last: null }; }
    }));
    const all = repos.flatMap((r) => r.runs);
    const value: PipelineView = { configured: true, repos, successRate: rateOf(all), running: repos.some((r) => r.running) };
    this.cache.set(key, { at: this.now(), value });
    return value;
  }
}
