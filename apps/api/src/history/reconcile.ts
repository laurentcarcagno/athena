import type { Pool } from 'pg';
import { Db } from '../core/db';
import type { GitLabClient } from './gitlab-client';
import type { ReverseSync } from './reverse-sync';
import { repositoryName } from './serialize';

const ARTIFACT_PATH = /^trackers\/[A-Z0-9]+\/artifacts\/[A-Z0-9-]+\.yaml$/;
const FROM_ATHENA = /^Athena-Event-Id:/m;

export type ReconcileOutcome = 'initialized' | 'in_sync' | 'replayed' | 'no_repository' | 'failed';
export interface ReconcileResult { project: string; outcome: ReconcileOutcome; files?: number; reason?: string }

/**
 * Réconciliation périodique avec GitLab (plan § 17.2 et 4.4) : un webhook perdu ne doit pas laisser Git et la base diverger. Pour chaque projet dont le dépôt d'historique
 * existe, compare le sommet de la branche au dernier sommet examiné ; les commits externes (sans trailer `Athena-Event-Id`) de l'intervalle sont rejoués comme une poussée.
 * Au premier passage, le sommet courant est mémorisé sans rien rejouer (rattrapage initial = `rebuild`). Idempotent : rejouer un fichier déjà importé ne change rien.
 */
export class ReconcileService {
  constructor(
    private readonly pool: Pool,
    private readonly gitlab: Pick<GitLabClient, 'findRepository' | 'branchHead' | 'compare'>,
    private readonly namespace: string,
    private readonly reverse: Pick<ReverseSync, 'handlePush'>,
    private readonly branch = 'main',
  ) {}

  async reconcileOrganization(organizationId: string): Promise<ReconcileResult[]> {
    const db = new Db(this.pool);
    const projects = await db.tx(organizationId, async (c) => ({
      org: (await c.query('select key from organization')).rows[0].key as string,
      list: (await c.query('select id, key from project order by key')).rows as Array<{ id: string; key: string }>,
    }), { system: true });
    const results: ReconcileResult[] = [];
    for (const p of projects.list) results.push(await this.reconcileProject(organizationId, projects.org, p.id, p.key));
    return results;
  }

  async reconcileProject(organizationId: string, orgKey: string, projectId: string, projectKey: string): Promise<ReconcileResult> {
    const db = new Db(this.pool);
    try {
      const repo = await this.gitlab.findRepository(`${this.namespace}/${repositoryName(orgKey, projectKey)}`);
      if (repo === null) return { project: projectKey, outcome: 'no_repository' };
      const head = await this.gitlab.branchHead(repo, this.branch);
      const known = await db.tx(organizationId, async (c) => (await c.query('select head_sha from history_sync_cursor where project_id = $1', [projectId])).rows[0]?.head_sha as string | undefined, { system: true });
      const save = (sha: string, result: ReconcileOutcome, replayed = 0) => db.tx(organizationId, (c) => c.query(
        `insert into history_sync_cursor (organization_id, project_id, head_sha, checked_at, last_result, replayed) values ($1,$2,$3,now(),$4,$5)
         on conflict (organization_id, project_id) do update set head_sha = excluded.head_sha, checked_at = now(), last_result = excluded.last_result, replayed = excluded.replayed`,
        [organizationId, projectId, sha, result, replayed]), { system: true });
      if (!known) { await save(head, 'initialized'); return { project: projectKey, outcome: 'initialized' }; }
      if (known === head) { await save(head, 'in_sync'); return { project: projectKey, outcome: 'in_sync' }; }

      const diff = await this.gitlab.compare(repo, known, head);
      const external = (diff.commits ?? []).filter((c) => !FROM_ATHENA.test(c.message));
      const files = [...new Set(diff.diffs.filter((d) => !d.deleted_file && ARTIFACT_PATH.test(d.new_path)).map((d) => d.new_path))];
      let replayed = 0;
      if (external.length > 0 && files.length > 0) {
        const last = external[external.length - 1]!;
        const results = await this.reverse.handlePush(organizationId, projectKey, { commits: [{ id: last.id, message: last.message, added: [], modified: files }] });
        replayed = results.filter((r) => r.outcome === 'imported' || r.outcome === 'conflict' || r.outcome === 'rejected').length;
      }
      // la correction d'un import rejeté ajoute un commit d'Athena : on repart du sommet réel
      const after = await this.gitlab.branchHead(repo, this.branch);
      await save(after, replayed > 0 ? 'replayed' : 'in_sync', replayed);
      return { project: projectKey, outcome: replayed > 0 ? 'replayed' : 'in_sync', files: files.length };
    } catch (error) {
      return { project: projectKey, outcome: 'failed', reason: (error as Error).message.slice(0, 200) };
    }
  }
}
