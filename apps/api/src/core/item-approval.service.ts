import type { PoolClient } from 'pg';
import { z } from 'zod';
import { emit } from '../notify/notify.service';
import { Db, type Actor } from './db';
import { conflict, forbidden, notFound, validation } from './errors';
import { audit } from './tracker.service';

export const StepInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['review', 'approval']),
  /** Sujets des personnes nommées autorisées à décider à cette étape. */
  approvers: z.array(z.string().min(1).max(200)).max(50).default([]),
  /** Rôle autorisé à décider : l'assurance qualité étatique (T-0080). */
  role: z.literal('athena-qa').nullish(),
  minApprovals: z.number().int().min(1).max(20).default(1),
}).refine((s) => s.approvers.length > 0 || s.role, { message: 'une étape désigne des personnes ou le rôle assurance qualité' })
  .refine((s) => s.role || s.minApprovals <= new Set(s.approvers).size, { message: 'le nombre de décisions requises dépasse le nombre de personnes désignées' });
export const FlowInput = z.object({ enabled: z.boolean(), steps: z.array(StepInput).min(1).max(20) });
export const ItemDecisionInput = z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().trim().max(2000).default('') });
export type FlowInput = z.infer<typeof FlowInput>;

export type ItemApprovalState = 'not_required' | 'pending' | 'approved' | 'rejected';
export interface ItemDecision { approver: string; approverName: string; decision: 'approved' | 'rejected'; comment: string; decidedAt: string }
export interface StepView {
  id: string; position: number; name: string; kind: 'review' | 'approval';
  approvers: Array<{ subject: string; displayName: string }>; role: 'athena-qa' | null; minApprovals: number;
  /** `done` : assez de décisions favorables ; `current` : en attente (ou refusée, voir `decisions`) ; `waiting` : étape précédente non terminée. */
  state: 'done' | 'current' | 'waiting' | 'rejected';
  decisions: ItemDecision[];
}
export interface ItemApprovalView {
  /** Un circuit est défini sur le tracker. */
  configured: boolean;
  enabled: boolean;
  state: ItemApprovalState;
  currentStep: number | null;
  steps: StepView[];
  /** Décisions invalidées par une modification de contenu depuis la dernière décision valide (message à afficher). */
  invalidated: { at: string; version: number | null; count: number } | null;
  /** L'appelant peut décider à l'étape courante. */
  canDecide: boolean;
}

interface StepRow { id: string; position: number; name: string; kind: 'review' | 'approval'; approvers: string[]; approver_role: 'athena-qa' | null; min_approvals: number }
interface DecisionRow { step_id: string | null; approver: string; approver_name: string; decision: 'approved' | 'rejected'; comment: string; decided_at: Date }

/** Calcul pur de l'état du circuit : première étape non terminée, un refus l'emporte à son étape. */
export function circuitState(steps: Array<{ id: string; minApprovals: number }>, decisions: Array<{ stepId: string | null; decision: string }>): { state: ItemApprovalState; currentIndex: number | null; stepStates: StepView['state'][] } {
  const stepStates: StepView['state'][] = steps.map(() => 'waiting');
  for (let i = 0; i < steps.length; i++) {
    const here = decisions.filter((d) => d.stepId === steps[i]!.id);
    if (here.some((d) => d.decision === 'rejected')) { stepStates[i] = 'rejected'; return { state: 'rejected', currentIndex: i, stepStates }; }
    if (here.filter((d) => d.decision === 'approved').length >= steps[i]!.minApprovals) { stepStates[i] = 'done'; continue; }
    stepStates[i] = 'current';
    return { state: 'pending', currentIndex: i, stepStates };
  }
  return { state: steps.length > 0 ? 'approved' : 'not_required', currentIndex: null, stepStates };
}

/**
 * Circuits d'approbation des items : défini sur le tracker, étapes ordonnées de relecture ou d'approbation, décisions nominatives et
 * horodatées (table `approval`, la même que celle de l'assurance qualité étatique pour les jalons et baselines), journalisées dans
 * l'audit chaîné. Une modification de contenu de l'item invalide les décisions en cours.
 */
