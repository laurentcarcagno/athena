import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Chart, Select, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

interface GateRow { project: string; name: string; phase: string; phaseName: string; review: string; reviewPlannedOn: string | null; reviewHeldOn: string | null; decision: string | null; canAdvance: boolean; criteria: { total: number; met: number; manualPending: number; automaticRemaining: number } }
interface RiskMatrix { cells: Array<{ probability: number; impact: number; count: number }>; top: Array<{ key: string; project: string; probability: number; impact: number; criticality: number }>; total: number }
interface ActionTracking { projects: Array<{ project: string; open: number; late: number; closed: number }>; overdue: Array<{ key: string; project: string; due: string; assignee: string | null }> }
interface Series { phase: string; field: 'planned_end' | 'review_planned_on'; points: Array<{ at: string; planned: string }> }

const DAY = 86_400_000;
const num = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
/** Palier d'une case de la matrice (mêmes seuils que le rapport Risques : faible 1-4, modéré 5-9, élevé 10-16, critique 20-25). */
const band = (score: number): 'low' | 'moderate' | 'high' | 'critical' => (score >= 20 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'moderate' : 'low');

/** Série du graphique de tendance : une ligne par jalon, valeur = date prévue en jours depuis la première date prévue, reportée d'un relevé au suivant. */
export function trendChart(series: Series[]): { categories: string[]; series: Array<{ name: string; data: number[] }> } {
  const categories = [...new Set(series.flatMap((s) => s.points.map((p) => p.at)))].sort();
  const origin = Math.min(...series.flatMap((s) => s.points.map((p) => num(p.planned))));
  return {
    categories,
    series: series.map((s) => {
      let last = 0;
      const data = categories.map((at) => { const p = [...s.points].reverse().find((q) => q.at <= at); if (p) last = num(p.planned) - origin; return p ? last : Number.NaN; });
      return { name: `${s.phase} · ${fr.governance.fields[s.field]}`, data: data.map((v) => (Number.isNaN(v) ? 0 : v)) };
    }),
  };
}

