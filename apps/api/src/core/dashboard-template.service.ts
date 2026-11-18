import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { conflict, forbidden, notFound, validation } from './errors';
import { audit } from './tracker.service';
import { BUILTIN_DASHBOARD_TEMPLATES, builtinDashboardTemplate } from './dashboard-templates';
import {
  ASSIGNABLE_ROLES, checkTemplate, fits, resolveTemplate,
  type DashboardTemplate, type Nature, type ProjectRole, type Resolved, type TemplateInputData, type TemplateType,
} from './dashboard-template';
import { DUAL_KINDS, KIND_LAYOUT, MAX_TABS, PORTFOLIO_KINDS, PORTFOLIO_ROLES, PORTFOLIO_SCOPE_KINDS, PROJECT_KINDS, WIDGET_KINDS, allowedKinds, uniqueTabId } from './dashboard.service';

/** Gabarit livré (code) ou d'organisation (table) → forme commune. */
const fromRow = (r: Record<string, unknown>): DashboardTemplate => ({
  key: r['key'] as string, type: r['type'] as TemplateType, name: r['name'] as string, description: r['description'] as string, roles: r['roles'] as DashboardTemplate['roles'],
  natures: r['natures'] as DashboardTemplate['natures'], projectRoles: r['project_roles'] as DashboardTemplate['projectRoles'], tabs: r['tabs'] as DashboardTemplate['tabs'],
  builtin: false, hidden: false, derivedFrom: (r['derived_from'] as string | null) ?? null,
});
const NATURE_OF_TEMPLATE: Record<string, Nature> = { spatial: 'space-software', 'spatial-project': 'space-project', defense: 'defense-software', 'armement-1618': 'armament' };
const GLOBAL_VIEW_ROLES = ['athena-admin', 'athena-pmo', 'athena-director', 'athena-finance'];

/** Type, projet et portefeuille visés par une portée de tableau de bord ('' = Mon travail, 'KEY', 'KEY:avancement', 'portfolio:clé'). */
export function scopeInfo(scope: string): { type: TemplateType; project?: string; portfolio?: string } {
  if (scope === '') return { type: 'home' };
  if (scope.startsWith('portfolio:')) return { type: 'portfolio', portfolio: scope.slice('portfolio:'.length) };
  if (scope.endsWith(':avancement')) return { type: 'progress', project: scope.slice(0, -':avancement'.length) };
  return { type: 'project', project: scope };
}

export interface ApplyResult { mode: 'add' | 'replace'; tabs: Array<{ id: string; title: string | null }>; truncated: number }

/** Gabarits de tableaux de bord (lot 27, ADR-0010) : catalogue livré et d'organisation, gabarits par défaut, proposition à la personne et application par copie. */
export class DashboardTemplateService {
  constructor(private readonly db: Db) {}

  // ------------------------------------------------------------------ catalogue
  /** Tous les gabarits de l'organisation : les livrés (avec leur masquage) puis les siens. */
  async all(organizationId: string): Promise<DashboardTemplate[]> {
    return this.db.tx(organizationId, async (c) => {
      const hidden = new Set((await c.query('select key from dashboard_template_hidden')).rows.map((r) => r.key as string));
      const own = (await c.query('select key, type, name, description, roles, natures, project_roles, tabs, derived_from from dashboard_template order by lower(name)')).rows.map(fromRow);
      return [...BUILTIN_DASHBOARD_TEMPLATES.map((b) => ({ ...b, builtin: true, hidden: hidden.has(b.key), derivedFrom: null }) as DashboardTemplate), ...own];
    });
  }

  async get(organizationId: string, key: string): Promise<DashboardTemplate> {
    const found = (await this.all(organizationId)).find((t) => t.key === key);
    if (!found) throw notFound(`Gabarit de tableau de bord ${key}`);
    return found;
  }

