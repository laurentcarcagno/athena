import type { Hit } from '../api';
import type { DashSize } from '@athena/ui';
import { fr } from '../i18n';
import type { ChartForm as ChartFormKind } from './ChartCard';

/** Modèle du tableau de bord modulaire (ADR-0007) et des gabarits (ADR-0010) : genres de cartes, cartes types, titres, portées. */
export type WidgetKind = 'search' | 'mentions' | 'approvals' | 'favorites' | 'recents' | 'trackers'
  | 'indicators' | 'flow' | 'velocity' | 'release' | 'tracker-status' | 'activity' | 'chart'
  | 'general-info' | 'global-progress' | 'key-indicators' | 'health' | 'sprint-progress' | 'pipelines' | 'quality' | 'badges' | 'portfolio-health' | 'portfolio-tiles'
  | 'portfolio-finance' | 'project-finance' | 'capacity' | 'roadmap' | 'phase-gate' | 'portfolio-gates' | 'portfolio-requests' | 'risk-matrix' | 'platform-ops';
/** Cartes d'avancement d'un projet (T-0155) : elles portent la clé du projet dans `projects`. */
export const PROGRESS: WidgetKind[] = ['indicators', 'flow', 'velocity', 'release', 'tracker-status', 'activity'];
export type Period = '7d' | '30d' | 'sprint';
/** Répétition d'une carte d'un gabarit (P7) : une par projet ou un par portefeuille de la personne. */
export type Repeat = 'project' | 'portfolio';
export interface Widget {
  id: string; kind: WidgetKind; title?: string; query?: string; projects?: string[]; size?: DashSize; field?: string; form?: ChartFormKind;
  x?: number; y?: number; w?: number; h?: number; project?: string; period?: Period; portfolio?: string; repeat?: Repeat;
}
export type Placed = Widget & { x: number; y: number; w: number; h: number };
/** Largeur par défaut d'une carte (T-0153) : trois cartes par rangée. */
export const sizeOf = (w: Widget): DashSize => w.size ?? 'S';
/** Cartes qui, vides, se résument dans la ligne « Rien d'urgent » de Mon travail (T-0153, revue O3). */
export const QUIET: WidgetKind[] = ['search', 'approvals', 'mentions'];
export type OnEmpty = (empty: boolean) => void;
export interface Layout { widgets: Widget[]; isDefault: boolean }
export interface TabInfo { id: string; title: string | null }
export const MAIN_TAB: TabInfo = { id: '', title: null };
export interface SavedSearch { id: string; name: string; query: string; projects: string[] }
export interface CatalogEntry { kind: WidgetKind; project: boolean; portfolio?: boolean; size?: DashSize; h?: number }

/** Toutes les cartes de recherche que l'on peut réajouter après un retrait (ce que l'ancien accueil par rôle proposait). */
export const HOME_WIDGETS: Widget[] = [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
  { id: 'mylate', kind: 'search', query: 'assignee = currentUser() AND late()' },
  { id: 'late', kind: 'search', query: 'late() ORDER BY dueDate' },
  { id: 'critical', kind: 'search', query: 'critical() AND category != done ORDER BY startDate' },
  { id: 'risks', kind: 'search', query: 'type = risk AND category != done ORDER BY criticality DESC' },
  { id: 'approvals', kind: 'approvals' },
  { id: 'mentions', kind: 'mentions' },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)' },
  { id: 'ncr', kind: 'search', query: 'type = nonconformity AND category != done' },
  { id: 'rid', kind: 'search', query: 'type = action AND category != done' },
  { id: 'favorites', kind: 'favorites' },
  { id: 'recents', kind: 'recents' },
];

