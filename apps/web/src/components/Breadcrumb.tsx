import { Link } from 'react-router-dom';
import { fr } from '../i18n';

export interface Crumb { label: string; to?: string; mono?: boolean }

const TAB_PATHS: Record<string, keyof typeof fr.project.tabs> = {
  trackers: 'trackers', planification: 'planning', tracabilite: 'traceability', documents: 'documents', code: 'code', activite: 'activity', membres: 'members',
};

/**
 * Fil d'Ariane `Projet › Tracker › Vue › Item` d'une adresse de projet. Chaque segment mène à sa page, le dernier est la page courante.
 * Vide hors d'un projet.
 */
export function crumbsFor(pathname: string, search = ''): Crumb[] {
  const match = /^\/p\/([A-Z][A-Z0-9]{1,9})(?:\/(.*))?$/.exec(pathname);
  if (!match) return [];
  const project = match[1]!;
  const rest = (match[2] ?? '').split('/').filter(Boolean);
  const home: Crumb = { label: project, to: `/p/${project}`, mono: true };
  const out: Crumb[] = [home];
  const tracker = (key: string): Crumb => ({ label: key, to: `/p/${project}/t/${key}/tableau`, mono: true });
  const [head, second, third] = rest;
  if (head === undefined) { /* accueil du projet */ }
  else if (head === 'trackers' && second === 'new') out.push({ label: fr.project.tabs.trackers, to: `/p/${project}/trackers` }, { label: fr.builder.newTracker });
  else if (head === 'trackers' && second && third === 'config') out.push(tracker(second), { label: fr.config.eyebrow });
  else if (head in TAB_PATHS) out.push({ label: fr.project.tabs[TAB_PATHS[head]!] });
  else if (head === 'recherche') out.push({ label: fr.nav.search });
  else if (head === 'admin') out.push({ label: fr.nav.admin });
  else if (head === 'board') out.push({ label: fr.project.tabs.planning, to: `/p/${project}/planification` }, { label: second ?? '', mono: true });
  else if (head === 't' && second) {
    const view = third ?? 'tableau';
    const item = new URLSearchParams(search).get('i');
    out.push(tracker(second));
    out.push(item ? { label: fr.trackerScreen.viewNames[view] ?? view, to: `/p/${project}/t/${second}/${view}` } : { label: fr.trackerScreen.viewNames[view] ?? view });
    if (item) out.push({ label: item, mono: true });
  } else if (head === 'a' && second) {
    const trackerKey = /^[A-Z][A-Z0-9]{1,9}-([A-Z][A-Z0-9]{1,9})-\d{4,9}$/.exec(second)?.[1];
    if (trackerKey) out.push(tracker(trackerKey));
    out.push({ label: second, mono: true });
  }
  return out.map((c, i) => (i === out.length - 1 ? { label: c.label, ...(c.mono ? { mono: true } : {}) } : c));
}

/** Fil d'Ariane persistant des pages de projet. */
export function Breadcrumb({ pathname, search }: { pathname: string; search: string }) {
  const crumbs = crumbsFor(pathname, search);
  if (crumbs.length === 0) return null;
  return (
    <nav className="ath-breadcrumb" aria-label={fr.crumb.label}>
      <ol className="ath-breadcrumb__list">
        {crumbs.map((c, i) => (
          <li key={`${i}-${c.label}`} className="ath-breadcrumb__item">
            {i > 0 && <span aria-hidden="true" className="ath-breadcrumb__sep">›</span>}
            {c.to ? <Link className={`ath-link${c.mono ? ' ath-mono' : ''}`} to={c.to}>{c.label}</Link>
              : <span className={c.mono ? 'ath-mono' : undefined} aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