export class ItemApprovalService {
  constructor(private readonly db: Db) {}

  private async tracker(c: PoolClient, projectKey: string, trackerKey: string) {
    const row = (await c.query('select t.id, t.project_id from tracker t join project p on p.id = t.project_id where p.key = $1 and t.key = $2', [projectKey, trackerKey])).rows[0];
    if (!row) throw notFound(`Tracker ${trackerKey}`);
    return { id: row.id as string, projectId: row.project_id as string };
  }

  /** Circuit défini sur le tracker (étapes vides si aucun). */
  async getFlow(organizationId: string, projectKey: string, trackerKey: string): Promise<{ enabled: boolean; configured: boolean; steps: Array<Omit<StepView, 'state' | 'decisions'>> }> {
    return this.db.tx(organizationId, async (c) => {
      const t = await this.tracker(c, projectKey, trackerKey);
      const flow = (await c.query('select id, enabled from approval_flow where tracker_id = $1', [t.id])).rows[0];
      if (!flow) return { enabled: false, configured: false, steps: [] };
      return { enabled: flow.enabled as boolean, configured: true, steps: await this.steps(c, flow.id as string) };
    });
  }

  private async steps(c: PoolClient, flowId: string): Promise<Array<Omit<StepView, 'state' | 'decisions'>>> {
    const rows = (await c.query('select id, position, name, kind, approvers, approver_role, min_approvals from approval_step where flow_id = $1 order by position', [flowId])).rows as StepRow[];
    const subjects = [...new Set(rows.flatMap((r) => r.approvers))];
    const names = new Map((await c.query('select subject, display_name from user_account where subject = any($1::text[])', [subjects])).rows.map((r) => [r.subject as string, r.display_name as string]));
    return rows.map((r) => ({
      id: r.id, position: r.position, name: r.name, kind: r.kind, role: r.approver_role, minApprovals: r.min_approvals,
      approvers: r.approvers.map((s) => ({ subject: s, displayName: names.get(s) ?? s })),
    }));
  }

