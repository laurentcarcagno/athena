import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, Id, PageHeader, type SortState } from '@athena/ui';
import { ApiError, api, type SavedFilter, type SearchResult, type Session, type TrackerDefinition, type TrackerOverview, type TrackerTypeEntry } from '../../api';
import { ArtifactTable, columnFor, type TableColumn } from '../../components/ArtifactTable';
import { ColumnPicker } from '../../components/ColumnPicker';
import { useCreate, useOnCreated } from '../../components/CreateArtifact';
import { DetailPanel } from '../../components/DetailPanel';
import { FilterBar } from '../../components/FilterBar';
import { SavedViews, viewOf, viewToParams } from '../../components/SavedViews';
import { MiniWorkflow } from '../../components/MiniWorkflow';
import { PinToggle } from '../../components/PinToggle';
import { SubscribeToggle } from '../../components/SubscribeToggle';
import { MatrixView } from '../../components/MatrixView';
import { TreeView } from '../../components/TreeView';
import { useFailure } from '../../hooks';
import { BoardView } from '../BoardPage';
import { fr } from '../../i18n';
import { columnOptions, columnsParam, selectedColumns } from '../../lib/columns';
import { emptyModel, fromAtql, toAtql } from '../../lib/filter-query';
import { TRACKER_VIEWS, viewsFor, type TrackerViewId } from '../../lib/tracker-views';

export { TRACKER_VIEWS, viewsFor, type TrackerViewId };

const PAGE = 25;

