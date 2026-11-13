import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PageHeader, TabLinks } from '@athena/ui';
import { api, type Session } from '../api';
import { fr } from '../i18n';
import { REPORTS, visibleReports, type ReportId } from '../lib/navigation';
import { AccessNotice } from '../components/AccessNotice';
import { ActivityTab } from './project/ActivityTab';
import { CodeTab } from './project/CodeTab';
import { ConformityTab } from './project/ConformityTab';
import { TraceabilityTab } from './project/TraceabilityTab';
import { DashboardPage } from './DashboardPage';
import { RisksTab } from './project/RisksTab';

/**
 * Rapports du projet `/p/:p/rapports/:r` (ADR-0003, T-0121) : Avancement, Traçabilité, Conformité, Livraison, Activité.
 * Un rapport dont le module est inactif n'est ni listé ni accessible ; `/rapports` mène au premier rapport affiché.
 */
export function ReportsPage({ session }: { session: Session }) {
  const { project = '', report } = useParams();
  const [modules, setModules] = useState<string[] | null | undefined>(undefined);
  const [hasRisks, setHasRisks] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    setModules(undefined);
    setHasRisks(undefined);
    api<Array<{ typeKey?: string | null }>>('GET', `/v1/projects/${project}/trackers`).then((r) => setHasRisks(Array.isArray(r) && r.some((x) => x.typeKey === 'risk'))).catch(() => setHasRisks(false));
    api<{ modules: string[] }>('GET', `/v1/projects/${project}/modules`).then((r) => setModules(Array.isArray(r.modules) ? r.modules : null)).catch(() => setModules(null));
  }, [project]);
  if (modules === undefined || hasRisks === undefined) return <p role="status">{fr.loading}</p>;
  const reports = visibleReports(modules, hasRisks);
  const current = reports.find((r) => r.id === report);
  // Rapport connu mais dont le module est inactif : message, pas de bascule silencieuse vers un autre rapport (T-0144).
  if (!current && REPORTS.some((r) => r.id === report)) return <><PageHeader title={fr.reports.names[report!]!} /><AccessNotice title={fr.denied.reportOff(fr.reports.names[report!]!)} help={fr.denied.reportOffHelp} back={{ to: `/p/${project}/rapports/${reports[0]!.id}`, label: fr.denied.backReports }} /></>;
  if (!current) return <Navigate replace to={`/p/${project}/rapports/${reports[0]!.id}`} />;
  // Les onglets se placent sous l'en-tête du rapport ouvert (ADR-0005, T-0143) : avant lui, l'en-tête collant les masquait.
  const tabs = <TabLinks label={fr.reports.nav} items={reports.map((r) => ({ id: r.id, label: fr.reports.names[r.id], current: r.id === current.id }))}
    link={(item, props) => <Link to={`/p/${project}/rapports/${item.id}`} {...props} />} />;
  const bodies: Record<ReportId, () => JSX.Element> = {
    avancement: () => <DashboardPage tabs={tabs} title={fr.reports.names.avancement} />,
    tracabilite: () => <TraceabilityTab session={session} tabs={tabs} />,
    conformite: () => <ConformityTab session={session} tabs={tabs} />,
    livraison: () => <CodeTab tabs={tabs} />,
    activite: () => <ActivityTab tabs={tabs} />,
    risques: () => <RisksTab tabs={tabs} />,
  };
  return bodies[current.id]();
}