  /** Remplace le circuit du tracker. Les décisions en cours sur ses items sont invalidées (le circuit change) et l'opération est auditée. */
  async setFlow(organizationId: string, projectKey: string, trackerKey: string, input: FlowInput, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const t = await this.tracker(c, projectKey, trackerKey);
      const wanted = [...new Set(input.steps.flatMap((s) => s.approvers))];
      const known = new Set((await c.query('select subject from user_account where subject = any($1::text[])', [wanted])).rows.map((r) => r.subject as string));
      const unknown = wanted.filter((s) => !known.has(s));
      if (unknown.length) throw validation([`utilisateur(s) inconnu(s) : ${unknown.join(', ')}`]);
      const flow = (await c.query(
        `insert into approval_flow (organization_id, project_id, tracker_id, enabled, created_by) values ($1,$2,$3,$4,$5)
         on conflict (tracker_id) do update set enabled = excluded.enabled, updated_at = now() returning id`,
        [organizationId, t.projectId, t.id, input.enabled, actor.id])).rows[0];
      const invalidated = await c.query(
        `update approval set invalidated_at = now() where object_type = 'item' and invalidated_at is null
           and object_id in (select id from artifact where tracker_id = $1)`, [t.id]);
      await c.query('delete from approval_step where flow_id = $1', [flow.id]);
      for (const [i, s] of input.steps.entries()) {
        await c.query(
          'insert into approval_step (organization_id, flow_id, position, name, kind, approvers, approver_role, min_approvals) values ($1,$2,$3,$4,$5,$6,$7,$8)',
          [organizationId, flow.id, i + 1, s.name, s.kind, [...new Set(s.approvers)], s.role ?? null, s.minApprovals]);
      }
      await audit(c, organizationId, actor, 'approval.flow_set', `tracker:${projectKey}/${trackerKey}`, {
        enabled: input.enabled, steps: input.steps.map((s) => ({ name: s.name, kind: s.kind, approvers: s.approvers, role: s.role ?? null, min: s.minApprovals })), invalidatedDecisions: invalidated.rowCount ?? 0,
      });
    });
  }

  /** Charge l'état du circuit d'un item pour `viewer` (sujet et rôles de l'appelant). */
  async viewIn(c: PoolClient, artifactId: string, viewer?: { subject: string; roles: string[] }): Promise<ItemApprovalView> {
    const flow = (await c.query('select f.id, f.enabled from approval_flow f join artifact a on a.tracker_id = f.tracker_id where a.id = $1', [artifactId])).rows[0];
    if (!flow) return { configured: false, enabled: false, state: 'not_required', currentStep: null, steps: [], invalidated: null, canDecide: false };
    const steps = await this.steps(c, flow.id as string);
    const decisions = (await c.query(
      `select step_id, approver, approver_name, decision, comment, decided_at from approval
       where object_type = 'item' and object_id = $1 and invalidated_at is null order by decided_at, id`, [artifactId])).rows as DecisionRow[];
    const stale = (await c.query(
      `select max(invalidated_at) as at, max(invalidated_version) as version, count(*)::int as n from approval
       where object_type = 'item' and object_id = $1 and invalidated_at is not null`, [artifactId])).rows[0];
    const calc = circuitState(steps.map((s) => ({ id: s.id, minApprovals: s.minApprovals })), decisions.map((d) => ({ stepId: d.step_id, decision: d.decision })));
    const views: StepView[] = steps.map((s, i) => ({
      ...s, state: calc.stepStates[i]!,
      decisions: decisions.filter((d) => d.step_id === s.id).map((d) => ({ approver: d.approver, approverName: d.approver_name, decision: d.decision, comment: d.comment, decidedAt: d.decided_at.toISOString() })),
    }));
    const enabled = flow.enabled as boolean;
    const state: ItemApprovalState = enabled ? calc.state : 'not_required';
    const current = enabled && calc.currentIndex !== null ? views[calc.currentIndex]! : null;
    const lastDecision = decisions.at(-1)?.decided_at;
    const showStale = stale.n > 0 && !(lastDecision && stale.at && lastDecision > stale.at);
    const eligible = (s: StepView) => viewer !== undefined && (s.approvers.some((a) => a.subject === viewer.subject) || (s.role !== null && viewer.roles.includes(s.role)));
    return {
      configured: true, enabled, state, currentStep: current?.position ?? null, steps: views,
      invalidated: showStale ? { at: (stale.at as Date).toISOString(), version: (stale.version as number | null) ?? null, count: stale.n as number } : null,
      canDecide: current !== null && eligible(current) && viewer !== undefined,
    };
  }

  async get(organizationId: string, projectKey: string, key: string, viewer: { subject: string; roles: string[] }): Promise<ItemApprovalView> {
    return this.db.tx(organizationId, async (c) => {
      const art = await this.artifact(c, projectKey, key, false);
      return this.viewIn(c, art.id, viewer);
    });
  }

  private async artifact(c: PoolClient, projectKey: string, key: string, lock: boolean) {
    const row = (await c.query(
      `select a.id, a.key, a.version from artifact a join project p on p.id = a.project_id
       where p.key = $1 and a.id = resolve_artifact(p.id, $2) ${lock ? 'for update of a' : ''}`, [projectKey, key])).rows[0];
    if (!row) throw notFound(`Ticket ${key}`);
    return { id: row.id as string, key: row.key as string, version: row.version as number };
  }

  /** Décision nominative d'une personne désignée à l'étape courante. Une nouvelle décision de la même personne remplace la sienne. */
  async decide(organizationId: string, projectKey: string, key: string, input: z.infer<typeof ItemDecisionInput>, who: { subject: string; name: string; roles: string[] }, actor: Actor): Promise<ItemApprovalView> {
    return this.db.tx(organizationId, async (c) => {
      const art = await this.artifact(c, projectKey, key, true);
      const before = await this.viewIn(c, art.id, who);
      if (!before.configured || !before.enabled) throw conflict("Aucun circuit d'approbation actif sur le tracker de cet item.");
      if (before.state === 'approved') throw conflict("L'item est déjà approuvé ; une modification de son contenu rouvre le circuit.");
      const step = before.steps.find((s) => s.position === before.currentStep);
      if (!step) throw conflict("Aucune étape en attente.");
      if (!before.canDecide) throw forbidden(`Vous n'êtes pas désigné pour l'étape « ${step.name} ».`);
      await c.query(
        `insert into approval (organization_id, project_id, object_type, object_id, approver, approver_name, decision, comment, step_id, object_version)
         select $1, a.project_id, 'item', a.id, $3, $4, $5, $6, $7, a.version from artifact a where a.id = $2
         on conflict (object_id, step_id, approver) where object_type = 'item' and invalidated_at is null
         do update set decision = excluded.decision, comment = excluded.comment, approver_name = excluded.approver_name, decided_at = now(), object_version = excluded.object_version`,
        [organizationId, art.id, who.subject, who.name, input.decision, input.comment, step.id]);
      await audit(c, organizationId, actor, `approval.item.${input.decision}`, `artifact:${art.key}`, { project: projectKey, step: step.name, position: step.position, version: art.version, comment: input.comment });
      const after = await this.viewIn(c, art.id, who);
      await emit(c, organizationId, { event: 'approval', artifactId: art.id, actor: who.subject, payload: { decision: input.decision, step: step.name, state: after.state } });
      // L'étape suivante s'ouvre : ses approbateurs nommés sont avertis.
      if (after.state === 'pending' && after.currentStep !== null && after.currentStep !== before.currentStep) {
        const next = after.steps.find((s) => s.position === after.currentStep)!;
        if (next.approvers.length) await emit(c, organizationId, { event: 'approval', artifactId: art.id, actor: who.subject, directOnly: true, direct: next.approvers.map((a) => a.subject), payload: { opened: next.name, state: after.state } });
      }
      return after;
    });
  }
}

