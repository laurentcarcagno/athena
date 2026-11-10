import { useEffect, useRef, useState } from 'react';
import type { NavItem, NavSection } from '@athena/ui';
import { api, type SavedFilter } from '../api';
import { fr } from '../i18n';
import { PROJECT_SECTIONS, placeOf, sectionHref, visibleSections, type Place, type ProjectSectionId } from '../lib/navigation';
import { entriesOf, pinHref, usePins, type Pin } from '../lib/pins';

interface TrackerRow { key: string; name: string }

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
const sectionLabel = (id: ProjectSectionId): string => (id === 'search' ? fr.nav.search : id === 'admin' ? fr.nav.admin : fr.project.tabs[id]);

/**
 * Rubriques du rail : favoris et récents, entrées globales, puis le projet courant : ses sections (ADR-0003), avec sous
 * « Trackers » les trackers du projet et, sous le tracker ouvert, ses vues partagées. Les rubriques gardent toujours le même
 * ordre ; seuls les favoris se réordonnent.
 */
export function useRailSections({ pathname, project, roles }: { pathname: string; project: string | undefined; roles: readonly string[] }): { sections: NavSection[]; current: string } {
  const pins = usePins();
  const [trackers, setTrackers] = useState<TrackerRow[]>([]);
  const [views, setViews] = useState<SavedFilter[]>([]);
  const [modules, setModules] = useState<string[] | null>(null);
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
  useEffect(() => {
    setViews([]);
    if (!project || !tracker) return;
    api<SavedFilter[]>('GET', `/v1/projects/${project}/filters?tracker=${tracker}`).then((r) => setViews(Array.isArray(r) ? r.filter((v) => v.shared) : [])).catch(() => setViews([]));
  }, [project, tracker]);

  const pinItem = (pin: Pin, index: number, count: number): NavItem => ({
    id: pinHref(pin), label: pin.label, mono: pin.kind === 'item',
    extra: (
      <>
        <button type="button" className="ath-nav__move" aria-label={`${fr.rail.moveUp} ${pin.label}`} disabled={index === 0} onClick={() => void pins.move(pin.id, -1)}>↑</button>
        <button type="button" className="ath-nav__move" aria-label={`${fr.rail.moveDown} ${pin.label}`} disabled={index === count - 1} onClick={() => void pins.move(pin.id, 1)}>↓</button>
      </>
    ),
  });
  const recentItem = (pin: Pin): NavItem => ({ id: pinHref(pin), label: pin.label, mono: pin.kind === 'item' });

  const sections: NavSection[] = [];
  sections.push({ id: 'favorites', title: fr.rail.favorites, flyout: true, emptyLabel: fr.rail.noFavorites, items: pins.favorites.map((p, i) => pinItem(p, i, pins.favorites.length)) });
  const recents = pins.recents.filter((r) => !pins.favorites.some((f) => f.kind === r.kind && f.project === r.project && f.ref === r.ref));
  sections.push({ id: 'recents', title: fr.rail.recents, flyout: true, emptyLabel: fr.rail.noRecents, items: recents.map(recentItem) });
  sections.push({
    id: 'main',
    items: [
      { id: '/', label: fr.nav.projects }, { id: '/me', label: fr.nav.work },
      ...(admin ? [{ id: '/org', label: fr.nav.organization }] : []),
      { id: '/help', label: fr.nav.help },
    ],
  });
  if (project) {
    const trackerItems = trackers.flatMap((t): NavItem[] => [
      { id: trackerHref(project, t.key), label: `${t.key} · ${t.name}`, depth: 1 },
      ...(tracker === t.key ? views.map((v): NavItem => ({ id: `${trackerHref(project, t.key)}?v=${v.id}`, label: v.name, depth: 2 })) : []),
    ]);
    sections.push({
      id: 'project', title: `${fr.rail.project} ${project}`,
      items: visibleSections(modules, roles).flatMap((s): NavItem[] => [
        { id: sectionHref(project, s), label: sectionLabel(s.id) },
        ...(s.id === 'trackers' ? trackerItems : []),
      ]),
    });
  }
  const ids = sections.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !id.includes('?'));
  return { sections, current: currentEntry(pathname, place, ids) };
}

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
  return [...ids].sort((a, b) => b.length - a.length).find((id) => id !== '/' && (pathname === id || pathname.startsWith(`${id}/`))) ?? '/';
}
