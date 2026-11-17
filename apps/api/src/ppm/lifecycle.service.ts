import { Db, type Actor } from '../core/db';
import { conflict, forbidden, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import { defaultLifecycle, lifecycleProblems, type LifecycleConfig, type LifecycleInputData, type LifecycleRole, type LifecycleState } from './lifecycle';

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface LifecycleHistoryEntry { from: string | null; to: string; reason: string; by: string; at: string }
export interface ProjectLifecycle {
  state: LifecycleState;
  /** Transitions sortantes de l'état courant, avec la permission de l'appelant. */
  next: Array<{ to: string; name: string; category: string; permitted: boolean; reasonRequired: boolean }>;
  history: LifecycleHistoryEntry[];
}

/** Cycle de vie configurable du projet : configuration de l'organisation, transitions permises et historique en ajout seul. */
export class LifecycleService {
  constructor(private readonly db: Db) {}

  async config(organizationId: string): Promise<LifecycleConfig & { customized: boolean }> {
    return this.db.tx(organizationId, async (c) => this.readConfig(c));
  }

  /** Remplace toute la configuration. Un état courant d'un projet ne peut pas disparaître (on le masque). */
  async put(organizationId: string, input: LifecycleInputData, actor: Actor): Promise<LifecycleConfig & { customized: boolean }> {
    return this.db.tx(organizationId, async (c) => {
      const used = (await c.query('select distinct lifecycle_state k from project')).rows.map((r) => r.k as string);
      const problems = lifecycleProblems(input, used);
      if (problems.length) throw validation(problems);
      await c.query('delete from project_lifecycle_transition');
      await c.query('delete from project_lifecycle_state');
      for (const [position, s] of input.states.entries()) {
        await c.query('insert into project_lifecycle_state (organization_id, key, name, category, position, hidden) values ($1,$2,$3,$4,$5,$6)', [organizationId, s.key, s.name, s.category, position, s.hidden]);
      }
      for (const t of input.transitions) await c.query('insert into project_lifecycle_transition (organization_id, from_key, to_key, roles) values ($1,$2,$3,$4)', [organizationId, t.from, t.to, t.roles]);
      await audit(c, organizationId, actor, 'lifecycle.update', 'lifecycle', { states: input.states.length, transitions: input.transitions.length });
      return this.readConfig(c);
    });
  }

  /** Retour aux états livrés. */
  async reset(organizationId: string, actor: Actor): Promise<LifecycleConfig & { customized: boolean }> {
    return this.db.tx(organizationId, async (c) => {
      await c.query('delete from project_lifecycle_transition');
      await c.query('delete from project_lifecycle_state');
      await audit(c, organizationId, actor, 'lifecycle.reset', 'lifecycle', {});
      return this.readConfig(c);
    });
  }

  async forProject(organizationId: string, projectKey: string, actor: Actor): Promise<ProjectLifecycle> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const cfg = await this.readConfig(c);
      const state = this.stateOf(cfg, project.lifecycle_state);
      const isManager = await this.isManager(c, project.id, actor);
      const next = cfg.transitions.filter((t) => t.from === state.key).map((t) => {
        const target = this.stateOf(cfg, t.to);
        return { to: t.to, name: target.name, category: target.category, permitted: this.permits(t.roles, actor, isManager), reasonRequired: target.category === 'cancelled' };
      });
      const history = (await c.query('select from_key, to_key, reason, changed_by, changed_at from project_lifecycle_history where project_id = $1 order by changed_at, id', [project.id]))
        .rows.map((r) => ({ from: r.from_key, to: r.to_key, reason: r.reason, by: r.changed_by, at: new Date(r.changed_at).toISOString() }));
      return { state, next, history };
    });
  }

  /** Change l'état du projet : transition permise, droit de l'acteur, motif obligatoire vers une catégorie « cancelled ». */
  async transition(organizationId: string, projectKey: string, to: string, reason: string, actor: Actor): Promise<ProjectLifecycle> {
    await this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const cfg = await this.readConfig(c);
      const from = this.stateOf(cfg, project.lifecycle_state);
      const edge = cfg.transitions.find((t) => t.from === from.key && t.to === to);
      const target = cfg.states.find((s) => s.key === to);
      if (!edge || !target) throw conflict(`La transition « ${from.name} → ${to} » n’est pas permise.`);
      if (!this.permits(edge.roles, actor, await this.isManager(c, project.id, actor))) throw forbidden(`Vous ne pouvez pas faire passer ${projectKey} de « ${from.name} » à « ${target.name} ».`);
      if (target.category === 'cancelled' && reason.trim() === '') throw validation(['reason : un motif est obligatoire pour annuler ou refuser']);
      await c.query('update project set lifecycle_state = $1 where id = $2', [to, project.id]);
      await c.query('insert into project_lifecycle_history (organization_id, project_id, from_key, to_key, reason, changed_by) values ($1,$2,$3,$4,$5,$6)', [organizationId, project.id, from.key, to, reason.trim(), actor.id]);
      await audit(c, organizationId, actor, 'project.lifecycle', `project:${projectKey}`, { from: from.key, to, reason: reason.trim() });
    });
    return this.forProject(organizationId, projectKey, actor);
  }

  private async readConfig(c: Client): Promise<LifecycleConfig & { customized: boolean }> {
    const states = (await c.query('select key, name, category, position, hidden from project_lifecycle_state order by position')).rows as LifecycleState[];
    if (states.length === 0) return { ...defaultLifecycle(), customized: false };
    const transitions = (await c.query('select from_key, to_key, roles from project_lifecycle_transition order by from_key, to_key')).rows.map((r) => ({ from: r.from_key as string, to: r.to_key as string, roles: r.roles as LifecycleRole[] }));
    return { states, transitions, customized: true };
  }

  private async project(c: Client, key: string): Promise<{ id: string; lifecycle_state: string }> {
    const project = (await c.query('select id, lifecycle_state from project where key = $1', [key])).rows[0];
    if (!project) throw notFound(`Projet ${key}`);
    return project;
  }

  private stateOf(cfg: LifecycleConfig, key: string): LifecycleState {
    return cfg.states.find((s) => s.key === key) ?? { key, name: key, category: 'active', position: -1, hidden: true };
  }

  private async isManager(c: Client, projectId: string, actor: Actor): Promise<boolean> {
    if (!actor.roles.includes('athena-pm')) return false;
    return Boolean((await c.query("select 1 from project_member where project_id = $1 and subject = $2 and role = 'manager'", [projectId, actor.id])).rows[0]);
  }

  private permits(roles: LifecycleRole[], actor: Actor, isManager: boolean): boolean {
    if (actor.roles.includes('athena-admin')) return true;
    return (roles.includes('pmo') && actor.roles.includes('athena-pmo')) || (roles.includes('manager') && isManager);
  }
}