/**
 * Invalide les décisions en cours d'un item dont le contenu vient de changer (appelée par `ArtifactService.update`, dans sa transaction).
 * Les lignes sont conservées, marquées ; l'audit chaîné consigne l'invalidation ; les approbateurs et abonnés sont avertis.
 */
export async function invalidateItemApprovals(c: PoolClient, organizationId: string, artifactId: string, key: string, version: number, actor: Actor): Promise<number> {
  const rows = (await c.query(
    `update approval set invalidated_at = now(), invalidated_version = $2
     where object_type = 'item' and object_id = $1 and invalidated_at is null returning approver`, [artifactId, version])).rows;
  if (rows.length === 0) return 0;
  await audit(c, organizationId, actor, 'approval.invalidated', `artifact:${key}`, { version, decisions: rows.length });
  await emit(c, organizationId, { event: 'approval', artifactId, actor: actor.id, direct: [...new Set(rows.map((r) => r.approver as string))], payload: { invalidated: true, version } });
  return rows.length;
}

/** Vrai si l'item peut franchir une transition gardée par le validateur `approval` : pas de circuit actif, ou circuit terminé. */
export async function approvalSatisfied(c: PoolClient, artifactId: string): Promise<boolean> {
  const flow = (await c.query('select f.id, f.enabled from approval_flow f join artifact a on a.tracker_id = f.tracker_id where a.id = $1', [artifactId])).rows[0];
  if (!flow || !flow.enabled) return true;
  const steps = (await c.query('select id, min_approvals from approval_step where flow_id = $1 order by position', [flow.id])).rows;
  const decisions = (await c.query("select step_id, decision from approval where object_type = 'item' and object_id = $1 and invalidated_at is null", [artifactId])).rows;
  return circuitState(steps.map((s) => ({ id: s.id as string, minApprovals: s.min_approvals as number })), decisions.map((d) => ({ stepId: d.step_id as string | null, decision: d.decision as string }))).state === 'approved';
}
