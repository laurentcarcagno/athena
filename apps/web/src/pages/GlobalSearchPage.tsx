import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, Field, PageHeader, Select, StatusPill, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { ApiError, api, type SearchResult, type Session } from '../api';
import { pillKind } from '../components/ArtifactTable';
import { useConfirm } from '../components/ConfirmDialog';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { fromHere } from '../lib/origin';

interface SavedSearch { id: string; name: string; query: string; projects: string[] }
const PAGE = 50;
const t = fr.globalSearch;

/** Clauses de premier niveau d'une conjonction simple (`a AND b`) ; une requête vide n'en a aucune. */
export const conjuncts = (query: string): string[] => query.trim() ? query.trim().split(/\s+AND\s+/i).map((c) => c.trim()).filter(Boolean) : [];

/** Ajoute la clause si elle manque, la retire sinon : les puces écrivent dans la requête ATQL, seule source de vérité. */
export function toggleClause(query: string, clause: string): string {
  const parts = conjuncts(query);
  return (parts.includes(clause) ? parts.filter((p) => p !== clause) : [...parts, clause]).join(' AND ');
}

/**
 * Recherche globale `/recherche` (ADR-0003, T-0119) : tickets de tous les projets autorisés, filtres rapides en puces,
 * requête ATQL, périmètre de projets et vues enregistrées personnelles. Tout l'état est dans l'adresse (`q`, `p`, `o`).
 */
