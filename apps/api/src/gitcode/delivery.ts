import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit, outbox } from '../core/tracker.service';

export interface BackportView {
  branch: string;
  state: 'pending' | 'done';
  mr: string | null;
  doneAt: string | null;
}

export interface Dora {
  windowDays: number;
  deployments: number;
  /** Déploiements en production par jour. */
  deploymentFrequency: number;
  /** Médiane en heures entre l'ouverture de la merge request et son déploiement. */
  leadTimeHours: number | null;
  /** Part des artefacts déployés ayant fait l'objet d'un commit `Reverts` ensuite. */
  changeFailureRate: number | null;
  /** Durée moyenne en heures entre la création et la dernière mise à jour des incidents résolus. */
  mttrHours: number | null;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const round = (n: number) => Math.round(n * 100) / 100;

/** Rétroportages, indicateurs DORA et notes de version (plan § 17.6 et § 17.7). */
export class DeliveryService {
  constructor(private readonly db: Db) {}

  async planBackports(organizationId: string, projectKey: string, artifactKey: string, branches: string[], actor: Actor): Promise<BackportView[]> {
    const invalid = branches.filter((b) => !/^release\/[0-9A-Za-z._-]{1,60}$/.test(b));
    if (invalid.length || branches.length === 0 || branches.length > 20) throw validation(['branches de maintenance attendues : release/<version>']);
    return this.db.tx(organizationId, async (c) => {
      const artifact = await this.artifact(c, projectKey, artifactKey);
      for (const branch of branches) {
        await c.query("insert into backport (organization_id, artifact_id, branch) values ($1,$2,$3) on conflict (artifact_id, branch) do nothing", [organizationId, artifact, branch]);
      }
      await outbox(c, organizationId, 'artifact', artifact, 'backport.planned', { key: artifactKey, branches, actor: actor.id });
      await audit(c, organizationId, actor, 'backport.plan', `artifact:${artifactKey}`, { branches });
      return this.list(c, artifact);
    });
  }

  async backports(organizationId: string, projectKey: string, artifactKey: string): Promise<BackportView[]> {
    return this.db.tx(organizationId, async (c) => this.list(c, await this.artifact(c, projectKey, artifactKey)));
  }

  /** Abandon explicite d'un rétroportage (branche non concernée) : audité, jamais silencieux. */
  async cancelBackport(organizationId: string, projectKey: string, artifactKey: string, branch: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const artifact = await this.artifact(c, projectKey, artifactKey);
      const result = await c.query("delete from backport where artifact_id = $1 and branch = $2 and state = 'pending'", [artifact, branch]);
      if (result.rowCount === 0) throw conflict('Rétroportage inconnu ou déjà terminé.');
      await audit(c, organizationId, actor, 'backport.cancel', `artifact:${artifactKey}`, { branch });
    });
  }

  async dora(organizationId: string, projectKey: string, days = 30, incidentTracker?: string): Promise<Dora> {
    if (!Number.isInteger(days) || days < 1 || days > 365) throw validation(['days : entre 1 et 365']);
    return this.db.tx(organizationId, async (c) => {
      const deployed = (
        await c.query(
          `select r.artifact_id, r.created_at, r.deployed_at from code_ref r join artifact a on a.id = r.artifact_id join project p on p.id = a.project_id
           where p.key = $1 and r.kind = 'mr' and r.environment = 'production' and r.deployed_at > now() - ($2 || ' days')::interval`,
          [projectKey, String(days)],
        )
      ).rows;
      const leadTimes = deployed.map((r) => (r.deployed_at.getTime() - r.created_at.getTime()) / 3_600_000).filter((h) => h >= 0);
      const deployedArtifacts = new Set<string>(deployed.map((r) => r.artifact_id as string));
      let failed = 0;
      if (deployedArtifacts.size > 0) {
        failed = Number(
          (
            await c.query(
              "select count(distinct r.artifact_id) n from code_ref r where r.artifact_id = any($1) and r.kind = 'commit' and r.state = 'reverts'",
              [[...deployedArtifacts]],
            )
          ).rows[0].n,
        );
      }
      let mttr: number | null = null;
      if (incidentTracker) {
        const rows = (
          await c.query(
            `select extract(epoch from (a.updated_at - a.created_at)) / 3600 as hours from artifact a
             join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id join project p on p.id = a.project_id
             where p.key = $1 and t.key = $2 and s.category = 'done' and a.updated_at > now() - ($3 || ' days')::interval`,
            [projectKey, incidentTracker, String(days)],
          )
        ).rows.map((r) => Number(r.hours));
        mttr = rows.length ? round(rows.reduce((n, h) => n + h, 0) / rows.length) : null;
      }
      const lead = median(leadTimes);
      return {
        windowDays: days,
        deployments: deployed.length,
        deploymentFrequency: round(deployed.length / days),
        leadTimeHours: lead === null ? null : round(lead),
        changeFailureRate: deployedArtifacts.size ? round(failed / deployedArtifacts.size) : null,
        mttrHours: mttr,
      };
    });
  }

  /** Notes de version en Markdown, déterministes : éléments de la release groupés par tracker, triés par numéro. */
  async releaseNotes(organizationId: string, projectKey: string, releaseId: string): Promise<string> {
    return this.db.tx(organizationId, async (c) => {
      const release = (
        await c.query('select r.name, r.starts_on::text as starts, r.ends_on::text as ends, r.state from release r join project p on p.id = r.project_id where p.key = $1 and r.id = $2', [projectKey, releaseId])
      ).rows[0];
      if (!release) throw notFound('Version');
      const items = (
        await c.query(
          `select a.key, a.number, t.key as tracker, t.name as tracker_name, s.category, s.name as status,
                  coalesce(a."values" ->> (select f.key from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'title'), a.key) as title
           from release_item i join artifact a on a.id = i.artifact_id join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id
           where i.release_id = $1 order by t.key, a.number`,
          [releaseId],
        )
      ).rows;
      const lines = [`# Notes de version — ${release.name}`, '', `Période : ${release.starts} → ${release.ends} · état : ${release.state}`];
      if (items.length === 0) lines.push('', 'Aucun élément.');
      let current = '';
      for (const item of items) {
        if (item.tracker !== current) {
          current = item.tracker;
          lines.push('', `## ${item.tracker_name}`, '');
        }
        lines.push(`- ${item.key} — ${String(item.title).replace(/\s+/g, ' ').trim()}${item.category === 'done' ? '' : ` _(${item.status})_`}`);
      }
      return `${lines.join('\n')}\n`;
    });
  }

  private async list(c: PoolClient, artifact: string): Promise<BackportView[]> {
    return (await c.query('select branch, state, mr_ref, done_at from backport where artifact_id = $1 order by branch', [artifact])).rows.map((r) => ({
      branch: r.branch, state: r.state, mr: r.mr_ref, doneAt: r.done_at ? (r.done_at as Date).toISOString() : null,
    }));
  }

  private async artifact(c: PoolClient, projectKey: string, key: string): Promise<string> {
    const row = (await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [projectKey, key])).rows[0];
    if (!row) throw notFound(`Ticket ${key}`);
    return row.id as string;
  }
}
