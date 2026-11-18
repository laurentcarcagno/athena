import { z } from 'zod';
import { Db, type Actor } from './db';
import { forbidden, notFound, validation } from './errors';
import { AtqlError, parse } from '../atql/parser';

/** Genres de widget (ADR-0003 § 2.1) : la grille est fixe, seuls le contenu, l'ordre et la présence se règlent. */
export const WIDGET_KINDS = ['search', 'mentions', 'approvals', 'favorites', 'recents', 'trackers',
  // Cartes d'avancement d'un projet (ADR-0005, T-0155) : la clé du projet est dans `projects`.
  'indicators', 'flow', 'velocity', 'release', 'tracker-status', 'activity',
  // Carte graphique sur une recherche (T-0156) : anneau, barres ou indicateur chiffré.
  'chart',
  // Pilotage, intégration continue et qualité (ADR-0007, T-0170 à T-0176).
  'general-info', 'global-progress', 'key-indicators', 'health', 'sprint-progress', 'pipelines', 'quality', 'badges',
  // Portefeuille (lot 18, B24) : réservés au tableau de bord d'un portefeuille.
  'portfolio-health', 'portfolio-tiles',
  // Gabarits (lot 27, ADR-0010) : finances, charge, feuille de route, phase, portes, demandes, risques, plateforme.
  'portfolio-finance', 'project-finance', 'capacity', 'roadmap', 'phase-gate', 'portfolio-gates', 'portfolio-requests', 'risk-matrix', 'platform-ops'] as const;
/** Genres qui portent sur un portefeuille (réglage `portfolio` hors du tableau de bord d'un portefeuille). */
export const PORTFOLIO_KINDS: readonly string[] = ['portfolio-health', 'portfolio-tiles', 'portfolio-finance', 'portfolio-gates', 'portfolio-requests'];
/** Genres à double portée : un projet (`projects`) ou un portefeuille (`portfolio`) ; sans l'un ni l'autre, `capacity` montre les équipes de la personne. */
export const DUAL_KINDS: readonly string[] = ['capacity', 'roadmap', 'risk-matrix'];
/** Rôles qui organisent le tableau de bord d'un portefeuille : le PMO, le directeur, la finance (lecture seule des portefeuilles) et l'administrateur. */
export const PORTFOLIO_ROLES = ['athena-admin', 'athena-pmo', 'athena-director', 'athena-finance'];
export const PROJECT_KINDS = new Set<string>(['chart', 'trackers', 'indicators', 'flow', 'velocity', 'release', 'tracker-status', 'activity',
  'general-info', 'global-progress', 'key-indicators', 'health', 'sprint-progress', 'pipelines', 'quality', 'badges', 'project-finance', 'phase-gate']);
/** Genres permis dans le tableau de bord d'un portefeuille : les siens, ceux à double portée, les recherches et les graphiques (P11). */
export const PORTFOLIO_SCOPE_KINDS = new Set<string>([...PORTFOLIO_KINDS, ...DUAL_KINDS, 'search', 'chart']);
/** Rôles qui peuvent poser chaque genre réservé (les autres genres suivent la règle générale ci-dessous). */
const KIND_ROLES: Record<string, readonly string[]> = {
  'portfolio-health': ['athena-admin', 'athena-pmo', 'athena-director'], 'portfolio-tiles': ['athena-admin', 'athena-pmo', 'athena-director', 'athena-finance'],
  'portfolio-finance': ['athena-admin', 'athena-pmo', 'athena-director', 'athena-finance'], 'portfolio-gates': ['athena-admin', 'athena-pmo', 'athena-director'],
  'portfolio-requests': ['athena-admin', 'athena-pmo', 'athena-director'], 'project-finance': ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director', 'athena-finance'],
  capacity: ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director', 'athena-manager'], roadmap: ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director', 'athena-qa'],
  'phase-gate': ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director', 'athena-qa'], 'risk-matrix': ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director'],
  'platform-ops': ['athena-admin'],
  'key-indicators': ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director', 'athena-qa'], 'global-progress': ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director', 'athena-qa'],
};

const COMMON_KINDS: readonly string[] = ['search', 'chart', 'mentions', 'approvals', 'favorites', 'recents', 'trackers', 'indicators', 'flow', 'velocity', 'release', 'tracker-status', 'activity', 'general-info', 'sprint-progress', 'pipelines', 'quality', 'badges'];