  // ------------------------------------------------------------------ administration
  async create(organizationId: string, input: TemplateInputData, actor: Actor, derivedFrom: string | null = null): Promise<DashboardTemplate> {
    checkTemplate(input);
    const key = input.key ?? (await this.freshKey(organizationId, input.name));
    if (builtinDashboardTemplate(key)) throw conflict('Cette clé est réservée à un gabarit livré avec Athena.');
    await this.db.tx(organizationId, async (c) => {
      if ((await c.query('select 1 from dashboard_template where key = $1', [key])).rows[0]) throw conflict(`Le gabarit ${key} existe déjà.`);
      await c.query(
        `insert into dashboard_template (organization_id, key, type, name, description, roles, natures, project_roles, tabs, derived_from, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [organizationId, key, input.type, input.name, input.description, input.roles, input.natures, input.projectRoles, JSON.stringify(input.tabs), derivedFrom, actor.id]);
      await audit(c, organizationId, actor, 'dashboard-template.create', `dashboard-template:${key}`, { type: input.type, name: input.name });
    });
    return this.get(organizationId, key);
  }

  async update(organizationId: string, key: string, input: TemplateInputData, actor: Actor): Promise<DashboardTemplate> {
    if (builtinDashboardTemplate(key)) throw forbidden('Un gabarit livré avec Athena ne se modifie pas : dupliquez-le.');
    checkTemplate(input);
    await this.db.tx(organizationId, async (c) => {
      const current = (await c.query('select type from dashboard_template where key = $1', [key])).rows[0];
      if (!current) throw notFound(`Gabarit de tableau de bord ${key}`);
      if (current.type !== input.type) throw validation(['Le type d’un gabarit ne change pas : créez-en un autre']);
      await c.query(
        `update dashboard_template set name = $2, description = $3, roles = $4, natures = $5, project_roles = $6, tabs = $7, updated_at = now() where key = $1`,
        [key, input.name, input.description, input.roles, input.natures, input.projectRoles, JSON.stringify(input.tabs)]);
      // Un gabarit par défaut ne peut pas viser un rôle que le gabarit ne cible plus.
      await c.query('delete from dashboard_template_default where template_key = $1 and not (role = any($2::text[]))', [key, input.roles]);
      await audit(c, organizationId, actor, 'dashboard-template.update', `dashboard-template:${key}`, { name: input.name });
    });
    return this.get(organizationId, key);
  }

  async remove(organizationId: string, key: string, actor: Actor): Promise<void> {
    if (builtinDashboardTemplate(key)) throw forbidden('Un gabarit livré avec Athena ne se supprime pas : masquez-le.');
    await this.db.tx(organizationId, async (c) => {
      const n = (await c.query('delete from dashboard_template where key = $1', [key])).rowCount;
      if (!n) throw notFound(`Gabarit de tableau de bord ${key}`);
      await c.query('delete from dashboard_template_default where template_key = $1', [key]);
      await audit(c, organizationId, actor, 'dashboard-template.delete', `dashboard-template:${key}`, {});
    });
  }

  /** Copie un gabarit (livré ou d'organisation) en gabarit d'organisation modifiable. */
  async duplicate(organizationId: string, key: string, actor: Actor, name?: string): Promise<DashboardTemplate> {
    const source = await this.get(organizationId, key);
    const title = (name ?? `${source.name} (copie)`).slice(0, 100);
    return this.create(organizationId, { type: source.type, name: title, description: source.description, roles: source.roles, natures: source.natures, projectRoles: source.projectRoles, tabs: source.tabs }, actor, key);
  }

  /** Masque ou réaffiche un gabarit livré (les gabarits d'organisation se suppriment). */
  async setHidden(organizationId: string, key: string, hidden: boolean, actor: Actor): Promise<void> {
    if (!builtinDashboardTemplate(key)) throw validation(['Seul un gabarit livré avec Athena se masque ; supprimez un gabarit d’organisation']);
    await this.db.tx(organizationId, async (c) => {
      if (hidden) await c.query('insert into dashboard_template_hidden (organization_id, key) values ($1,$2) on conflict do nothing', [organizationId, key]);
      else await c.query('delete from dashboard_template_hidden where key = $1', [key]);
      await audit(c, organizationId, actor, hidden ? 'dashboard-template.hide' : 'dashboard-template.show', `dashboard-template:${key}`, {});
    });
  }

  async defaults(organizationId: string): Promise<Array<{ type: TemplateType; role: string; templateKey: string }>> {
    return this.db.tx(organizationId, async (c) => (await c.query('select type, role, template_key from dashboard_template_default order by type, role')).rows
      .map((r) => ({ type: r.type as TemplateType, role: r.role as string, templateKey: r.template_key as string })));
  }

  /** Désigne le gabarit affiché tant qu'une personne de ce rôle n'a rien enregistré (P5). */
  async setDefault(organizationId: string, type: TemplateType, role: string, key: string, actor: Actor): Promise<void> {
    const t = await this.get(organizationId, key);
    if (t.type !== type) throw validation([`Le gabarit ${key} est un gabarit de type ${t.type}, pas ${type}`]);
    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) throw validation([`Rôle inconnu : ${role}`]);
    if (!t.roles.includes(role as never)) throw validation([`Le gabarit ${key} ne cible pas le rôle ${role}`]);
    if (t.hidden) throw validation([`Le gabarit ${key} est masqué`]);
    await this.db.tx(organizationId, async (c) => {
      await c.query(
        `insert into dashboard_template_default (organization_id, type, role, template_key) values ($1,$2,$3,$4)
         on conflict (organization_id, type, role) do update set template_key = excluded.template_key`, [organizationId, type, role, key]);
      await audit(c, organizationId, actor, 'dashboard-template.default', `dashboard-template:${key}`, { type, role });
    });
  }

  async clearDefault(organizationId: string, type: TemplateType, role: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      await c.query('delete from dashboard_template_default where type = $1 and role = $2', [type, role]);
      await audit(c, organizationId, actor, 'dashboard-template.default-clear', `dashboard-template:${type}:${role}`, {});
    });
  }

  /** Genres de cartes posables dans un gabarit : l'intersection des catalogues des rôles visés, filtrée par le type du tableau de bord. */
  catalog(type: TemplateType, roles: readonly string[]): Array<{ kind: string; project: boolean; portfolio: boolean; size: string; h?: number }> {
    const lists = (roles.length > 0 ? roles : ASSIGNABLE_ROLES).map((r) => new Set(allowedKinds([r])));
    return WIDGET_KINDS.filter((k) => lists.every((l) => l.has(k)))
      .filter((k) => (type === 'home' ? true : type === 'portfolio' ? PORTFOLIO_SCOPE_KINDS.has(k) || PROJECT_KINDS.has(k) : !PORTFOLIO_KINDS.includes(k) && k !== 'platform-ops'))
      .map((kind) => ({ kind, project: PROJECT_KINDS.has(kind) || DUAL_KINDS.includes(kind), portfolio: PORTFOLIO_KINDS.includes(kind) || DUAL_KINDS.includes(kind), ...(KIND_LAYOUT[kind] ?? { size: 'M' }) }));
  }

  private async freshKey(organizationId: string, name: string): Promise<string> {
    const base = ('t' + name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 34).replace(/-+$/, '');
    const taken = new Set((await this.all(organizationId)).map((t) => t.key));
    let key = base.length >= 3 ? base : 'tableau-de-bord';
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    return key;
  }

  // ------------------------------------------------------------------ contexte de la personne
  /** Nature du projet (déduite de son gabarit normatif, héritages compris) et rôle de la personne dans ce projet. */
  async context(organizationId: string, actor: Actor, project: string): Promise<{ nature: Nature; projectRole: ProjectRole }> {
    return this.db.tx(organizationId, async (c) => this.contextIn(c, actor, project));
  }

  private async contextIn(c: PoolClient, actor: Actor, project: string): Promise<{ nature: Nature; projectRole: ProjectRole }> {
    const p = (await c.query('select id, template_key from project where key = $1', [project])).rows[0] as { id: string; template_key: string | null } | undefined;
    if (!p) throw notFound(`Projet ${project}`);
    let nature: Nature = 'generic';
    let key = p.template_key;
    for (let depth = 0; key && depth < 8; depth++) {
      const mapped = NATURE_OF_TEMPLATE[key];
      if (mapped) { nature = mapped; break; }
      key = ((await c.query('select parent_key from project_template where key = $1', [key])).rows[0]?.parent_key as string | null | undefined) ?? null;
    }
    const m = (await c.query('select role from project_member where project_id = $1 and subject = $2', [p.id, actor.id])).rows[0] as { role: 'manager' | 'member' } | undefined;
    return { nature, projectRole: m ? m.role : 'reader' };
  }

  /** Projets visés par « une par projet » dans Mon travail : ceux dont on est chef, à défaut ceux dont on est membre, à défaut (vision globale) tous. */
  private async repeatProjects(c: PoolClient, actor: Actor, type: TemplateType, portfolio?: string): Promise<string[]> {
    if (type === 'portfolio' && portfolio) {
      return (await c.query(
        `select p.key from portfolio f join portfolio_project x on x.portfolio_id = f.id join project p on p.id = x.project_id
          where f.key = $1 and p.lifecycle_state not in ('completed', 'cancelled', 'rejected', 'archived') order by p.key`, [portfolio])).rows.map((r) => r.key as string);
    }
    const mine = async (role?: string) => (await c.query(
      `select p.key from project_member m join project p on p.id = m.project_id where m.subject = $1 ${role ? 'and m.role = $2' : ''} order by p.key`, role ? [actor.id, role] : [actor.id])).rows.map((r) => r.key as string);
    const managed = await mine('manager');
    if (managed.length > 0) return managed;
    const member = await mine();
    if (member.length > 0) return member;
    if (GLOBAL_VIEW_ROLES.some((r) => actor.roles.includes(r))) return (await c.query('select key from project order by key')).rows.map((r) => r.key as string);
    return [];
  }

  private async repeatPortfolios(c: PoolClient, actor: Actor): Promise<string[]> {
    if (!PORTFOLIO_ROLES.some((r) => actor.roles.includes(r))) return [];
    return (await c.query('select key from portfolio order by key')).rows.map((r) => r.key as string);
  }

  private async resolveIn(c: PoolClient, actor: Actor, t: Pick<DashboardTemplate, 'type' | 'tabs'>, scope: string, override: { projects?: string[]; portfolios?: string[] } = {}): Promise<Resolved> {
    const info = scopeInfo(scope);
    const usesProject = t.tabs.some((tab) => tab.widgets.some((w) => w.repeat === 'project'));
    const usesPortfolio = t.tabs.some((tab) => tab.widgets.some((w) => w.repeat === 'portfolio'));
    return resolveTemplate(t, {
      ...(info.project ? { project: info.project } : {}), ...(info.portfolio ? { portfolio: info.portfolio } : {}),
      repeatProjects: override.projects ?? (usesProject ? await this.repeatProjects(c, actor, info.type, info.portfolio) : []),
      repeatPortfolios: override.portfolios ?? (usesPortfolio ? await this.repeatPortfolios(c, actor) : []),
    });
  }

  /** Portefeuilles visibles de la personne et leurs projets (vide pour qui n'a pas un rôle de portefeuille). */
  async portfolios(organizationId: string, actor: Actor): Promise<Array<{ key: string; name: string; projects: string[] }>> {
    if (!PORTFOLIO_ROLES.some((r) => actor.roles.includes(r))) return [];
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select f.key, f.name, coalesce(array_agg(p.key order by p.key) filter (where p.key is not null), '{}') as projects
         from portfolio f left join portfolio_project x on x.portfolio_id = f.id left join project p on p.id = x.project_id
        group by f.key, f.name order by f.name`)).rows.map((r) => ({ key: r.key as string, name: r.name as string, projects: r.projects as string[] })));
  }

