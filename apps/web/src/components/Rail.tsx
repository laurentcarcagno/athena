import { useEffect, useRef, useState } from 'react';
import type { NavItem, NavSection } from '@athena/ui';
import { api, type SavedFilter } from '../api';
import { fr } from '../i18n';
import { PROJECT_SECTIONS, placeOf, sectionHref, visibleSections, type Place, type ProjectSectionId } from '../lib/navigation';
import { entriesOf, pinHref, usePins, type Pin } from '../lib/pins';
import { RAIL_ICONS, sectionIcon } from './RailIcons';

interface TrackerRow { key: string; name: string; category?: string | null }

/** Nom du tracker au rail : sans le code entre parenthèses (« Conception (DDF) » → « Conception »). */
export const plainName = (name: string): string => name.replace(/\s*\([^()]*\)\s*$/, '').trim() || name;
const GROUPS = ['engineering', 'development', 'verification', 'management', 'other'] as const;
/** Au-delà de ce nombre, les trackers se regroupent par catégorie (repliées, sauf celle du tracker ouvert). */
const GROUP_FROM = 5;

interface ProjectRow { key: string; name: string }
const titleCache = new Map<string, string>();

/**
 * Titres en clair des favoris et récents (nom du projet, du tracker, du ticket), affichés après l'identifiant. Les noms de projets
 * viennent de la liste déjà chargée ; trackers et tickets sont lus une fois par projet (un appel chacun) puis gardés en mémoire.
 * Un échec laisse l'identifiant seul : le menu reste utilisable.
 */
