import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, Id, PageHeader, type SortState } from '@athena/ui';
import { ApiError, api, type SavedFilter, type SearchResult, type Session, type TrackerDefinition, type TrackerOverview, type TrackerTypeEntry } from '../../api';
import { ArtifactTable } from '../../components/ArtifactTable';
import { CreateArtifact } from '../../components/CreateArtifact';
import { DetailPanel } from '../../components/DetailPanel';
import { FilterBar } from '../../components/FilterBar';
import { SavedViews, fromStored } from '../../components/SavedViews';
import { MiniWorkflow } from '../../components/MiniWorkflow';
import { PinToggle } from '../../components/PinToggle';
import { useFailure } from '../../hooks';
import { BoardView } from '../BoardPage';
import { fr } from '../../i18n';
import { emptyModel, fromAtql, toAtql } from '../../lib/filter-query';

const PAGE = 25;
export const TRACKER_VIEWS = ['tableau', 'board'] as const;
export type TrackerViewId = (typeof TRACKER_VIEWS)[number];

/**
 * Vues proposées pour un tracker : celles de son type (`defaultViews`) que l'application sait afficher, le Tableau toujours en premier.
 * Un tracker sans type propose toutes les vues disponibles (il avait un board avant l'introduction des types).
 */
export function viewsFor(type: Pick<TrackerTypeEntry, 'defaultViews'> | undefined): TrackerViewId[] {
  if (!type) return [...TRACKER_VIEWS];
  return TRACKER_VIEWS.filter((v) => v === 'tableau' || type.defaultViews.includes(v));
}

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
  const [types, setTypes] = useState<TrackerTypeEntry[]>([]);
  const fragment = params.get('f') ?? '';
  const item = params.get('i');
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

  useEffect(() => { api<TrackerTypeEntry[]>('GET', '/v1/tracker-types').then((t) => setTypes(Array.isArray(t) ? t : [])).catch(() => setTypes([])); }, []);

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
  const [knownViews, setKnownViews] = useState<SavedFilter[]>([]);
  const wantedView = params.get('v');
  // ?v=<id> (rail, favori) : applique la vue enregistrée désignée, puis retire le paramètre.
  useEffect(() => {
    const chosen = wantedView ? knownViews.find((v) => v.id === wantedView) : undefined;
    if (!chosen) return;
    const v = fromStored(chosen.query);
    setParams(new URLSearchParams([...(v.fragment ? [['f', v.fragment]] : []), ...(v.sort ? [['sort', v.sort]] : [])]), { replace: true });
  }, [wantedView, knownViews, setParams]);
  const onViews = useCallback((views: SavedFilter[]) => {
    setKnownViews(views);
    const initial = currentParams.current;
    if (appliedDefault.current === String(tracker)) return;
    appliedDefault.current = String(tracker);
    const def = views.find((v) => v.isDefault);
    if (def && !initial.has('f') && !initial.has('sort') && !initial.has('v')) { const v = fromStored(def.query); setParams(new URLSearchParams([...(v.fragment ? [['f', v.fragment]] : []), ...(v.sort ? [['sort', v.sort]] : [])]), { replace: true }); }
  }, [tracker, setParams]);

  const rows = result?.hits ?? [];
  const withItem = (key: string | null) => { const copy = new URLSearchParams(params); if (key) copy.set('i', key); else copy.delete('i'); return copy; };
  const closePanel = () => {
    const was = item;
    setParams(withItem(null));
    if (was) setTimeout(() => document.getElementById(`row-${was}`)?.focus(), 0);
  };
  // J / K : item suivant / précédent ; Échap : ferme le panneau. Ignorés dans un champ de saisie ou avec un modificateur.
  useEffect(() => {
    if (vue === 'board') return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === 'Escape' && item) { event.preventDefault(); closePanel(); return; }
      const step = event.key === 'j' || event.key === 'J' ? 1 : event.key === 'k' || event.key === 'K' ? -1 : 0;
      if (step === 0 || rows.length === 0) return;
      const index = item ? rows.findIndex((h) => h.key === item) : -1;
      const nextIndex = index < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step));
      event.preventDefault();
      setParams(withItem(rows[nextIndex]!.key), { replace: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const views = viewsFor(def?.typeKey ? types.find((t) => t.key === def.typeKey) : undefined);
  const known = (TRACKER_VIEWS as readonly string[]).includes(vue ?? 'tableau');
  if (vue !== undefined && (!known || (def && types.length > 0 && !views.includes(vue as TrackerViewId)))) return <Navigate replace to={`/p/${project}/t/${tracker}/tableau`} />;
  const current = (vue ?? 'tableau') as TrackerViewId;
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
          <PinToggle entry={{ kind: 'tracker', project: String(project), ref: String(tracker), label: `${project} · ${tracker}` }} />
          {admin && <Btn variant="ghost" onClick={() => navigate(`/p/${project}/trackers/${tracker}/config`)}>{fr.trackerScreen.configure}</Btn>}
        </>} />
      <CreateArtifact project={String(project)} trackers={[String(tracker)]} open={creating} onClose={() => setCreating(false)}
        onCreated={(key) => { setCreating(false); navigate(`/p/${project}/a/${key}`); }} />
      {current === 'tableau' && <MiniWorkflow states={states} active={status} onPick={(key) => next({ f: toAtql({ ...(fromAtql(fragment, username) ?? emptyModel()), status: key ?? undefined }, username) || null, o: null })} />}
      {current === 'tableau' && <FilterBar def={def} fragment={fragment} username={username} error={queryError} onChange={(f) => next({ f: f || null, o: null })} />}
      {current === 'tableau' && <SavedViews project={String(project)} tracker={String(tracker)} current={{ fragment, sort }} roles={session.user?.roles ?? []} onLoaded={onViews}
        onApply={(v) => setParams(new URLSearchParams([...(v.fragment ? [['f', v.fragment]] : []), ...(v.sort ? [['sort', v.sort]] : [])]))} />}
      <nav className="ath-tabs ath-tabs--links" aria-label={fr.trackerScreen.views}>
        {views.map((v) => (
          <Link key={v} to={`${base}/${v}`} className="ath-tab" aria-current={v === current ? 'page' : undefined}>{fr.trackerScreen.viewNames[v]}</Link>
        ))}
      </nav>
      {current === 'board' ? <BoardView project={String(project)} board={`~${tracker}`} header={false} /> : result === null ? <p role="status">{fr.loading}</p> : result.hits.length === 0 ? (
        <EmptyState eyebrow={fr.trackerScreen.eyebrow} title={fr.trackerScreen.empty} action={fragment ? <Btn variant="ghost" onClick={() => next({ f: null, o: null })}>{fr.list.reset}</Btn> : undefined} />
      ) : (
        <div className={item ? 'ath-split' : undefined}>
          <div>
            <ArtifactTable project={String(project)} result={result} offset={offset} pageSize={PAGE} sortOf={sortOf} sortBy={sortBy} onPage={(o) => next({ o: String(o), i: null })}
              selected={item} linkFor={(key) => `${base}/tableau?${withItem(key).toString()}`} />
          </div>
          {item && <DetailPanel session={session} project={String(project)} itemKey={item} onClose={closePanel}
            onExpand={() => navigate(`/p/${project}/a/${item}`)} onCanonicalKey={(key) => setParams(withItem(key), { replace: true })} />}
        </div>
      )}
    </>
  );
}