  // ------------------------------------------------------------------ proposition et application
  /** Gabarits proposés à la personne pour cette portée : ses rôles, la nature du projet et son rôle dans le projet ; ceux de la nature d'abord. */
  async proposed(organizationId: string, actor: Actor, scope: string): Promise<DashboardTemplate[]> {
    const info = scopeInfo(scope);
    if (info.type === 'portfolio' && !PORTFOLIO_ROLES.some((r) => actor.roles.includes(r))) return []; // le tableau de bord d'un portefeuille est réservé à ses rôles
    const all = (await this.all(organizationId)).filter((t) => t.type === info.type && !t.hidden && t.roles.some((r) => actor.roles.includes(r)));
    if (!info.project) return all.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const ctx = await this.context(organizationId, actor, info.project);
    return all.filter((t) => fits(t, ctx)).sort((a, b) => Number(b.natures.includes(ctx.nature)) - Number(a.natures.includes(ctx.nature)) || a.name.localeCompare(b.name, 'fr'));
  }

  /** Copie un gabarit dans le tableau de bord de la personne : `add` ajoute ses onglets, `replace` remplace tout (P4). */
  async apply(organizationId: string, actor: Actor, scope: string, key: string, mode: 'add' | 'replace'): Promise<ApplyResult> {
    const proposed = (await this.proposed(organizationId, actor, scope)).find((t) => t.key === key);
    if (!proposed) throw notFound(`Gabarit de tableau de bord ${key} pour ce tableau de bord`);
    return this.db.tx(organizationId, async (c) => this.applyIn(c, organizationId, actor, scope, proposed, mode));
  }

