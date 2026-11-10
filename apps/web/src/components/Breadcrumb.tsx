import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type TrackerTypeEntry } from '../api';
import { fr } from '../i18n';
import { viewsFor } from '../lib/tracker-views';

/** Frères d'un segment : les autres projets, les autres trackers du projet, ou les autres vues du tracker. */
export interface Siblings { kind: 'project' | 'tracker' | 'view'; project: string; tracker?: string; current: string }
export interface Crumb { label: string; to?: string; mono?: boolean; siblings?: Siblings }

const TAB_PATHS: Record<string, keyof typeof fr.project.tabs> = {
  backlog: 'backlog', trackers: 'trackers', roadmap: 'roadmap', tracabilite: 'traceability', conformite: 'conformity', documents: 'documents', code: 'code', activite: 'activity',
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
  const home: Crumb = { label: project, to: `/p/${project}`, mono: true, siblings: { kind: 'project', project, current: project } };
  const out: Crumb[] = [home];
  const tracker = (key: string): Crumb => ({ label: key, to: `/p/${project}/t/${key}/tableau`, mono: true, siblings: { kind: 'tracker', project, current: key } });
  const [head, second, third] = rest;
  if (head === undefined) { /* accueil du projet */ }
  else if (head === 'trackers' && second === 'new') out.push({ label: fr.project.tabs.trackers, to: `/p/${project}/trackers` }, { label: fr.builder.newTracker });
  else if (head === 'trackers' && second && third === 'config') out.push(tracker(second), { label: fr.config.eyebrow });
  else if (head in TAB_PATHS) out.push({ label: fr.project.tabs[TAB_PATHS[head]!] });
  else if (head === 'recherche') out.push({ label: fr.nav.search });
  else if (head === 'parametres') out.push(second ? { label: fr.settings.title, to: `/p/${project}/parametres` } : { label: fr.settings.title }, ...(second ? [{ label: fr.settings.sections[second] ?? second }] : []), ...(third ? [{ label: third, mono: true }] : []));
  else if (head === 'board') out.push(second ? { label: fr.project.tabs.board, to: `/p/${project}/board` } : { label: fr.project.tabs.board }, ...(second ? [{ label: second, mono: true }] : []));
  else if (head === 't' && second) {
    const view = third ?? 'tableau';
    const item = new URLSearchParams(search).get('i');
    const viewLabel = fr.trackerScreen.viewNames[view] ?? view;
    const siblings: Siblings = { kind: 'view', project, tracker: second, current: view };
    out.push(tracker(second));
    out.push(item ? { label: viewLabel, to: `/p/${project}/t/${second}/${view}`, siblings } : { label: viewLabel, siblings });
    if (item) out.push({ label: item, mono: true });
  } else if (head === 'a' && second) {
    const trackerKey = /^[A-Z][A-Z0-9]{1,9}-([A-Z][A-Z0-9]{1,9})-\d{4,9}$/.exec(second)?.[1];
    if (trackerKey) out.push(tracker(trackerKey));
    out.push({ label: second, mono: true });
  }
  return out.map((c, i) => (i === out.length - 1 ? { label: c.label, ...(c.mono ? { mono: true } : {}), ...(c.siblings ? { siblings: c.siblings } : {}) } : c));
}

interface Choice { id: string; label: string; to: string }

/** Charge les frères à l'ouverture seulement : aucun appel tant que le menu reste fermé. */
async function loadChoices(s: Siblings): Promise<Choice[]> {
  if (s.kind === 'project') {
    const projects = await api<Array<{ key: string; name: string }>>('GET', '/v1/projects');
    return projects.map((p) => ({ id: p.key, label: p.key, to: `/p/${p.key}` }));
  }
  const trackers = await api<Array<{ key: string; name: string; typeKey?: string | null }>>('GET', `/v1/projects/${s.project}/trackers`);
  if (s.kind === 'tracker') return trackers.map((t) => ({ id: t.key, label: t.key, to: `/p/${s.project}/t/${t.key}/tableau` }));
  const me = trackers.find((t) => t.key === s.tracker);
  const types = me?.typeKey ? await api<TrackerTypeEntry[]>('GET', '/v1/tracker-types').catch(() => [] as TrackerTypeEntry[]) : [];
  return viewsFor(types.find((t) => t.key === me?.typeKey)).map((v) => ({ id: v, label: fr.trackerScreen.viewNames[v] ?? v, to: `/p/${s.project}/t/${s.tracker}/${v}` }));
}

/** Bouton « ▾ » d'un segment : liste les frères (autre projet, autre tracker, autre vue) sous forme de liens. */
function SiblingMenu({ siblings }: { siblings: Siblings }) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open || choices !== null) return;
    loadChoices(siblings).then(setChoices).catch(() => setChoices([]));
  }, [open, choices, siblings]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const label = { project: fr.crumb.siblingProject, tracker: fr.crumb.siblingTracker, view: fr.crumb.siblingView }[siblings.kind];
  return (
    <span className="ath-breadcrumb__siblings" ref={root}>
      <button type="button" className="ath-breadcrumb__toggle" aria-label={label} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>▾</button>
      {open && choices !== null && (
        <ul className="ath-breadcrumb__menu" aria-label={label}>
          {choices.map((c) => (
            <li key={c.id}><Link className={`ath-link${siblings.kind === 'view' ? '' : ' ath-mono'}`} to={c.to} aria-current={c.id === siblings.current ? 'true' : undefined} onClick={() => setOpen(false)}>{c.label}</Link></li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** Fil d'Ariane persistant des pages de projet. */
export function Breadcrumb({ pathname, search }: { pathname: string; search: string }) {
  const crumbs = crumbsFor(pathname, search);
  if (crumbs.length === 0) return null;
  return (
    <nav className="ath-breadcrumb" aria-label={fr.crumb.label} key={pathname}>
      <ol className="ath-breadcrumb__list">
        {crumbs.map((c, i) => (
          <li key={`${i}-${c.label}`} className="ath-breadcrumb__item">
            {i > 0 && <span aria-hidden="true" className="ath-breadcrumb__sep">›</span>}
            {c.to ? <Link className={`ath-link${c.mono ? ' ath-mono' : ''}`} to={c.to}>{c.label}</Link>
              : <span className={c.mono ? 'ath-mono' : undefined} aria-current="page">{c.label}</span>}
            {c.siblings && <SiblingMenu siblings={c.siblings} />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
