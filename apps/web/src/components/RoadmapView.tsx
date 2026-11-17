import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Checkbox, EmptyState, Select, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

export interface RoadmapPhaseData {
  key: string; name: string; review: string; offTemplate: boolean; current: boolean; plannedStart: string | null; plannedEnd: string | null;
  reviewPlannedOn: string | null; reviewHeldOn: string | null; decision: string | null; undated: boolean; heldLate: boolean;
}
export interface RoadmapProjectData {
  key: string; name: string; lifecycle: { key: string; name: string; category: string }; plannedStart: string | null; plannedEnd: string | null; calculatedEnd: string | null;
  baseline: { name: string; end: string; gapDays: number | null } | null; phases: RoadmapPhaseData[];
  releases: Array<{ name: string; startsOn: string; endsOn: string; state: string }>; unscheduled: boolean;
}
export interface RoadmapData { portfolio: { key: string; name: string }; projects: RoadmapProjectData[]; baselines?: string[]; hiddenByState: number }

const DAY_MS = 86_400_000;
const num = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const ZOOMS = [{ id: 'year', px: 1.2 }, { id: 'quarter', px: 3 }, { id: 'month', px: 7 }] as const;
const LABEL_W = 180;
const ROW_H = 44;
const HEAD_H = 28;
/** Milieu de la barre du projet dans son couloir. */
const BAR_Y = 8;
const BAR_H = 8;
const PHASE_Y = 20;
const PHASE_H = 14;

type View = 'timeline' | 'table' | 'milestones';

/** Jalons d'un projet : revues (prévue, tenue) et versions, pour la vue jalons et pour la vue tableau. */
export function milestonesOf(p: RoadmapProjectData): Array<{ project: string; kind: 'review' | 'release'; label: string; planned: string | null; actual: string | null; late: boolean }> {
  const reviews = p.phases.filter((ph) => !ph.offTemplate && (ph.reviewPlannedOn || ph.reviewHeldOn)).map((ph) => ({
    project: p.key, kind: 'review' as const, label: ph.review ? ph.review.toUpperCase() : ph.name, planned: ph.reviewPlannedOn, actual: ph.reviewHeldOn, late: ph.heldLate,
  }));
  const releases = p.releases.map((r) => ({ project: p.key, kind: 'release' as const, label: r.name, planned: r.endsOn, actual: r.state === 'released' ? r.endsOn : null, late: false }));
  return [...reviews, ...releases].sort((a, b) => (a.planned ?? a.actual ?? '').localeCompare(b.planned ?? b.actual ?? ''));
}