/** Écran Tracker `/p/:projet/t/:tracker/:vue` : en-tête, barre de vues, puis la vue (Tableau : les items du tracker). */
export function TrackerScreen({ session }: { session: Session }) {
  const { project, tracker, vue } = useParams();
  const navigate = useNavigate();
  const fail = useFailure();
  const [params, setParams] = useSearchParams();
  const [def, setDef] = useState<TrackerDefinition | null>(null);
  const [counts, setCounts] = useState<TrackerOverview | null>(null);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const create = useCreate();
  const [refresh, setRefresh] = useState(0);
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
  const cols = params.get('cols');
  const admin = session.user?.roles.includes('athena-admin') ?? false;

  useEffect(() => {
    setDef(null);
    api<TrackerDefinition>('GET', `/v1/projects/${project}/trackers/${tracker}`).then(setDef).catch(fail);
  }, [project, tracker, fail]);
  useEffect(() => {
    api<{ trackers: TrackerOverview[] }>('GET', `/v1/projects/${project}/overview`).then((r) => { setCounts(r.trackers.find((t) => t.key === tracker) ?? null); setSiblings(r.trackers.map((t) => t.key)); }).catch(fail);
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
  }, [project, query, offset, fail, refresh]);
  // À la première visite sans filtre ni tri dans l'adresse, la vue par défaut du tracker s'applique.
  const [knownViews, setKnownViews] = useState<SavedFilter[]>([]);
  const wantedView = params.get('v');
  // ?v=<id> (rail, favori) : applique la vue enregistrée désignée, puis retire le paramètre.
  useEffect(() => {
    const chosen = wantedView ? knownViews.find((v) => v.id === wantedView) : undefined;
    if (!chosen) return;
    setParams(viewToParams(viewOf(chosen)), { replace: true });
  }, [wantedView, knownViews, setParams]);
  const onViews = useCallback((views: SavedFilter[]) => {
    setKnownViews(views);
    const initial = currentParams.current;
    if (appliedDefault.current === String(tracker)) return;
    appliedDefault.current = String(tracker);
    const def = views.find((v) => v.isDefault);
    if (def && !initial.has('f') && !initial.has('sort') && !initial.has('cols') && !initial.has('v')) setParams(viewToParams(viewOf(def)), { replace: true });
  }, [tracker, setParams]);

  const rows = result?.hits ?? [];
  const withItem = (key: string | null) => { const copy = new URLSearchParams(params); if (key) copy.set('i', key); else copy.delete('i'); return copy; };
  // Ticket créé depuis cette page (bouton du tracker, « Créer », N) : on reste ici, la liste se recharge et, s'il est de ce
  // tracker, il s'ouvre dans le panneau (Tableau, Arbre).
  useOnCreated((created) => {
    setRefresh((n) => n + 1);
    if (created.project === project && created.tracker === tracker && vue !== 'board' && vue !== 'matrice') setParams(withItem(created.key));
  });
  const closePanel = () => {
    const was = item;
    setParams(withItem(null));
    if (was) setTimeout(() => document.getElementById(`row-${was}`)?.focus(), 0);
  };
  // J / K : item suivant / précédent ; Échap : ferme le panneau. Ignorés dans un champ de saisie ou avec un modificateur.
  // Le gestionnaire est enregistré une fois et lit l'état du dernier rendu : un raccourci tapé juste après un rendu n'est jamais perdu.
  const latest = useRef({ item, rows, closePanel, select: (key: string) => setParams(withItem(key), { replace: true }) });
  latest.current = { item, rows, closePanel, select: (key: string) => setParams(withItem(key), { replace: true }) };
  useEffect(() => {
    if (vue === 'board' || vue === 'arbre' || vue === 'matrice') return undefined;
    const onKey = (event: KeyboardEvent) => {
      const { item: open, rows: list, closePanel: close, select } = latest.current;
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === 'Escape' && open) { event.preventDefault(); close(); return; }
      const step = event.key === 'j' || event.key === 'J' ? 1 : event.key === 'k' || event.key === 'K' ? -1 : 0;
      if (step === 0 || list.length === 0) return;
      const index = open ? list.findIndex((h) => h.key === open) : -1;
      const nextIndex = index < 0 ? (step > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, index + step));
      event.preventDefault();
      select(list[nextIndex]!.key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [vue]);

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
  const chosenColumns = selectedColumns(cols, def);
  const tableColumns = chosenColumns.map((id) => columnFor(id, def)).filter((c): c is TableColumn => c !== null);
  const states = counts?.statuses ?? def?.statuses.map((s) => ({ key: s.key, name: s.name, category: s.category, count: 0 })) ?? [];

  return (
    <>
      <PageHeader eyebrow={fr.trackerScreen.eyebrow} title={def?.name ?? String(tracker)}
        sub={<><Id>{project}-{tracker}</Id>{counts && <> · <span className="ath-mono">{fr.trackerScreen.total(counts.artifacts)}</span></>}</>}
        actions={<>
          <Btn onClick={() => create({ scope: 'tracker', project: String(project), tracker: String(tracker) })}>{fr.trackerScreen.newItem}</Btn>
          <SubscribeToggle project={String(project)} scope="tracker" target={String(tracker)} size="md" />
          <PinToggle entry={{ kind: 'tracker', project: String(project), ref: String(tracker), label: `${project} · ${tracker}` }} />
          {admin && <Btn variant="ghost" onClick={() => navigate(`/p/${project}/trackers/${tracker}/config`)}>{fr.trackerScreen.configure}</Btn>}
        </>} />
      {current === 'tableau' && <MiniWorkflow states={states} active={status} onPick={(key) => next({ f: toAtql({ ...(fromAtql(fragment, username) ?? emptyModel()), status: key ?? undefined }, username) || null, o: null })} />}
      {current === 'tableau' && <FilterBar def={def} fragment={fragment} username={username} error={queryError} onChange={(f) => next({ f: f || null, o: null })} />}
      {current === 'tableau' && <SavedViews project={String(project)} tracker={String(tracker)} current={{ fragment, sort, columns: cols }} roles={session.user?.roles ?? []} onLoaded={onViews}
        onApply={(v) => setParams(viewToParams(v))} />}
      {current === 'tableau' && <ColumnPicker options={columnOptions(def)} selected={chosenColumns} onChange={(ids) => next({ cols: columnsParam(ids, def) })} />}
      <nav className="ath-tabs ath-tabs--links" aria-label={fr.trackerScreen.views}>
        {views.map((v) => (
          <Link key={v} to={`${base}/${v}`} className="ath-tab" aria-current={v === current ? 'page' : undefined}>{fr.trackerScreen.viewNames[v]}</Link>
        ))}
      </nav>
      {current === 'board' ? <BoardView key={refresh} project={String(project)} board={`~${tracker}`} header={false} /> : current === 'matrice' ? (
        <MatrixView project={String(project)} tracker={String(tracker)} columnsTracker={params.get('mx')} linkType={params.get('mt')}
          trackers={siblings} onChange={next} />
      ) : current === 'arbre' ? (
        <div className={item ? 'ath-split' : undefined}>
          <div><TreeView project={String(project)} tracker={String(tracker)} selected={item} onOpen={(key) => setParams(withItem(key))} /></div>
          {item && <DetailPanel session={session} project={String(project)} itemKey={item} onClose={closePanel}
            onExpand={() => navigate(`/p/${project}/a/${item}`)} onCanonicalKey={(key) => setParams(withItem(key), { replace: true })} />}
        </div>
      ) : result === null ? <p role="status">{fr.loading}</p> : result.hits.length === 0 ? (
        <EmptyState eyebrow={fr.trackerScreen.eyebrow} title={fr.trackerScreen.empty} action={fragment ? <Btn variant="ghost" onClick={() => next({ f: null, o: null })}>{fr.list.reset}</Btn> : undefined} />
      ) : (
        <div className={item ? 'ath-split' : undefined}>
          <div>
            <ArtifactTable project={String(project)} columns={tableColumns} result={result} offset={offset} pageSize={PAGE} sortOf={sortOf} sortBy={sortBy} onPage={(o) => next({ o: String(o), i: null })}
              selected={item} linkFor={(key) => `${base}/tableau?${withItem(key).toString()}`} />
          </div>
          {item && <DetailPanel session={session} project={String(project)} itemKey={item} onClose={closePanel}
            onExpand={() => navigate(`/p/${project}/a/${item}`)} onCanonicalKey={(key) => setParams(withItem(key), { replace: true })} />}
        </div>
      )}
    </>
  );
}