export function GlobalSearchPage({ session }: { session: Session }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  const query = params.get('q') ?? '';
  const scope = (params.get('p') ?? '').split(',').filter(Boolean);
  const offset = Number(params.get('o') ?? '0') || 0;
  const [draft, setDraft] = useState(query);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [views, setViews] = useState<SavedSearch[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const username = session.user?.username ?? '';
  const quick = [
    { id: 'mine', label: t.mine, clause: `assignee = "${username.replace(/["\\]/g, '')}"` },
    { id: 'open', label: t.open, clause: 'category != done' },
    { id: 'recent', label: t.recent, clause: 'updated > daysAgo(7)' },
  ];

  const go = (next: { q?: string; p?: string[]; o?: number }) => {
    const q = next.q ?? query; const p = next.p ?? scope;
    setParams({ ...(q ? { q } : {}), ...(p.length ? { p: p.join(',') } : {}), ...(next.o ? { o: String(next.o) } : {}) });
  };

  useEffect(() => setDraft(query), [query]);
  useEffect(() => { api<Array<{ key: string; name: string }>>('GET', '/v1/projects').then((p) => setProjects(Array.isArray(p) ? p : [])).catch(() => setProjects([])); }, []);
  const loadViews = useCallback(() => api<SavedSearch[]>('GET', '/v1/searches').then((v) => setViews(Array.isArray(v) ? v : [])).catch(() => setViews([])), []);
  useEffect(() => { void loadViews(); }, [loadViews]);
  useEffect(() => {
    setResult(null); setError(null);
    const p = scope.length ? `&project=${encodeURIComponent(scope.join(','))}` : '';
    api<SearchResult>('GET', `/v1/search?q=${encodeURIComponent(query)}${p}&limit=${PAGE}&offset=${offset}`)
      .then(setResult)
      .catch((e: unknown) => { if (e instanceof ApiError && e.status === 422) setError(e.readable); else fail(e); });
  }, [query, scope.join(','), offset, fail]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = views.find((v) => v.query === query && v.projects.join(',') === scope.join(','));
  const submit = (event: FormEvent) => { event.preventDefault(); go({ q: draft.trim(), o: 0 }); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try { await api('POST', '/v1/searches', { name: saving, query, projects: scope }); setSaving(null); toast('success', t.saved); await loadViews(); } catch (e) { fail(e); }
  };
  const remove = async () => {
    if (!active || !(await confirm.ask({ title: t.deleteTitle(active.name), body: t.deleteBody, confirm: fr.confirm.delete }))) return;
    try { await api('DELETE', `/v1/searches/${active.id}`); await loadViews(); } catch (e) { fail(e); }
  };
  const keys = result?.hits.map((h) => h.key) ?? [];

  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} sub={result ? `${fr.list.total(result.total)}${result.totalCapped ? '+' : ''}` : undefined} />
      {confirm.dialog}
      <div className="ath-stack" role="search" aria-label={t.title}>
        <div className="ath-toolbar" role="group" aria-label={t.quick}>
          {quick.map((c) => {
            const on = conjuncts(query).includes(c.clause);
            return <button key={c.id} type="button" className={`ath-chip${on ? ' ath-chip--active' : ''}`} aria-pressed={on} onClick={() => go({ q: toggleClause(query, c.clause), o: 0 })}>{c.label}</button>;
          })}
        </div>
        {projects.length > 1 && (
          <div className="ath-toolbar" role="group" aria-label={t.projects}>
            <button type="button" className={`ath-chip${scope.length === 0 ? ' ath-chip--active' : ''}`} aria-pressed={scope.length === 0} onClick={() => go({ p: [], o: 0 })}>{t.allProjects}</button>
            {projects.map((p) => {
              const on = scope.includes(p.key);
              return <button key={p.key} type="button" className={`ath-chip ath-mono${on ? ' ath-chip--active' : ''}`} aria-pressed={on} title={p.name} onClick={() => go({ p: on ? scope.filter((k) => k !== p.key) : [...scope, p.key], o: 0 })}>{p.key}</button>;
            })}
          </div>
        )}
        <form className="ath-toolbar" onSubmit={submit}>
          <input className="ath-input ath-mono" size={60} aria-label={t.atql} placeholder={fr.list.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
          <Btn type="submit" icon="search">{t.run}</Btn>
          <label className="ath-field__label" htmlFor="global-views">{t.views}</label>
          <Select id="global-views" value={active?.id ?? ''} onChange={(e) => { const v = views.find((x) => x.id === e.target.value); go({ q: v?.query ?? '', p: v?.projects ?? [], o: 0 }); }}>
            <option value="">{t.noView}</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          {active && <Btn type="button" variant="ghost" size="sm" icon="trash" onClick={() => void remove()}>{t.deleteView}</Btn>}
          {(query || scope.length > 0) && !active && <Btn type="button" variant="ghost" size="sm" icon="save" onClick={() => setSaving('')}>{t.save}</Btn>}
        </form>
        {saving !== null && (
          <form className="ath-toolbar" aria-label={t.save} onSubmit={save}>
            <Field label={t.viewName} value={saving} onChange={(e) => setSaving(e.target.value)} />
            <Btn type="submit" icon="save" disabled={!saving.trim()}>{t.save}</Btn>
          </form>
        )}
      </div>
      {error && <p role="alert" className="ath-field__error">{error}</p>}
      {result && result.hits.length === 0 && !error ? (
        <EmptyState eyebrow={fr.list.emptyEyebrow} title={t.empty} action={query || scope.length ? <Btn variant="ghost" onClick={() => setParams({})}>{fr.list.reset}</Btn> : undefined} />
      ) : result ? (
        <>
          <Table>
            <thead><tr><Th>{fr.list.key}</Th><Th>{fr.list.title}</Th><Th>{t.project}</Th><Th>{fr.list.tracker}</Th><Th>{fr.list.status}</Th></tr></thead>
            <tbody>
              {result.hits.map((h) => (
                <tr key={h.key}>
                  <Td mono><Link className="ath-link" to={`/p/${h.project}/a/${h.key}`} state={fromHere(location, t.origin, keys)}>{h.key}</Link></Td>
                  <Td>{h.title && h.title !== h.key ? h.title : ''}</Td>
                  <Td mono>{h.project}</Td>
                  <Td><Tag variant="ghost">{h.tracker}</Tag></Td>
                  <Td><StatusPill kind={pillKind(h.category)}>{h.statusName}</StatusPill></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {result.total > PAGE && (
            <div className="ath-toolbar">
              <Btn variant="ghost" size="sm" disabled={offset === 0} onClick={() => go({ o: Math.max(offset - PAGE, 0) })}>{fr.list.previous}</Btn>
              <Btn variant="ghost" size="sm" disabled={offset + PAGE >= result.total} onClick={() => go({ o: offset + PAGE })}>{fr.list.next}</Btn>
            </div>
          )}
        </>
      ) : error ? null : <p role="status">{fr.loading}</p>}
    </>
  );
}