/** Gouvernance d'un portefeuille (lot 20, B34) : passage des gates, matrice des risques, suivi des actions, tendance des jalons d'un projet. */
export function GovernancePanel({ portfolio, projects }: { portfolio: string; projects: string[] }) {
  const t = fr.governance;
  const [gates, setGates] = useState<GateRow[] | null>(null);
  const [risks, setRisks] = useState<RiskMatrix | null>(null);
  const [actions, setActions] = useState<ActionTracking | null>(null);
  const [project, setProject] = useState('');
  const [series, setSeries] = useState<Series[]>([]);
  useEffect(() => {
    api<{ rows: GateRow[] }>('GET', `/v1/portfolios/${portfolio}/gates`).then((r) => setGates(Array.isArray(r?.rows) ? r.rows : [])).catch(() => setGates([]));
    api<RiskMatrix>('GET', `/v1/portfolios/${portfolio}/risks`).then((r) => setRisks(r && Array.isArray(r.cells) ? r : null)).catch(() => setRisks(null));
    api<ActionTracking>('GET', `/v1/portfolios/${portfolio}/actions`).then((r) => setActions(r && Array.isArray(r.projects) ? r : null)).catch(() => setActions(null));
  }, [portfolio]);
  useEffect(() => {
    if (!project) { setSeries([]); return; }
    api<{ series: Series[] }>('GET', `/v1/portfolios/${portfolio}/milestone-trend/${project}`).then((r) => setSeries(Array.isArray(r?.series) ? r.series : [])).catch(() => setSeries([]));
  }, [portfolio, project]);
  const chart = useMemo(() => (series.length ? trendChart(series) : null), [series]);
  const cell = (p: number, i: number) => risks?.cells.find((c) => c.probability === p && c.impact === i)?.count ?? 0;

  return (
    <div className="ath-stack">
      <Card title={t.gates}>
        {gates === null ? <p role="status">{fr.loading}</p> : gates.length === 0 ? <p>{t.noGates}</p> : (
          <Table caption={t.gatesCaption(gates.length)}>
            <thead><tr><Th>{fr.steer.project}</Th><Th>{t.gate}</Th><Th>{t.review}</Th><Th>{t.criteria}</Th><Th>{t.ready}</Th></tr></thead>
            <tbody>{gates.map((g) => (
              <tr key={g.project}>
                <Td mono><Link className="ath-link" to={`/p/${g.project}`}>{g.project}</Link></Td><Td>{g.phaseName}</Td>
                <Td>{g.review ? g.review.toUpperCase() : '—'} · {g.reviewPlannedOn ? formatDay(g.reviewPlannedOn, true) : t.notDated}{g.reviewHeldOn ? ` · ${t.held(formatDay(g.reviewHeldOn, true))}` : ''}</Td>
                <Td mono>{g.criteria.met}/{g.criteria.total}{g.criteria.manualPending > 0 ? ` · ${t.manualPending(g.criteria.manualPending)}` : ''}{g.criteria.automaticRemaining > 0 ? ` · ${t.remaining(g.criteria.automaticRemaining)}` : ''}</Td>
                <Td>{g.canAdvance ? t.yes : t.no}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <Card title={t.riskMatrix}>
        {risks === null ? <p>{t.unavailable}</p> : risks.total === 0 ? <p>{t.noRisks}</p> : (
          <div className="ath-stack">
            <table className="ath-matrix" aria-label={t.matrixCaption(risks.total)}>
              <thead><tr><th scope="col">{t.probabilityImpact}</th>{[1, 2, 3, 4, 5].map((i) => <th key={i} scope="col">{t.impact} {i}</th>)}</tr></thead>
              <tbody>{[5, 4, 3, 2, 1].map((p) => (
                <tr key={p}><th scope="row">{t.probability} {p}</th>{[1, 2, 3, 4, 5].map((i) => {
                  const n = cell(p, i);
                  return <td key={i} className={`ath-matrix__cell ath-matrix__cell--${band(p * i)}`}>{n > 0 ? <strong>{n}</strong> : <span aria-hidden="true">·</span>}<span className="ath-visually-hidden">{t.cellLabel(p, i, n, t.bands[band(p * i)]!)}</span></td>;
                })}</tr>
              ))}</tbody>
            </table>
            <ul>{risks.top.slice(0, 5).map((r) => <li key={r.key}><Link className="ath-link ath-mono" to={`/p/${r.project}/a/${r.key}`}>{r.key}</Link> · {t.criticality} <strong className="ath-mono">{r.criticality}</strong> ({r.probability} × {r.impact})</li>)}</ul>
          </div>
        )}
      </Card>
      <Card title={t.actions}>
        {actions === null ? <p>{t.unavailable}</p> : actions.projects.length === 0 ? <p>{t.noActions}</p> : (
          <>
            <Table caption={t.actionsCaption(actions.projects.length)}>
              <thead><tr><Th>{fr.steer.project}</Th><Th>{t.open}</Th><Th>{fr.steer.late}</Th><Th>{t.closed}</Th></tr></thead>
              <tbody>{actions.projects.map((a) => <tr key={a.project}><Td mono><Link className="ath-link" to={`/p/${a.project}/recherche?q=${encodeURIComponent('type = action AND category != done')}`}>{a.project}</Link></Td><Td mono>{a.open}</Td><Td mono>{a.late}</Td><Td mono>{a.closed}</Td></tr>)}</tbody>
            </Table>
            {actions.overdue.length > 0 && <ul>{actions.overdue.slice(0, 8).map((o) => <li key={o.key}><Link className="ath-link ath-mono" to={`/p/${o.project}/a/${o.key}`}>{o.key}</Link> · {t.dueOn(formatDay(o.due, true))}{o.assignee ? ` · ${o.assignee}` : ''}</li>)}</ul>}
          </>
        )}
      </Card>
      <Card title={t.trend}>
        <div className="ath-toolbar">
          <label className="ath-field__label" htmlFor="gov-project">{t.trendProject}</label>
          <Select id="gov-project" value={project} onChange={(e) => setProject(e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
        </div>
        {project && (chart ? <Chart type="line" title={t.trendTitle(project)} unit={t.trendUnit} categories={chart.categories} series={chart.series} /> : <p>{t.noTrend}</p>)}
      </Card>
    </div>
  );
}
