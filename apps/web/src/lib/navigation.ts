/**
 * Sections d'un projet (ADR-0003 § 4) : une seule définition, lue par le rail, le fil d'Ariane et, plus tard, le sélecteur mobile.
 * Pendant la transition du Lot 9, les pages existantes restent des sections ; elles se regroupent sous Rapports et Paramètres
 * quand ces pages sont livrées (T-0120, T-0121).
 */

/** Module de projet calculé par le serveur (`GET /v1/projects/:p/modules`). */
export type ModuleId = 'overview' | 'trackers' | 'planning' | 'traceability' | 'conformity' | 'documents' | 'code' | 'activity' | 'members';

export type ProjectSectionId = ModuleId | 'backlog' | 'board' | 'roadmap' | 'reports' | 'search' | 'settings';

/** Qui voit la section : tout le monde, ou les seuls porteurs de l'un des rôles. */
export type Access = { kind: 'everyone' } | { kind: 'roles'; roles: readonly string[] };

export interface ProjectSection {
  readonly id: ProjectSectionId;
  /** Chemin relatif à `/p/:projet` (`''` : l'accueil du projet). */
  readonly path: string;
  /** Vrai : la section n'existe que si le serveur la déclare active pour ce projet. */
  readonly gated: boolean;
  readonly access: Access;
}

const EVERYONE: Access = { kind: 'everyone' };
const MANAGERS: Access = { kind: 'roles', roles: ['athena-admin', 'athena-pm'] };

/** Ordre fixe : une section masquée ne décale jamais les autres. */
export const PROJECT_SECTIONS: readonly ProjectSection[] = [
  { id: 'overview', path: '', gated: true, access: EVERYONE },
  { id: 'backlog', path: 'backlog', gated: false, access: EVERYONE }, // T-0116 : backlog des trackers Tâche et sprints
  { id: 'board', path: 'board', gated: false, access: EVERYONE }, // T-0114 : boards du projet et des trackers
  { id: 'trackers', path: 'trackers', gated: true, access: EVERYONE },
  { id: 'roadmap', path: 'roadmap', gated: false, access: EVERYONE }, // T-0117 : versions, avancement, publication
  { id: 'reports', path: 'rapports', gated: false, access: EVERYONE }, // T-0121 : avancement, traçabilité, conformité, livraison, activité
  { id: 'documents', path: 'documents', gated: true, access: EVERYONE },
  { id: 'search', path: 'recherche', gated: false, access: EVERYONE },
  // T-0120 : Membres, Planification et l'ancienne Administration du projet y sont regroupés ; l'assurance qualité y trouve les approbations.
  { id: 'settings', path: 'parametres', gated: false, access: { kind: 'roles', roles: ['athena-admin', 'athena-pm', 'athena-qa'] } },
];

export type ReportId = 'avancement' | 'tracabilite' | 'conformite' | 'livraison' | 'activite';

/** Rapports du projet (ADR-0003 § 2) : `/p/:p/rapports/:r`, dans cet ordre. `module` : le rapport n'existe que si le serveur déclare ce module actif. */
export const REPORTS: ReadonlyArray<{ id: ReportId; module: ModuleId | null }> = [
  { id: 'avancement', module: null },
  { id: 'tracabilite', module: 'traceability' },
  { id: 'conformite', module: 'conformity' },
  { id: 'livraison', module: 'code' },
  { id: 'activite', module: 'activity' },
];
/** Rapports affichés ; `modules` vaut null tant que la liste n'est pas connue : tous restent alors visibles. */
export const visibleReports = (modules: readonly string[] | null) => REPORTS.filter((r) => r.module === null || modules === null || modules.includes(r.module));

export type SettingsId = 'membres' | 'trackers' | 'boards' | 'automatisations' | 'baselines' | 'approbations';
const ADMIN: Access = { kind: 'roles', roles: ['athena-admin'] };

/** Paramètres du projet (ADR-0003 § 2) : `/p/:p/parametres/:s`, dans cet ordre. Les objets globaux (webhooks, plugins) sont à l'Administration. */
export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsId; access: Access }> = [
  { id: 'membres', access: MANAGERS },
  { id: 'trackers', access: ADMIN },
  { id: 'boards', access: MANAGERS },
  { id: 'automatisations', access: ADMIN },
  { id: 'baselines', access: MANAGERS },
  { id: 'approbations', access: { kind: 'roles', roles: ['athena-admin', 'athena-pm', 'athena-qa'] } },
];
export const visibleSettings = (roles: readonly string[]) => SETTINGS_SECTIONS.filter((s) => allows(s.access, roles));

export const allows = (access: Access, roles: readonly string[]): boolean =>
  access.kind === 'everyone' || access.roles.some((r) => roles.includes(r));

/**
 * Sections affichées : autorisées pour ces rôles et, pour les sections soumises à module, déclarées actives.
 * `modules` vaut null tant que la liste n'est pas connue ou si elle échoue : toutes les sections autorisées restent alors visibles.
 */
export function visibleSections(modules: readonly string[] | null, roles: readonly string[]): ProjectSection[] {
  return PROJECT_SECTIONS.filter((s) => allows(s.access, roles) && (!s.gated || modules === null || modules.includes(s.id)));
}

export const sectionHref = (project: string, section: ProjectSection): string => (section.path === '' ? `/p/${project}` : `/p/${project}/${section.path}`);

/** Clé canonique `PROJET-TRACKER-0042` : le tracker est son deuxième segment. */
const CANONICAL_KEY = /^[A-Z][A-Z0-9]{1,9}-([A-Z][A-Z0-9]{1,9})-\d{4,9}$/;

/** Anciennes adresses qui pointent vers une section (redirigées dans `App.tsx`). */
const ALIASES: Readonly<Record<string, ProjectSectionId>> = { manage: 'settings', planification: 'settings', membres: 'settings', admin: 'settings', dashboard: 'overview', tracabilite: 'reports', conformite: 'reports', code: 'reports', activite: 'reports' };

export interface Place { project: string; section: ProjectSectionId | null; tracker: string | null }

/**
 * Où se trouve une adresse dans le projet : sa section et, s'il y en a un, le tracker concerné
 * (écran Tracker, configuration du tracker, fiche à clé canonique). Hors d'un projet : null.
 */
export function placeOf(pathname: string): Place | null {
  const match = /^\/p\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (!match) return null;
  const project = match[1]!;
  const [head = '', second, third] = (match[2] ?? '').split('/').filter(Boolean);
  if (head === 't' && second) return { project, section: 'trackers', tracker: second };
  // Configuration d'un tracker (T-0109) : le rail signale le tracker, à l'ancienne adresse comme dans Paramètres (T-0120).
  if (head === 'trackers' && second && second !== 'new' && third === 'config') return { project, section: 'trackers', tracker: second };
  if (head === 'parametres' && second === 'trackers' && third) return { project, section: 'trackers', tracker: third };
  if (head === 'a' && second) return { project, section: 'trackers', tracker: CANONICAL_KEY.exec(second)?.[1] ?? null };
  if (head === 'rapports') return { project, section: 'reports', tracker: null };
  if (head === 'board') return { project, section: 'board', tracker: null };
  const section = PROJECT_SECTIONS.find((s) => s.path === head)?.id ?? ALIASES[head] ?? null;
  return { project, section, tracker: null };
}