  private async applyIn(c: PoolClient, organizationId: string, actor: Actor, scope: string, t: DashboardTemplate, mode: 'add' | 'replace'): Promise<ApplyResult> {
    const resolved = await this.resolveIn(c, actor, t, scope);
    const saveLayout = (tab: string, widgets: unknown[]) => c.query(
      `insert into dashboard_layout (organization_id, owner, scope, tab, widgets) values ($1,$2,$3,$4,$5)
       on conflict (organization_id, owner, scope, tab) do update set widgets = excluded.widgets, updated_at = now()`, [organizationId, actor.id, scope, tab, JSON.stringify(widgets)]);
    const saveTab = (id: string, title: string, position: number) => c.query(
      `insert into dashboard_tab (organization_id, owner, scope, id, title, position) values ($1,$2,$3,$4,$5,$6)
       on conflict (organization_id, owner, scope, id) do update set title = excluded.title, position = excluded.position`, [organizationId, actor.id, scope, id, title, position]);
    if (mode === 'replace') {
      await c.query('delete from dashboard_tab where owner = $1 and scope = $2', [actor.id, scope]);
      await c.query('delete from dashboard_layout where owner = $1 and scope = $2', [actor.id, scope]);
      const ids = new Set<string>();
      const out: ApplyResult['tabs'] = [];
      for (const [i, tab] of resolved.tabs.entries()) {
        if (i === 0) { await saveTab('', tab.name, -1); await saveLayout('', tab.widgets); out.push({ id: '', title: tab.name }); continue; }
        const id = uniqueTabId(tab.name, ids); ids.add(id);
        await saveTab(id, tab.name, i); await saveLayout(id, tab.widgets); out.push({ id, title: tab.name });
      }
      await audit(c, organizationId, actor, 'dashboard-template.apply', `dashboard:${actor.id}:${scope}`, { template: t.key, mode });
      return { mode, tabs: out, truncated: resolved.truncated };
    }
    const existing = (await c.query('select id, title, position from dashboard_tab where owner = $1 and scope = $2', [actor.id, scope])).rows as Array<{ id: string; title: string; position: number }>;
    const named = existing.filter((r) => r.id !== '');
    if (named.length + resolved.tabs.length > MAX_TABS) throw validation([`Un classeur compte au plus ${MAX_TABS} onglets en plus de l’onglet principal : ce gabarit en ajouterait ${resolved.tabs.length} à ${named.length}`]);
    const ids = new Set(named.map((r) => r.id));
    const titles = new Set(existing.map((r) => r.title.toLowerCase()));
    let position = named.reduce((m, r) => Math.max(m, r.position + 1), 0);
    const out: ApplyResult['tabs'] = [];
    for (const tab of resolved.tabs) {
      let title = tab.name;
      for (let n = 2; titles.has(title.toLowerCase()); n++) title = `${tab.name} (${n})`;
      titles.add(title.toLowerCase());
      const id = uniqueTabId(title, ids); ids.add(id);
      await saveTab(id, title, position++); await saveLayout(id, tab.widgets); out.push({ id, title });
    }
    await audit(c, organizationId, actor, 'dashboard-template.apply', `dashboard:${actor.id}:${scope}`, { template: t.key, mode });
    return { mode, tabs: out, truncated: resolved.truncated };
  }

