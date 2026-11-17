import type { PoolClient } from 'pg';
import { healthOf, type Health, type KpiService, type ProjectKpis } from '../agile/kpi.service';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

export interface PortfolioView { key: string; name: string; description: string; owner: string | null; projects: number }
export interface PortfolioProject {
  key: string; name: string;
  /** Santé effective : celle que la personne qui pilote a forcée, sinon la santé calculée (bloqués et retards). */
  health: Health; computedHealth: Health; overridden: boolean; reasons: string[]; note: string;
  progress: number; open: number; late: number; blocked: number; dueSoon: number;
  managers: string[]; members: number;
  sprint: { name: string; percent: number; daysLeft: number | null } | null;
}
export interface PortfolioSummary {
  portfolio: PortfolioView;
  projects: PortfolioProject[];
  totals: { projects: number; byHealth: Record<Health, number>; progress: number; open: number; late: number; blocked: number };
}

const KEY = /^[a-z0-9][a-z0-9-]{1,29}$/;
const ORDER: Record<Health, number> = { critical: 0, attention: 1, ok: 2 };

/** Portefeuilles de projets (ADR-0008) : regroupement, santé consolidée, avancement et retards. Lecture pour le directeur, gestion pour l'administrateur. */
export class PortfolioService {
  constructor(private readonly db: Db, private readonly kpis: Pick<KpiService, 'kpis'>) {}

