import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api';
import { PinToggle } from '../../components/PinToggle';
import { fr } from '../../i18n';

/** Onglets d'un projet dans l'ordre fixe de la spécification ; `path` est relatif à `/p/:projet`. */
export const PROJECT_TABS = [
  { id: 'overview', path: '' },
  { id: 'trackers', path: 'trackers' },
  { id: 'planning', path: 'planification' },
  { id: 'traceability', path: 'tracabilite' },
  { id: 'documents', path: 'documents' },
  { id: 'code', path: 'code' },
  { id: 'activity', path: 'activite' },
  { id: 'members', path: 'membres' },
] as const;
export type ProjectTabId = (typeof PROJECT_TABS)[number]['id'];

/**
 * Onglets affichés : ceux dont le module est actif (`modules`, null tant que la liste n'est pas connue ou si elle échoue)
 * et dont la page existe (`implemented`). L'ordre ne dépend jamais de ce qui est affiché : un onglet absent ne décale pas les autres.
 */
export function visibleTabs(modules: readonly string[] | null, implemented: readonly ProjectTabId[]) {
  return PROJECT_TABS.filter((t) => implemented.includes(t.id) && (modules === null || modules.includes(t.id)));
}

/** Pages d'onglets disponibles ; chaque tâche du lot 1 puis des lots suivants en ajoute une. */
export const IMPLEMENTED_TABS: readonly ProjectTabId[] = ['overview', 'trackers', 'planning', 'traceability', 'code', 'activity', 'members'];

/** Redirige les anciennes adresses `/p/:projet?q=…` (liste ATQL) vers la vue Recherche. */
export function OverviewOrLegacySearch({ children }: { children: JSX.Element }) {
  const { project } = useParams();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.has('q') || params.has('o')) return <Navigate replace to={`/p/${project}/recherche${search}`} />;
  return children;
}

/** Coquille d'un projet : barre d'onglets fixes et ordonnés, puis la page de l'onglet. */
export function ProjectShell({ implemented = IMPLEMENTED_TABS }: { implemented?: readonly ProjectTabId[] }) {
  const { project } = useParams();
  const [modules, setModules] = useState<string[] | null>(null);
  useEffect(() => {
    setModules(null);
    api<{ modules: string[] }>('GET', `/v1/projects/${project}/modules`).then((r) => setModules(r.modules)).catch(() => setModules(null));
  }, [project]);
  const tabs = visibleTabs(modules, implemented);
  return (
    <>
      <nav className="ath-tabs ath-tabs--links" aria-label={fr.project.navLabel(String(project))}>
        {tabs.map((t) => (
          <NavLink key={t.id} to={t.path === '' ? `/p/${project}` : `/p/${project}/${t.path}`} end={t.path === ''} className="ath-tab">
            {fr.project.tabs[t.id]}
          </NavLink>
        ))}
      </nav>
      <PinToggle entry={{ kind: 'project', project: String(project), ref: String(project), label: String(project) }} />
      <Outlet />
    </>
  );
}