/** Genres de widget qu'un rôle peut poser (catalogue, T-0170) ; l'union vaut pour une personne à plusieurs rôles. */
export function allowedKinds(roles: readonly string[]): string[] {
  const general = ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director'].some((r) => roles.includes(r)) ? WIDGET_KINDS.filter((k) => !(k in KIND_ROLES)) : COMMON_KINDS;
  // Les genres réservés se posent selon leur propre liste de rôles ; la finance a donc les siens sans le reste du pilotage.
  const reserved = WIDGET_KINDS.filter((k) => k in KIND_ROLES && KIND_ROLES[k]!.some((r) => roles.includes(r)));
  return WIDGET_KINDS.filter((k) => general.includes(k) || reserved.includes(k));
}

/** Taille et hauteur par défaut d'une carte, par genre : les gabarits livrés n'ont pas à les répéter, et le catalogue les propose à l'ajout. */
export const KIND_LAYOUT: Record<string, { size: 'S' | 'M' | 'L' | 'XL'; h?: number }> = {
  search: { size: 'M' }, approvals: { size: 'S' }, mentions: { size: 'S' }, favorites: { size: 'S' }, recents: { size: 'S' }, trackers: { size: 'M' },
  indicators: { size: 'L' }, flow: { size: 'M' }, velocity: { size: 'M' }, release: { size: 'S' }, 'tracker-status': { size: 'M' }, activity: { size: 'M' },
  chart: { size: 'S' }, 'general-info': { size: 'M' }, 'global-progress': { size: 'S' }, 'key-indicators': { size: 'L' }, health: { size: 'M' },
  'sprint-progress': { size: 'M' }, pipelines: { size: 'M' }, quality: { size: 'M' }, badges: { size: 'S' },
  'portfolio-health': { size: 'XL', h: 5 }, 'portfolio-tiles': { size: 'XL', h: 2 }, 'portfolio-finance': { size: 'XL', h: 4 }, 'project-finance': { size: 'M', h: 4 },
  capacity: { size: 'L', h: 4 }, roadmap: { size: 'XL', h: 5 }, 'phase-gate': { size: 'M', h: 3 }, 'portfolio-gates': { size: 'L', h: 4 }, 'portfolio-requests': { size: 'L', h: 4 },
  'risk-matrix': { size: 'M', h: 4 }, 'platform-ops': { size: 'L', h: 4 },
};

export const GRID_COLUMNS = 12;
export const MAX_ROWS = 8;
export const MAX_WIDGETS = 24;
/** Largeur en colonnes des tailles S, M, L, XL (ADR-0005) et hauteur par défaut en lignes. */
export const SIZE_COLUMNS = { S: 4, M: 6, L: 8, XL: 12 } as const;
export const DEFAULT_ROWS = 3;

export const WidgetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  kind: z.enum(WIDGET_KINDS),
  /** Titre libre ; absent pour un widget par défaut, dont le titre suit la langue. */
  title: z.string().trim().min(1).max(100).optional(),
  /** `search` seulement : requête ATQL et périmètre de projets (vide : toute l'organisation). */
  query: z.string().max(2000).optional(),
  projects: z.array(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)).max(50).optional(),
  /** Largeur sur la grille de 12 colonnes (ADR-0005, T-0153) : S = 4, M = 6, L = 8, XL = 12. Absente : largeur par défaut du genre. */
  size: z.enum(['S', 'M', 'L', 'XL']).optional(),
  /** `chart` seulement (T-0156) : champ de répartition et forme du graphique. */
  field: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
  form: z.enum(['donut', 'bars', 'count']).optional(),
  /** Position et taille sur la grille 2D (ADR-0007, T-0169) : colonnes 0 à 11, lignes de 88 px. Absentes : placées à la lecture. */
  x: z.number().int().min(0).max(11).optional(),
  y: z.number().int().min(0).max(200).optional(),
  w: z.number().int().min(1).max(GRID_COLUMNS).optional(),
  h: z.number().int().min(1).max(MAX_ROWS).optional(),
  /** Projet unique d'un exemplaire (clé) et période d'analyse ; plusieurs exemplaires d'un même genre sont permis. */
  project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).optional(),
  /** Portefeuille d'une carte à portée de portefeuille posée hors du tableau de bord d'un portefeuille (P11). */
  portfolio: z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/).optional(),
  period: z.enum(['7d', '30d', 'sprint']).optional(),
});
/** Onglets d'un classeur : au plus MAX_TABS onglets nommés par portée, en plus de l'onglet principal. */
export const MAX_TABS = 8;
export const TabIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,29}$/);
export const TabInput = z.object({ title: z.string().trim().min(1).max(60) });
export interface DashboardTab { id: string; title: string | null }
export const LayoutInput = z.object({ widgets: z.array(WidgetSchema).max(MAX_WIDGETS) });
export type Widget = z.infer<typeof WidgetSchema>;

