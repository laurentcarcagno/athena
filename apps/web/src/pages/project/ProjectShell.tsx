import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { Id, PageContextProvider } from '@athena/ui';
import { api } from '../../api';
import { fr } from '../../i18n';
import { SectionPicker } from '../../components/MobileNav';
import { PinToggle } from '../../components/PinToggle';

/** Redirige les anciennes adresses `/p/:projet?q=…` (liste ATQL) vers la vue Recherche. */
export function OverviewOrLegacySearch({ children }: { children: JSX.Element }) {
  const { project } = useParams();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.has('q') || params.has('o')) return <Navigate replace to={`/p/${project}/recherche${search}`} />;
  return children;
}

/**
 * Parent de toutes les routes `/p/:projet/*` (ADR-0003). La navigation du projet est dans le rail, qui lit les sections de
 * `lib/navigation.ts` ; ce cadre accueillera le sélecteur de section mobile (T-0110) et la cible de création (T-0111).
 */
/** Coquille du projet : sélecteur de section (mobile) et projet courant rappelé au-dessus du titre de chaque page (T-0134). */
export function ProjectLayout() {
  const { project = '' } = useParams();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setName(null);
    api<Array<{ key: string; name: string }>>('GET', '/v1/projects')
      .then((list) => { if (alive) setName(Array.isArray(list) ? list.find((p) => p.key === project)?.name ?? null : null); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [project]);
  return (
    <PageContextProvider context={<>{fr.projectContext}{' '}<Id>{project}</Id>{name ? ` · ${name}` : ''}</>}>
      <SectionPicker />
      <Outlet />
    </PageContextProvider>
  );
}

/** Cadre des pages de section (Vue d'ensemble, Trackers…) : l'étoile qui épingle le projet rejoint les actions de l'en-tête de page. */
export function ProjectSectionFrame() {
  const { project } = useParams();
  return (
    <PageContextProvider actions={<PinToggle entry={{ kind: 'project', project: String(project), ref: String(project), label: String(project) }} />}>
      <Outlet />
    </PageContextProvider>
  );
}
