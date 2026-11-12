import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Id } from '@athena/ui';
import { fr, getLocale } from '../i18n';
import { formatDay } from '../lib/dates';
import { fromHere } from '../lib/origin';
import {
  DAY_WIDTH, HEAD_HEIGHT, ROW_HEIGHT, axisOf, dayNumber, isoOf, nonWorkingRuns, visibleWindow, workingPredicate, wbsOrder, xOf,
  type CalendarData, type ScheduleData, type ScheduleTask,
} from '../lib/schedule';

const t = fr.planning;
const BAR_PAD = 6;

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
export function ScheduleGantt({ project, data, calendar, today = new Date() }: { project: string; data: ScheduleData; calendar: CalendarData | null; today?: Date }) {
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

  const onScroll = () => {
    const el = body.current;
    if (el) setScroll({ top: el.scrollTop, height: el.clientHeight || 600 });
  };

  if (rows.length === 0) return null;
  const isWorking = workingPredicate(calendar);
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
      return (
        <g key={task.key} className="ath-gantt-milestone">
          <title>{summarize(task)}</title>
          <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} />
        </g>
      );
    }
    if (!task.plannedStart) return null;
    const x1 = xOf(axis, task.plannedStart);
    const width = Math.max(x2 - x1, DAY_WIDTH / 2);
    const done = Math.min(100, Math.max(0, task.progress ?? 0));
    const height = task.summary ? ROW_HEIGHT / 2 - BAR_PAD / 2 : ROW_HEIGHT - 2 * BAR_PAD;
    const top = y + (ROW_HEIGHT - height) / 2;
    return (
      <g key={task.key} className={task.summary ? 'ath-gantt-summary' : 'ath-gantt-task'}>
        <title>{summarize(task)}</title>
        <rect className="ath-gantt-bar" x={x1} y={top} width={width} height={height} />
        {done > 0 && <rect className="ath-gantt-done" x={x1} y={top} width={(width * done) / 100} height={height} />}
      </g>
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
  const runs = axis ? nonWorkingRuns(axis, isWorking) : [];
  const visibleLinks = data.links.filter((l) => {
    const a = index.get(l.from);
    const b = index.get(l.to);
    return a !== undefined && b !== undefined && ((a >= from && a < to) || (b >= from && b < to));
  });

  return (
    <div className="ath-gantt-wrap" ref={body} onScroll={onScroll} data-rows={rows.length}>
      <table className="ath-gantt-table">
        <caption className="ath-visually-hidden">{t.tableCaption}</caption>
        <thead>
          <tr><th scope="col">{t.key}</th><th scope="col">{t.titleCol}</th><th scope="col">{t.start}</th><th scope="col">{t.end}</th><th scope="col">{t.duration}</th><th scope="col">{t.progressCol}</th></tr>
        </thead>
        <tbody>
          {from > 0 && <tr aria-hidden="true"><td colSpan={6}><svg width="1" height={from * ROW_HEIGHT} /></td></tr>}
          {shown.map(({ task, depth }, k) => (
            <tr key={task.key} aria-rowindex={from + k + 2} className={task.summary ? 'ath-gantt-row--summary' : undefined}>
              <td><Link className="ath-link ath-mono" to={`/p/${project}/a/${task.key}`} state={fromHere(location, t.title, keys)}>{task.key}</Link></td>
              <td className={indent(depth)}>{task.title === task.key ? '' : task.title}</td>
              <td>{task.milestone ? '' : task.plannedStart ? <time dateTime={task.plannedStart}>{formatDay(task.plannedStart)}</time> : t.none}</td>
              <td>{task.plannedEnd ? <time dateTime={task.plannedEnd}>{formatDay(task.plannedEnd)}</time> : t.none}</td>
              <td>{task.scheduled ? (task.milestone ? t.milestone : t.days(task.duration)) : t.none}</td>
              <td>{task.progress !== null ? <Id>{`${task.progress} %`}</Id> : t.none}</td>
            </tr>
          ))}
          {to < rows.length && <tr aria-hidden="true"><td colSpan={6}><svg width="1" height={(rows.length - to) * ROW_HEIGHT} /></td></tr>}
        </tbody>
      </table>
      {axis && (
        <div className="ath-gantt-chart">
          <svg className="ath-gantt-svg ath-gantt-svg--head" width={axis.width} height={HEAD_HEIGHT} aria-hidden="true">
            {months.map((m) => <text key={m.x} className="ath-gantt-month" x={m.x + 4} y="16">{m.label}</text>)}
            {dayCells.map((d) => <text key={d.x} className={d.off ? 'ath-gantt-day ath-gantt-day--off' : 'ath-gantt-day'} x={d.x + DAY_WIDTH / 2} y="38" textAnchor="middle">{d.label}</text>)}
          </svg>
          <svg className="ath-gantt-svg" width={axis.width} height={total} role="img" aria-label={t.chartLabel(rows.length, formatDay(isoOf(axis.first), true), formatDay(isoOf(axis.first + axis.days - 1), true))}>
            <defs>
              <marker id="ath-gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path className="ath-gantt-arrowhead" d="M0,0 L8,4 L0,8 z" /></marker>
            </defs>
            {runs.map(([start, count]) => <rect key={start} className="ath-gantt-off" x={start * DAY_WIDTH} y="0" width={count * DAY_WIDTH} height={total} />)}
            {Array.from({ length: Math.max(0, to - from) }, (_, k) => <line key={k} className="ath-gantt-rule" x1="0" x2={axis.width} y1={(from + k + 1) * ROW_HEIGHT} y2={(from + k + 1) * ROW_HEIGHT} />)}
            {todayX !== null && <line className="ath-gantt-today" x1={todayX} x2={todayX} y1="0" y2={total}><title>{fr.when.today}</title></line>}
            <g aria-hidden="true">
              {visibleLinks.map((l) => { const d = linkPath(l.from, l.to); return d ? <path key={`${l.from}>${l.to}`} className="ath-gantt-link" d={d} markerEnd="url(#ath-gantt-arrow)" /> : null; })}
            </g>
            {shown.map(({ task }, k) => barOf(task, from + k))}
          </svg>
        </div>
      )}
    </div>
  );
}
