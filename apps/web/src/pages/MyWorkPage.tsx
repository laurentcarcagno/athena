import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, StatusPill, Table, Td, Th, useToast } from '@athena/ui';
import { api, type Hit, type SearchResult, type Session } from '../api';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';
import { Dashboard } from '../components/Dashboard';
import { pillKind } from './ListPage';
import { fromHere } from '../lib/origin';
import { statusPill } from '../lib/status';

interface Item { project: string; hit: Hit }

const titleOf = (hit: Hit) => String(hit.values['title'] ?? hit.values['name'] ?? '');

/** Fenêtre de l'utilisateur : ses artefacts à traiter et ceux qu'il peut prendre. */
export function MyWorkPage({ session }: { session: Session }) {
  const toast = useToast();
  const fail = useFailure();
  const location = useLocation();
  const { busy, guard } = useBusy();
  const me = session.user!.id ?? session.user!.username; // le champ Responsable porte l'identifiant du compte (sub), pas son nom
  const [free, setFree] = useState<Item[] | null>(null);

  const load = useCallback(async () => {
    const projects = await api<Array<{ key: string }>>('GET', '/v1/projects');
    const search = (project: string, q: string) => api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent(q)}&limit=50`).catch(() => ({ total: 0, hits: [] as Hit[] }));
    const lists = await Promise.all(projects.map(async (p) => (await search(p.key, 'assignee IS EMPTY')).hits.filter((h) => h.category === 'todo').map((hit) => ({ project: p.key, hit }))));
    setFree(lists.flat());
  }, []);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  const take = (item: Item) => guard(() => takeRun(item));
  const takeRun = async ({ project, hit }: Item) => {
    try {
      await api('PATCH', `/v1/projects/${project}/artifacts/${hit.key}`, { values: { assignee: me }, version: hit.version });
      toast('success', fr.work.taken(hit.key));
      await load();
    } catch (error) { fail(error); }
  };

  const rows = (items: Item[], action?: (i: Item) => void) => (
    <Table>
      <thead><tr><Th>{fr.work.project}</Th><Th>{fr.list.key}</Th><Th>{fr.list.title}</Th><Th>{fr.list.status}</Th>{action && <Th>{fr.work.take}</Th>}</tr></thead>
      <tbody>{items.map((i) => (
        <tr key={`${i.project}-${i.hit.key}`}>
          <Td mono>{i.project}</Td>
          {/* Précédent et suivant parcourent les tickets du même projet de cette liste (la fiche est une adresse de projet). */}
          <Td><Link className="ath-link ath-mono" to={`/p/${i.project}/a/${i.hit.key}`} state={fromHere(location, fr.origin.myWork, items.filter((x) => x.project === i.project).map((x) => x.hit.key))}>{i.hit.key}</Link></Td>
          <Td><span className="ath-clip" title={titleOf(i.hit)}>{titleOf(i.hit)}</span></Td>
          <Td><StatusPill {...statusPill(i.hit.category, i.hit.statusColor)}>{i.hit.statusName ?? i.hit.status}</StatusPill></Td>
          {action && <Td><Btn icon="check" size="sm" variant="ghost" loading={busy} onClick={() => action(i)}>{fr.work.take}</Btn></Td>}
        </tr>
      ))}</tbody>
    </Table>
  );

  return (
    <>
      <PageHeader eyebrow={fr.work.eyebrow} title={fr.work.title} />
      <div className="ath-stack">
        <Dashboard qa={(session.user?.roles ?? []).includes('athena-qa')} />
        <h2 className="ath-section-title">{fr.work.available}</h2>
        {free === null ? <p role="status">{fr.loading}</p> : free.length === 0 ? <EmptyState eyebrow={fr.work.available} title={fr.work.none} /> : rows(free, take)}
      </div>
    </>
  );
}
