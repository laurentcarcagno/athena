import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, Field as TextField, FilterChip, PageHeader, type SortState } from '@athena/ui';
import { ApiError, api, type SavedFilter, type Session, type SearchResult, type TrackerDefinition } from '../api';
import { ArtifactTable } from '../components/ArtifactTable';
import { useConfirm } from '../components/ConfirmDialog';
import { CreateArtifact } from '../components/CreateArtifact';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export { pillKind } from '../components/ArtifactTable';
const PAGE = 25;
const SORTABLE = { key: 'key', status: 'status', tracker: 'tracker', updated: 'updated' } as const;

/** Sépare la clause ORDER BY de la requête pour que le tri par colonne reste visible dans l'URL. */
const BUILTIN_FIELDS = ['key', 'status', 'tracker', 'project', 'created', 'updated', 'created_by', 'text'];
const KEYWORDS = ['AND', 'OR', 'NOT', 'IN', 'IS EMPTY', 'IS NOT EMPTY', 'ORDER BY', 'suspect()', 'linkedTo(', 'notLinked('];

/** Suggestions pour le dernier mot saisi : champs (natifs et du projet) et mots-clés ATQL. */
export function suggest(draft: string, fields: string[], values: Record<string, string[]> = {}): { prefix: string; items: string[] } {
  // Après « champ = », on propose les valeurs possibles (clé technique de statut, options d'une liste, trackers).
  const afterOp = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|!=|~)\s*([A-Za-z0-9_-]*)$/.exec(draft);
  const known = afterOp ? values[afterOp[1]!.toLowerCase()] : undefined;
  if (afterOp && known) {
    const typed = afterOp[2] ?? '';
    return { prefix: typed, items: known.filter((v) => v.toLowerCase().startsWith(typed.toLowerCase()) && v.toLowerCase() !== typed.toLowerCase()).slice(0, 8) };
  }
  const match = /([A-Za-z_]+)$/.exec(draft);
  const prefix = match?.[1] ?? '';
  if (prefix.length < 1) return { prefix, items: [] };
  const lower = prefix.toLowerCase();
  const pool = [...new Set([...BUILTIN_FIELDS, ...fields, ...KEYWORDS])];
  return { prefix, items: pool.filter((p) => p.toLowerCase().startsWith(lower) && p.toLowerCase() !== lower).sort().slice(0, 8) };
}

export function splitOrder(query: string): { where: string; order: { field: string; dir: 'asc' | 'desc' } | null } {
  const match = /\s*\bORDER\s+BY\s+([a-z_][a-z0-9_]*)\s*(ASC|DESC)?\s*$/i.exec(query);
  if (!match) return { where: query.trim(), order: null };
  return { where: query.slice(0, match.index).trim(), order: { field: match[1]!.toLowerCase(), dir: (match[2] ?? 'asc').toLowerCase() as 'asc' | 'desc' } };
}
export const joinOrder = (where: string, order: { field: string; dir: string } | null) => (order ? `${where} ORDER BY ${order.field} ${order.dir}`.trim() : where);