function usePinTitles(pins: Pin[], projects: ProjectRow[]): (pin: Pin) => string | undefined {
  const [, bump] = useState(0);
  const signature = pins.map((p) => `${p.kind}:${p.project}:${p.ref}`).join('|');
  useEffect(() => {
    let live = true;
    const jobs: Array<Promise<void>> = [];
    const byProject = new Map<string, { trackers: boolean; items: string[] }>();
    for (const p of pins) {
      const entry = byProject.get(p.project) ?? { trackers: false, items: [] };
      if ((p.kind === 'tracker' || p.kind === 'view') && !titleCache.has(`trackers:${p.project}`)) entry.trackers = true;
      if (p.kind === 'item' && !titleCache.has(`item:${p.project}:${p.ref}`)) entry.items.push(p.ref);
      byProject.set(p.project, entry);
    }
    for (const [project, need] of byProject) {
      if (need.trackers) {
        jobs.push(api<Array<{ key: string; name?: string }>>('GET', `/v1/projects/${project}/trackers`).then((rows) => {
          for (const t of Array.isArray(rows) ? rows : []) titleCache.set(`tracker:${project}:${t.key}`, plainName(t.name ?? t.key));
          titleCache.set(`trackers:${project}`, 'ok');
        }).catch(() => undefined));
      }
      if (need.items.length > 0) {
        const list = [...new Set(need.items)].slice(0, 50).map((k) => `"${k}"`).join(', ');
        jobs.push(api<{ hits: Array<{ key: string; title?: string }> }>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent(`key IN (${list})`)}&limit=50`).then((r) => {
          for (const h of r.hits ?? []) if (h.title && h.title !== h.key) titleCache.set(`item:${project}:${h.key}`, h.title);
        }).catch(() => undefined));
      }
    }
    if (jobs.length > 0) void Promise.all(jobs).then(() => { if (live) bump((n) => n + 1); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return (pin) => {
    if (pin.kind === 'project') return projects.find((p) => p.key === pin.project)?.name;
    if (pin.kind === 'tracker') return titleCache.get(`tracker:${pin.project}:${pin.ref}`);
    if (pin.kind === 'item') return titleCache.get(`item:${pin.project}:${pin.ref}`);
    return undefined;
  };
}

/** Note dans les récents le projet, le tracker ou l'item que l'adresse désigne (une fois par changement). */
export function useRecordVisits(pathname: string): void {
  const pins = usePins();
  const visit = useRef(pins.visit);
  visit.current = pins.visit;
  const last = useRef('');
  useEffect(() => {
    for (const entry of entriesOf(pathname)) {
      const id = `${entry.kind}:${entry.project}:${entry.ref}`;
      if (last.current.split('|').includes(id)) continue;
      visit.current(entry);
    }
    last.current = entriesOf(pathname).map((e) => `${e.kind}:${e.project}:${e.ref}`).join('|');
  }, [pathname]);
}

/** Libellé d'une section de projet dans le rail. */
const sectionLabel = (id: ProjectSectionId, roles: readonly string[] = []): string => {
  if (id === 'search') return fr.rail.projectSearch;
  // Assurance produit seule : les Paramètres ne lui montrent que les approbations, l'entrée le dit.
  if (id === 'settings' && roles.includes('athena-qa') && !roles.includes('athena-admin') && !roles.includes('athena-pm')) return fr.rail.approvals;
  return fr.project.tabs[id];
};

/**
 * Rubriques du rail : favoris et récents, entrées globales, puis le projet courant : ses sections (ADR-0003), avec sous
 * « Trackers » les trackers du projet et, sous le tracker ouvert, ses vues partagées. Les rubriques gardent toujours le même
 * ordre ; seuls les favoris se réordonnent.
 */
export function useRailSections({ pathname, project, roles }: { pathname: string; project: string | undefined; roles: readonly string[] }): { sections: NavSection[]; current: string; projectNav: ProjectNav | null } {
  const pins = usePins();
  const [trackers, setTrackers] = useState<TrackerRow[]>([]);
  const [views, setViews] = useState<SavedFilter[]>([]);
  const [modules, setModules] = useState<string[] | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const place = placeOf(pathname);
  const tracker = /^\/p\/[^/]+\/t\/([^/]+)/.exec(pathname)?.[1];
  const admin = roles.includes('athena-admin');

  useEffect(() => {
    setTrackers([]);
    setModules(null);
    if (!project) return;
    api<TrackerRow[]>('GET', `/v1/projects/${project}/trackers`).then((r) => setTrackers(Array.isArray(r) ? r : [])).catch(() => setTrackers([]));
    api<{ modules: string[] }>('GET', `/v1/projects/${project}/modules`).then((r) => setModules(Array.isArray(r.modules) ? r.modules : null)).catch(() => setModules(null));
  }, [project]);
  const reloadProjects = pathname.startsWith('/admin') || pathname.startsWith('/projets');
  useEffect(() => {
    api<ProjectRow[]>('GET', '/v1/projects').then((r) => setProjects(Array.isArray(r) ? r : [])).catch(() => setProjects([]));
  }, [project, reloadProjects]);
  const titleOf = usePinTitles([...pins.favorites, ...pins.recents], projects);
  useEffect(() => {
    setViews([]);
    if (!project || !tracker) return;
    api<SavedFilter[]>('GET', `/v1/projects/${project}/filters?tracker=${tracker}`).then((r) => setViews(Array.isArray(r) ? r.filter((v) => v.shared) : [])).catch(() => setViews([]));
  }, [project, tracker]);

  /** Le titre n'est ajouté que s'il apporte quelque chose de plus que l'identifiant. */
  const detailOf = (pin: Pin): { detail?: string } => { const t = titleOf(pin); return t && t !== pin.label ? { detail: t } : {}; };
  const pinItem = (pin: Pin, index: number, count: number): NavItem => ({
    id: pinHref(pin), label: pin.label, mono: pin.kind === 'item', ...detailOf(pin),
    extra: (
      <>
        <button type="button" className="ath-nav__move" aria-label={`${fr.rail.moveUp} ${pin.label}`} disabled={index === 0} onClick={() => void pins.move(pin.id, -1)}>↑</button>
        <button type="button" className="ath-nav__move" aria-label={`${fr.rail.moveDown} ${pin.label}`} disabled={index === count - 1} onClick={() => void pins.move(pin.id, 1)}>↓</button>
      </>
    ),
  });
  const recentItem = (pin: Pin): NavItem => ({ id: pinHref(pin), label: pin.label, mono: pin.kind === 'item', ...detailOf(pin) });

  const sections: NavSection[] = [];
  sections.push({ id: 'favorites', title: fr.rail.favorites, icon: RAIL_ICONS['favorites'], flyout: true, emptyLabel: fr.rail.noFavorites, items: pins.favorites.map((p, i) => pinItem(p, i, pins.favorites.length)) });
  const recents = pins.recents.filter((r) => !pins.favorites.some((f) => f.kind === r.kind && f.project === r.project && f.ref === r.ref));
  sections.push({ id: 'recents', title: fr.rail.recents, icon: RAIL_ICONS['recents'], flyout: true, emptyLabel: fr.rail.noRecents, items: recents.map(recentItem) });
  // Projets : un menu comme Favoris et Récents. « Nouveau projet » en première option (administrateur), puis les projets, puis la liste complète.
  sections.push({
    id: 'projects', title: fr.nav.projects, icon: RAIL_ICONS['projects'], flyout: true, emptyLabel: fr.projects.empty, count: projects.length,
    items: [
      ...(admin ? [{ id: '/admin?onglet=projets', label: fr.rail.newProject, emphasis: true }] : []),
      ...projects.map((p): NavItem => ({ id: `/p/${p.key}`, label: p.key, mono: true, ...(p.name && p.name !== p.key ? { detail: p.name } : {}) })),
      { id: '/projets', label: fr.rail.allProjects },
    ],
  });
  sections.push({
    id: 'main',
    items: [
      // Rail global : Projets (menu), Mon travail, Recherche, Administration ; Favoris et Récents sont aussi des menus (ADR-0003) ; Profil et Aide sont au bas du rail.
      { id: '/', label: fr.nav.work, icon: RAIL_ICONS['work'] }, { id: '/recherche', label: fr.nav.search, icon: RAIL_ICONS['search'] },
      ...(roles.some((r) => ['athena-admin', 'athena-pm', 'athena-manager', 'athena-director'].includes(r)) ? [{ id: '/charge', label: fr.steer.nav.teams, icon: RAIL_ICONS['teams'] }] : []),
      ...(roles.some((r) => ['athena-admin', 'athena-pm', 'athena-director'].includes(r)) ? [{ id: '/portefeuilles', label: fr.steer.nav.portfolios, icon: RAIL_ICONS['portfolios'] }] : []),
      ...(admin ? [{ id: '/admin', label: fr.nav.admin, icon: RAIL_ICONS['admin'] }] : []),
    ],
  });
  let projectNav: ProjectNav | null = null;
  if (project) {
    const entries = visibleSections(modules, roles).map((s) => ({ id: sectionHref(project, s), label: sectionLabel(s.id, roles) }));
    const here = PROJECT_SECTIONS.find((s) => s.id === place?.section);
    const currentHref = here ? sectionHref(project, here) : null;
    projectNav = { project, entries, current: entries.some((e) => e.id === currentHref) ? currentHref : null };
    const trackerItem = (t: TrackerRow, depth: number): NavItem[] => [
      { id: trackerHref(project, t.key), label: plainName(t.name ?? t.key), depth },
      ...(tracker === t.key ? views.map((v): NavItem => ({ id: `${trackerHref(project, t.key)}?v=${v.id}`, label: v.name, depth: depth + 1 })) : []),
    ];
    const grouped = trackers.length > GROUP_FROM;
    const trackerItems = grouped
      ? GROUPS.flatMap((group): NavItem[] => {
        const members = trackers.filter((t) => (GROUPS.includes((t.category ?? 'other') as (typeof GROUPS)[number]) ? t.category ?? 'other' : 'other') === group);
        if (members.length === 0) return [];
        const expanded = opened[group] ?? members.some((t) => t.key === tracker);
        return [
          { id: `group:${group}`, label: `${fr.rail.groups[group]} (${members.length})`, depth: 1, toggle: { expanded, onToggle: () => setOpened((o) => ({ ...o, [group]: !expanded })) } },
          ...(expanded ? members.flatMap((t) => trackerItem(t, 2)) : []),
        ];
      })
      : trackers.flatMap((t) => trackerItem(t, 1));
    sections.push({
      id: 'project', title: `${fr.rail.project} ${project}`,
      items: visibleSections(modules, roles).flatMap((s): NavItem[] => [
        { id: sectionHref(project, s), label: sectionLabel(s.id, roles), icon: sectionIcon(s.id) },
        ...(s.id === 'trackers' ? trackerItems : []),
      ]),
    });
  }
  const ids = sections.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !id.includes('?') && !id.startsWith('group:'));
  return { sections, current: currentEntry(pathname, place, ids), projectNav };
}

/** Sections du projet courant, pour le sélecteur mobile (même source que le rail). `current` : la section de la page. */
export interface ProjectNav { project: string; entries: ReadonlyArray<{ id: string; label: string }>; current: string | null }

const trackerHref = (project: string, key: string) => `/p/${project}/t/${key}/tableau`;

/**
 * Entrée courante. Dans un projet : le tracker de la page s'il figure au rail (écran Tracker, fiche, configuration), sinon
 * la section de la page. Ailleurs : l'adresse la plus longue qui est un préfixe de la page. Rien si aucune entrée ne convient.
 */
function currentEntry(pathname: string, place: Place | null, ids: readonly string[]): string {
  if (place) {
    const byTracker = place.tracker ? trackerHref(place.project, place.tracker) : null;
    if (byTracker && ids.includes(byTracker)) return byTracker;
    const section = PROJECT_SECTIONS.find((s) => s.id === place.section);
    const bySection = section ? sectionHref(place.project, section) : null;
    return bySection && ids.includes(bySection) ? bySection : '';
  }
  return [...ids].sort((a, b) => b.length - a.length).find((id) => id !== '/' && (pathname === id || pathname.startsWith(`${id}/`))) ?? (pathname === '/' ? '/' : '');
}
