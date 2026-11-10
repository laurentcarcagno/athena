import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { TabLinks } from '@athena/ui';
import { api, type Session } from '../api';
import { fr } from '../i18n';
import { visibleReports, type ReportId } from '../lib/navigation';
import { ActivityTab } from './project/ActivityTab';
import { CodeTab } from './project/CodeTab';
import { ConformityTab } from './project/ConformityTab';
import { TraceabilityTab } from './project/TraceabilityTab';
import { DashboardPage } from './DashboardPage';

/**
 * Rapports du projet `/p/:p/rapports/:r` (ADR-0003, T-0121) : Avancement, Traçabilité, Conformité, Livraison, Activité.
 * Un rapport dont le module est inactif n'est ni listé ni accessible ; `/rapports` mène au premier rapport affiché.
 */
export function ReportsPage({ session }: { session: Session }) {
  const { project = '', report } = useParams();
  const [modules, setModules] = useState<string[] | null | undefined>(undefined);
  useEffect(() => {
    setModules(undefined);
    api<{ modules: string[] }>('GET', `/v1/projects/${project}/modules`).then((r) => setModules(Array.isArray(r.modules) ? r.modules : null)).catch(() => setModules(null));
  }, [project]);
  if (modules === undefined) return <p role="status">{fr.loading}</p>;
  const reports = visibleReports(modules);
  const current = reports.find((r) => r.id === report);
  if (!current) return <Navigate replace to={`/p/${project}/rapports/${reports[0]!.id}`} />;
  const bodies: Record<ReportId, () => JSX.Element> = {
    avancement: () => <DashboardPage />,
    tracabilite: () => <TraceabilityTab session={session} />,
    conformite: () => <ConformityTab session={session} />,
    livraison: () => <CodeTab />,
    activite: () => <ActivityTab />,
  };
  return (
    <>
      <TabLinks label={fr.reports.nav} items={reports.map((r) => ({ id: r.id, label: fr.reports.names[r.id], current: r.id === current.id }))}
        link={(item, props) => <Link to={`/p/${project}/rapports/${item.id}`} {...props} />} />
      {bodies[current.id]()}
    </>
  );
}
