import { useParams } from 'react-router-dom';
import { PageHeader } from '@athena/ui';
import type { Session } from '../../api';
import { Dashboard } from '../../components/Dashboard';
import { fr } from '../../i18n';
import { ProjectTemplateCard } from '../../components/ProjectTemplateCard';
import { DashboardPage } from '../DashboardPage';

/**
 * Vue d'ensemble : le moteur de widgets du tableau de bord, limité au projet (T-0123). Mes tickets, échéances de la semaine,
 * trackers et mentions par défaut ; chaque widget renvoie à la liste qui le détaille. L'avancement détaillé suit.
 */
export function OverviewTab({ session }: { session: Session }) {
  const { project } = useParams();
  return (
    <>
      <PageHeader title={fr.overview.title} />
      <Dashboard project={String(project)} />
      <ProjectTemplateCard project={String(project)} canManage={(session.user?.roles ?? []).some((r) => r === 'athena-admin' || r === 'athena-pm')} />
      <DashboardPage embedded />
    </>
  );
}
