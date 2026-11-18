import { z } from 'zod';
import { AtqlError, parse } from '../atql/parser';
import { validation } from './errors';
import {
  DUAL_KINDS, KIND_LAYOUT, MAX_WIDGETS, PORTFOLIO_KINDS, PORTFOLIO_SCOPE_KINDS, PROJECT_KINDS, WIDGET_KINDS, WidgetSchema, allowedKinds, checkGrid, toGrid, type Widget,
} from './dashboard.service';

/**
 * Gabarits de tableaux de bord (lot 27, ADR-0010) : un gabarit vise un type de tableau de bord, des rôles, des natures de projet et
 * des rôles dans le projet, et porte un à neuf onglets. Ses cartes ne contiennent jamais de clé de projet ni de portefeuille : elles
 * visent « le courant » ou se répètent (`repeat`) à l'application. Ce fichier est sans accès à la base : types, validation et résolution.
 */
export const TEMPLATE_TYPES = ['home', 'project', 'progress', 'portfolio'] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];
export const NATURES = ['space-software', 'space-project', 'defense-software', 'armament', 'generic'] as const;
export type Nature = (typeof NATURES)[number];
export const PROJECT_ROLES = ['manager', 'member', 'reader'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
/** Rôles auxquels un gabarit se destine, du plus large au plus étroit : l'ordre fixe aussi la priorité du gabarit par défaut (P6). */
export const ASSIGNABLE_ROLES = ['athena-admin', 'athena-pmo', 'athena-director', 'athena-pm', 'athena-manager', 'athena-finance', 'athena-qa', 'athena-team-member'] as const;
export const MAX_TEMPLATE_TABS = 9;

/** Carte d'un gabarit : une carte ordinaire, sans identifiant imposé, et sa répétition. */
export const TemplateWidgetSchema = WidgetSchema.omit({ id: true, projects: true, project: true, portfolio: true }).extend({
  id: WidgetSchema.shape.id.optional(),
  repeat: z.enum(['project', 'portfolio']).optional(),
});
export type TemplateWidget = z.infer<typeof TemplateWidgetSchema>;
export const TemplateTabSchema = z.object({ name: z.string().trim().min(1).max(60), widgets: z.array(TemplateWidgetSchema).max(MAX_WIDGETS) });
export type TemplateTab = z.infer<typeof TemplateTabSchema>;

export const TemplateKeySchema = z.string().regex(/^[a-z][a-z0-9-]{2,39}$/);
export const TemplateInput = z.object({
  key: TemplateKeySchema.optional(),
  type: z.enum(TEMPLATE_TYPES),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
  roles: z.array(z.enum(ASSIGNABLE_ROLES)).min(1).max(ASSIGNABLE_ROLES.length),
  natures: z.array(z.enum(NATURES)).max(NATURES.length).default([]),
  projectRoles: z.array(z.enum(PROJECT_ROLES)).max(PROJECT_ROLES.length).default([]),
  tabs: z.array(TemplateTabSchema).min(1).max(MAX_TEMPLATE_TABS),
});
export type TemplateInputData = z.infer<typeof TemplateInput>;

/** Un gabarit tel que l'API le montre : livré (code) ou d'organisation. */
export interface DashboardTemplate extends Omit<TemplateInputData, 'key'> {
  key: string;
  builtin: boolean;
  hidden: boolean;
  derivedFrom: string | null;
}

/** Titres des genres, pour nommer les exemplaires répétés d'une carte sans titre (« Santé du projet · LUMEN »). */
export const KIND_LABELS: Record<string, string> = {
  trackers: 'Trackers', search: 'Recherche', mentions: 'Mentions', approvals: 'À approuver', favorites: 'Favoris', recents: 'Récents', indicators: 'Tickets', flow: 'Flux cumulé',
  velocity: 'Vélocité', release: 'Prochaine version', 'tracker-status': 'Trackers par statut', activity: 'Activité récente', chart: 'Graphique', 'general-info': 'Informations générales',
  'global-progress': 'Avancement global', 'key-indicators': 'Indicateurs clés', health: 'Santé du projet', 'sprint-progress': 'Progression du sprint', pipelines: 'Pipelines CI/CD',
  quality: 'Qualité du code', badges: 'Badges', 'portfolio-health': 'Santé du portefeuille', 'portfolio-tiles': 'Tuiles du portefeuille', 'portfolio-finance': 'Finances du portefeuille',
  'project-finance': 'Finances du projet', capacity: 'Charge et capacité', roadmap: 'Feuille de route', 'phase-gate': 'Phase et prochaine revue', 'portfolio-gates': 'Portes et décisions à venir',
  'portfolio-requests': 'Demandes à instruire', 'risk-matrix': 'Risques consolidés', 'platform-ops': 'État de la plateforme',
};

const PROJECT_ONLY = (kind: string): boolean => PROJECT_KINDS.has(kind) && kind !== 'chart';

/** Contrôles d'une carte de gabarit, selon le type visé. Les problèmes sont rendus en clair, par carte. */
function widgetProblems(type: TemplateType, tab: string, w: TemplateWidget, index: number): string[] {
  const where = `${tab} : carte ${index + 1} (${w.kind})`;
  const out: string[] = [];
  if ((w.field !== undefined || w.form !== undefined) && w.kind !== 'chart') out.push(`${where} : field et form ne concernent que les cartes graphiques`);
  if (w.kind === 'chart' && (!w.form || (w.form !== 'count' && !w.field))) out.push(`${where} : une carte graphique exige une forme, et un champ sauf pour un indicateur`);
  if (w.kind === 'search' || w.kind === 'chart') {
    try { parse(w.query ?? ''); } catch (error) {
      if (error instanceof AtqlError) out.push(`${where} : ${error.message}`); else throw error;
    }
  } else if (w.query !== undefined) out.push(`${where} : query ne concerne que les cartes de recherche et les graphiques`);
  if (w.repeat !== undefined && type !== 'home' && !(type === 'portfolio' && w.repeat === 'project')) out.push(`${where} : « une par projet » et « un par portefeuille » se règlent dans Mon travail (et « une par projet » dans un portefeuille)`);
  const portfolioKind = PORTFOLIO_KINDS.includes(w.kind);
  const dual = DUAL_KINDS.includes(w.kind);
  if (type === 'home') {
    if (PROJECT_ONLY(w.kind) && w.repeat !== 'project') out.push(`${where} : cette carte porte sur un projet ; réglez-la sur « une par projet »`);
    if (portfolioKind && w.repeat !== 'portfolio') out.push(`${where} : cette carte porte sur un portefeuille ; réglez-la sur « un par portefeuille »`);
    if ((w.kind === 'roadmap' || w.kind === 'risk-matrix') && w.repeat === undefined) out.push(`${where} : cette carte exige un projet ou un portefeuille ; réglez-la sur une répétition`);
  } else if (type === 'portfolio') {
    if (!PORTFOLIO_SCOPE_KINDS.has(w.kind) && !(PROJECT_ONLY(w.kind) && w.repeat === 'project')) out.push(`${where} : le tableau de bord d'un portefeuille n'accepte que les cartes de portefeuille, de charge, de feuille de route, de risques, de recherche, les graphiques et les cartes de projet répétées`);
    if (w.repeat === 'project' && !PROJECT_ONLY(w.kind) && !dual && w.kind !== 'search' && w.kind !== 'chart') out.push(`${where} : seule une carte de projet se répète par projet`);
  } else {
    if (portfolioKind) out.push(`${where} : une carte de portefeuille ne se pose pas dans un tableau de bord de projet`);
    if (w.kind === 'platform-ops') out.push(`${where} : l'état de la plateforme ne se pose que dans Mon travail`);
  }
  if (w.kind === 'platform-ops' && type !== 'home') out.push(`${where} : l'état de la plateforme ne se pose que dans Mon travail`);
  return out;
}

/** Vérifie un gabarit complet : forme, cohérence avec son type et droits de chacun des rôles ciblés (P10). Lève une 422 qui liste tous les problèmes. */
export function checkTemplate(input: TemplateInputData): void {
  const problems: string[] = [];
  if ((input.type === 'home' || input.type === 'portfolio') && (input.natures.length > 0 || input.projectRoles.length > 0)) problems.push('Les natures de projet et les rôles dans le projet ne concernent que les tableaux de bord de projet et d’avancement');
  const names = new Set<string>();
  for (const tab of input.tabs) {
    if (names.has(tab.name.toLowerCase())) problems.push(`${tab.name} : nom d'onglet en double`);
    names.add(tab.name.toLowerCase());
    const ids = new Set<string>();
    tab.widgets.forEach((w, i) => {
      problems.push(...widgetProblems(input.type, tab.name, w, i));
      if (w.id !== undefined) { if (ids.has(w.id)) problems.push(`${tab.name} : identifiant en double (${w.id})`); ids.add(w.id); }
      if (!(WIDGET_KINDS as readonly string[]).includes(w.kind)) return;
      for (const role of input.roles) {
        if (!allowedKinds([role]).includes(w.kind)) problems.push(`${tab.name} : la carte « ${KIND_LABELS[w.kind] ?? w.kind} » n'est pas permise au rôle ${role}`);
      }
    });
    // Contrôle de grille sur la disposition résolue (hors répétitions, dont le nombre dépend de la personne).
    try { checkGrid(layoutOf(tab.widgets.filter((w) => w.repeat === undefined).map((w) => ({ ...w, id: w.id ?? 'x' })) as TemplateWidget[], 'x')); } catch (error) {
      problems.push(`${tab.name} : ${(error as { details?: string[] }).details?.join(' ; ') ?? 'disposition invalide'}`);
    }
  }
  if (problems.length > 0) throw validation([...new Set(problems)]);
}

/** Place les cartes d'un onglet sur la grille : taille et hauteur par défaut du genre, première place libre. */
function layoutOf(widgets: readonly TemplateWidget[], idBase: string): Widget[] {
  const withIds = widgets.map((w, i) => {
    const d = KIND_LAYOUT[w.kind] ?? { size: 'M' as const };
    const { repeat: _repeat, ...rest } = w;
    return { ...rest, id: w.id ?? `${idBase}-${i + 1}`, ...(w.size === undefined && w.w === undefined ? { size: d.size } : {}), ...(w.h === undefined && d.h !== undefined ? { h: d.h } : {}) } as Widget;
  });
  return toGrid(withIds);
}

export interface ResolveContext {
  /** Projet courant (vue d'ensemble, avancement). */
  project?: string;
  /** Portefeuille courant (tableau de bord d'un portefeuille). */
  portfolio?: string;
  /** Projets visés par « une par projet » : ceux de la personne (Mon travail) ou du portefeuille. */
  repeatProjects: string[];
  /** Portefeuilles visés par « un par portefeuille ». */
  repeatPortfolios: string[];
}
export interface ResolvedTab { name: string; widgets: Widget[] }
export interface Resolved { tabs: ResolvedTab[]; truncated: number }

const idPart = (s: string): string => s.toLowerCase().replace(/[^a-z0-9-]/g, '');

/** Transforme un gabarit en onglets de cartes ordinaires (copie, sans lien avec le gabarit) : relatives résolues, répétitions développées, au plus 24 cartes par onglet. */
export function resolveTemplate(t: { type: TemplateType; tabs: readonly TemplateTab[] }, ctx: ResolveContext): Resolved {
  let truncated = 0;
  const tabs = t.tabs.map((tab, ti) => {
    const out: TemplateWidget[] = [];
    tab.widgets.forEach((w, wi) => {
      const base = w.id ?? `${w.kind}-${wi + 1}`;
      const named = (suffix: string) => ({ title: w.title ? `${w.title} · ${suffix}` : `${KIND_LABELS[w.kind] ?? w.kind} · ${suffix}` });
      const clean = (): TemplateWidget => { const { repeat: _r, ...rest } = w; return { ...rest, id: base }; };
      if (w.repeat === 'project') {
        for (const p of ctx.repeatProjects) out.push({ ...clean(), id: `${base}-${idPart(p)}`.slice(0, 40), ...named(p), projects: [p], ...(PROJECT_ONLY(w.kind) ? { project: p } : {}) } as TemplateWidget);
      } else if (w.repeat === 'portfolio') {
        for (const q of ctx.repeatPortfolios) out.push({ ...clean(), id: `${base}-${idPart(q)}`.slice(0, 40), ...named(q), portfolio: q } as TemplateWidget);
      } else if (t.type === 'project' || t.type === 'progress') {
        const scoped = PROJECT_KINDS.has(w.kind) || DUAL_KINDS.includes(w.kind) || w.kind === 'search' || w.kind === 'chart';
        out.push({ ...clean(), ...(scoped && ctx.project ? { projects: [ctx.project], ...(PROJECT_ONLY(w.kind) ? { project: ctx.project } : {}) } : {}) } as TemplateWidget);
      } else if (t.type === 'portfolio') {
        out.push({ ...clean(), ...(ctx.portfolio ? { portfolio: ctx.portfolio } : {}) } as TemplateWidget);
      } else out.push(clean());
    });
    if (out.length > MAX_WIDGETS) { truncated += out.length - MAX_WIDGETS; out.length = MAX_WIDGETS; }
    return { name: tab.name, widgets: layoutOf(out, `c${ti + 1}`) };
  });
  return { tabs, truncated };
}

/** Un gabarit est-il applicable à ce contexte (nature du projet, rôle dans le projet) ? Les listes vides valent « tous ». */
export function fits(t: { natures: readonly string[]; projectRoles: readonly string[] }, ctx: { nature?: Nature; projectRole?: ProjectRole }): boolean {
  if (ctx.nature !== undefined && t.natures.length > 0 && !t.natures.includes(ctx.nature)) return false;
  if (ctx.projectRole !== undefined && t.projectRoles.length > 0 && !t.projectRoles.includes(ctx.projectRole)) return false;
  return true;
}