  async list(organizationId: string): Promise<PortfolioView[]> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select f.key, f.name, f.description, coalesce(u.display_name, u.username, f.owner_subject) as owner,
              (select count(*)::int from portfolio_project x join project p on p.id = x.project_id where x.portfolio_id = f.id) as projects
         from portfolio f left join user_account u on u.organization_id = f.organization_id and u.subject = f.owner_subject
        order by lower(f.name)`)).rows.map((r) => ({ key: r.key, name: r.name, description: r.description, owner: r.owner, projects: r.projects })));
  }

  async create(organizationId: string, input: { key: string; name: string; description?: string; owner?: string | null }, actor: Actor): Promise<PortfolioView> {
    if (!KEY.test(input.key)) throw validation(['clé de portefeuille invalide (minuscules, chiffres et tirets)']);
    await this.db.tx(organizationId, async (c) => {
      if ((await c.query('select 1 from portfolio where key = $1', [input.key])).rows[0]) throw conflict(`Le portefeuille ${input.key} existe déjà.`);
      await c.query('insert into portfolio (organization_id, key, name, description, owner_subject, created_by) values ($1,$2,$3,$4,$5,$6)',
        [organizationId, input.key, input.name.trim(), (input.description ?? '').trim(), input.owner ?? null, actor.id]);
      await audit(c, organizationId, actor, 'portfolio.create', `portfolio:${input.key}`, { name: input.name });
    });
    return this.view(organizationId, input.key);
  }

  async update(organizationId: string, key: string, patch: { name?: string; description?: string; owner?: string | null }, actor: Actor): Promise<PortfolioView> {
    await this.db.tx(organizationId, async (c) => {
      const f = await this.require(c, key);
      await c.query(
        `update portfolio set name = coalesce($2, name), description = coalesce($3, description),
                owner_subject = case when $4::boolean then $5 else owner_subject end where id = $1`,
        [f.id, patch.name?.trim() ?? null, patch.description?.trim() ?? null, patch.owner !== undefined, patch.owner ?? null]);
      await audit(c, organizationId, actor, 'portfolio.update', `portfolio:${key}`, patch);
    });
    return this.view(organizationId, key);
  }

  async remove(organizationId: string, key: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const f = await this.require(c, key);
      await c.query('delete from portfolio where id = $1', [f.id]);
      await audit(c, organizationId, actor, 'portfolio.delete', `portfolio:${key}`, {});
    });
  }

  /** Rattache un projet (ou met à jour sa note et sa santé forcée ; `health: null` rend la santé calculée). */
  async setProject(organizationId: string, key: string, projectKey: string, patch: { health?: Health | null; note?: string; kind?: 'delivery' | 'pilot'; purpose?: string }, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const f = await this.require(c, key);
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      await c.query(
        `insert into portfolio_project (organization_id, portfolio_id, project_id, position, health_override, note, added_by, kind, purpose)
         values ($1,$2,$3,(select coalesce(max(position), -1) + 1 from portfolio_project where portfolio_id = $2),$4,$5,$6,coalesce($9, 'delivery'),$11)
         on conflict (portfolio_id, project_id) do update set
           health_override = case when $7::boolean then excluded.health_override else portfolio_project.health_override end,
           note = case when $8::boolean then excluded.note else portfolio_project.note end,
           kind = coalesce($9, portfolio_project.kind), purpose = case when $10::boolean then $11 else portfolio_project.purpose end`,
        [organizationId, f.id, project.id, patch.health ?? null, (patch.note ?? '').trim(), actor.id, patch.health !== undefined, patch.note !== undefined, patch.kind ?? null, patch.purpose !== undefined, (patch.purpose ?? '').trim()]);
      await audit(c, organizationId, actor, 'portfolio.project.set', `portfolio:${key}`, { project: projectKey, ...patch });
    });
  }

  async removeProject(organizationId: string, key: string, projectKey: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const f = await this.require(c, key);
      const r = await c.query('delete from portfolio_project where portfolio_id = $1 and project_id = (select id from project where key = $2)', [f.id, projectKey]);
      if (r.rowCount === 0) throw notFound(`Projet ${projectKey} dans le portefeuille`);
      await audit(c, organizationId, actor, 'portfolio.project.remove', `portfolio:${key}`, { project: projectKey });
    });
  }

  /** Synthèse d'un portefeuille : une ligne par projet (les plus à risque d'abord) et les totaux. */
  async summary(organizationId: string, key: string, actor: Actor, cache: Map<string, Promise<ProjectKpis>> = new Map()): Promise<PortfolioSummary> {
    const { view, rows } = await this.db.tx(organizationId, async (c) => {
      const f = await this.require(c, key);
      const rows = (await c.query(
        `select p.key, x.health_override, x.note from portfolio_project x join project p on p.id = x.project_id
          where x.portfolio_id = $1 and x.kind = 'delivery' order by x.position, p.key`, [f.id])).rows as Array<{ key: string; health_override: Health | null; note: string }>;
      return { view: await this.viewIn(c, f.key), rows };
    });
    const projects = await Promise.all(rows.map(async (r): Promise<PortfolioProject> => {
      let k = cache.get(r.key);
      if (!k) { k = this.kpis.kpis(organizationId, r.key, actor); cache.set(r.key, k); }
      const v = await k;
      const computed = healthOf(v.open, v.late, v.blocked);
      return {
        key: r.key, name: v.project.name, health: r.health_override ?? computed.state, computedHealth: computed.state, overridden: r.health_override !== null,
        reasons: computed.reasons, note: r.note, progress: v.progress.percent, open: v.open, late: v.late, blocked: v.blocked, dueSoon: v.dueSoon,
        managers: v.project.managers, members: v.project.members,
        sprint: v.sprint ? { name: v.sprint.name, percent: v.sprint.percent, daysLeft: v.sprint.daysLeft } : null,
      };
    }));
    projects.sort((a, b) => ORDER[a.health] - ORDER[b.health] || b.late - a.late || a.key.localeCompare(b.key));
    const byHealth: Record<Health, number> = { ok: 0, attention: 0, critical: 0 };
    for (const p of projects) byHealth[p.health] += 1;
    const sum = (f: (p: PortfolioProject) => number) => projects.reduce((s, p) => s + f(p), 0);
    return {
      portfolio: view, projects,
      totals: { projects: projects.length, byHealth, progress: projects.length === 0 ? 0 : Math.round(sum((p) => p.progress) / projects.length), open: sum((p) => p.open), late: sum((p) => p.late), blocked: sum((p) => p.blocked) },
    };
  }

  /** Synthèse de tous les portefeuilles (tableau de bord du directeur) ; un projet présent dans plusieurs n'est calculé qu'une fois. */
  async summaries(organizationId: string, actor: Actor): Promise<PortfolioSummary[]> {
    const cache = new Map<string, Promise<ProjectKpis>>();
    const list = await this.list(organizationId);
    return Promise.all(list.map((f) => this.summary(organizationId, f.key, actor, cache)));
  }

  private async view(organizationId: string, key: string): Promise<PortfolioView> {
    return this.db.tx(organizationId, async (c) => this.viewIn(c, key));
  }

  private async viewIn(c: PoolClient, key: string): Promise<PortfolioView> {
    const r = (await c.query(
      `select f.key, f.name, f.description, coalesce(u.display_name, u.username, f.owner_subject) as owner,
              (select count(*)::int from portfolio_project x join project p on p.id = x.project_id where x.portfolio_id = f.id) as projects
         from portfolio f left join user_account u on u.organization_id = f.organization_id and u.subject = f.owner_subject where f.key = $1`, [key])).rows[0];
    if (!r) throw notFound(`Portefeuille ${key}`);
    return { key: r.key, name: r.name, description: r.description, owner: r.owner, projects: r.projects };
  }

  private async require(c: PoolClient, key: string): Promise<{ id: string; key: string }> {
    const f = (await c.query('select id, key from portfolio where key = $1', [key])).rows[0];
    if (!f) throw notFound(`Portefeuille ${key}`);
    return f;
  }
}
