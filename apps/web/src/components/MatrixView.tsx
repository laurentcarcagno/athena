import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Tag, useToast } from '@athena/ui';
import { ApiError, api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface Item { key: string; title: string; status: string; statusName: string; category: string }
interface Row extends Item { linked: boolean }
export interface MatrixData {
  type: { key: string; outwardLabel: string; inwardLabel: string };
  rows: Row[]; cols: Item[]; totalRows: number; totalCols: number; uncoveredRows: number;
  links: Array<{ row: string; col: string; suspect: boolean }>;
}
interface LinkType { key: string; outwardLabel: string; inwardLabel: string }
interface Store {
  rows: Map<number, Row>; cols: Map<number, Item>; links: Map<string, boolean>; tiles: Set<string>;
  meta: { type: MatrixData['type']; totalRows: number; totalCols: number; uncoveredRows: number } | null;
}

const ROW_H = 32;
const COL_W = 44;
const HEAD_W = 220;
const TILE_ROWS = 500;
const TILE_COLS = 200;
const OVERSCAN = 4;
const FALLBACK_VIEW = { w: 1000, h: 600 }; // pas de mise en page (tests) : une fenêtre raisonnable

const emptyStore = (): Store => ({ rows: new Map(), cols: new Map(), links: new Map(), tiles: new Set(), meta: null });

/** Contenu CSV d'une matrice : une ligne par item, une colonne par item de l'autre tracker, « 1 » (ou « 1! » si suspect) dans les cases remplies. */
export function matrixCsv(data: Pick<MatrixData, 'rows' | 'cols' | 'links'>): string {
  const cell = (value: string) => (/[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const filled = new Map(data.links.map((l) => [`${l.row}|${l.col}`, l.suspect]));
  const header = ['', ...data.cols.map((c) => cell(c.key))].join(',');
  const lines = data.rows.map((r) => [cell(r.key), ...data.cols.map((c) => (filled.has(`${r.key}|${c.key}`) ? (filled.get(`${r.key}|${c.key}`) ? '1!' : '1') : ''))].join(','));
  return [header, ...lines].join('\n') + '\n';
}

/**
 * Matrice de traçabilité du tracker courant (lignes) croisé avec un autre tracker (colonnes) par un type de lien.
 * Défilement virtuel : seules les cellules visibles existent dans la page, les données arrivent par tuiles (500 lignes × 200 colonnes)
 * au fil du défilement. Les lignes sans aucun lien sont signalées par un texte (« non couvert »), jamais par la couleur seule.
 * La CSP interdit les attributs `style` : les dimensions passent par des propriétés CSS posées sur l'élément (CSSOM).
 */
export function MatrixView({ project, tracker, columnsTracker, linkType, trackers, onChange }: {
  project: string; tracker: string; columnsTracker: string | null; linkType: string | null;
  trackers: string[]; onChange: (changes: { mx?: string | null; mt?: string | null }) => void;
}) {
  const fail = useFailure();
  const toast = useToast();
  const [types, setTypes] = useState<LinkType[]>([]);
  const [, bump] = useState(0);
  const [version, setVersion] = useState(0);
  const [view, setView] = useState({ top: 0, left: 0, ...FALLBACK_VIEW });
  const store = useRef<Store>(emptyStore());
  const generation = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const others = trackers.filter((t) => t !== tracker);
  const cols = columnsTracker ?? others[0] ?? tracker;
  const type = linkType ?? types.find((t) => t.key === 'verifies')?.key ?? types[0]?.key ?? null;
  const configKey = `${project}|${tracker}|${cols}|${type}`;

  useEffect(() => { api<LinkType[]>('GET', `/v1/projects/${project}/link-types`).then((t) => setTypes(Array.isArray(t) ? t : [])).catch(() => setTypes([])); }, [project]);

  const url = useCallback((ro: number, co: number) => `/v1/projects/${project}/matrix?rows=${tracker}&cols=${cols}&type=${type}&offset=${co}&rowOffset=${ro}`, [project, tracker, cols, type]);

  const loadTile = useCallback(async (ro: number, co: number) => {
    const key = `${ro}:${co}`;
    if (!type || store.current.tiles.has(key)) return;
    store.current.tiles.add(key);
    const mine = generation.current;
    try {
      const d = await api<MatrixData>('GET', url(ro, co));
      if (mine !== generation.current) return; // la matrice a changé entre-temps
      const s = store.current;
      s.meta = { type: d.type, totalRows: d.totalRows, totalCols: d.totalCols, uncoveredRows: d.uncoveredRows };
      d.rows.forEach((r, i) => s.rows.set(ro + i, r));
      d.cols.forEach((c, i) => s.cols.set(co + i, c));
      for (const l of d.links) s.links.set(`${l.row}|${l.col}`, l.suspect);
      bump((n) => n + 1);
    } catch (error) {
      if (mine === generation.current) store.current.tiles.delete(key);
      fail(error);
    }
  }, [type, url, fail]);

  // Nouvelle matrice (autre tracker, type de lien ou lien créé) : on repart de la première tuile.
  useEffect(() => {
    if (!type) return;
    generation.current += 1;
    store.current = emptyStore();
    bump((n) => n + 1);
    void loadTile(0, 0);
  }, [configKey, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (scroller.current) { scroller.current.scrollTop = 0; scroller.current.scrollLeft = 0; } setView((v) => ({ ...v, top: 0, left: 0 })); }, [configKey]);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setView({ top: el.scrollTop, left: el.scrollLeft, w: el.clientWidth || FALLBACK_VIEW.w, h: el.clientHeight || FALLBACK_VIEW.h });
  }, []);
  useLayoutEffect(measure, [measure]);
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, [measure]);
  const onScroll = (e: UIEvent<HTMLDivElement>) => setView({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft, w: e.currentTarget.clientWidth || FALLBACK_VIEW.w, h: e.currentTarget.clientHeight || FALLBACK_VIEW.h });

  const meta = store.current.meta;
  const totalRows = meta?.totalRows ?? 0;
  const totalCols = meta?.totalCols ?? 0;
  const r0 = Math.max(0, Math.floor(view.top / ROW_H) - OVERSCAN);
  const r1 = Math.min(totalRows, Math.ceil((view.top + view.h) / ROW_H) + OVERSCAN);
  const c0 = Math.max(0, Math.floor(view.left / COL_W) - OVERSCAN);
  const c1 = Math.min(totalCols, Math.ceil((view.left + view.w - HEAD_W) / COL_W) + OVERSCAN);

  // Tuiles couvrant les quatre coins de la fenêtre visible.
  useEffect(() => {
    if (!meta || r1 <= r0 || c1 <= c0) return;
    const tile = (n: number, size: number) => Math.floor(n / size) * size;
    for (const ro of new Set([tile(r0, TILE_ROWS), tile(r1 - 1, TILE_ROWS)])) for (const co of new Set([tile(c0, TILE_COLS), tile(c1 - 1, TILE_COLS)])) void loadTile(ro, co);
  }, [meta, r0, r1, c0, c1, loadTile]);

  // Dimensions du défilement virtuel : propriétés CSS posées sur la grille (jamais d'attribut style).
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const px = (n: number) => `${n}px`;
    el.style.setProperty('--mx-head', px(HEAD_W));
    el.style.setProperty('--mx-colw', px(COL_W));
    el.style.setProperty('--mx-n', String(Math.max(0, c1 - c0)));
    el.style.setProperty('--mx-left', px(c0 * COL_W));
    el.style.setProperty('--mx-right', px(Math.max(0, totalCols - c1) * COL_W));
    el.style.setProperty('--mx-top', px(r0 * ROW_H));
    el.style.setProperty('--mx-bottom', px(Math.max(0, totalRows - r1) * ROW_H));
  });

  const exportCsv = async () => {
    if (!meta || !type) return;
    try {
      const rows: Row[] = [];
      const colsAll: Item[] = [];
      const links = new Map<string, { row: string; col: string; suspect: boolean }>();
      for (let ro = 0; ro < meta.totalRows; ro += TILE_ROWS) {
        for (let co = 0; co < meta.totalCols; co += TILE_COLS) {
          const d = await api<MatrixData>('GET', url(ro, co));
          if (co === 0) rows.push(...d.rows);
          if (ro === 0) colsAll.push(...d.cols);
          for (const l of d.links) links.set(`${l.row}|${l.col}`, l);
        }
      }
      const blob = new Blob([matrixCsv({ rows, cols: colsAll, links: [...links.values()] })], { type: 'text/csv;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href; a.download = `matrice-${tracker}-${cols}-${type}.csv`; a.click();
      URL.revokeObjectURL(href);
    } catch (error) { fail(error); }
  };

  const create = async (row: Item, col: Item) => {
    if (!meta) return;
    try {
      try { await api('POST', `/v1/projects/${project}/artifacts/${col.key}/links`, { to: row.key, type: meta.type.key }); }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 422) throw error;
        await api('POST', `/v1/projects/${project}/artifacts/${row.key}/links`, { to: col.key, type: meta.type.key }); // le type n'autorise que l'autre sens
      }
      toast('success', fr.links.created);
      setVersion((v) => v + 1);
    } catch (error) { fail(error); }
  };

  if (others.length === 0) return <p>{fr.matrix.noOther}</p>;
  const s = store.current;
  const visibleRows = Array.from({ length: Math.max(0, r1 - r0) }, (_, i) => r0 + i);
  const visibleCols = Array.from({ length: Math.max(0, c1 - c0) }, (_, i) => c0 + i);

  return (
    <div className="ath-stack">
      <div className="ath-toolbar">
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="mx-cols">{fr.matrix.columns}</label>
          <select id="mx-cols" className="ath-select" value={cols} onChange={(e) => onChange({ mx: e.target.value })}>
            {others.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="mx-type">{fr.matrix.linkType}</label>
          <select id="mx-type" className="ath-select" value={type ?? ''} onChange={(e) => onChange({ mt: e.target.value })}>
            {types.map((t) => <option key={t.key} value={t.key}>{t.outwardLabel} ({t.key})</option>)}
          </select>
        </div>
        <Btn type="button" variant="ghost" size="sm" disabled={!meta} onClick={() => void exportCsv()}>{fr.matrix.exportCsv}</Btn>
      </div>
      {meta === null && <p role="status">{fr.loading}</p>}
      {meta !== null && <p className="ath-eyebrow">{fr.matrix.summary(meta.totalRows - meta.uncoveredRows, meta.totalRows, meta.totalCols)}</p>}
      <div className="ath-mxscroll" ref={scroller} onScroll={onScroll} tabIndex={0} role="region" aria-label={fr.matrix.region}>
        <div className="ath-mxgrid" ref={grid} role="grid" aria-label={meta ? fr.matrix.caption(tracker, cols, meta.type.outwardLabel) : fr.matrix.region}
          aria-rowcount={totalRows + 1} aria-colcount={totalCols + 1}>
          <div className="ath-mxgrid__row ath-mxgrid__head" role="row" aria-rowindex={1}>
            <div className="ath-mxgrid__corner" role="columnheader" aria-colindex={1}>{tracker} \ {cols}</div>
            <div role="presentation" />
            {visibleCols.map((c) => {
              const item = s.cols.get(c);
              return (
                <div key={c} className="ath-mxgrid__colhead" role="columnheader" aria-colindex={c + 2} title={item?.title}>
                  {item ? <Link className="ath-link ath-mono" to={`/p/${project}/a/${item.key}`}>{item.key}</Link> : <span aria-busy="true">…</span>}
                </div>
              );
            })}
            <div role="presentation" />
          </div>
          <div className="ath-mxgrid__top" role="presentation" />
          {visibleRows.map((r) => {
            const row = s.rows.get(r);
            return (
              <div key={r} className="ath-mxgrid__row" role="row" aria-rowindex={r + 2}>
                <div className="ath-mxgrid__rowhead" role="rowheader" aria-colindex={1} title={row?.title}>
                  {row ? <><Link className="ath-link ath-mono" to={`/p/${project}/a/${row.key}`}>{row.key}</Link>{!row.linked && <> <Tag>{fr.matrix.uncovered}</Tag></>}</> : <span aria-busy="true">…</span>}
                </div>
                <div role="presentation" />
                {visibleCols.map((c) => {
                  const col = s.cols.get(c);
                  if (!row || !col) return <div key={c} className="ath-mxgrid__cell" role="gridcell" aria-colindex={c + 2} aria-busy="true">…</div>;
                  const suspect = s.links.get(`${row.key}|${col.key}`);
                  if (suspect !== undefined) {
                    return (
                      <div key={c} className={`ath-mxgrid__cell ath-matrix__cell--linked${suspect ? ' ath-matrix__cell--suspect' : ''}`} role="gridcell" aria-colindex={c + 2}>
                        <span aria-label={suspect ? fr.matrix.linkedSuspect : fr.matrix.linked}>{suspect ? '✓!' : '✓'}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={c} className={`ath-mxgrid__cell${row.linked ? '' : ' ath-matrix__cell--gap'}`} role="gridcell" aria-colindex={c + 2}>
                      <button type="button" className="ath-matrix__add" aria-label={fr.matrix.link(row.key, col.key)} onClick={() => void create(row, col)}>{row.linked ? '·' : '—'}</button>
                    </div>
                  );
                })}
                <div role="presentation" />
              </div>
            );
          })}
          <div className="ath-mxgrid__bottom" role="presentation" />
        </div>
      </div>
    </div>
  );
}
