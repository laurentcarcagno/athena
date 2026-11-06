import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Tag, useToast } from '@athena/ui';
import { ApiError, api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface Item { key: string; title: string; status: string; statusName: string; category: string }
interface Row extends Item { linked: boolean }
export interface MatrixData {
  type: { key: string; outwardLabel: string; inwardLabel: string };
  rows: Row[]; cols: Item[]; totalRows: number; totalCols: number;
  links: Array<{ row: string; col: string; suspect: boolean }>;
}
interface LinkType { key: string; outwardLabel: string; inwardLabel: string }

const WINDOW = 200;

/** Contenu CSV d'une matrice : une ligne par item, une colonne par item de l'autre tracker, « 1 » (ou « 1!» si suspect) dans les cases remplies. */
export function matrixCsv(data: Pick<MatrixData, 'rows' | 'cols' | 'links'>): string {
  const cell = (value: string) => (/[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const filled = new Map(data.links.map((l) => [`${l.row}|${l.col}`, l.suspect]));
  const header = ['', ...data.cols.map((c) => cell(c.key))].join(',');
  const lines = data.rows.map((r) => [cell(r.key), ...data.cols.map((c) => (filled.has(`${r.key}|${c.key}`) ? (filled.get(`${r.key}|${c.key}`) ? '1!' : '1') : ''))].join(','));
  return [header, ...lines].join('\n') + '\n';
}

/**
 * Matrice de traçabilité du tracker courant (lignes) croisé avec un autre tracker (colonnes) par un type de lien.
 * Les lignes sans aucun lien sont signalées par un texte (« non couvert ») et un pointillé, jamais par la couleur seule.
 */
export function MatrixView({ project, tracker, columnsTracker, linkType, offset, trackers, onChange }: {
  project: string; tracker: string; columnsTracker: string | null; linkType: string | null; offset: number;
  trackers: string[]; onChange: (changes: { mx?: string | null; mt?: string | null; mo?: string | null }) => void;
}) {
  const fail = useFailure();
  const toast = useToast();
  const [types, setTypes] = useState<LinkType[]>([]);
  const [data, setData] = useState<MatrixData | null>(null);
  const [version, setVersion] = useState(0);
  const others = trackers.filter((t) => t !== tracker);
  const cols = columnsTracker ?? others[0] ?? tracker;
  const type = linkType ?? types.find((t) => t.key === 'verifies')?.key ?? types[0]?.key ?? null;

  useEffect(() => { api<LinkType[]>('GET', `/v1/projects/${project}/link-types`).then((t) => setTypes(Array.isArray(t) ? t : [])).catch(() => setTypes([])); }, [project]);
  useEffect(() => {
    if (!type) return;
    setData(null);
    api<MatrixData>('GET', `/v1/projects/${project}/matrix?rows=${tracker}&cols=${cols}&type=${type}&offset=${offset}`).then(setData).catch(fail);
  }, [project, tracker, cols, type, offset, version, fail]);

  const exportCsv = useCallback(async () => {
    if (!data || !type) return;
    try {
      const all: MatrixData = { ...data, cols: [...data.cols], links: [...data.links] };
      for (let o = WINDOW; o < data.totalCols; o += WINDOW) {
        const next = await api<MatrixData>('GET', `/v1/projects/${project}/matrix?rows=${tracker}&cols=${cols}&type=${type}&offset=${o}`);
        all.cols.push(...next.cols); all.links.push(...next.links);
      }
      if (offset > 0) { // la fenêtre affichée n'est pas la première : repartir de zéro
        const first = await api<MatrixData>('GET', `/v1/projects/${project}/matrix?rows=${tracker}&cols=${cols}&type=${type}&offset=0`);
        all.cols = [...first.cols, ...all.cols.filter((c) => !first.cols.some((x) => x.key === c.key))];
        all.links = [...first.links, ...all.links.filter((l) => !first.links.some((x) => x.row === l.row && x.col === l.col))];
      }
      const url = URL.createObjectURL(new Blob([matrixCsv(all)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `matrice-${tracker}-${cols}-${type}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (error) { fail(error); }
  }, [data, type, project, tracker, cols, offset, fail]);

  const create = async (row: Item, col: Item) => {
    if (!data) return;
    try {
      try { await api('POST', `/v1/projects/${project}/artifacts/${col.key}/links`, { to: row.key, type: data.type.key }); }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 422) throw error;
        await api('POST', `/v1/projects/${project}/artifacts/${row.key}/links`, { to: col.key, type: data.type.key }); // le type n'autorise que l'autre sens
      }
      toast('success', fr.links.created);
      setVersion((v) => v + 1);
    } catch (error) { fail(error); }
  };

  if (others.length === 0) return <p>{fr.matrix.noOther}</p>;
  const filled = new Map((data?.links ?? []).map((l) => [`${l.row}|${l.col}`, l.suspect]));
  const uncovered = data?.rows.filter((r) => !r.linked).length ?? 0;
  const windowEnd = data ? Math.min(offset + WINDOW, data.totalCols) : 0;

  return (
    <div className="ath-stack">
      <div className="ath-toolbar">
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="mx-cols">{fr.matrix.columns}</label>
          <select id="mx-cols" className="ath-select" value={cols} onChange={(e) => onChange({ mx: e.target.value, mo: null })}>
            {others.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="mx-type">{fr.matrix.linkType}</label>
          <select id="mx-type" className="ath-select" value={type ?? ''} onChange={(e) => onChange({ mt: e.target.value, mo: null })}>
            {types.map((t) => <option key={t.key} value={t.key}>{t.outwardLabel} ({t.key})</option>)}
          </select>
        </div>
        <Btn type="button" variant="ghost" size="sm" disabled={!data} onClick={() => void exportCsv()}>{fr.matrix.exportCsv}</Btn>
      </div>
      {data === null ? <p role="status">{fr.loading}</p> : (
        <>
          <p className="ath-eyebrow">{fr.matrix.summary(data.rows.length - uncovered, data.rows.length, data.totalRows)}</p>
          <div className="ath-matrix-wrap">
            <table className="ath-matrix">
              <caption className="ath-table__caption">{fr.matrix.caption(tracker, cols, data.type.outwardLabel)}</caption>
              <thead>
                <tr>
                  <th scope="col">{tracker} \ {cols}</th>
                  {data.cols.map((c) => <th key={c.key} scope="col" title={c.title}><Link className="ath-link ath-mono" to={`/p/${project}/a/${c.key}`}>{c.key}</Link></th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" title={r.title}>
                      <Link className="ath-link ath-mono" to={`/p/${project}/a/${r.key}`}>{r.key}</Link>
                      {!r.linked && <> <Tag>{fr.matrix.uncovered}</Tag></>}
                    </th>
                    {data.cols.map((c) => {
                      const suspect = filled.get(`${r.key}|${c.key}`);
                      if (suspect !== undefined) {
                        return <td key={c.key} className={`ath-matrix__cell ath-matrix__cell--linked${suspect ? ' ath-matrix__cell--suspect' : ''}`}><span aria-label={suspect ? fr.matrix.linkedSuspect : fr.matrix.linked}>{suspect ? '✓!' : '✓'}</span></td>;
                      }
                      return (
                        <td key={c.key} className={`ath-matrix__cell ath-matrix__cell--empty${r.linked ? '' : ' ath-matrix__cell--gap'}`}>
                          <button type="button" className="ath-matrix__add" aria-label={fr.matrix.link(r.key, c.key)} onClick={() => void create(r, c)}>{r.linked ? '·' : '—'}</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalRows > data.rows.length && <p className="ath-eyebrow">{fr.matrix.rowsTruncated(data.rows.length, data.totalRows)}</p>}
          {data.totalCols > WINDOW && (
            <div className="ath-toolbar">
              <Btn variant="ghost" size="sm" disabled={offset === 0} onClick={() => onChange({ mo: String(Math.max(0, offset - WINDOW)) })}>{fr.list.previous}</Btn>
              <span className="ath-mono">{offset + 1}–{windowEnd} / {data.totalCols}</span>
              <Btn variant="ghost" size="sm" disabled={windowEnd >= data.totalCols} onClick={() => onChange({ mo: String(offset + WINDOW) })}>{fr.list.next}</Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
