import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, Id, PageHeader, type SortState } from '@athena/ui';
import { ApiError, api, type SavedFilter, type SearchResult, type Session, type TrackerDefinition, type TrackerOverview } from '../../api';
import { ArtifactTable } from '../../components/ArtifactTable';
import { CreateArtifact } from '../../components/CreateArtifact';
import { FilterBar } from '../../components/FilterBar';
import { SavedViews, fromStored } from '../../components/SavedViews';
import { MiniWorkflow } from '../../components/MiniWorkflow';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';
import { emptyModel, fromAtql, toAtql } from '../../lib/filter-query';

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
  const fragment = params.get('f') ?? '';
  const username = session.user?.username ?? '';
  const [queryError, setQueryError] = useState<string | null>(null);
  const appliedDefault = useRef<string | null>(null);
  const currentParams = useRef(params);
  currentParams.current = params;
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
  const status = fromAtql(fragment, username)?.status ?? null;
  const query = `tracker = ${tracker}${fragment ? ` AND (${fragment})` : ''}${field ? ` ORDER BY ${field} ${dir}` : ''}`;
  useEffect(() => {
    setResult(null);
    setQueryError(null);
    api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent(query)}&limit=${PAGE}&offset=${offset}`).then(setResult)
      .catch((e: unknown) => { if (e instanceof ApiError && e.status === 422) { setQueryError(e.readable); setResult({ total: 0, hits: [] } as SearchResult); } else fail(e); });
  }, [project, query, offset, fail]);
  // À la première visite sans filtre ni tri dans l'adresse, la vue par défaut du tracker s'applique.
  const onViews = useCallback((views: SavedFilter[]) => {
    const initial = currentParams.current;
    if (appliedDefault.current === String(tracker)) return;
    appliedDefault.current = String(tracker);
    const def = views.find((v) => v.isDefault);
    if (def && !initial.has('f') && !initial.has('sort')) { const v = fromStored(def.query); setParams(new URLSearchParams([...(v.fragment ? [['f', v.fragment]] : []), ...(v.sort ? [['sort', v.sort]] : [])]), { replace: true }); }
  }, [tracker, setParams]);

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
      <MiniWorkflow states={states} active={status} onPick={(key) => next({ f: toAtql({ ...(fromAtql(fragment, username) ?? emptyModel()), status: key ?? undefined }, username) || null, o: null })} />
      <FilterBar def={def} fragment={fragment} username={username} error={queryError} onChange={(f) => next({ f: f || null, o: null })} />
      <SavedViews project={String(project)} tracker={String(tracker)} current={{ fragment, sort }} roles={session.user?.roles ?? []} onLoaded={onViews}
        onApply={(v) => setParams(new URLSearchParams([...(v.fragment ? [['f', v.fragment]] : []), ...(v.sort ? [['sort', v.sort]] : [])]))} />
      <nav className="ath-tabs ath-tabs--links" aria-label={fr.trackerScreen.views}>
        {TRACKER_VIEWS.map((v) => (
          <Link key={v} to={`${base}/${v}`} className="ath-tab" aria-current={v === (vue ?? 'tableau') ? 'page' : undefined}>{fr.trackerScreen.viewNames[v]}</Link>
        ))}
      </nav>
      {result === null ? <p role="status">{fr.loading}</p> : result.hits.length === 0 ? (
        <EmptyState eyebrow={fr.trackerScreen.eyebrow} title={fr.trackerScreen.empty} action={fragment ? <Btn variant="ghost" onClick={() => next({ f: null, o: null })}>{fr.list.reset}</Btn> : undefined} />
      ) : (
        <ArtifactTable project={String(project)} result={result} offset={offset} pageSize={PAGE} sortOf={sortOf} sortBy={sortBy} onPage={(o) => next({ o: String(o) })} />
      )}
    </>
  );
}