/** Disposition initiale : Mes tickets, À approuver, Mentions, Échéances de la semaine, Projets favoris, Récents. */
export const DEFAULT_WIDGETS: readonly Widget[] = [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
  { id: 'approvals', kind: 'approvals' },
  { id: 'mentions', kind: 'mentions' },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)' },
  { id: 'favorites', kind: 'favorites' },
  { id: 'recents', kind: 'recents' },
];

/** Portée du tableau de bord : '' (accueil), la clé d'un projet (Vue d'ensemble) ou « clé:avancement » (Avancement, T-0153). */
export const ScopeSchema = z.string().regex(/^([A-Z][A-Z0-9]{1,9}(:avancement)?|portfolio:[a-z0-9][a-z0-9-]{1,29})?$/);

/** Disposition initiale de la Vue d'ensemble d'un projet : mes tickets, échéances, trackers et mentions de ce projet. */
export const defaultProjectWidgets = (project: string): Widget[] => [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done', projects: [project] },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)', projects: [project] },
  { id: 'trackers', kind: 'trackers', projects: [project] },
  { id: 'mentions', kind: 'mentions' },
  { id: 'indicators', kind: 'indicators', projects: [project], size: 'XL' },
];

/** Disposition initiale de l'Avancement d'un projet (T-0155) : variantes retenues à la revue d'ergonomie. */
export const defaultProgressWidgets = (project: string): Widget[] => [
  { id: 'indicators', kind: 'indicators', projects: [project], size: 'L' },
  { id: 'release', kind: 'release', projects: [project], size: 'S' },
  { id: 'flow', kind: 'flow', projects: [project], size: 'M' },
  { id: 'tracker-status', kind: 'tracker-status', projects: [project], size: 'M' },
  { id: 'velocity', kind: 'velocity', projects: [project], size: 'M' },
  { id: 'activity', kind: 'activity', projects: [project], size: 'M' },
];
/**
 * Disposition initiale de l'accueil selon le rôle (audit des rôles) : un chef de projet voit d'abord les retards, le chemin critique
 * et les risques ouverts ; un utilisateur ses tâches en retard ; l'assurance produit (lecture et visa) ses visas, mentions et
 * écarts à suivre. Chacun peut ensuite réorganiser, retirer ou ajouter ces cartes.
 */
export const suggestedHomeWidgets = (roles: readonly string[]): Widget[] => {
  const manager = ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director'].some((r) => roles.includes(r));
  const qaOnly = roles.includes('athena-qa') && !manager; // l'assurance produit a aussi les droits d'un utilisateur (rôle effectif), son accueil reste le sien
  if (qaOnly) {
    return [
      { id: 'approvals', kind: 'approvals' }, { id: 'mentions', kind: 'mentions' },
      { id: 'ncr', kind: 'search', query: 'type = nonconformity AND category != done' },
      { id: 'rid', kind: 'search', query: 'type = action AND category != done' },
      { id: 'favorites', kind: 'favorites' }, { id: 'recents', kind: 'recents' },
    ];
  }
  const out = [...DEFAULT_WIDGETS];
  const after = out.findIndex((w) => w.id === 'assigned') + 1;
  const extra: Widget[] = manager
    ? [
      { id: 'late', kind: 'search', query: 'late() ORDER BY dueDate' },
      { id: 'critical', kind: 'search', query: 'critical() AND category != done ORDER BY startDate' },
      { id: 'risks', kind: 'search', query: 'type = risk AND category != done ORDER BY criticality DESC' },
    ]
    : [{ id: 'mylate', kind: 'search', query: 'assignee = currentUser() AND late()' }];
  out.splice(after, 0, ...extra);
  return out;
};
/**
 * Disposition initiale de l'accueil : vide pour tous les rôles ; chacun compose ses onglets avec Organiser. Les dispositions
 * par rôle ci-dessus (`suggestedHomeWidgets`) sont conservées pour les définir plus tard.
 */
