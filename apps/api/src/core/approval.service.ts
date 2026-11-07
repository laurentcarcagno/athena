import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { conflict, notFound } from './errors';
import { audit } from './tracker.service';

export const APPROVAL_TYPES = ['release', 'baseline'] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];
export const DecisionInput = z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().trim().max(2000).default('') });
export const RequiredInput = z.object({ required: z.boolean() });

export type ApprovalState = 'not_required' | 'pending' | 'approved' | 'rejected';
export interface ApprovalDecision { approver: string; approverName: string; decision: 'approved' | 'rejected'; comment: string; decidedAt: string }
export interface ApprovalObject { type: ApprovalType; ref: string; id: string; requiresApproval: boolean; state: ApprovalState; decisions: ApprovalDecision[] }

/** État d'approbation : un refus l'emporte, une décision favorable suffit sinon ; sans exigence ni décision, « non requis ». */
export function approvalState(requires: boolean, decisions: Array<{ decision: string }>): ApprovalState {
  if (decisions.some((d) => d.decision === 'rejected')) return 'rejected';
  if (decisions.some((d) => d.decision === 'approved')) return 'approved';
  return requires ? 'pending' : 'not_required';
}

/**
 * Approbation des jalons (releases) et des baselines par l'assurance qualité étatique. La décision est nominative, horodatée et
 * auditée ; le rôle ne peut rien écrire d'autre (voir `AuthGuard` : lecture seule). Les lectures respectent les listes d'ayants droit.
 */
export class ApprovalService {
  constructor(private readonly db: Db) {}

  private async resolve(c: PoolClient, projectKey: string, type: ApprovalType, ref: string) {
    const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
    if (!project) throw notFound(`Projet ${projectKey}`);
    const table = type === 'release' ? 'release' : 'baseline';
    const row = (await c.query(`select id, name, requires_approval from ${table} where project_id = $1 and name = $2`, [project.id, ref])).rows[0];
    if (!row) throw notFound(type === 'release' ? `Jalon ${ref}` : `Baseline ${ref}`);
    return { projectId: project.id as string, id: row.id as string, requires: row.requires_approval as boolean };
  }

  private async decisions(c: PoolClient, type: ApprovalType, ids: string[]): Promise<Map<string, ApprovalDecision[]>> {
    const out = new Map<string, ApprovalDecision[]>();
    if (ids.length === 0) return out;
    const rows = (await c.query('select object_id, approver, approver_name, decision, comment, decided_at from approval where object_type = $1 and object_id = any($2::uuid[]) order by decided_at', [type, ids])).rows;
    for (const r of rows) out.set(r.object_id as string, [...(out.get(r.object_id as string) ?? []), { approver: r.approver, approverName: r.approver_name, decision: r.decision, comment: r.comment, decidedAt: (r.decided_at as Date).toISOString() }]);
    return out;
  }

  /** Jalons et baselines du projet avec leur état d'approbation. */
  async list(organizationId: string, projectKey: string): Promise<ApprovalObject[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const out: ApprovalObject[] = [];
      for (const type of APPROVAL_TYPES) {
        const rows = (await c.query(`select id, name, requires_approval from ${type} where project_id = $1 order by created_at desc`, [project.id])).rows;
        const decided = await this.decisions(c, type, rows.map((r) => r.id as string));
        for (const r of rows) {
          const decisions = decided.get(r.id as string) ?? [];
          out.push({ type, ref: r.name as string, id: r.id as string, requiresApproval: r.requires_approval as boolean, state: approvalState(r.requires_approval as boolean, decisions), decisions });
        }
      }
      return out;
    });
  }

  /** Exige (ou non) l'approbation de l'objet : réservé aux responsables par le contrôleur. Audité. */
  async setRequired(organizationId: string, projectKey: string, type: ApprovalType, ref: string, required: boolean, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const o = await this.resolve(c, projectKey, type, ref);
      await c.query(`update ${type} set requires_approval = $2 where id = $1`, [o.id, required]);
      await audit(c, organizationId, actor, 'approval.required', `${type}:${ref}`, { project: projectKey, required });
    });
  }

  /** Décision nominative de l'assurance qualité étatique. Une nouvelle décision du même approbateur remplace la précédente (horodatage mis à jour). */
  async decide(organizationId: string, projectKey: string, type: ApprovalType, ref: string, input: z.infer<typeof DecisionInput>, approver: { id: string; name: string }, actor: Actor): Promise<ApprovalObject> {
    return this.db.tx(organizationId, async (c) => {
      const o = await this.resolve(c, projectKey, type, ref);
      if (type === 'release') {
        const state = (await c.query('select state from release where id = $1', [o.id])).rows[0].state as string;
        if (state === 'released' && input.decision === 'rejected') throw conflict('Un jalon déjà publié ne peut plus être refusé.');
      }
      await c.query(
        `insert into approval (organization_id, project_id, object_type, object_id, approver, approver_name, decision, comment) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (object_type, object_id, approver) where object_type <> 'item' do update set decision = excluded.decision, comment = excluded.comment, approver_name = excluded.approver_name, decided_at = now()`,
        [organizationId, o.projectId, type, o.id, approver.id, approver.name, input.decision, input.comment],
      );
      await audit(c, organizationId, actor, `approval.${input.decision}`, `${type}:${ref}`, { project: projectKey, comment: input.comment });
      const decisions = (await this.decisions(c, type, [o.id])).get(o.id) ?? [];
      return { type, ref, id: o.id, requiresApproval: o.requires, state: approvalState(o.requires, decisions), decisions };
    });
  }

  /** État d'approbation d'un jalon (pour bloquer la publication tant qu'il n'est pas approuvé). */
  async releaseState(c: PoolClient, releaseId: string): Promise<ApprovalState> {
    const row = (await c.query('select requires_approval from release where id = $1', [releaseId])).rows[0];
    if (!row) return 'not_required';
    const decisions = (await this.decisions(c, 'release', [releaseId])).get(releaseId) ?? [];
    return approvalState(row.requires_approval as boolean, decisions);
  }
}
