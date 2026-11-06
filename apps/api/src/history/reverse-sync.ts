import { ITEM_KEY_PATTERN } from '../core/key';
import type { Pool } from 'pg';
import { parse } from 'yaml';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import type { ConfidentialFields } from '../secrets/confidential';
import { GitLabClient } from './gitlab-client';
import { repositoryName, serializeArtifact } from './serialize';

export interface PushCommit {
  id: string;
  message: string;
  author?: { email?: string };
  added?: string[];
  modified?: string[];
  removed?: string[];
}
export interface PushPayload {
  commits?: PushCommit[];
}

export type ImportOutcome = 'imported' | 'ignored' | 'conflict' | 'rejected';
export interface ImportResult {
  commit: string;
  path: string;
  outcome: ImportOutcome;
  reason?: string;
}

// Ancien (REQ-42.yaml) ou nouveau (SAT1-REQ-0042.yaml) nom de fichier : voir core/key.ts.
const ARTIFACT_PATH = new RegExp(`^trackers/([A-Z][A-Z0-9]{1,9})/artifacts/(${ITEM_KEY_PATTERN})\\.yaml$`);

/**
 * Synchronisation inverse : importe dans Athena les commits faits directement dans le dépôt d'historique.
 * Règles : seules les valeurs sont importées (le statut ne change que par transition), l'auteur doit
 * correspondre à un utilisateur connu, la validation du tracker s'applique, un artefact ayant des événements
 * non synchronisés vers Git est en conflit (rien n'est écrasé), et un commit n'est importé qu'une fois.
 */
export class ReverseSync {
  constructor(
    private readonly pool: Pool,
    private readonly gitlab: GitLabClient,
    private readonly namespace: string,
    private readonly artifacts: ArtifactService,
    private readonly confidential?: ConfidentialFields,
    private readonly branch = 'main',
  ) {}

  async handlePush(organizationId: string, projectKey: string, payload: PushPayload): Promise<ImportResult[]> {
    const db = new Db(this.pool);
    const orgKey = await db.tx(organizationId, async (c) => (await c.query('select key from organization')).rows[0].key as string);
    const repo = await this.gitlab.ensureRepository(this.namespace, repositoryName(orgKey, projectKey));
    const results: ImportResult[] = [];
    for (const commit of payload.commits ?? []) {
      const fromAthena = /^Athena-Event-Id:/m.test(commit.message);
      for (const path of [...(commit.added ?? []), ...(commit.modified ?? [])]) {
        const match = ARTIFACT_PATH.exec(path);
        if (!match) { results.push({ commit: commit.id, path, outcome: 'ignored', reason: 'fichier non importable' }); continue; }
        if (fromAthena) { results.push({ commit: commit.id, path, outcome: 'ignored', reason: "commit d'Athena" }); continue; }
        const imported = await this.importFile(organizationId, projectKey, repo, commit, path, match[2]!, orgKey);
        // Un commit externe rejeté reste dans Git : Athena y rétablit l'état validé pour que Git et la base convergent.
        if (imported.outcome === 'rejected') await this.correct(organizationId, orgKey, projectKey, repo, path, match[2]!, commit.id, 'rejeté');
        // Un import réussi est normalisé si le fichier édité à la main n'est pas sous la forme canonique (statut, version, mise en forme).
        else if (imported.outcome === 'imported') await this.correct(organizationId, orgKey, projectKey, repo, path, match[2]!, commit.id, 'normalisé');
        results.push(imported);
      }
    }
    return results;
  }