export const homeWidgetsFor = (_roles: readonly string[]): Widget[] => [];
/** Disposition initiale du tableau de bord d'un portefeuille : les tuiles de la vue direction puis le tableau de santé. */
export const defaultPortfolioWidgets = (): Widget[] => [
  { id: 'portfolio-tiles', kind: 'portfolio-tiles', size: 'XL', h: 2 },
  { id: 'portfolio-health', kind: 'portfolio-health', size: 'XL', h: 5 },
];
/** Aucun tableau de bord n'a de disposition par défaut : chacun organise les siens (les dispositions types ci-dessus restent disponibles pour les définir plus tard). */
const defaultsFor = (_scope: string, _roles: readonly string[] = []): Widget[] => [];

const overlaps = (a: Required<Pick<Widget, 'x' | 'y' | 'w' | 'h'>>, b: Required<Pick<Widget, 'x' | 'y' | 'w' | 'h'>>) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
type Box = Required<Pick<Widget, 'x' | 'y' | 'w' | 'h'>>;

/** Taille S/M/L/XL la plus proche d'une largeur, pour les clients qui ne lisent que `size`. */
const sizeOfWidth = (w: number): 'S' | 'M' | 'L' | 'XL' => (w <= 4 ? 'S' : w <= 6 ? 'M' : w <= 8 ? 'L' : 'XL');

/**
 * Conversion vers la grille 2D (T-0169), sans perte : les cartes sans position sont posées dans l'ordre, de gauche à droite puis
 * de haut en bas, à la première place libre ; la largeur vient de `size` (sinon S). Les positions
 * déjà présentes sont conservées. `size` est maintenu pour qu'un ancien client lise encore la disposition.
 */
export function toGrid(widgets: readonly Widget[]): Widget[] {
  const placed: Box[] = widgets.filter((w) => w.x !== undefined && w.y !== undefined).map((w) => ({ x: w.x!, y: w.y!, w: w.w ?? SIZE_COLUMNS[w.size ?? 'S'], h: w.h ?? DEFAULT_ROWS }));
  return widgets.map((widget) => {
    let box: Box;
    if (widget.x !== undefined && widget.y !== undefined) box = { x: widget.x, y: widget.y, w: widget.w ?? SIZE_COLUMNS[widget.size ?? 'S'], h: widget.h ?? DEFAULT_ROWS };
    else {
      const w = widget.w ?? SIZE_COLUMNS[widget.size ?? 'S'];
      const h = widget.h ?? DEFAULT_ROWS;
      box = { x: 0, y: 0, w, h };
      search: for (let y = 0; ; y++) for (let x = 0; x + w <= GRID_COLUMNS; x++) {
        box = { x, y, w, h };
        if (!placed.some((p) => overlaps(p, box))) { placed.push(box); break search; }
      }
    }
    return { ...widget, ...box, size: sizeOfWidth(box.w) };
  });
}

/** Refuse les cartes hors grille et les chevauchements (422). */
export function checkGrid(widgets: readonly Widget[]): void {
  const boxes = widgets.map((w) => ({ id: w.id, x: w.x ?? 0, y: w.y ?? 0, w: w.w ?? 1, h: w.h ?? 1 }));
  for (const b of boxes) if (b.x + b.w > GRID_COLUMNS) throw validation([`${b.id} : la carte dépasse la grille de ${GRID_COLUMNS} colonnes`]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i]!, boxes[j]!)) throw validation([`${boxes[i]!.id} et ${boxes[j]!.id} se chevauchent`]);
}

/** Identifiant d'un onglet tiré de son titre (sans accents, tirets), distinct de ceux déjà pris. */
export function uniqueTabId(title: string, taken: ReadonlySet<string>): string {
  const base = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 22) || 'onglet';
  let id = base;
  // « main » désigne l'onglet principal dans les adresses (PATCH et DELETE des onglets) : aucun onglet nommé ne le porte.
  for (let n = 2; taken.has(id) || id === 'main'; n++) id = `${base}-${n}`;
  return id;
}

/** Tableau de bord personnel configurable (T-0122) : disposition par personne, défaut sans réglage, réinitialisation. */
export class DashboardService {
  constructor(private readonly db: Db) {}

