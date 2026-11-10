import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, TabLinks, Table, Td, Th } from '@athena/ui';
import { api, type Session } from '../api';
import { ApprovalsPanel } from '../components/ApprovalsPanel';
import { BaselineCompare } from '../components/BaselineCompare';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { visibleSettings, type SettingsId } from '../lib/navigation';
import { MembersPanel } from './project/MembersTab';
import { BoardsTab } from './ProjectManagePage';
import { AutomationsTab, BaselineCreate } from './SettingsPanels';
import { TrackerConfigPage } from './TrackerConfigPage';

/** Paramètres › Trackers : liste des trackers, chacun mène à sa configuration ; création d'un tracker. */
function TrackersSettings({ project }: { project: string }) {
  const fail = useFailure();
  const [trackers, setTrackers] = useState<Array<{ key: string; name: string }> | null>(null);
  useEffect(() => { api<Array<{ key: string; name: string }>>('GET', `/v1/projects/${project}/trackers`).then(setTrackers).catch((e) => { setTrackers([]); fail(e); }); }, [project, fail]);
  if (trackers === null) return <p role="status">{fr.loading}</p>;
  return (
    <div className="ath-stack">
      {trackers.length === 0 ? <EmptyState eyebrow={fr.settings.sections['trackers']!} title={fr.settings.noTracker} /> : (
        <Table>
          <thead><tr><Th>{fr.list.key}</Th><Th>{fr.config.name}</Th><Th>{fr.settings.title}</Th></tr></thead>
          <tbody>
            {trackers.map((t) => (
              <tr key={t.key}><Td mono>{t.key}</Td><Td>{t.name}</Td><Td><Link className="ath-link" to={`/p/${project}/parametres/trackers/${t.key}`}>{fr.settings.configure(t.name)}</Link></Td></tr>
            ))}
          </tbody>
        </Table>
      )}
      <div><Link className="ath-btn ath-btn--ghost" to={`/p/${project}/trackers/new`}>{fr.settings.newTracker}</Link></div>
    </div>
  );
}

/**
 * Paramètres du projet `/p/:p/parametres/:s` (ADR-0003, T-0120) : Membres, Trackers, Boards, Automatisations, Baselines,
 * Approbations. Chaque section n'apparaît qu'aux rôles qui y ont accès ; `/parametres` mène à la première autorisée.
 * Aucun objet global ici : webhooks et plugins sont réglés dans l'Administration de l'organisation.
 */
export function SettingsPage({ session }: { session: Session }) {
  const { project = '', section, tracker } = useParams();
  const roles = session.user?.roles ?? [];
  const sections = visibleSettings(roles);
  const header = (sub?: string) => <PageHeader title={sub ? `${fr.settings.title} · ${sub}` : fr.settings.title} />;
  if (sections.length === 0) return <>{header()}<p className="ath-field__error">{fr.settings.restricted}</p></>;
  const current = sections.find((s) => s.id === section);
  if (!current) return <Navigate replace to={`/p/${project}/parametres/${sections[0]!.id}`} />;
  if (current.id === 'trackers' && tracker) return <TrackerConfigPage session={session} />;
  const manager = roles.includes('athena-admin') || roles.includes('athena-pm');
  const panels: Record<SettingsId, () => JSX.Element> = {
    membres: () => <MembersPanel project={project} me={session.user?.username} />,
    trackers: () => <TrackersSettings project={project} />,
    boards: () => <BoardsTab project={project} />,
    automatisations: () => <AutomationsTab project={project} />,
    baselines: () => <div className="ath-stack">{roles.includes('athena-admin') && <BaselineCreate project={project} />}<BaselineCompare project={project} /></div>,
    approbations: () => <>{!manager && <p className="ath-eyebrow">{fr.approvals.qaOnly}</p>}<ApprovalsPanel project={project} canRequire={manager} canDecide={roles.includes('athena-qa')} /></>,
  };
  return (
    <>
      {header(fr.settings.sections[current.id])}
      <TabLinks label={fr.settings.nav} items={sections.map((s) => ({ id: s.id, label: fr.settings.sections[s.id], current: s.id === current.id }))}
        link={(item, props) => <Link to={`/p/${project}/parametres/${item.id}`} {...props} />} />
      <div className="ath-stack">{panels[current.id]()}</div>
    </>
  );
}
