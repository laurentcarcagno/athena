import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Btn, DASH_SIZES, boxClasses, DashCard, DashGrid, Select, useToast, type DashSize } from '@athena/ui';
import { fr } from '../i18n';
import { DEFAULT_ROWS, GRID_COLUMNS, MAX_ROWS, SIZE_COLUMNS, placeAt, resizeTo, withBoxes } from '../lib/grid';
import { ChartForm, type ChartForm as ChartFormKind } from './ChartCard';
import {
  PERIODS, PORTFOLIO_CAPABLE, PROJECT_KINDS, SPECIAL, cx, missingTarget, widgetTitle,
  type CatalogEntry, type Period, type Placed, type Repeat, type SavedSearch, type Widget, type WidgetKind,
} from './dashboard-model';

export type EditorTarget = 'home' | 'project' | 'progress' | 'portfolio';

export interface DashboardEditorProps {
  /** Cartes du brouillon, toutes placées sur la grille. */
  widgets: Placed[];
  onChange: (next: Placed[]) => void;
  /** Projet ou portefeuille du tableau de bord édité (absents : Mon travail ou un gabarit). */
  project?: string | undefined;
  portfolio?: string | undefined;
  catalog: CatalogEntry[];
  views: SavedSearch[];
  /** Cartes types que le catalogue propose de réajouter. */
  builtin: Widget[];
  renderBody: (w: Widget) => ReactNode;
  renderFooter?: (w: Widget) => ReactNode;
  /** Édition d'un gabarit (ADR-0010) : les cartes visent « le courant » ou se répètent ; aucune clé de projet ni de portefeuille. */
  template?: EditorTarget;
}

/** Cible d'une carte de gabarit, pour la liste de réglage : une seule, une par projet, un par portefeuille. */
const repeatOptions = (target: EditorTarget, kind: WidgetKind): Repeat[] => {
  if (target === 'home') return kind === 'platform-ops' ? [] : ['project', 'portfolio'];
  if (target === 'portfolio') return ['project'];
  return [];
};

/**
 * Éditeur de grille partagé (ADR-0007 T-0171 et T-0172, ADR-0010) : glisser-déposer sur la grille ou clavier (Entrée pour saisir la poignée, flèches pour
 * déplacer, Entrée ou Échap pour poser), engrenage (titre, projet, portefeuille, taille, période, répétition d'un gabarit), retrait, tiroir « Catalogue ».
 * Il ne sait rien de l'enregistrement : le tableau de bord de la personne et l'éditeur de gabarits l'utilisent chacun avec leur brouillon.
 */