  private guard(actor: Actor, scope: string): void {
    if (scope.startsWith('portfolio:') && !PORTFOLIO_ROLES.some((r) => actor.roles.includes(r))) throw forbidden('Le tableau de bord d’un portefeuille est réservé au PMO, au directeur et à l’administrateur.');
  }

  /** Un onglet nommé doit exister (404 sinon) ; l'onglet principal (`''`) existe toujours. */
  private async requireTab(organizationId: string, actor: Actor, scope: string, tab: string): Promise<void> {
    if (tab === '') return;
    const found = await this.db.tx(organizationId, async (c) => (await c.query('select 1 from dashboard_tab where owner = $1 and scope = $2 and id = $3', [actor.id, scope, tab])).rowCount);
    if (!found) throw notFound('Onglet');
  }

  async get(organizationId: string, actor: Actor, scope = '', tab = ''): Promise<{ widgets: Widget[]; isDefault: boolean }> {
    this.guard(actor, scope);
    await this.requireTab(organizationId, actor, scope, tab);
    const row = await this.db.tx(organizationId, async (c) => (await c.query('select widgets from dashboard_layout where owner = $1 and scope = $2 and tab = $3', [actor.id, scope, tab])).rows[0]);
    if (row) return { widgets: toGrid(row.widgets as Widget[]), isDefault: false };
    // Un onglet nommé neuf est une feuille blanche ; seul l'onglet principal a une disposition par défaut.
    return { widgets: tab === '' ? toGrid(defaultsFor(scope, actor.roles)) : [], isDefault: true };
  }

  /** Onglets d'une portée : le principal d'abord (titre `null` : le client le nomme), puis les onglets nommés dans l'ordre de création. */
  async tabs(organizationId: string, actor: Actor, scope = ''): Promise<DashboardTab[]> {
    this.guard(actor, scope);
    const rows = await this.db.tx(organizationId, async (c) => (await c.query("select id, title from dashboard_tab where owner = $1 and scope = $2 order by (id <> ''), position, created_at, id", [actor.id, scope])).rows as { id: string; title: string }[]);
    return rows[0]?.id === '' ? rows : [{ id: '', title: null }, ...rows];
  }

  async createTab(organizationId: string, actor: Actor, scope: string, title: string): Promise<DashboardTab> {
    this.guard(actor, scope);
    return this.db.tx(organizationId, async (c) => {
      const rows = (await c.query("select id, position from dashboard_tab where owner = $1 and scope = $2 and id <> ''", [actor.id, scope])).rows as { id: string; position: number }[];
      if (rows.length >= MAX_TABS) throw validation([`Un classeur compte au plus ${MAX_TABS} onglets en plus de l’onglet principal`]);
      const id = uniqueTabId(title, new Set(rows.map((r) => r.id)));
      await c.query('insert into dashboard_tab (organization_id, owner, scope, id, title, position) values ($1,$2,$3,$4,$5,$6)',
        [organizationId, actor.id, scope, id, title, rows.reduce((m, r) => Math.max(m, r.position + 1), 0)]);
      return { id, title };
    });
  }

  async renameTab(organizationId: string, actor: Actor, scope: string, tab: string, title: string): Promise<DashboardTab> {
    this.guard(actor, scope);
    // L'onglet principal se renomme aussi : son titre est enregistré à la première fois (id vide).
    if (tab === '') {
      await this.db.tx(organizationId, (c) => c.query(`insert into dashboard_tab (organization_id, owner, scope, id, title, position) values ($1,$2,$3,'',$4,-1)
        on conflict (organization_id, owner, scope, id) do update set title = excluded.title`, [organizationId, actor.id, scope, title]));
      return { id: tab, title };
    }
    const n = await this.db.tx(organizationId, async (c) => (await c.query('update dashboard_tab set title = $4 where owner = $1 and scope = $2 and id = $3', [actor.id, scope, tab, title])).rowCount);
    if (!n) throw notFound('Onglet');
    return { id: tab, title };
  }