  /** Gabarit par défaut (P5, P6) : appliqué une fois, à la première lecture d'une portée où la personne n'a rien enregistré. Renvoie vrai s'il a été appliqué. */
  async applyDefault(organizationId: string, actor: Actor, scope: string): Promise<boolean> {
    const info = scopeInfo(scope);
    if (info.type === 'portfolio' && !PORTFOLIO_ROLES.some((r) => actor.roles.includes(r))) return false;
    const mine = await this.db.tx(organizationId, async (c) => {
      const defaults = (await c.query('select role, template_key from dashboard_template_default where type = $1', [info.type])).rows as Array<{ role: string; template_key: string }>;
      if (defaults.length === 0) return null;
      const saved = (await c.query(
        `select (select count(*) from dashboard_layout where owner = $1 and scope = $2) + (select count(*) from dashboard_tab where owner = $1 and scope = $2 and id <> '') n`, [actor.id, scope])).rows[0].n as number;
      return Number(saved) === 0 ? defaults : null;
    });
    if (!mine) return false;
    for (const role of ASSIGNABLE_ROLES) {
      const d = mine.find((x) => x.role === role);
      if (!d || !actor.roles.includes(role)) continue;
      const t = (await this.proposed(organizationId, actor, scope).catch(() => [])).find((x) => x.key === d.template_key);
      if (!t) continue;
      // Deux lectures simultanées (disposition et onglets) ne doivent appliquer le gabarit qu'une fois : verrou par personne et par portée, puis contrôle à nouveau.
      return this.db.tx(organizationId, async (c) => {
        await c.query('select pg_advisory_xact_lock(hashtext($1))', [`dashboard-default:${actor.id}:${scope}`]);
        const saved = (await c.query(
          `select (select count(*) from dashboard_layout where owner = $1 and scope = $2) + (select count(*) from dashboard_tab where owner = $1 and scope = $2 and id <> '') n`, [actor.id, scope])).rows[0].n as number;
        if (Number(saved) !== 0) return false;
        await this.applyIn(c, organizationId, actor, scope, t, 'replace');
        return true;
      });
    }
    return false;
  }