export function ListPage({ session }: { session?: Session } = {}) {
  const { project } = useParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [trackerKeys, setTrackerKeys] = useState<string[]>([]);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const offset = Number(params.get('o') ?? '0') || 0;
  const [draft, setDraft] = useState(query);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = useFailure();
  const [fieldKeys, setFieldKeys] = useState<string[]>([]);
  const [valueMap, setValueMap] = useState<Record<string, string[]>>({});
  const [valueLabels, setValueLabels] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [saving, setSaving] = useState({ open: false, name: '', shared: false });
  const { where, order } = splitOrder(query);

  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    api<Array<{ key: string }>>('GET', `/v1/projects/${project}/trackers`).then(async (t) => {
      setTrackerKeys(t.map((x) => x.key));
      const roles = session?.user?.roles ?? [];
      const defs = await Promise.all(t.map((x) => api<TrackerDefinition>('GET', `/v1/projects/${project}/trackers/${x.key}`).catch(() => null)));
      const map: Record<string, string[]> = { tracker: t.map((x) => x.key), status: [...new Set(defs.flatMap((d) => d?.statuses ?? []).map((st) => st.key))] };
      const labels: Record<string, string> = {};
      for (const d of defs) for (const st of d?.statuses ?? []) labels[st.key] = st.name;
      for (const f of defs.flatMap((d) => d?.fields ?? [])) { const o = f.config['options']; if (f.type === 'select' && Array.isArray(o)) map[f.key.toLowerCase()] = [...new Set([...(map[f.key.toLowerCase()] ?? []), ...(o as string[])])]; }
      setValueMap(map); setValueLabels(labels);
      setFieldKeys(defs.flatMap((d) => d?.fields ?? []).filter((f) => !f.readRoles || f.readRoles.some((r) => roles.includes(r)) || roles.includes('athena-admin')).map((f) => f.key));
    }).catch(() => setTrackerKeys([]));
  }, [project]);
  useEffect(() => {
    setResult(null);
    setError(null);
    api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent(query)}&limit=${PAGE}&offset=${offset}`)
      .then(setResult)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 422) setError(e.readable);
        else fail(e);
      });
  }, [project, query, offset, fail]);

  const loadFilters = useCallback(() => api<SavedFilter[]>('GET', `/v1/projects/${project}/filters`).then((f) => setFilters(Array.isArray(f) ? f : [])).catch(() => setFilters([])), [project]);
  useEffect(() => { void loadFilters(); }, [loadFilters]);
  const saveFilter = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', `/v1/projects/${project}/filters`, { name: saving.name, query, shared: saving.shared });
      setSaving({ open: false, name: '', shared: false });
      await loadFilters();
    } catch (e) { fail(e); }
  };
  const activeFilter = filters.find((f) => f.query === query);
  const confirm = useConfirm();
  const deleteFilter = async () => {
    if (!activeFilter) return;
    if (!(await confirm.ask({ title: fr.confirm.deleteFilterTitle(activeFilter.name), body: fr.confirm.deleteFilterBody, confirm: fr.confirm.delete }))) return;
    try { await api('DELETE', `/v1/projects/${project}/filters/${activeFilter.id}`); await loadFilters(); } catch (e) { fail(e); }
  };

  const completion = suggest(draft, fieldKeys, valueMap);
  const complete = (item: string) => setDraft(draft.slice(0, draft.length - completion.prefix.length) + item + ' ');

  const submit = (event: FormEvent) => { event.preventDefault(); setParams(draft ? { q: draft } : {}); };
  const sortOf = (field: string): SortState => (order?.field === field ? order.dir : null);
  const sortBy = (field: string) => (next: SortState) => setParams({ q: joinOrder(where, next ? { field, dir: next } : null) });
  
  return (
    <>
      <PageHeader eyebrow={fr.list.eyebrow} title={String(project)} sub={result ? `${fr.list.total(result.total)}${result.totalCapped ? '+' : ''}` : undefined}
        actions={<><Btn onClick={() => setCreating(true)}>{fr.list.create}</Btn>{session?.user?.roles.includes('athena-admin') && trackerKeys[0] && <Btn variant="ghost" onClick={() => navigate(`/p/${project}/trackers/${trackerKeys[0]}/config`)}>{fr.config.eyebrow}</Btn>}</>} />
      {confirm.dialog}
      <CreateArtifact project={String(project)} trackers={trackerKeys} open={creating} onClose={() => setCreating(false)} onCreated={(key) => { setCreating(false); navigate(`/p/${project}/a/${key}`); }} />
      <form className="ath-toolbar" onSubmit={submit} role="search">
        <div className="ath-suggest">
          <input className="ath-input ath-mono" size={60} aria-label="Requête ATQL" placeholder={fr.list.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
          {completion.items.length > 0 && (
            <ul className="ath-suggest__list" role="listbox" aria-label={fr.list.suggestions}>
              {completion.items.map((item) => <li key={item} role="option" aria-selected={false}><button type="button" className="ath-suggest__item ath-mono" onClick={() => complete(item)}>{item}{valueLabels[item] && valueLabels[item] !== item ? <span className="ath-suggest__label"> — {valueLabels[item]}</span> : null}</button></li>)}
            </ul>
          )}
        </div>
        <Btn type="submit">{fr.list.run}</Btn>
        <label className="ath-field__label" htmlFor="saved-filters">{fr.list.filters}</label>
        <select id="saved-filters" className="ath-select" value={activeFilter?.id ?? ''} onChange={(e) => { const f = filters.find((x) => x.id === e.target.value); setParams(f?.query ? { q: f.query } : {}); }}>
          <option value="">{fr.list.noFilter}</option>
          {filters.map((f) => <option key={f.id} value={f.id}>{f.name}{f.shared ? ' ⇄' : ''}</option>)}
        </select>
        {activeFilter && <Btn type="button" variant="ghost" size="sm" onClick={deleteFilter}>{fr.list.deleteFilter}</Btn>}
        {query && !activeFilter && <Btn type="button" variant="ghost" size="sm" onClick={() => setSaving({ ...saving, open: true })}>{fr.list.saveFilter}</Btn>}
        {where && <FilterChip label="ATQL" value={where} active onClear={() => setParams({})} />}
      </form>
      {saving.open && (
        <form className="ath-toolbar" onSubmit={saveFilter}>
          <TextField label={fr.list.filterName} value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} />
          <label className="ath-row"><input type="checkbox" checked={saving.shared} onChange={(e) => setSaving({ ...saving, shared: e.target.checked })} />{fr.list.shareFilter}</label>
          <Btn type="submit" disabled={!saving.name.trim()}>{fr.list.saveFilter}</Btn>
        </form>
      )}
      {error && <p role="alert" className="ath-field__error">{error}</p>}
      {result && result.hits.length === 0 && !error ? (
        <EmptyState eyebrow={fr.list.emptyEyebrow} title={fr.list.empty} action={query ? <Btn variant="ghost" onClick={() => setParams({})}>{fr.list.reset}</Btn> : undefined} />
      ) : result ? (
        <ArtifactTable project={String(project)} result={result} offset={offset} pageSize={PAGE} sortOf={sortOf} sortBy={sortBy}
          onPage={(o) => setParams({ ...(query ? { q: query } : {}), o: String(o) })} />
      ) : error ? null : <p role="status">{fr.loading}</p>}
    </>
  );
}