/** Widgets par défaut de la Vue d'un projet : mes tickets et échéances de ce projet, ses trackers, mes mentions. */
export const projectWidgets = (project: string): Widget[] => [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done', projects: [project] },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)', projects: [project] },
  { id: 'trackers', kind: 'trackers', projects: [project] },
  { id: 'mentions', kind: 'mentions' },
  { id: 'indicators', kind: 'indicators', projects: [project], size: 'XL' },
];
/** Cartes types de l'Avancement d'un projet (T-0155), variantes retenues à la revue : elles se réajoutent depuis le catalogue. */
export const progressWidgets = (project: string): Widget[] => [
  { id: 'indicators', kind: 'indicators', projects: [project], size: 'L' },
  { id: 'release', kind: 'release', projects: [project], size: 'S' },
  { id: 'flow', kind: 'flow', projects: [project], size: 'M' },
  { id: 'tracker-status', kind: 'tracker-status', projects: [project], size: 'M' },
  { id: 'velocity', kind: 'velocity', projects: [project], size: 'M' },
  { id: 'activity', kind: 'activity', projects: [project], size: 'M' },
];
/** Cartes proposées par « + Ajouter une carte » : celles de la page, plus, dans un projet, toutes les cartes d'avancement. */
export const PORTFOLIO_WIDGETS: Widget[] = [{ id: 'portfolio-tiles', kind: 'portfolio-tiles', size: 'XL' }, { id: 'portfolio-health', kind: 'portfolio-health', size: 'XL' }];
export const builtinFor = (project?: string, page?: string, portfolio?: string): Widget[] => (portfolio ? PORTFOLIO_WIDGETS : project && page ? progressWidgets(project)
  : project ? [...projectWidgets(project), ...progressWidgets(project).filter((w) => w.id !== 'indicators')] : HOME_WIDGETS);

export const titleOf = (hit: Hit) => String(hit.values['title'] ?? hit.values['name'] ?? '');
export const widgetTitle = (w: Widget) => w.title ?? fr.home.titles[w.id] ?? fr.home.kinds[w.kind] ?? w.id;
/** Lien « tout voir » d'un widget de recherche : la recherche globale pré-remplie. */
export const searchHref = (w: Widget) => `/recherche?q=${encodeURIComponent(w.query ?? '')}${w.projects?.length ? `&p=${w.projects.join(',')}` : ''}`;

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ') || undefined;

/** Déplace la carte `from` à la place `to` (glisser-déposer ou clavier, T-0154). */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item!);
  return next;
}

export const PERIODS: Period[] = ['7d', '30d', 'sprint'];
/** Genres de portefeuille (la clé du portefeuille est dans `portfolio`). */
export const PORTFOLIO_KINDS = new Set<WidgetKind>(['portfolio-health', 'portfolio-tiles', 'portfolio-finance', 'portfolio-gates', 'portfolio-requests']);
/** Genres à double portée : un projet (`projects`) ou un portefeuille (`portfolio`) ; `capacity` sans l'un ni l'autre montre les équipes visibles de la personne. */
export const DUAL_KINDS = new Set<WidgetKind>(['capacity', 'roadmap', 'risk-matrix']);
/** Genres rattachés à un projet (clé dans `projects` / `project`). */
export const PROJECT_KINDS = new Set<WidgetKind>(['chart', 'trackers', ...PROGRESS, 'general-info', 'global-progress', 'key-indicators', 'health', 'sprint-progress', 'pipelines', 'quality', 'badges', 'project-finance', 'phase-gate', ...DUAL_KINDS]);
/** Genres qui ne servent qu'avec un projet choisi (les cartes d'avancement et les trackers en ont toujours un). */
export const NEEDS_PROJECT = new Set<WidgetKind>(['general-info', 'global-progress', 'key-indicators', 'health', 'sprint-progress', 'project-finance', 'phase-gate']);
/** Genres ajoutés depuis leur propre commande (recherche enregistrée, graphique) plutôt que depuis la liste des genres. */
export const SPECIAL = new Set<string>(['search', 'chart']);
/** Genres qui acceptent un portefeuille : les leurs, ceux à double portée, la recherche et le graphique. */
export const PORTFOLIO_CAPABLE = new Set<WidgetKind>([...PORTFOLIO_KINDS, ...DUAL_KINDS, 'search', 'chart']);

/** Ce qui manque à une carte pour s'afficher : un projet, un portefeuille (ou l'un des deux), ou rien. */
export function missingTarget(w: Widget, project?: string, portfolio?: string): 'project' | 'portfolio' | 'either' | null {
  const p = w.projects?.[0] ?? w.project ?? project;
  const q = w.portfolio ?? portfolio;
  if (NEEDS_PROJECT.has(w.kind)) return p ? null : 'project';
  if (PORTFOLIO_KINDS.has(w.kind)) return q ? null : 'portfolio';
  if (w.kind === 'roadmap' || w.kind === 'risk-matrix') return p || q ? null : 'either';
  return null;
}