  /** Aperçu d'un gabarit (administrateur) : résolu sur un projet ou un portefeuille réels, sans rien enregistrer. */
  async preview(organizationId: string, actor: Actor, key: string, target: { project?: string; portfolio?: string; projects?: string[]; portfolios?: string[] }): Promise<Resolved & { scope: string }> {
    const t = await this.get(organizationId, key);
    const scope = t.type === 'home' ? '' : t.type === 'portfolio' ? `portfolio:${target.portfolio ?? ''}` : t.type === 'progress' ? `${target.project ?? ''}:avancement` : (target.project ?? '');
    if (t.type === 'portfolio' && !target.portfolio) throw validation(['portfolio : choisissez un portefeuille pour l’aperçu']);
    if ((t.type === 'project' || t.type === 'progress') && !target.project) throw validation(['project : choisissez un projet pour l’aperçu']);
    const resolved = await this.db.tx(organizationId, async (c) => {
      if (target.project && !(await c.query('select 1 from project where key = $1', [target.project])).rows[0]) throw notFound(`Projet ${target.project}`);
      if (target.portfolio && !(await c.query('select 1 from portfolio where key = $1', [target.portfolio])).rows[0]) throw notFound(`Portefeuille ${target.portfolio}`);
      return this.resolveIn(c, actor, t, scope, { ...(target.projects ? { projects: target.projects } : {}), ...(target.portfolios ? { portfolios: target.portfolios } : {}) });
    });
    return { ...resolved, scope };
  }
}
