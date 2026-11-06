import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, Id, PageHeader, type SortState } from '@athena/ui';
import { api, type SearchResult, type Session, type TrackerDefinition, type TrackerOverview } from '../../api';
import { ArtifactTable } from '../../components/ArtifactTable';
import { CreateArtifact } from '../../components/CreateArtifact';
import { MiniWorkflow } from '../../components/MiniWorkflow';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';

const PAGE = 25;
export const TRACKER_VIEWS = ['tableau'] as const;

/** Écran Tracker `/p/:projet/t/:tracker/:vue` : en-tête, barre de vues, puis la vue (Tableau : les items du tracker). */
export function TrackerScreen({ session }: { session: Session }) {
  const { project, tracker, vue } = useParams();
  const navigate = useNavigate();
  const fail = useFailure();
  const [params, setParams] = useSearchParams();
  const [def, setDef] = useState<TrackerDefinition | null>(null);
  const [counts, setCounts] = useState<TrackerOverview | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [creating, setCreating] = useState(false);
  const status = params.get('s');
  const offset = Number(params.get('o') ?? '0') || 0;
  const sort = params.get('sort');
  const admin = session.user?.roles.includes('athena-admin') ?? false;

  useEffect(() => {
    setDef(null);
    api<TrackerDefinition>('GET', `/v1/projects/${project}/trackers/${tracker}`).then(setDef).catch(fail);
  }, [project, tracker, fail]);
  useEffect(() => {
    api<{ trackers: TrackerOverview[] }>('GET', `/v1/projects/${project}/overview`).then((r) => setCounts(r.trackers.find((t) => t.key === tracker) ?? null)).catch(fail);
  }, [project, tracker, fail]);

  const [field, dir] = sort ? sort.split(':') : [null, null];
  const query = `tracker = ${tracker}${status ? ` AND status = ${status}` : ''}${field ? ` ORDER BY ${field} ${dir}` : ''}`;
  useEffect(() => {
    setResult(null);
    api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent(query)}&limit=${PAGE}&offset=${offset}`).then(setResult).catch(fail);
  }, [project, query, offset, fail]);

  if (vue !== undefined && !(TRACKER_VIEWS as readonly string[]).includes(vue)) return <Navigate replace to={`/p/${project}/t/${tracker}/tableau`} />;
  const base = `/p/${project}/t/${tracker}`;
  const next = (changes: Record<string, string | null>) => {
    const copy = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v === null ? copy.delete(k) : copy.set(k, v));
    setParams(copy);
  };
  const sortOf = (f: string): SortState => (field === f ? (dir as 'asc' | 'desc') : null);
  const sortBy = (f: string) => (state: SortState) => next({ sort: state ? `${f}:${state}` : null, o: null });
  const states = counts?.statuses ?? def?.statuses.map((s) => ({ key: s.key, name: s.name, category: s.category, count: 0 })) ?? [];

  return (
    <>
      <PageHeader eyebrow={fr.trackerScreen.eyebrow} title={def?.name ?? String(tracker)}
        sub={<><Id>{project}-{tracker}</Id>{counts && <> · <span className="ath-mono">{fr.trackerScreen.total(counts.artifacts)}</span></>}</>}
        actions={<>
          <Btn onClick={() => setCreating(true)}>{fr.trackerScreen.newItem}</Btn>
          {admin && <Btn variant="ghost" onClick={() => navigate(`/p/${project}/trackers/${tracker}/config`)}>{fr.trackerScreen.configure}</Btn>}
        </>} />
      <CreateArtifact project={String(project)} trackers={[String(tracker)]} open={creating} onClose={() => setCreating(false)}
        onCreated={(key) => { setCreating(false); navigate(`/p/${project}/a/${key}`); }} />
      <MiniWorkflow states={states} active={status} onPick={(key) => next({ s: key, o: null })} />
      <nav className="ath-tabs ath-tabs--links" aria-label={fr.trackerScreen.views}>
        {TRACKER_VIEWS.map((v) => (
          <Link key={v} to={`${base}/${v}`} className="ath-tab" aria-current={v === (vue ?? 'tableau') ? 'page' : undefined}>{fr.trackerScreen.viewNames[v]}</Link>
        ))}
      </nav>
      {result === null ? <p role="status">{fr.loading}</p> : result.hits.length === 0 ? (
        <EmptyState eyebrow={fr.trackerScreen.eyebrow} title={fr.trackerScreen.empty} action={status ? <Btn variant="ghost" onClick={() => next({ s: null, o: null })}>{fr.list.reset}</Btn> : undefined} />
      ) : (
        <ArtifactTable project={String(project)} result={result} offset={offset} pageSize={PAGE} sortOf={sortOf} sortBy={sortBy} onPage={(o) => next({ o: String(o) })} />
      )}
    </>
  );
}