export function DashboardEditor({ widgets: shown, onChange: edit, project, portfolio, catalog, views, builtin, renderBody, renderFooter, template }: DashboardEditorProps) {
  const toast = useToast();
  const [chartOpen, setChartOpen] = useState(false);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  // Après un déplacement au clavier, le focus reste sur la poignée de la carte déplacée.
  useEffect(() => { if (grabbed) document.getElementById(`dash-handle-${grabbed}`)?.focus(); }, [shown, grabbed]);

  const patch = (id: string, change: Partial<Widget>) => edit(shown.map((w) => (w.id === id ? { ...w, ...change } : w)));
  const remove = (id: string) => { edit(shown.filter((w) => w.id !== id)); if (settings === id) setSettings(null); };
  const addWidget = (widget: Widget) => {
    // Première place libre de la grille (les cartes sans position se posent dans les trous, comme à l'ouverture).
    edit(withBoxes([...shown, { ...widget, w: SIZE_COLUMNS[widget.size ?? 'S'], h: widget.h ?? DEFAULT_ROWS }]) as Placed[]);
    toast('success', fr.home.added);
  };
  const uid = (base: string) => `${base.replace(/[^a-z0-9-]/g, '').slice(0, 28)}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const addKind = (kind: WidgetKind) => {
    const lay = catalog.find((c) => c.kind === kind);
    addWidget({ id: uid(kind), kind, ...(lay?.size ? { size: lay.size } : {}), ...(lay?.h ? { h: lay.h } : {}), ...(!template && project && PROJECT_KINDS.has(kind) ? { projects: [project], project } : {}) });
  };
  const duplicate = (id: string) => {
    const { x: _x, y: _y, ...w } = shown.find((c) => c.id === id)!;
    addWidget({ ...w, id: uid(w.id.replace(/-[a-z0-9]{6,}$/, '')), title: fr.home.copyOf(widgetTitle(w)) });
  };
  const missing = builtin.filter((b) => !shown.some((w) => w.id === b.id));
  const addView = (view: SavedSearch) => addWidget({ id: uid(`v-${view.id.slice(0, 8)}`), kind: 'search', title: view.name, query: view.query, ...(!template && project ? { projects: [project] } : !template && view.projects.length ? { projects: view.projects } : {}) });
  const addChart = (c: { title: string; query: string; field: string; form: ChartFormKind }) => {
    addWidget({ id: uid('chart'), kind: 'chart', title: c.title, query: c.query, form: c.form, size: 'S', ...(c.form === 'count' ? {} : { field: c.field }), ...(!template && project ? { projects: [project] } : {}) });
    setChartOpen(false);
  };

  // Clavier sur la poignée : Entrée ou Espace saisit et pose, les flèches déplacent d'une case, Échap pose.
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, w: Placed) => {
    const title = widgetTitle(w);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (grabbed === w.id) { setGrabbed(null); setAnnounce(fr.home.dropped(title, w.x + 1, w.y + 1)); }
      else { setGrabbed(w.id); setAnnounce(fr.home.grabbed(title)); }
    } else if (event.key === 'Escape' && grabbed === w.id) {
      setGrabbed(null); setAnnounce(fr.home.dropped(title, w.x + 1, w.y + 1));
    } else if (grabbed === w.id && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      const next = placeAt(shown, w.id, w.x + dx, w.y + dy);
      edit(next);
      const moved = next.find((c) => c.id === w.id)!;
      setAnnounce(fr.home.at(title, moved.x + 1, moved.y + 1));
    }
  };

  /** Case de la grille sous le pointeur. */
  const cellAt = (event: DragEvent): { x: number; y: number } | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const style = window.getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 0;
    const rowHeight = parseFloat(style.gridAutoRows) || 88;
    const colWidth = (rect.width + gap) / GRID_COLUMNS;
    if (!(colWidth > 0) || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    return { x: Math.floor((event.clientX - rect.left) / colWidth), y: Math.floor((event.clientY - rect.top) / (rowHeight + gap)) };
  };
  const onDragOver = (event: DragEvent) => {
    if (!dragging) return;
    event.preventDefault();
    const cell = cellAt(event);
    if (cell) setPreview({ x: cell.x - dragging.dx, y: cell.y - dragging.dy });
  };
  const onDrop = (event: DragEvent) => {
    if (!dragging) return;
    event.preventDefault();
    const cell = cellAt(event);
    const target = cell ? { x: cell.x - dragging.dx, y: cell.y - dragging.dy } : preview;
    if (target) {
      const next = placeAt(shown, dragging.id, target.x, target.y);
      edit(next);
      const moved = next.find((c) => c.id === dragging.id)!;
      setAnnounce(fr.home.at(widgetTitle(moved), moved.x + 1, moved.y + 1));
    }
    setDragging(null); setPreview(null);
  };
  const dragged = dragging ? shown.find((w) => w.id === dragging.id) : undefined;
  const ghost = dragged && preview ? placeAt(shown, dragged.id, preview.x, preview.y).find((c) => c.id === dragged.id)! : null;
  const current = settings ? shown.find((w) => w.id === settings) : undefined;

  return (
    <>
      <p className="ath-visually-hidden" aria-live="assertive">{announce}</p>
      <div className="ath-dashedit">
        <DashGrid ref={gridRef} className="ath-dashgrid--editing" onDragOver={onDragOver} onDrop={onDrop}>
          {shown.map((w) => {
            const title = widgetTitle(w);
            const lacks = !template && missingTarget(w, project, portfolio) !== null;
            return (
              <DashCard key={w.id} size={w.size ?? 'S'} box={{ x: w.x, y: w.y, w: w.w, h: w.h }} title={title} role="group" aria-label={title}
                className={cx(grabbed === w.id && 'ath-dashcard--grabbed', dragging?.id === w.id && 'ath-dashcard--dragging')}
                draggable={grabbed === null} onDragStart={(e) => { const cell = cellAt(e); setDragging({ id: w.id, dx: cell ? Math.max(0, Math.min(w.w - 1, cell.x - w.x)) : 0, dy: cell ? Math.max(0, Math.min(w.h - 1, cell.y - w.y)) : 0 }); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setDragging(null); setPreview(null); }}
                handle={<button type="button" id={`dash-handle-${w.id}`} className="ath-dashcard__handle" aria-pressed={grabbed === w.id}
                  aria-label={fr.home.handle(title)} title={fr.home.handle(title)} onKeyDown={(e) => onHandleKey(e, w)}
                  onClick={() => { if (grabbed === w.id) setGrabbed(null); }}>⠿</button>}
                actions={(
                  <>
                    <Btn variant="ghost" size="sm" aria-label={fr.home.settingsOf(title)} aria-expanded={settings === w.id} onClick={() => setSettings(settings === w.id ? null : w.id)}>{fr.home.settings}</Btn>
                    <Btn variant="ghost" size="sm" aria-label={`${fr.home.hide} ${title}`} onClick={() => remove(w.id)}>{fr.home.hide}</Btn>
                  </>
                )}
                footer={renderFooter?.(w)}>
                {lacks ? <p>{missingTarget(w, project, portfolio) === 'project' ? fr.home.chooseProject : missingTarget(w, project, portfolio) === 'portfolio' ? fr.home.choosePortfolio : fr.home.chooseTarget}</p> : renderBody(w)}
              </DashCard>
            );
          })}
          {ghost && <div className={cx('ath-dashdrop', ...boxClasses(ghost))} aria-hidden="true" />}
        </DashGrid>
        <div role="group" className="ath-dashdrawer" aria-label={fr.home.catalog}>
          {current && (
            <section className="ath-stack" aria-label={fr.home.settingsOf(widgetTitle(current))}>
              <h3 className="ath-subsection-title">{fr.home.settingsOf(widgetTitle(current))}</h3>
              <label className="ath-field">{fr.home.fieldTitle}<input className="ath-input" value={current.title ?? ''} placeholder={widgetTitle({ ...current, title: undefined })} maxLength={100} onChange={(e) => patch(current.id, { title: e.target.value || undefined })} /></label>
              {template && repeatOptions(template, current.kind).length > 0 && (
                <label className="ath-field">{fr.home.fieldRepeat}
                  <Select value={current.repeat ?? ''} onChange={(e) => patch(current.id, { repeat: (e.target.value || undefined) as Repeat | undefined })}>
                    <option value="">{fr.home.repeatNone}</option>
                    {repeatOptions(template, current.kind).map((r) => <option key={r} value={r}>{fr.home.repeatOption[r]}</option>)}
                  </Select>
                </label>
              )}
              {!template && PROJECT_KINDS.has(current.kind) && (
                <label className="ath-field">{fr.home.fieldProject}<input className="ath-input ath-mono" value={current.project ?? current.projects?.[0] ?? ''} maxLength={10} placeholder="NOVA"
                  onChange={(e) => { const key = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); patch(current.id, key ? { project: key, projects: [key] } : { project: undefined, projects: undefined }); }} /></label>
              )}
              {!template && !portfolio && PORTFOLIO_CAPABLE.has(current.kind) && (
                <label className="ath-field">{fr.home.fieldPortfolio}<input className="ath-input ath-mono" value={current.portfolio ?? ''} maxLength={30} placeholder="defense"
                  onChange={(e) => patch(current.id, { portfolio: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') || undefined })} /></label>
              )}
              <label className="ath-field">{fr.home.fieldWidth}
                <Select value={String(current.size ?? 'M')} onChange={(e) => edit(resizeTo(shown, current.id, SIZE_COLUMNS[e.target.value as DashSize], current.h))}>
                  {DASH_SIZES.map((sz) => <option key={sz} value={sz}>{fr.home.sizeOption(sz, SIZE_COLUMNS[sz])}</option>)}
                </Select>
              </label>
              <label className="ath-field">{fr.home.fieldHeight}
                <Select value={String(current.h)} onChange={(e) => edit(resizeTo(shown, current.id, current.w, Number(e.target.value)))}>
                  {Array.from({ length: MAX_ROWS }, (_, i) => i + 1).map((r) => <option key={r} value={r}>{fr.home.rows(r)}</option>)}
                </Select>
              </label>
              <label className="ath-field">{fr.home.fieldPeriod}
                <Select value={current.period ?? ''} onChange={(e) => patch(current.id, { period: (e.target.value || undefined) as Period | undefined })}>
                  <option value="">{fr.home.periodDefault}</option>
                  {PERIODS.map((pd) => <option key={pd} value={pd}>{fr.home.periods[pd]}</option>)}
                </Select>
              </label>
              {current.kind === 'search' && <div><Btn variant="ghost" size="sm" aria-label={`${fr.home.duplicate} ${widgetTitle(current)}`} onClick={() => duplicate(current.id)}>{fr.home.duplicate}</Btn></div>}
              <div><Btn variant="ghost" size="sm" onClick={() => setSettings(null)}>{fr.home.close}</Btn></div>
            </section>
          )}
          <h3 className="ath-subsection-title">{fr.home.catalog}</h3>
          <p className="ath-field__hint">{fr.home.catalogHelp}</p>
          <ul className="ath-stack">
            {catalog.filter((c) => !SPECIAL.has(c.kind)).map((c) => (
              <li key={c.kind} className="ath-row"><span>{fr.home.kinds[c.kind] ?? c.kind}</span>
                <Btn variant="ghost" size="sm" aria-label={fr.home.addKind(fr.home.kinds[c.kind] ?? c.kind)} onClick={() => addKind(c.kind)}>{fr.home.add}</Btn></li>
            ))}
            {missing.filter((b) => b.kind === 'search' || !catalog.some((c) => c.kind === b.kind)).map((b) => (
              <li key={b.id} className="ath-row"><span>{widgetTitle(b)}</span><Btn variant="ghost" size="sm" aria-label={fr.home.addKind(widgetTitle(b))} onClick={() => addWidget(b)}>{fr.home.add}</Btn></li>
            ))}
            {views.map((v) => (
              <li key={v.id} className="ath-row"><span>{fr.home.viewOption(v.name)}</span><Btn variant="ghost" size="sm" aria-label={fr.home.addKind(v.name)} onClick={() => addView(v)}>{fr.home.add}</Btn></li>
            ))}
            <li className="ath-row"><span>{fr.chart.newOption}</span><Btn variant="ghost" size="sm" aria-expanded={chartOpen} aria-label={fr.home.addKind(fr.chart.newOption)} onClick={() => setChartOpen(!chartOpen)}>{fr.home.add}</Btn></li>
          </ul>
          {chartOpen && <ChartForm onAdd={addChart} />}
        </div>
      </div>
    </>
  );
}