  /** Supprime un onglet nommé et sa disposition ; l'onglet principal ne se supprime pas (il se réinitialise). */
  async deleteTab(organizationId: string, actor: Actor, scope: string, tab: string): Promise<void> {
    this.guard(actor, scope);
    if (tab === '') throw validation(['L’onglet principal ne se supprime pas']);
    await this.db.tx(organizationId, async (c) => {
      const n = (await c.query('delete from dashboard_tab where owner = $1 and scope = $2 and id = $3', [actor.id, scope, tab])).rowCount;
      if (!n) throw notFound('Onglet');
      await c.query('delete from dashboard_layout where owner = $1 and scope = $2 and tab = $3', [actor.id, scope, tab]);
    });
  }

  /** Catalogue du rôle : genres posables et, pour chacun, s'il vise un projet. */
  catalog(actor: Actor): { kind: string; project: boolean; size: string; h?: number }[] {
    return allowedKinds(actor.roles).map((kind) => ({ kind, project: PROJECT_KINDS.has(kind), ...(KIND_LAYOUT[kind] ?? { size: 'M' }) }));
  }

  async put(organizationId: string, input: z.infer<typeof LayoutInput>, actor: Actor, scope = '', tab = ''): Promise<{ widgets: Widget[]; isDefault: boolean }> {
    this.guard(actor, scope);
    await this.requireTab(organizationId, actor, scope, tab);
    const allowed = new Set(allowedKinds(actor.roles));
    const current = await this.db.tx(organizationId, async (c) => (await c.query('select widgets from dashboard_layout where owner = $1 and scope = $2 and tab = $3', [actor.id, scope, tab])).rows[0]);
    const kept = new Set(((current?.widgets ?? []) as Widget[]).map((w) => `${w.id}:${w.kind}`));
    for (const w of input.widgets) if (!allowed.has(w.kind) && !kept.has(`${w.id}:${w.kind}`)) throw forbidden(`Le genre « ${w.kind} » n'est pas disponible pour votre rôle`);
    const ids = new Set<string>();
    for (const w of input.widgets) {
      if (ids.has(w.id)) throw validation([`widgets : identifiant en double (${w.id})`]);
      ids.add(w.id);
      if (scope.startsWith('portfolio:') && !PORTFOLIO_SCOPE_KINDS.has(w.kind)) throw validation([`${w.id} : le tableau de bord d’un portefeuille n’accepte que les cartes de portefeuille, de charge, de feuille de route, de risques, de recherche et les graphiques`]);
      if (w.portfolio !== undefined && !PORTFOLIO_SCOPE_KINDS.has(w.kind)) throw validation([`${w.id} : portfolio ne concerne que les cartes de portefeuille, de recherche et les graphiques`]);
      if ((w.field !== undefined || w.form !== undefined) && w.kind !== 'chart') throw validation([`${w.id} : field et form ne concernent que les cartes graphiques`]);
      if (w.kind === 'chart' && (!w.form || (w.form !== 'count' && !w.field))) throw validation([`${w.id} : une carte graphique exige une forme, et un champ sauf pour un indicateur`]);
      if (w.kind === 'search' || w.kind === 'chart') {
        try { parse(w.query ?? ''); } catch (error) {
          if (error instanceof AtqlError) throw validation([`${w.id} : ${error.message}`]);
          throw error;
        }
      } else if (w.query !== undefined) throw validation([`${w.id} : query ne concerne que les widgets de recherche`]);
      else if (w.projects !== undefined && !PROJECT_KINDS.has(w.kind) && !DUAL_KINDS.includes(w.kind)) throw validation([`${w.id} : projects ne concerne que les widgets de recherche, de trackers, d'avancement, de charge, de feuille de route et de risques`]);
    }
    const stored = toGrid(input.widgets);
    checkGrid(stored);
    await this.db.tx(organizationId, (c) => c.query(
      `insert into dashboard_layout (organization_id, owner, scope, tab, widgets) values ($1,$2,$3,$4,$5)
       on conflict (organization_id, owner, scope, tab) do update set widgets = excluded.widgets, updated_at = now()`,
      [organizationId, actor.id, scope, tab, JSON.stringify(stored)],
    ));
    return { widgets: stored, isDefault: false };
  }

  /** Revient à la disposition par défaut (onglet principal) ou vide l'onglet (onglet nommé). */
  async reset(organizationId: string, actor: Actor, scope = '', tab = ''): Promise<void> {
    await this.requireTab(organizationId, actor, scope, tab);
    await this.db.tx(organizationId, (c) => c.query('delete from dashboard_layout where owner = $1 and scope = $2 and tab = $3', [actor.id, scope, tab]));
  }
}
