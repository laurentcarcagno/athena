import { useEffect, useRef, useState } from 'react';
import type { NavItem, NavSection } from '@athena/ui';
import { api, type SavedFilter } from '../api';
import { fr } from '../i18n';
import { entriesOf, pinHref, usePins, type Pin } from '../lib/pins';
import { IMPLEMENTED_TABS, visibleTabs } from '../pages/project/ProjectShell';

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

/**
 * Rubriques du rail : favoris et récents, entrées globales, puis le projet courant (onglets), ses trackers et,
 * sous le tracker ouvert, ses vues partagées. Les rubriques gardent toujours le même ordre ; seuls les favoris se réordonnent.
 */
export function useRailSections({ pathname, project, admin }: { pathname: string; project: string | undefined; admin: boolean }): { sections: NavSection[]; current: string } {
  const pins = usePins();
  const [modules, setModules] = useState<string[] | null>(null);
  const [trackers, setTrackers] = useState<TrackerRow[]>([]);
  const [views, setViews] = useState<SavedFilter[]>([]);
  const tracker = /^\/p\/[^/]+\/t\/([^/]+)/.exec(pathname)?.[1];

  useEffect(() => {
    setModules(null);
    setTrackers([]);
    if (!project) return;
    api<{ modules: string[] }>('GET', `/v1/projects/${project}/modules`).then((r) => setModules(r.modules)).catch(() => setModules(null));
    api<TrackerRow[]>('GET', `/v1/projects/${project}/trackers`).then((r) => setTrackers(Array.isArray(r) ? r : [])).catch(() => setTrackers([]));
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
  if (pins.favorites.length > 0) sections.push({ id: 'favorites', title: fr.rail.favorites, items: pins.favorites.map((p, i) => pinItem(p, i, pins.favorites.length)) });
  const recents = pins.recents.filter((r) => !pins.favorites.some((f) => f.kind === r.kind && f.project === r.project && f.ref === r.ref));
  if (recents.length > 0) sections.push({ id: 'recents', title: fr.rail.recents, items: recents.map(recentItem) });
  sections.push({
    id: 'main',
    items: [
      { id: '/', label: fr.nav.projects }, { id: '/me', label: fr.nav.work },
      ...(admin ? [{ id: '/org', label: fr.nav.organization }] : []),
      { id: '/help', label: fr.nav.help },
    ],
  });
  if (project) {
    const tabs = visibleTabs(modules, IMPLEMENTED_TABS).map((t) => ({ id: t.path === '' ? `/p/${project}` : `/p/${project}/${t.path}`, label: fr.project.tabs[t.id] }));
    sections.push({
      id: 'project', title: `${fr.rail.project} ${project}`,
      items: [...tabs, { id: `/p/${project}/recherche`, label: fr.nav.search }, ...(admin ? [{ id: `/p/${project}/admin`, label: fr.nav.admin }] : [])],
    });
    if (trackers.length > 0) {
      sections.push({
        id: 'trackers', title: fr.rail.trackers,
        items: trackers.flatMap((t): NavItem[] => [
          { id: `/p/${project}/t/${t.key}/tableau`, label: `${t.key} · ${t.name}` },
          ...(tracker === t.key ? views.map((v): NavItem => ({ id: `/p/${project}/t/${t.key}/tableau?v=${v.id}`, label: v.name, depth: 1 })) : []),
        ]),
      });
    }
  }
  // Entrée courante : l'adresse la plus longue qui est un préfixe de la page (les vues, qui portent une requête, ne comptent pas).
  const ids = sections.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !id.includes('?'));
  const current = [...ids].sort((a, b) => b.length - a.length).find((id) => id !== '/' && (pathname === id || pathname.startsWith(`${id}/`))) ?? '/';
  return { sections, current };
}
