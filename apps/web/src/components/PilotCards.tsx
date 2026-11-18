import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { fr, getLocale } from '../i18n';
import { formatDay } from '../lib/dates';
import { WidgetEmpty, useData } from './WidgetCards';
import { milestonesOf, type RoadmapData } from './RoadmapView';
import type { PhaseEntry } from './PhaseTimeline';

/**
 * Cartes des gabarits de tableaux de bord (lot 27, ADR-0010, N1 à N9) : finances, charge et capacité, feuille de route, phase et revue, portes et décisions,
 * demandes, risques, état de la plateforme. Elles lisent les routes des pages correspondantes, sous les droits de la personne, et mènent à ces pages.
 * Chacune a un état de chargement, un état vide et un état d'erreur.
 */
const t = fr.pilot;
const DAY_MS = 86_400_000;
const today = () => new Date().toISOString().split('T')[0]!;
const plus = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().split('T')[0]!;
const euro = (n: number) => new Intl.NumberFormat(getLocale() === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const day = (iso: string | null) => (iso ? <time dateTime={iso}>{formatDay(iso, true)}</time> : null);

/** Portefeuilles que la personne peut poser, avec leurs projets (une lecture partagée par toutes les cartes). */
let portfoliosCache: Promise<Array<{ key: string; name: string; projects: string[] }>> | null = null;
export const resetPortfoliosCache = () => { portfoliosCache = null; };
const loadPortfolios = () => (portfoliosCache ??= api<{ portfolios: Array<{ key: string; name: string; projects: string[] }> }>('GET', '/v1/me/dashboard/portfolios')
  .then((r) => (Array.isArray(r?.portfolios) ? r.portfolios : [])).catch(() => { portfoliosCache = null; return []; }));

/** Projets d'un portefeuille : `undefined` sans portefeuille, `null` pendant le chargement, sinon la liste de leurs clés. */
export function usePortfolioProjects(portfolio: string | undefined): string[] | null | undefined {
  const [projects, setProjects] = useState<string[] | null>(null);
  useEffect(() => {
    if (!portfolio) return;
    let live = true;
    setProjects(null);
    void loadPortfolios().then((all) => { if (live) setProjects(all.find((p) => p.key === portfolio)?.projects ?? []); });
    return () => { live = false; };
  }, [portfolio]);
  return portfolio ? projects : undefined;
}

const Unavailable = () => <p>{t.unavailable}</p>;
const Loading = () => <p role="status">{fr.loading}</p>;

// ------------------------------------------------------------------------------------------------ finances (N1, N2)
interface Totals { budget: number; committed: number; actual: number; forecast: number; eac: number; variance: number }
interface Finance { project: string; lines: Array<{ category: string } & Totals>; totals: Totals; alerts: Array<{ kind: string }>; curve: Array<{ period: string; actualCumulative: number; forecastCumulative: number }> }

/** Finances d'un projet (N2) : budget, engagé, réel, prévision à terminaison, écart ; courbe cumulée prévu / réel. */
export function ProjectFinanceCard({ project }: { project: string }) {
  const data = useData<Finance>(project ? `/v1/finance/projects/${project}` : null);
  if (data === undefined) return <Loading />;
  if (data === null || !data.totals) return <Unavailable />;
  const tt = data.totals;
  if (data.lines.length === 0) return <WidgetEmpty text={t.finance.none} action={t.finance.open} to="/finances" />;
  return (
    <div className="ath-stack">
      <dl className="ath-facts">
        <div className="ath-facts__item"><dt>{t.finance.budget}</dt><dd>{euro(tt.budget)}</dd></div>
        <div className="ath-facts__item"><dt>{t.finance.committed}</dt><dd>{euro(tt.committed)}</dd></div>
        <div className="ath-facts__item"><dt>{t.finance.actual}</dt><dd>{euro(tt.actual)}</dd></div>
        <div className="ath-facts__item"><dt>{t.finance.eac}</dt><dd>{euro(tt.eac)}</dd></div>
        <div className="ath-facts__item"><dt>{t.finance.variance}</dt><dd className={tt.variance < 0 ? 'ath-text-danger' : undefined}>{euro(tt.variance)}{tt.variance < 0 ? ` · ${t.finance.over}` : ''}</dd></div>
      </dl>
      {data.curve.length > 1 && <Chart type="line" title={t.finance.curve} unit="€" categories={data.curve.map((c) => c.period)} series={[{ name: t.finance.actualCumulative, data: data.curve.map((c) => c.actualCumulative) }, { name: t.finance.forecastCumulative, data: data.curve.map((c) => c.forecastCumulative) }]} />}
      <Link className="ath-link" to="/finances">{t.finance.open}</Link>
    </div>
  );
}

/** Finances d'un portefeuille (N1) : une ligne par projet, total en pied. */
export function PortfolioFinanceCard({ portfolio }: { portfolio: string }) {
  const projects = usePortfolioProjects(portfolio);
  const [rows, setRows] = useState<Finance[] | null | undefined>(undefined);
  useEffect(() => {
    if (!projects) return;
    let live = true;
    setRows(undefined);
    void Promise.all(projects.map((p) => api<Finance>('GET', `/v1/finance/projects/${p}`).catch(() => null))).then((all) => { if (live) setRows(all.filter((f): f is Finance => !!f && Array.isArray(f.lines))); });
    return () => { live = false; };
  }, [projects]);
  if (!portfolio || projects === null || (projects && rows === undefined)) return <Loading />;
  if (!projects || rows === null || rows === undefined) return <Unavailable />;
  if (rows.length === 0) return <WidgetEmpty text={t.finance.none} action={t.finance.open} to="/finances" />;
  const sum = (k: keyof Totals) => rows.reduce((n, r) => n + r.totals[k], 0);
  return (
    <div className="ath-stack">
      <Table caption={t.finance.portfolioCaption(portfolio)}>
        <thead><tr><Th>{t.finance.project}</Th><Th>{t.finance.budget}</Th><Th>{t.finance.committed}</Th><Th>{t.finance.actual}</Th><Th>{t.finance.eac}</Th><Th>{t.finance.variance}</Th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.project}><Td mono>{r.project}</Td><Td mono>{euro(r.totals.budget)}</Td><Td mono>{euro(r.totals.committed)}</Td><Td mono>{euro(r.totals.actual)}</Td><Td mono>{euro(r.totals.eac)}</Td>
            <Td mono>{euro(r.totals.variance)}{r.totals.variance < 0 ? ` · ${t.finance.over}` : ''}</Td></tr>
        ))}</tbody>
        <tfoot><tr><Th>{t.finance.total}</Th><Td mono>{euro(sum('budget'))}</Td><Td mono>{euro(sum('committed'))}</Td><Td mono>{euro(sum('actual'))}</Td><Td mono>{euro(sum('eac'))}</Td><Td mono>{euro(sum('variance'))}</Td></tr></tfoot>
      </Table>
      <Link className="ath-link" to="/finances">{t.finance.open}</Link>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ charge et capacité (N3)
