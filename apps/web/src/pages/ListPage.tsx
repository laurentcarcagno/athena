import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, FilterChip, Id, PageHeader, StatusPill, Table, Td, Th, type PillKind, type SortState } from '@athena/ui';
import { ApiError, api, type SearchResult } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export const pillKind = (category: string): PillKind => (category === 'done' ? 'success' : category === 'in_progress' ? 'warning' : 'info');
const PAGE = 25;
const SORTABLE = { key: 'key', status: 'status', tracker: 'tracker', updated: 'updated' } as const;

/** Sépare la clause ORDER BY de la requête pour que le tri par colonne reste visible dans l'URL. */
export function splitOrder(query: string): { where: string; order: { field: string; dir: 'asc' | 'desc' } | null } {
  const match = /\s*\bORDER\s+BY\s+([a-z_][a-z0-9_]*)\s*(ASC|DESC)?\s*$/i.exec(query);
  if (!match) return { where: query.trim(), order: null };
  return { where: query.slice(0, match.index).trim(), order: { field: match[1]!.toLowerCase(), dir: (match[2] ?? 'asc').toLowerCase() as 'asc' | 'desc' } };
}
export const joinOrder = (where: string, order: { field: string; dir: string } | null) => (order ? `${where} ORDER BY ${order.field} ${order.dir}`.trim() : where);

export function ListPage() {
  const { project } = useParams();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const offset = Number(params.get('o') ?? '0') || 0;
  const [draft, setDraft] = useState(query);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = useFailure();
  const { where, order } = splitOrder(query);

  useEffect(() => setDraft(query), [query]);
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

  const submit = (event: FormEvent) => { event.preventDefault(); setParams(draft ? { q: draft } : {}); };
  const sortOf = (field: string): SortState => (order?.field === field ? order.dir : null);
  const sortBy = (field: string) => (next: SortState) => setParams({ q: joinOrder(where, next ? { field, dir: next } : null) });
  const title = (hit: SearchResult['hits'][number]) => String(hit.values['title'] ?? hit.values['name'] ?? '');

  return (
    <>
      <PageHeader eyebrow={fr.list.eyebrow} title={String(project)} sub={result ? fr.list.total(result.total) : undefined} />
      <form className="ath-toolbar" onSubmit={submit} role="search">
        <input className="ath-input ath-mono" size={60} aria-label="Requête ATQL" placeholder={fr.list.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Btn type="submit">{fr.list.run}</Btn>
        {where && <FilterChip label="ATQL" value={where} active onClear={() => setParams({})} />}
      </form>
      {error && <p role="alert" className="ath-field__error">{error}</p>}
      {result && result.hits.length === 0 && !error ? (
        <EmptyState eyebrow={fr.list.emptyEyebrow} title={fr.list.empty} action={query ? <Btn variant="ghost" onClick={() => setParams({})}>{fr.list.reset}</Btn> : undefined} />
      ) : result ? (
        <>
          <Table>
            <thead>
              <tr>
                <Th sort={sortOf('key')} onSort={sortBy('key')}>{fr.list.key}</Th>
                <Th>{fr.list.title}</Th>
                <Th sort={sortOf('status')} onSort={sortBy('status')}>{fr.list.status}</Th>
                <Th sort={sortOf('tracker')} onSort={sortBy('tracker')}>{fr.list.tracker}</Th>
                <Th sort={sortOf('updated')} onSort={sortBy('updated')}>{fr.list.updated}</Th>
              </tr>
            </thead>
            <tbody>
              {result.hits.map((hit) => (
                <tr key={hit.key}>
                  <Td><Link className="ath-link ath-mono" to={`/p/${project}/a/${hit.key}`}>{hit.key}</Link></Td>
                  <Td>{title(hit)}</Td>
                  <Td><StatusPill kind={pillKind(hit.category)}>{hit.status}</StatusPill></Td>
                  <Td mono>{hit.tracker}</Td>
                  <Td mono mute>{hit.updatedAt.slice(0, 16).replace('T', ' ')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="ath-toolbar">
            <Btn variant="ghost" size="sm" disabled={offset === 0} onClick={() => setParams({ ...(query ? { q: query } : {}), o: String(Math.max(0, offset - PAGE)) })}>{fr.list.previous}</Btn>
            <Id>{offset + 1}–{Math.min(offset + PAGE, result.total)} / {result.total}</Id>
            <Btn variant="ghost" size="sm" disabled={offset + PAGE >= result.total} onClick={() => setParams({ ...(query ? { q: query } : {}), o: String(offset + PAGE) })}>{fr.list.next}</Btn>
          </div>
        </>
      ) : <p role="status">{fr.loading}</p>}
    </>
  );
}