/** Roadmap d'un portefeuille (lot 19, B27 et B28) : couloirs, chevrons de phase, losanges de revue, versions, baseline fantôme ; vues tableau et jalons. */
export function RoadmapView({ portfolio, today = new Date() }: { portfolio: string; today?: Date }) {
  const t = fr.pfRoadmap;
  const fail = useFailure();
  const [data, setData] = useState<RoadmapData | null>(null);
  const [view, setView] = useState<View>('timeline');
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]['id']>('quarter');
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState(false);
  const [baseline, setBaseline] = useState('');
  useEffect(() => {
    setError(false);
    const q = new URLSearchParams({ ...(closed ? { includeClosed: '1' } : {}), ...(baseline ? { baseline } : {}) });
    api<RoadmapData>('GET', `/v1/portfolios/${portfolio}/roadmap${q.size ? `?${q}` : ''}`).then((d) => setData(d && Array.isArray(d.projects) ? d : null)).catch((e) => { setError(true); fail(e); });
  }, [portfolio, closed, baseline, fail]);

  const range = useMemo(() => {
    const days: number[] = [];
    for (const p of data?.projects ?? []) {
      for (const d of [p.plannedStart, p.plannedEnd, p.calculatedEnd, p.baseline?.end]) if (d) days.push(num(d));
      for (const ph of p.phases) for (const d of [ph.plannedStart, ph.plannedEnd, ph.reviewPlannedOn, ph.reviewHeldOn]) if (d) days.push(num(d));
      for (const r of p.releases) days.push(num(r.startsOn), num(r.endsOn));
    }
    const todayN = Math.floor(today.getTime() / DAY_MS);
    return days.length ? { min: Math.min(...days, todayN) - 14, max: Math.max(...days, todayN) + 14 } : { min: todayN - 30, max: todayN + 90 };
  }, [data, today]);

  if (error) return <Card title={t.title}><p role="alert">{t.degraded}</p></Card>;
  if (!data) return <p role="status">{fr.loading}</p>;
  const px = ZOOMS.find((z) => z.id === zoom)!.px;
  const x = (iso: string) => LABEL_W + (num(iso) - range.min) * px;
  const width = LABEL_W + (range.max - range.min) * px;
  const todayX = LABEL_W + (Math.floor(today.getTime() / DAY_MS) - range.min) * px;
  const months: Array<{ x: number; label: string }> = [];
  for (let d = new Date(range.min * DAY_MS); d.getTime() <= range.max * DAY_MS; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    months.push({ x: LABEL_W + (Math.floor(d.getTime() / DAY_MS) - range.min) * px, label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
  }
  const list = data.projects;
  const milestones = list.flatMap(milestonesOf).sort((a, b) => (a.planned ?? a.actual ?? '').localeCompare(b.planned ?? b.actual ?? ''));
  const gap = (g: number | null) => (g === null ? t.noGap : g === 0 ? t.onTrack : t.gapDays(g));

  return (
    <div className="ath-stack">
      <div className="ath-toolbar" role="group" aria-label={t.viewLabel}>
        {(['timeline', 'table', 'milestones'] as const).map((v) => <Btn key={v} size="sm" variant={view === v ? 'primary' : 'ghost'} aria-pressed={view === v} onClick={() => setView(v)}>{t.views[v]}</Btn>)}
        {view === 'timeline' && ZOOMS.map((z) => <Btn key={z.id} size="sm" variant={zoom === z.id ? 'primary' : 'ghost'} aria-pressed={zoom === z.id} onClick={() => setZoom(z.id)}>{t.zooms[z.id]}</Btn>)}
        <label className="ath-notify__pref"><Checkbox checked={closed} onChange={(e) => setClosed(e.target.checked)} />{t.includeClosed}</label>
        {(data.baselines?.length ?? 0) > 0 && (
          <>
            <label className="ath-field__label" htmlFor="rm-baseline">{t.baselineChoice}</label>
            <Select id="rm-baseline" value={baseline} onChange={(e) => setBaseline(e.target.value)}>
              <option value="">{t.latestBaseline}</option>
              {data.baselines!.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </>
        )}
        {view === 'milestones' && <Btn size="sm" variant="ghost" onClick={() => window.print()}>{t.print}</Btn>}
      </div>
      <p>{t.scope}{data.hiddenByState > 0 && !closed ? ` · ${t.hidden(data.hiddenByState)}` : ''}</p>
      {list.length === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : view === 'timeline' ? (
        <div className="ath-roadmap-scroll">
          <svg className="ath-roadmap" width={width} height={HEAD_H + list.length * ROW_H} role="img" aria-label={t.caption(list.length)}>
            {months.map((m) => <g key={m.x}><line className="ath-gantt-rule" x1={m.x} x2={m.x} y1={0} y2={HEAD_H + list.length * ROW_H} /><text className="ath-gantt-month" x={m.x + 3} y={16}>{m.label}</text></g>)}
            <line className="ath-roadmap-today" x1={todayX} x2={todayX} y1={0} y2={HEAD_H + list.length * ROW_H}><title>{t.today}</title></line>
            {list.map((p, i) => {
              const top = HEAD_H + i * ROW_H;
              return (
                <g key={p.key} transform={`translate(0 ${top})`}>
                  <line className="ath-gantt-rule" x1={0} x2={width} y1={ROW_H} y2={ROW_H} />
                  <text className="ath-roadmap-label" x={4} y={18}>{p.key}</text>
                  <text className="ath-roadmap-sub" x={4} y={34}>{p.unscheduled ? t.unscheduled : p.lifecycle.name}</text>
                  {p.plannedStart && p.plannedEnd && <rect className="ath-roadmap-bar" x={x(p.plannedStart)} y={BAR_Y} width={Math.max(2, x(p.plannedEnd) - x(p.plannedStart))} height={BAR_H}><title>{`${p.key} : ${formatDay(p.plannedStart, true)} → ${formatDay(p.plannedEnd, true)}`}</title></rect>}
                  {p.baseline && p.plannedStart && <rect className="ath-roadmap-ghost" x={x(p.plannedStart)} y={BAR_Y + BAR_H + 1} width={Math.max(2, x(p.baseline.end) - x(p.plannedStart))} height={3}><title>{`${t.baseline} ${p.baseline.name} : ${formatDay(p.baseline.end, true)} · ${gap(p.baseline.gapDays)}`}</title></rect>}
                  {p.calculatedEnd && p.plannedEnd && p.calculatedEnd > p.plannedEnd && <polygon className="ath-roadmap-calc" points={`${x(p.calculatedEnd)},${BAR_Y - 2} ${x(p.calculatedEnd) + 5},${BAR_Y + 4} ${x(p.calculatedEnd)},${BAR_Y + 10}`}><title>{`${t.calculatedEnd} : ${formatDay(p.calculatedEnd, true)}`}</title></polygon>}
                  {p.phases.filter((ph) => !ph.offTemplate && ph.plannedStart && ph.plannedEnd).map((ph) => {
                    const a = x(ph.plannedStart!); const b = Math.max(a + 6, x(ph.plannedEnd!));
                    return <polygon key={ph.key} className={`ath-roadmap-phase${ph.current ? ' ath-roadmap-phase--current' : ''}`} points={`${a},${PHASE_Y} ${b - 5},${PHASE_Y} ${b},${PHASE_Y + PHASE_H / 2} ${b - 5},${PHASE_Y + PHASE_H} ${a},${PHASE_Y + PHASE_H}`}><title>{`${ph.name} : ${formatDay(ph.plannedStart, true)} → ${formatDay(ph.plannedEnd, true)}`}</title></polygon>;
                  })}
                  {p.phases.filter((ph) => !ph.offTemplate && ph.reviewPlannedOn).map((ph) => {
                    const cx = x(ph.reviewPlannedOn!);
                    return <polygon key={`r-${ph.key}`} className={`ath-roadmap-review${ph.reviewHeldOn ? ' ath-roadmap-review--held' : ''}${ph.heldLate ? ' ath-roadmap-review--late' : ''}`} points={`${cx},${PHASE_Y + 1} ${cx + 6},${PHASE_Y + 8} ${cx},${PHASE_Y + 15} ${cx - 6},${PHASE_Y + 8}`}><title>{`${ph.review.toUpperCase() || ph.name} : ${formatDay(ph.reviewPlannedOn, true)}${ph.heldLate ? ` · ${t.heldLate}` : ''}`}</title></polygon>;
                  })}
                  {p.releases.map((r) => <rect key={r.name} className="ath-roadmap-release" x={x(r.endsOn) - 3} y={BAR_Y + BAR_H + 6} width={6} height={6}><title>{`${r.name} : ${formatDay(r.endsOn, true)}`}</title></rect>)}
                </g>
              );
            })}
          </svg>
        </div>
      ) : view === 'table' ? (
        <Table caption={t.caption(list.length)}>
          <thead><tr><Th>{fr.steer.project}</Th><Th>{t.state}</Th><Th>{t.plannedEnd}</Th><Th>{t.calculatedEnd}</Th><Th>{t.baseline}</Th><Th>{t.gap}</Th><Th>{t.phase}</Th><Th>{t.nextReview}</Th></tr></thead>
          <tbody>{list.map((p) => {
            const cur = p.phases.find((ph) => ph.current);
            return (
              <tr key={p.key}>
                <Td mono><Link className="ath-link" to={`/p/${p.key}`}>{p.key}</Link> <span>{p.name}</span></Td><Td>{p.lifecycle.name}</Td>
                <Td>{p.plannedEnd ? formatDay(p.plannedEnd, true) : t.notSet}</Td><Td>{p.calculatedEnd ? formatDay(p.calculatedEnd, true) : t.notSet}</Td>
                <Td>{p.baseline ? `${p.baseline.name} · ${formatDay(p.baseline.end, true)}` : t.notSet}</Td><Td mono>{p.baseline ? gap(p.baseline.gapDays) : t.notSet}</Td>
                <Td>{cur ? <Link className="ath-link" to={`/p/${p.key}`}>{cur.name}</Link> : t.notSet}</Td><Td>{cur?.reviewPlannedOn ? formatDay(cur.reviewPlannedOn, true) : t.notSet}</Td>
              </tr>
            );
          })}</tbody>
        </Table>
      ) : (
        <Table caption={t.milestonesCaption(milestones.length)}>
          <thead><tr><Th>{fr.steer.project}</Th><Th>{t.kind}</Th><Th>{t.milestone}</Th><Th>{t.planned}</Th><Th>{t.actual}</Th><Th>{t.deviation}</Th></tr></thead>
          <tbody>{milestones.map((m, i) => (
            <tr key={`${m.project}-${m.kind}-${m.label}-${i}`}>
              <Td mono><Link className="ath-link" to={m.kind === 'release' ? `/p/${m.project}/planning?vue=versions` : `/p/${m.project}`}>{m.project}</Link></Td><Td>{t.kinds[m.kind]}</Td><Td>{m.label}</Td>
              <Td>{m.planned ? formatDay(m.planned, true) : t.notSet}</Td><Td>{m.actual ? formatDay(m.actual, true) : t.notHeld}</Td><Td>{m.late ? t.heldLate : m.actual ? t.onTrack : '—'}</Td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </div>
  );
}
