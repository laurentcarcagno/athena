import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Btn, Id, Modal, Select, Tag, Textarea } from '@athena/ui';
import { fr, getLocale } from '../i18n';
import { formatDay } from '../lib/dates';
import { fromHere } from '../lib/origin';
import {
  DAY_WIDTH, HEAD_HEIGHT, ROW_HEIGHT, axisOf, dayNumber, isoOf, nonWorkingRuns, shiftTo, visibleWindow, workingPredicate, wbsOrder, xOf,
  type CalendarData, type ScheduleData, type ScheduleTask,
} from '../lib/schedule';

const t = fr.planning;
const BAR_PAD = 6;

/** Modifications demandées par le diagramme (chef de projet) ; l'appelant les envoie à l'API et recharge le planning. */
export interface GanttEdit {
  onChange: (key: string, change: { start?: string; due?: string; duration?: number }) => void;
  onLink: (from: string, to: string, lag: number) => void;
  onUnlink: (id: string) => void;
  onLag: (id: string, lag: number) => void;
}
/** Demande de décalage d'un utilisateur : envoyée au chef de projet (commentaire du ticket qui le mentionne). */
export interface ShiftRequest { onSubmit: (key: string, ask: { end: string | null; reason: string }) => void }
interface Drag { key: string; mode: 'move' | 'resize' | 'link'; x0: number; y0: number; dx: number; dy: number }

/** Retrait d'une ligne du tableau : une classe par niveau (aucune mise en forme en ligne, CSP). */
const indent = (depth: number) => `ath-gantt-indent-${Math.min(depth, 6)}`;

/** Résumé en clair d'une tâche, lu par les lecteurs d'écran sur la barre. */
function summarize(task: ScheduleTask): string {
  if (!task.scheduled) return `${task.key} : ${t.unscheduled}`;
  const kind = task.milestone ? t.milestone : task.summary ? t.summary : t.task;
  const dates = task.milestone ? formatDay(task.plannedEnd, true) : `${formatDay(task.plannedStart, true)} → ${formatDay(task.plannedEnd, true)}`;
  return `${task.key} ${task.title} · ${kind} · ${dates}${task.progress !== null ? ` · ${t.progress(task.progress)}` : ''}`;
}

/**
 * Diagramme de Gantt en lecture (ADR-0006, T-0162) : tableau WBS (hiérarchie), barres avec avancement, jalons en losange, repère
 * du jour, jours non ouvrés grisés et liens fin → début. Au-delà de 80 lignes, seules les lignes visibles sont dessinées.
 * Le rayon des barres est celui du thème (jeton) ; tout est en attributs SVG ou en classes : aucun style en ligne.
 */
