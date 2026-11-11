import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Card, EmptyState, PageHeader, Table, Td, Th } from '@athena/ui';
import { api } from '../../api';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';

interface Repo { path: string; defaultBranch: string }
interface Dora { windowDays: number; deployments: number; deploymentFrequency: number; leadTimeHours: number | null; changeFailureRate: number | null; mttrHours: number | null }

const num = (value: number | null, digits = 1) => (value === null ? fr.codeTab.none : value.toFixed(digits));

/** Onglet Code et intégration : dépôts liés au projet et indicateurs de livraison (DORA). */
export function CodeTab({ tabs }: { tabs?: ReactNode } = {}) {
  const { project } = useParams();
  const fail = useFailure();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [dora, setDora] = useState<Dora | null>(null);
  useEffect(() => {
    api<Repo[]>('GET', `/v1/projects/${project}/code-repos`).then((r) => setRepos(Array.isArray(r) ? r : [])).catch(fail);
    api<Dora>('GET', `/v1/projects/${project}/dora?days=30`).then(setDora).catch(() => setDora(null));
  }, [project, fail]);
  return (
    <>
      <PageHeader title={fr.codeTab.title} />
      {tabs}
      <div className="ath-stack">
        {repos === null ? <p role="status">{fr.loading}</p> : repos.length === 0 ? <EmptyState eyebrow={fr.codeTab.repos} title={fr.codeTab.noRepos} /> : (
          <Table>
            <thead><tr><Th>{fr.codeTab.path}</Th><Th>{fr.codeTab.branch}</Th></tr></thead>
            <tbody>{repos.map((r) => <tr key={r.path}><Td mono>{r.path}</Td><Td mono>{r.defaultBranch}</Td></tr>)}</tbody>
          </Table>
        )}
        {dora && (
          <Card title={fr.codeTab.delivery}>
            <Table>
              <thead><tr><Th>{fr.codeTab.metric}</Th><Th>{fr.codeTab.value}</Th></tr></thead>
              <tbody>
                <tr><Td>{fr.codeTab.deployments}</Td><Td mono>{dora.deployments}</Td></tr>
                <tr><Td>{fr.codeTab.frequency}</Td><Td mono>{num(dora.deploymentFrequency, 2)}</Td></tr>
                <tr><Td>{fr.codeTab.leadTime}</Td><Td mono>{num(dora.leadTimeHours)}</Td></tr>
                <tr><Td>{fr.codeTab.failureRate}</Td><Td mono>{dora.changeFailureRate === null ? fr.codeTab.none : `${Math.round(dora.changeFailureRate * 100)} %`}</Td></tr>
                <tr><Td>{fr.codeTab.mttr}</Td><Td mono>{num(dora.mttrHours)}</Td></tr>
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