  private async correct(organizationId: string, orgKey: string, projectKey: string, repo: number, path: string, key: string, commitId: string, why: 'rejeté' | 'normalisé'): Promise<void> {
    try {
      const row = await new Db(this.pool).tx(organizationId, async (c) =>
        (
          await c.query(
            `select a.version, a."values" as values, s.key as status, t.key as tracker,
                    coalesce((select array_agg(f.key) from field_definition f where f.tracker_id = a.tracker_id and f.config->>'confidential' = 'true'), '{}') as confidential
             from artifact a join status s on s.id = a.status_id join tracker t on t.id = a.tracker_id join project p on p.id = a.project_id
             where p.key = $1 and a.id = resolve_artifact(p.id, $2)`,
            [projectKey, key],
          )
        ).rows[0],
      );
      if (!row) return;
      const values = this.confidential ? await this.confidential.protect(orgKey, row.values, row.confidential) : row.values;
      const canonical = serializeArtifact({ key, tracker: row.tracker, status: row.status, version: row.version, values });
      if (why === 'normalisé' && (await this.gitlab.fileContent(repo, path, commitId)) === canonical) return;
      await this.gitlab.commit(repo, {
        branch: this.branch,
        message: `${key}: rétablit l'état validé (commit externe ${commitId.slice(0, 8)} ${why === 'rejeté' ? 'rejeté' : 'normalisé'})

Athena-Event-Id: correction-${commitId}
Athena-Actor: athena`,
        authorName: 'Athena',
        authorEmail: 'athena@localhost',
        actions: [{ action: 'update', file_path: path, content: canonical }],
      });
    } catch (error) {
      console.error(`reverse-sync: correction de ${key} impossible : ${(error as Error).message.slice(0, 200)}`);
    }
  }

  private async importFile(organizationId: string, projectKey: string, repo: number, commit: PushCommit, path: string, key: string, orgKey: string): Promise<ImportResult> {
    const db = new Db(this.pool);
    const result = (outcome: ImportOutcome, reason?: string): ImportResult => ({ commit: commit.id, path, outcome, ...(reason ? { reason } : {}) });
    try {
      const state = await db.tx(organizationId, async (c) => {
        const already = await c.query('select 1 from artifact_revision where git_sha = $1', [commit.id]);
        const actor = commit.author?.email
          ? (await c.query('select subject from user_account where lower(email) = lower($1)', [commit.author.email])).rows[0]
          : undefined;
        const artifact = (
          await c.query('select a.id, a.version, a."values" as values from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [projectKey, key])
        ).rows[0];
        const pending = artifact
          ? Number((await c.query("select count(*) n from outbox_event where history_synced_at is null and aggregate_id = $1", [artifact.id])).rows[0].n)
          : 0;
        return { already: already.rowCount! > 0, actor: actor?.subject as string | undefined, artifact, pending };
      });
      if (state.already) return result('ignored', 'commit déjà importé');
      if (!state.artifact) return result('rejected', `artefact ${key} inconnu : la création par Git n'est pas prise en charge`);
      if (!state.actor) return result('rejected', `auteur inconnu : ${commit.author?.email ?? 'sans e-mail'}`);
      if (state.pending > 0) return result('conflict', `${state.pending} modification(s) d'Athena pas encore synchronisée(s) vers Git`);

      let document: { values?: Record<string, unknown> };
      try {
        document = parse(await this.gitlab.fileContent(repo, path, commit.id)) as typeof document;
      } catch {
        return result('rejected', 'YAML illisible');
      }
      if (!document || typeof document.values !== 'object' || document.values === null) return result('rejected', 'champ values absent');
      const incoming = this.confidential ? await this.confidential.reveal(orgKey, document.values) : document.values;
      const patch: Record<string, unknown> = { ...incoming };
      for (const k of Object.keys(state.artifact.values)) if (!(k in incoming)) patch[k] = null;
      if (JSON.stringify(sorted(state.artifact.values)) === JSON.stringify(sorted(incoming))) return result('ignored', 'aucune différence');

      const actor: Actor = { id: state.actor, roles: ['athena-user'] };
      await this.artifacts.update(organizationId, projectKey, key, patch, state.artifact.version as number, actor);
      // La révision créée correspond déjà à ce commit : on évite l'écho d'un second commit d'Athena.
      await db.tx(organizationId, async (c) => {
        await c.query('update artifact_revision set git_sha = $1 where artifact_id = $2 and version = $3', [commit.id, state.artifact.id, state.artifact.version + 1]);
        await c.query("update outbox_event set history_synced_at = now() where history_synced_at is null and aggregate_id = $1", [state.artifact.id]);
      });
      return result('imported');
    } catch (error) {
      if (error instanceof DomainError) return result('rejected', `${error.message} ${error.details.join(' ; ')}`.trim());
      throw error;
    }
  }
}

function sorted(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
