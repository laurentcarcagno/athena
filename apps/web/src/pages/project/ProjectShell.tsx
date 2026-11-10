import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
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
export function ProjectLayout() {
  return (
    <>
      <SectionPicker />
      <Outlet />
    </>
  );
}

/** Cadre des pages de section (Vue d'ensemble, Trackers, Planification…) : l'étoile qui épingle le projet, puis la page. */
export function ProjectSectionFrame() {
  const { project } = useParams();
  return (
    <>
      <PinToggle entry={{ kind: 'project', project: String(project), ref: String(project), label: String(project) }} />
      <Outlet />
    </>
  );
}