export function ScheduleGantt({ project, data, calendar, today = new Date(), edit, request, critical = false }: { project: string; data: ScheduleData; calendar: CalendarData | null; today?: Date; edit?: GanttEdit; request?: ShiftRequest; critical?: boolean }) {
  const location = useLocation();
  const body = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const rows = wbsOrder(data.tasks);
  const axis = axisOf(data.tasks);
  const { from, to } = visibleWindow(rows.length, scroll.top, scroll.height);
  const shown = rows.slice(from, to);
  const index = new Map(rows.map((r, i) => [r.task.key, i]));
  const keys = rows.map((r) => r.task.key);
  const total = rows.length * ROW_HEIGHT;
  const baseline = data.baseline ?? null;
  const cols = 6 + (baseline ? 1 : 0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const isWorking = workingPredicate(calendar);
  const latest = useRef({ edit, data, rows, isWorking });
  latest.current = { edit, data, rows, isWorking };
  const dragging = drag !== null;

  /** Glisser une barre (déplacer), sa poignée de fin (étirer) ou sa poignée de lien (relier à une autre ligne). */
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = { ...dragRef.current, dx: e.clientX - dragRef.current.x0, dy: e.clientY - dragRef.current.y0 };
      setDrag(dragRef.current);
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      const cur = latest.current;
      const task = cur.data.tasks.find((x) => x.key === d?.key);
      if (!d || !task || !cur.edit) return;
      const days = Math.round(d.dx / DAY_WIDTH);
      if (d.mode === 'move' && days !== 0) {
        if (task.milestone && task.plannedEnd) cur.edit.onChange(task.key, { due: shiftTo(cur.isWorking, task.plannedEnd, days) });
        else if (task.plannedStart) cur.edit.onChange(task.key, { start: shiftTo(cur.isWorking, task.plannedStart, days) });
      } else if (d.mode === 'resize' && days !== 0 && task.plannedEnd) {
        cur.edit.onChange(task.key, { due: shiftTo(cur.isWorking, task.plannedEnd, days) });
      } else if (d.mode === 'link') {
        const top = svgRef.current?.getBoundingClientRect().top ?? 0;
        const target = cur.rows[Math.floor((e.clientY - top) / ROW_HEIGHT)]?.task;
        if (target && target.key !== task.key) cur.edit.onLink(task.key, target.key, 0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);

  const begin = (event: ReactPointerEvent, task: ScheduleTask, mode: Drag['mode']) => {
    if (!edit || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(task.key);
    dragRef.current = { key: task.key, mode, x0: event.clientX, y0: event.clientY, dx: 0, dy: 0 };
    setDrag(dragRef.current);
  };

  /** Équivalent clavier : flèches = début (ou date d'un jalon), Maj + flèches = fin, Entrée = ouvrir « Lier à… ». */
  const onBarKey = (event: ReactKeyboardEvent, task: ScheduleTask) => {
    if (!edit) return;
    if (event.key === 'Enter') { event.preventDefault(); setLinking(task.key); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const days = event.key === 'ArrowRight' ? 1 : -1;
    if (task.milestone && task.plannedEnd) edit.onChange(task.key, { due: shiftTo(isWorking, task.plannedEnd, days) });
    else if (event.shiftKey && task.plannedEnd) {
      const due = shiftTo(isWorking, task.plannedEnd, days);
      if (!task.plannedStart || due >= task.plannedStart) edit.onChange(task.key, { due });
    } else if (task.plannedStart) edit.onChange(task.key, { start: shiftTo(isWorking, task.plannedStart, days) });
  };

  const onScroll = () => {
    const el = body.current;
    if (el) setScroll({ top: el.scrollTop, height: el.clientHeight || 600 });
  };

  if (rows.length === 0) return null;
  const todayIso = today.toISOString().split('T')[0]!;
  const todayX = axis && dayNumber(todayIso) >= axis.first && dayNumber(todayIso) < axis.first + axis.days ? xOf(axis, todayIso) + DAY_WIDTH / 2 : null;

  const barOf = (task: ScheduleTask, i: number) => {
    if (!axis || !task.scheduled || !task.plannedEnd) return null;
    const y = i * ROW_HEIGHT;
    const x2 = xOf(axis, task.plannedEnd) + DAY_WIDTH;
    if (task.milestone) {
      const cx = xOf(axis, task.plannedEnd) + DAY_WIDTH / 2;
      const cy = y + ROW_HEIGHT / 2;
      const r = ROW_HEIGHT / 2 - BAR_PAD + 2;
      const shift = drag?.key === task.key && drag.mode === 'move' ? Math.round(drag.dx / DAY_WIDTH) * DAY_WIDTH : 0;
      return (
        <g key={task.key} className={`ath-gantt-milestone${edit ? ' ath-gantt-editable' : ''}${critical && task.critical ? ' ath-gantt-critical' : ''}`} transform={shift ? `translate(${shift},0)` : undefined}
          {...(edit ? { tabIndex: 0, role: 'button', 'aria-label': `${summarize(task)}. ${t.edit.hint}`, onFocus: () => setSelected(task.key), onKeyDown: (e: ReactKeyboardEvent) => onBarKey(e, task), onPointerDown: (e: ReactPointerEvent) => begin(e, task, 'move') } : {})}>
          <title>{summarize(task)}</title>
          <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} />
          {edit && <circle className="ath-gantt-handle" cx={cx + r + 8} cy={cy} r="4" onPointerDown={(e) => begin(e, task, 'link')}><title>{t.edit.linkHandle(task.key)}</title></circle>}
        </g>
      );
    }
    if (!task.plannedStart) return null;
    const x1 = xOf(axis, task.plannedStart);
    const width = Math.max(x2 - x1, DAY_WIDTH / 2);
    const done = Math.min(100, Math.max(0, task.progress ?? 0));
    const height = task.summary ? ROW_HEIGHT / 2 - BAR_PAD / 2 : ROW_HEIGHT - 2 * BAR_PAD;
    const top = y + (ROW_HEIGHT - height) / 2;
    const editable = Boolean(edit) && !task.summary;
    const moving = drag?.key === task.key && drag.mode === 'move' ? Math.round(drag.dx / DAY_WIDTH) * DAY_WIDTH : 0;
    const stretch = drag?.key === task.key && drag.mode === 'resize' ? Math.max(Math.round(drag.dx / DAY_WIDTH) * DAY_WIDTH, DAY_WIDTH / 2 - width) : 0;
    const w = width + stretch;
    const className = `${task.summary ? 'ath-gantt-summary' : 'ath-gantt-task'}${editable ? ' ath-gantt-editable' : ''}${critical && task.critical ? ' ath-gantt-critical' : ''}`;
    return (
      <g key={task.key} className={className} transform={moving ? `translate(${moving},0)` : undefined}
        {...(editable ? { tabIndex: 0, role: 'button', 'aria-label': `${summarize(task)}. ${t.edit.hint}`, onFocus: () => setSelected(task.key), onKeyDown: (e: ReactKeyboardEvent) => onBarKey(e, task), onPointerDown: (e: ReactPointerEvent) => begin(e, task, 'move') } : {})}>
        <title>{summarize(task)}</title>
        <rect className="ath-gantt-bar" x={x1} y={top} width={w} height={height} />
        {done > 0 && <rect className="ath-gantt-done" x={x1} y={top} width={(w * done) / 100} height={height} />}
        {editable && <rect className="ath-gantt-resize" x={x1 + w - 4} y={top} width="8" height={height} onPointerDown={(e) => begin(e, task, 'resize')}><title>{t.edit.resizeHandle(task.key)}</title></rect>}
        {editable && <circle className="ath-gantt-handle" cx={x1 + w + 12} cy={y + ROW_HEIGHT / 2} r="4" onPointerDown={(e) => begin(e, task, 'link')}><title>{t.edit.linkHandle(task.key)}</title></circle>}
      </g>
    );
  };

  /** Calque de la baseline : mêmes dates qu'à la baseline, en pointillés sous la barre (aucune information portée par la couleur seule). */
  const ghostOf = (task: ScheduleTask, i: number) => {
    if (!axis || !task.baselineEnd) return null;
    const y = i * ROW_HEIGHT + ROW_HEIGHT - 8;
    const x1 = xOf(axis, task.baselineStart ?? task.baselineEnd);
    const x2 = xOf(axis, task.baselineEnd) + DAY_WIDTH;
    return (
      <rect key={`ghost-${task.key}`} className="ath-gantt-baseline" x={x1} y={y} width={Math.max(x2 - x1, DAY_WIDTH / 2)} height="5" aria-hidden="true">
        <title>{t.baseline.frozen(formatDay(task.baselineStart ?? task.baselineEnd, true), formatDay(task.baselineEnd, true))}</title>
      </rect>
    );
  };

  /** Lien fin → début : sortie à droite de la barre du prédécesseur, entrée à gauche de celle du successeur. */
  const linkPath = (from: string, to: string): string | null => {
    const a = data.tasks.find((x) => x.key === from);
    const b = data.tasks.find((x) => x.key === to);
    const ia = index.get(from);
    const ib = index.get(to);
    if (!axis || !a?.plannedEnd || !b?.plannedEnd || ia === undefined || ib === undefined) return null;
    const x1 = a.milestone ? xOf(axis, a.plannedEnd) + DAY_WIDTH / 2 + ROW_HEIGHT / 2 - BAR_PAD : xOf(axis, a.plannedEnd) + DAY_WIDTH;
    const x2 = b.milestone ? xOf(axis, b.plannedEnd) + DAY_WIDTH / 2 - (ROW_HEIGHT / 2 - BAR_PAD + 2) : xOf(axis, b.plannedStart ?? b.plannedEnd);
    const y1 = ia * ROW_HEIGHT + ROW_HEIGHT / 2;
    const y2 = ib * ROW_HEIGHT + ROW_HEIGHT / 2;
    if (x2 >= x1 + 12) return `M${x1},${y1} H${x1 + 6} V${y2} H${x2}`;
    const mid = y1 + (y2 > y1 ? ROW_HEIGHT / 2 : -ROW_HEIGHT / 2);
    return `M${x1},${y1} H${x1 + 6} V${mid} H${x2 - 6} V${y2} H${x2}`;
  };

  const months: Array<{ x: number; label: string }> = [];
  const dayCells: Array<{ x: number; label: string; off: boolean }> = [];
  if (axis) {
    let lastMonth = -1;
    for (let i = 0; i < axis.days; i++) {
      const day = axis.first + i;
      const d = new Date(day * 86_400_000);
      if (d.getUTCMonth() !== lastMonth) {
        lastMonth = d.getUTCMonth();
        months.push({ x: i * DAY_WIDTH, label: d.toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
      }
      dayCells.push({ x: i * DAY_WIDTH, label: String(d.getUTCDate()), off: !isWorking(day) });
    }
  }
  const linkPreview = (() => {
    if (!drag || drag.mode !== 'link' || !axis) return null;
    const task = data.tasks.find((x) => x.key === drag.key);
    const i = index.get(drag.key);
    if (!task?.plannedEnd || i === undefined) return null;
    const sx = xOf(axis, task.plannedEnd) + DAY_WIDTH + 12;
    const sy = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    return <line className="ath-gantt-link ath-gantt-link--preview" x1={sx} y1={sy} x2={sx + drag.dx} y2={sy + drag.dy} />;
  })();
  const runs = axis ? nonWorkingRuns(axis, isWorking) : [];
  const visibleLinks = data.links.filter((l) => {
    const a = index.get(l.from);
    const b = index.get(l.to);
    return a !== undefined && b !== undefined && ((a >= from && a < to) || (b >= from && b < to));
  });

  const pickable = Boolean(edit || request);
  const picked = selected ? data.tasks.find((x) => x.key === selected) ?? null : null;
  return (
    <div className="ath-stack">
      {pickable && (
        <div className="ath-toolbar" role="toolbar" aria-label={t.edit.selectedActions}>
          {picked ? (
            <>
              <strong className="ath-mono">{picked.key}</strong>
              <span>{picked.title === picked.key ? '' : picked.title}</span>
              {edit && <Btn size="sm" variant="ghost" onClick={() => setLinking(picked.key)}>{t.edit.linkTo}</Btn>}
              {request && !edit && !picked.summary && <Btn size="sm" variant="ghost" onClick={() => setAsking(picked.key)}>{t.edit.askShift}</Btn>}
            </>
          ) : <span>{t.edit.selectHint(Boolean(edit))}</span>}
        </div>
      )}
    <div className="ath-gantt-wrap" ref={body} onScroll={onScroll} data-rows={rows.length}>
      <table className="ath-gantt-table">
        <caption className="ath-visually-hidden">{t.tableCaption}</caption>
        <thead>
          <tr><th scope="col">{t.key}</th><th scope="col">{t.titleCol}</th><th scope="col">{t.start}</th><th scope="col">{t.end}</th><th scope="col">{t.duration}</th><th scope="col">{t.progressCol}</th>{baseline && <th scope="col">{t.baseline.gap}</th>}</tr>
        </thead>
        <tbody>
          {from > 0 && <tr aria-hidden="true"><td colSpan={cols}><svg width="1" height={from * ROW_HEIGHT} /></td></tr>}
          {shown.map(({ task, depth }, k) => (
            <tr key={task.key} aria-rowindex={from + k + 2} aria-selected={pickable && selected === task.key ? true : undefined} className={`${task.summary ? 'ath-gantt-row--summary' : ''}${selected === task.key ? ' ath-row-active' : ''}`.trim() || undefined}>
              <td><Link className="ath-link ath-mono" to={`/p/${project}/a/${task.key}`} state={fromHere(location, t.title, keys)}>{task.key}</Link></td>
              <td className={indent(depth)}>{pickable && !task.summary ? <button type="button" className="ath-gantt-pick" aria-pressed={selected === task.key} onClick={() => setSelected(task.key)}>{task.title === task.key ? t.none : task.title}</button> : (task.title === task.key ? '' : task.title)}{critical && task.critical && <> <Tag variant="solid">{t.critical.tag}</Tag></>}</td>
              <td>{task.milestone ? '' : task.plannedStart ? <time dateTime={task.plannedStart}>{formatDay(task.plannedStart)}</time> : t.none}</td>
              <td>{task.plannedEnd ? <time dateTime={task.plannedEnd}>{formatDay(task.plannedEnd)}</time> : t.none}</td>
              <td>{edit && task.scheduled && !task.milestone && !task.summary
                ? <DurationCell task={task} onCommit={(duration) => edit.onChange(task.key, { duration })} />
                : task.scheduled && !task.summary ? (task.milestone ? t.milestone : t.days(task.duration)) : t.none}</td>
              <td>{task.progress !== null ? <Id>{`${task.progress} %`}</Id> : t.none}</td>
              {baseline && <td>{task.variance === null || task.variance === undefined ? t.none : <span title={task.variance === 0 ? t.baseline.onTime : task.variance > 0 ? t.baseline.gapLate(task.variance) : t.baseline.gapEarly(-task.variance)}>{t.baseline.gapValue(task.variance)}</span>}</td>}
            </tr>
          ))}
          {to < rows.length && <tr aria-hidden="true"><td colSpan={cols}><svg width="1" height={(rows.length - to) * ROW_HEIGHT} /></td></tr>}
        </tbody>
      </table>
      {axis && (
        <div className="ath-gantt-chart">
          <svg className="ath-gantt-svg ath-gantt-svg--head" width={axis.width} height={HEAD_HEIGHT} aria-hidden="true">
            {months.map((m) => <text key={m.x} className="ath-gantt-month" x={m.x + 4} y="16">{m.label}</text>)}
            {dayCells.map((d) => <text key={d.x} className={d.off ? 'ath-gantt-day ath-gantt-day--off' : 'ath-gantt-day'} x={d.x + DAY_WIDTH / 2} y="38" textAnchor="middle">{d.label}</text>)}
          </svg>
          <svg ref={svgRef} className="ath-gantt-svg" width={axis.width} height={total} role={edit ? 'group' : 'img'} aria-label={t.chartLabel(rows.length, formatDay(isoOf(axis.first), true), formatDay(isoOf(axis.first + axis.days - 1), true))}>
            <defs>
              <marker id="ath-gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path className="ath-gantt-arrowhead" d="M0,0 L8,4 L0,8 z" /></marker>
            </defs>
            {runs.map(([start, count]) => <rect key={start} className="ath-gantt-off" x={start * DAY_WIDTH} y="0" width={count * DAY_WIDTH} height={total} />)}
            {Array.from({ length: Math.max(0, to - from) }, (_, k) => <line key={k} className="ath-gantt-rule" x1="0" x2={axis.width} y1={(from + k + 1) * ROW_HEIGHT} y2={(from + k + 1) * ROW_HEIGHT} />)}
            {todayX !== null && <line className="ath-gantt-today" x1={todayX} x2={todayX} y1="0" y2={total}><title>{fr.when.today}</title></line>}
            <g aria-hidden="true">
              {visibleLinks.map((l) => { const d = linkPath(l.from, l.to); const hot = critical && data.tasks.find((x) => x.key === l.from)?.critical && data.tasks.find((x) => x.key === l.to)?.critical; return d ? <path key={`${l.from}>${l.to}`} className={hot ? 'ath-gantt-link ath-gantt-link--critical' : 'ath-gantt-link'} d={d} markerEnd="url(#ath-gantt-arrow)" /> : null; })}
            </g>
            {baseline && shown.map(({ task }, k) => ghostOf(task, from + k))}
            {shown.map(({ task }, k) => barOf(task, from + k))}
            {linkPreview}
          </svg>
        </div>
      )}
    </div>
      {edit && linking && <LinkDialog task={data.tasks.find((x) => x.key === linking)!} data={data} edit={edit} onClose={() => setLinking(null)} />}
      {request && asking && <ShiftDialog task={data.tasks.find((x) => x.key === asking)!} request={request} onClose={() => setAsking(null)} />}
    </div>
  );
}

/** Durée en jours ouvrés d'une tâche : un bouton « 2 j » qui devient un champ au clic (Entrée ou sortie du champ valide, Échap annule). */
function DurationCell({ task, onCommit }: { task: ScheduleTask; onCommit: (duration: number) => void }) {
  const [editing, setEditing] = useState(false);
  const commit = (input: HTMLInputElement) => {
    const value = Number(input.value);
    setEditing(false);
    if (Number.isInteger(value) && value >= 1 && value !== task.duration) onCommit(value);
  };
  if (!editing) return <button type="button" className="ath-gantt-pick" aria-label={t.edit.editDuration(task.key, task.duration)} onClick={() => setEditing(true)}>{t.days(task.duration)}</button>;
  return (
    <input key={`${task.key}-${task.duration}`} className="ath-input ath-gantt-duration" type="number" min={1} max={2000} defaultValue={task.duration} aria-label={t.edit.durationOf(task.key)} autoFocus
      onBlur={(e) => commit(e.currentTarget)} onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget); if (e.key === 'Escape') setEditing(false); }} />
  );
}

/** « Lier à… » : choisir la tâche qui suit, avec un décalage ; liste aussi les liens de la tâche, qu'on peut retirer. */
function LinkDialog({ task, data, edit, onClose }: { task: ScheduleTask; data: ScheduleData; edit: GanttEdit; onClose: () => void }) {
  const others = data.tasks.filter((x) => x.key !== task.key);
  const [target, setTarget] = useState(others[0]?.key ?? '');
  const [lag, setLag] = useState('0');
  const mine = data.links.filter((l) => l.from === task.key || l.to === task.key);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = Number(lag);
    if (!target || !Number.isInteger(n)) return;
    edit.onLink(task.key, target, n);
    onClose();
  };
  return (
    <Modal open title={t.edit.linkTitle(task.key)} onClose={onClose} footer={<Btn variant="ghost" onClick={onClose}>{t.edit.cancel}</Btn>}>
      <form className="ath-stack" onSubmit={submit} aria-label={t.edit.linkTitle(task.key)}>
        <label className="ath-field">
          <span className="ath-field__label">{t.edit.successor}</span>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((x) => <option key={x.key} value={x.key}>{`${x.key} ${x.title === x.key ? '' : x.title}`.trim()}</option>)}
          </Select>
        </label>
        <label className="ath-field">
          <span className="ath-field__label">{t.edit.lag}</span>
          <input className="ath-input ath-mono" type="number" min={-365} max={365} step={1} value={lag} onChange={(e) => setLag(e.target.value)} />
        </label>
        <div><Btn type="submit" disabled={!target}>{t.edit.link}</Btn></div>
      </form>
      <ul className="ath-stack" aria-label={`${t.edit.predecessors} / ${t.edit.successors}`}>
        {mine.length === 0 ? <li>{t.edit.noLinks}</li> : mine.map((l) => {
          const label = l.from === task.key ? `${t.edit.predecessors} ${l.to}` : `${t.edit.successors} ${l.from}`;
          return (
            <li key={l.id} className="ath-row">
              <span>{label}</span>
              <LagInput link={l} label={label} onCommit={(lag) => { edit.onLag(l.id, lag); onClose(); }} />
              <Btn size="sm" variant="ghost" icon="trash" aria-label={t.edit.unlink(label)} onClick={() => { edit.onUnlink(l.id); onClose(); }}>{fr.confirm.delete}</Btn>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Décalage d'un lien, en jours ouvrés (négatif : chevauchement) : modifié sur place, validé à la sortie du champ ou par Entrée. */
function LagInput({ link, label, onCommit }: { link: { lag: number }; label: string; onCommit: (lag: number) => void }) {
  const commit = (input: HTMLInputElement) => {
    const value = Number(input.value);
    if (input.value.trim() !== '' && Number.isInteger(value) && value >= -365 && value <= 365 && value !== link.lag) onCommit(value);
    else input.value = String(link.lag);
  };
  return (
    <input className="ath-input ath-mono ath-gantt-duration" type="number" min={-365} max={365} step={1} defaultValue={link.lag} aria-label={t.edit.lagOf(label)}
      onBlur={(e) => commit(e.currentTarget)} onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget); }} />
  );
}

/** « Demander un décalage » : fin souhaitée et motif ; la demande part en commentaire du ticket (mention du chef de projet). */
function ShiftDialog({ task, request, onClose }: { task: ScheduleTask; request: ShiftRequest; onClose: () => void }) {
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return;
    request.onSubmit(task.key, { end: end || null, reason: reason.trim() });
    onClose();
  };
  return (
    <Modal open title={t.edit.ask.title(task.key)} onClose={onClose} footer={<Btn variant="ghost" onClick={onClose}>{t.edit.cancel}</Btn>}>
      <form className="ath-stack" onSubmit={submit} aria-label={t.edit.ask.title(task.key)}>
        <p>{t.edit.ask.help}</p>
        <label className="ath-field">
          <span className="ath-field__label">{t.edit.ask.end}</span>
          <input className="ath-input ath-mono" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="ath-field">
          <span className="ath-field__label">{t.edit.ask.reason}</span>
          <Textarea rows={3} value={reason} required maxLength={1500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div><Btn type="submit" disabled={!reason.trim()}>{t.edit.ask.send}</Btn></div>
      </form>
    </Modal>
  );
}