type Level = 'free' | 'normal' | 'tight' | 'overload';
interface CapacityView {
  periods: Array<{ key: string; from: string; to: string }>;
  teams: Array<{ team: string; name: string; cells: Array<{ period: string; capacityMinutes: number; nominativeMinutes: number; genericMinutes: number; freeMinutes: number; level: Level }> }>;
  bottlenecks: Array<{ team: string; name: string; period: string; saturationPercent: number; projects: Array<{ project: string; minutes: number }> }>;
}

/** Charge contre capacité sur douze semaines, surcharges signalées. Sans projet ni portefeuille : les équipes que la personne voit. */
export function CapacityCard({ project, portfolio }: { project?: string; portfolio?: string }) {
  const portfolioProjects = usePortfolioProjects(project ? undefined : portfolio);
  const query = useMemo(() => `/v1/capacity?from=${today()}&to=${plus(83)}&granularity=week`, []);
  const view = useData<CapacityView>(portfolioProjects === null ? null : query);
  if (view === undefined || portfolioProjects === null) return <Loading />;
  if (view === null || !Array.isArray(view.teams)) return <Unavailable />;
  const scope = project ? [project] : portfolioProjects ?? null;
  const bottlenecks = view.bottlenecks.filter((b) => !scope || b.projects.some((p) => scope.includes(p.project)));
  const inScope = new Set(bottlenecks.map((b) => b.team));
  const teams = view.teams.filter((tm) => !scope || inScope.has(tm.team));
  if (teams.length === 0) return <WidgetEmpty text={scope ? t.capacity.noneScope : t.capacity.none} action={t.capacity.open} to="/capacite" />;
  const peak = (tm: CapacityView['teams'][number]) => Math.max(0, ...tm.cells.map((c) => (c.capacityMinutes > 0 ? Math.round(((c.capacityMinutes - c.freeMinutes) / c.capacityMinutes) * 100) : 0)));
  return (
    <div className="ath-stack">
      <Table caption={t.capacity.caption}>
        <thead><tr><Th>{t.capacity.team}</Th><Th>{t.capacity.peak}</Th><Th>{t.capacity.overloaded}</Th></tr></thead>
        <tbody>{teams.map((tm) => {
          const over = tm.cells.filter((c) => c.level === 'overload').length;
          return <tr key={tm.team}><Td>{tm.name}</Td><Td mono>{peak(tm)} %</Td><Td>{over > 0 ? t.capacity.weeks(over) : t.capacity.noOverload}</Td></tr>;
        })}</tbody>
      </Table>
      {bottlenecks.length > 0 && (
        <ul className="ath-stack">{bottlenecks.slice(0, 4).map((b) => (
          <li key={`${b.team}-${b.period}`} className="ath-row"><span>{b.name}</span><span className="ath-mono">{b.period}</span><span>{t.capacity.saturation(b.saturationPercent)}</span></li>
        ))}</ul>
      )}
      <Link className="ath-link" to="/capacite">{t.capacity.open}</Link>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ feuille de route (N4)
interface Ms { project: string; kind: 'review' | 'release'; label: string; planned: string | null; actual: string | null; late: boolean }

/** Jalons des quatre-vingt-dix prochains jours (revues et versions), les retards d'abord signalés. */
export function RoadmapCard({ project, portfolio }: { project?: string; portfolio?: string }) {
  const portfolioData = useData<RoadmapData>(!project && portfolio ? `/v1/portfolios/${portfolio}/roadmap` : null);
  const releases = useData<Array<{ name: string; endsOn: string; state: string }>>(project ? `/v1/projects/${project}/roadmap` : null);
  const status = useData<{ phases?: PhaseEntry[] }>(project ? `/v1/projects/${project}/template` : null);
  const loading = project ? releases === undefined || status === undefined : portfolioData === undefined;
  if (loading) return <Loading />;
  let all: Ms[] = [];
  if (project) {
    if (releases === null && status === null) return <Unavailable />;
    all = [
      ...(Array.isArray(releases) ? releases.map((r) => ({ project, kind: 'release' as const, label: r.name, planned: r.endsOn, actual: r.state === 'released' ? r.endsOn : null, late: false })) : []),
      ...(status?.phases ?? []).filter((ph) => !ph.offTemplate && (ph.record.reviewPlannedOn || ph.record.reviewHeldOn)).map((ph) => ({ project, kind: 'review' as const, label: ph.review ? ph.review.toUpperCase() : ph.name, planned: ph.record.reviewPlannedOn, actual: ph.record.reviewHeldOn, late: false })),
    ];
  } else {
    if (!portfolioData || !Array.isArray(portfolioData.projects)) return <Unavailable />;
    all = portfolioData.projects.flatMap(milestonesOf);
  }
  const from = today(); const to = plus(90);
  const list = all.filter((m) => !m.actual && m.planned && m.planned <= to).map((m) => ({ ...m, late: m.planned! < from })).sort((a, b) => a.planned!.localeCompare(b.planned!)).slice(0, 8);
  if (list.length === 0) return <WidgetEmpty text={t.roadmap.none} action={t.roadmap.open} to={project ? `/p/${project}/planning?vue=versions` : `/portefeuilles/${portfolio ?? ''}/roadmap`} />;
  return (
    <div className="ath-stack">
      <Table caption={t.roadmap.caption}>
        <thead><tr><Th>{t.roadmap.date}</Th><Th>{t.roadmap.project}</Th><Th>{t.roadmap.milestone}</Th></tr></thead>
        <tbody>{list.map((m) => (
          <tr key={`${m.project}-${m.kind}-${m.label}-${m.planned}`}><Td mono>{day(m.planned)}</Td><Td mono>{m.project}</Td>
            <Td>{m.label} <span className="ath-eyebrow">{t.roadmap.kinds[m.kind]}</span>{m.late && <span className="ath-eyebrow ath-text-danger"> · {t.roadmap.late}</span>}</Td></tr>
        ))}</tbody>
      </Table>
      <Link className="ath-link" to={project ? `/p/${project}/planning?vue=versions` : `/portefeuilles/${portfolio ?? ''}/roadmap`}>{t.roadmap.open}</Link>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ phase et prochaine revue (N5)
interface PhaseStatus {
  templateKey: string | null; phase: string | null;
  phaseCheck: { key: string; name: string; review: string; next: string | null; canAdvance: boolean; criteria: Array<{ label: string; stage: 'exit' | 'entry'; manual: boolean; met: boolean }> } | null;
  phases?: PhaseEntry[];
}

/** Phase en cours, prochaine revue et sa date, critères de sortie remplis ou restants. */
export function PhaseGateCard({ project }: { project: string }) {
  const status = useData<PhaseStatus>(project ? `/v1/projects/${project}/template` : null);
  if (status === undefined) return <Loading />;
  if (status === null) return <Unavailable />;
  const check = status.phaseCheck;
  if (!status.templateKey || !check) return <WidgetEmpty text={t.phase.none} action={t.phase.open} to={`/p/${project}/parametres`} />;
  const record = status.phases?.find((ph) => ph.key === check.key)?.record;
  const exit = check.criteria.filter((c) => c.stage === 'exit');
  const met = exit.filter((c) => c.met).length;
  const manual = exit.filter((c) => c.manual && !c.met).length;
  return (
    <div className="ath-stack">
      <dl className="ath-facts">
        <div className="ath-facts__item"><dt>{t.phase.current}</dt><dd>{check.name}</dd></div>
        <div className="ath-facts__item"><dt>{t.phase.review}</dt><dd>{check.review ? check.review.toUpperCase() : '—'}{record?.reviewPlannedOn ? <> · {day(record.reviewPlannedOn)}</> : <> · {t.phase.undated}</>}</dd></div>
        <div className="ath-facts__item"><dt>{t.phase.criteria}</dt><dd>{t.phase.met(met, exit.length)}{manual > 0 ? ` · ${t.phase.manual(manual)}` : ''}</dd></div>
        <div className="ath-facts__item"><dt>{t.phase.ready}</dt><dd>{check.canAdvance ? fr.governance.yes : fr.governance.no}</dd></div>
      </dl>
      <Link className="ath-link" to={`/p/${project}/parametres`}>{t.phase.open}</Link>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ portes, décisions, demandes (N6, N7)
interface GateRow { project: string; name: string; phaseName: string; review: string; reviewPlannedOn: string | null; reviewHeldOn: string | null; canAdvance: boolean; criteria: { total: number; met: number } }
interface DecisionRow { id: string; project: string; kind: string; appliedAt: string | null; decidedAt: string; costDelta: number | null; scheduleDeltaDays: number | null; proposedState: string | null }

/** Revues et portes de phase des soixante prochains jours, décisions en attente d'application et dernières décisions. */
export function PortfolioGatesCard({ portfolio }: { portfolio: string }) {
  const gates = useData<{ rows: GateRow[] }>(portfolio ? `/v1/portfolios/${portfolio}/gates` : null);
  const decisions = useData<DecisionRow[]>(portfolio ? `/v1/portfolios/${portfolio}/decisions` : null);
  if (gates === undefined || decisions === undefined) return <Loading />;
  if (gates === null && decisions === null) return <Unavailable />;
  const to = plus(60);
  const rows = (gates?.rows ?? []).filter((g) => !g.reviewHeldOn && g.reviewPlannedOn && g.reviewPlannedOn <= to).slice(0, 6);
  const list = Array.isArray(decisions) ? decisions : [];
  const pending = list.filter((d) => !d.appliedAt && (d.costDelta !== null || d.scheduleDeltaDays !== null || d.proposedState !== null));
  const recent = [...list].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)).slice(0, 3);
  if (rows.length === 0 && pending.length === 0 && recent.length === 0) return <WidgetEmpty text={t.gates.none} action={t.gates.open} to={`/portefeuilles/${portfolio}`} />;
  return (
    <div className="ath-stack">
      {rows.length > 0 && (
        <Table caption={t.gates.caption}>
          <thead><tr><Th>{t.gates.project}</Th><Th>{t.gates.review}</Th><Th>{t.gates.planned}</Th><Th>{t.gates.criteria}</Th></tr></thead>
          <tbody>{rows.map((g) => (
            <tr key={g.project}><Td mono>{g.project}</Td><Td>{g.review ? g.review.toUpperCase() : g.phaseName}</Td><Td mono>{day(g.reviewPlannedOn)}{g.reviewPlannedOn && g.reviewPlannedOn < today() ? <span className="ath-text-danger"> · {t.roadmap.late}</span> : null}</Td>
              <Td mono>{g.criteria.met}/{g.criteria.total}{g.canAdvance ? ` · ${t.gates.ready}` : ''}</Td></tr>
          ))}</tbody>
        </Table>
      )}
      <p>{pending.length > 0 ? t.gates.pending(pending.length) : t.gates.noPending}</p>
      {recent.length > 0 && <ul className="ath-stack">{recent.map((d) => <li key={d.id} className="ath-row"><span className="ath-mono">{d.project}</span><span>{fr.decisions.decisionKinds[d.kind] ?? d.kind}</span>{day(d.decidedAt)}</li>)}</ul>}
      <Link className="ath-link" to={`/portefeuilles/${portfolio}`}>{t.gates.open}</Link>
    </div>
  );
}

interface Ranked { key: string; project: string; title: string; score: number | null; completeness: number; incomplete: boolean; converted: 'converted' | 'refused' | null }

/** Demandes de projet en cours, triées par score, avec leur étape (à instruire, convertie, refusée). */
export function PortfolioRequestsCard({ portfolio }: { portfolio: string }) {
  const ranking = useData<{ requests: Ranked[] }>(portfolio ? `/v1/portfolios/${portfolio}/ranking` : null);
  if (ranking === undefined) return <Loading />;
  if (ranking === null || !Array.isArray(ranking.requests)) return <Unavailable />;
  const open = ranking.requests.filter((r) => r.converted === null).slice(0, 6);
  if (open.length === 0) return <WidgetEmpty text={t.requests.none} action={t.requests.open} to={`/portefeuilles/${portfolio}`} />;
  return (
    <div className="ath-stack">
      <Table caption={t.requests.caption}>
        <thead><tr><Th>{t.requests.request}</Th><Th>{t.requests.title}</Th><Th>{t.requests.score}</Th><Th>{t.requests.step}</Th></tr></thead>
        <tbody>{open.map((r) => (
          <tr key={r.key}><Td mono><Link className="ath-link" to={`/p/${r.project}/a/${r.key}`}>{r.key}</Link></Td><Td><span className="ath-clip" title={r.title}>{r.title}</span></Td>
            <Td mono>{r.score === null ? '—' : r.score}</Td><Td>{r.incomplete ? t.requests.incomplete : t.requests.toReview}</Td></tr>
        ))}</tbody>
      </Table>
      <Link className="ath-link" to={`/portefeuilles/${portfolio}`}>{t.requests.open}</Link>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ risques consolidés (N8)
interface RiskMatrix { cells: Array<{ probability: number; impact: number; count: number }>; top: Array<{ key: string; project: string; probability: number; impact: number; criticality: number }>; total: number }
const band = (score: number): 'low' | 'moderate' | 'high' | 'critical' => (score >= 20 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'moderate' : 'low');

/** Matrice probabilité × impact des risques ouverts d'un projet ou d'un portefeuille, et les cinq plus critiques. */
export function RiskMatrixCard({ project, portfolio }: { project?: string; portfolio?: string }) {
  const g = fr.governance;
  const risks = useData<RiskMatrix>(project ? `/v1/projects/${project}/risk-matrix` : portfolio ? `/v1/portfolios/${portfolio}/risks` : null);
  if (risks === undefined) return <Loading />;
  if (risks === null || !Array.isArray(risks.cells)) return <Unavailable />;
  if (risks.total === 0) return <WidgetEmpty text={g.noRisks} />;
  const cell = (p: number, i: number) => risks.cells.find((c) => c.probability === p && c.impact === i)?.count ?? 0;
  return (
    <div className="ath-stack">
      <table className="ath-matrix" aria-label={g.matrixCaption(risks.total)}>
        <thead><tr><th scope="col">{g.probabilityImpact}</th>{[1, 2, 3, 4, 5].map((i) => <th key={i} scope="col">{g.impact} {i}</th>)}</tr></thead>
        <tbody>{[5, 4, 3, 2, 1].map((p) => (
          <tr key={p}><th scope="row">{g.probability} {p}</th>{[1, 2, 3, 4, 5].map((i) => {
            const n = cell(p, i);
            return <td key={i} className={`ath-matrix__cell ath-matrix__cell--${band(p * i)}`}>{n > 0 ? <strong>{n}</strong> : <span aria-hidden="true">·</span>}<span className="ath-visually-hidden">{g.cellLabel(p, i, n, g.bands[band(p * i)]!)}</span></td>;
          })}</tr>
        ))}</tbody>
      </table>
      <ul>{risks.top.slice(0, 5).map((r) => <li key={r.key}><Link className="ath-link ath-mono" to={`/p/${r.project}/a/${r.key}`}>{r.key}</Link> · {g.criticality} <strong className="ath-mono">{r.criticality}</strong> ({r.probability} × {r.impact})</li>)}</ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ état de la plateforme (N9)
interface Platform { history: { pending: number; oldestMinutes: number | null; reconcileErrors: number }; webhooks: { failed: number; late: number }; plugins: { installed: number; disabled: number }; tokens: { expiring: number } }

/** Historique GitLab en retard, webhooks en échec, plugins désactivés, jetons proches de l'échéance : chaque ligne mène à l'écran qui permet d'agir. */
export function PlatformOpsCard() {
  const s = useData<Platform>('/v1/admin/platform-status');
  if (s === undefined) return <Loading />;
  if (s === null || !s.history) return <Unavailable />;
  const o = t.ops;
  const rows: Array<{ label: string; text: string; to: string; bad: boolean }> = [
    { label: o.history, text: s.history.pending > 0 ? o.historyPending(s.history.pending, s.history.oldestMinutes ?? 0) : o.historyOk, to: '/admin', bad: s.history.pending > 0 },
    { label: o.reconcile, text: s.history.reconcileErrors > 0 ? o.reconcileErrors(s.history.reconcileErrors) : o.reconcileOk, to: '/admin', bad: s.history.reconcileErrors > 0 },
    { label: o.webhooks, text: s.webhooks.failed + s.webhooks.late > 0 ? o.webhooksBad(s.webhooks.failed, s.webhooks.late) : o.webhooksOk, to: '/admin', bad: s.webhooks.failed + s.webhooks.late > 0 },
    { label: o.plugins, text: s.plugins.disabled > 0 ? o.pluginsOff(s.plugins.disabled, s.plugins.installed) : o.pluginsOk(s.plugins.installed), to: '/admin', bad: s.plugins.disabled > 0 },
    { label: o.tokens, text: s.tokens.expiring > 0 ? o.tokensBad(s.tokens.expiring) : o.tokensOk, to: '/profil', bad: s.tokens.expiring > 0 },
  ];
  return (
    <ul className="ath-stack">{rows.map((r) => (
      <li key={r.label} className="ath-row"><Link className="ath-link" to={r.to}>{r.label}</Link><span className={r.bad ? 'ath-text-danger' : undefined}>{r.bad ? `${o.attention} · ` : ''}{r.text}</span></li>
    ))}</ul>
  );
}
