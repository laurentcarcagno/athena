import { useParams } from 'react-router-dom';
import { PageHeader } from '@athena/ui';
import type { Session } from '../../api';
import { Dashboard } from '../../components/Dashboard';
import { fr } from '../../i18n';
import { ProjectTemplateCard } from '../../components/ProjectTemplateCard';

/**
 * Vue d'ensemble : le moteur de widgets du tableau de bord, limité au projet (T-0123). Mes tickets, échéances de la semaine,
 * trackers, mentions et indicateurs par défaut ; les autres cartes d'avancement s'ajoutent par « Organiser » (T-0155).
 */
export function OverviewTab({ session }: { session: Session }) {
  const { project } = useParams();
  return (
    <>
      <PageHeader title={fr.overview.title} />
      <Dashboard project={String(project)} />
      <ProjectTemplateCard project={String(project)} canManage={(session.user?.roles ?? []).some((r) => r === 'athena-admin' || r === 'athena-pm')} />
    </>
  );
}
