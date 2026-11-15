import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatusPill, type PillKind } from '@athena/ui';
import { api } from '../api';
import { fr } from '../i18n';
import { formatDate } from '../lib/dates';

/**
 * Widgets de pilotage, d'intégration continue et de qualité (ADR-0007, T-0173 à T-0176) : ligne commune, état vide, grand chiffre,
 * arc et anneau en SVG (positions par attributs, aucun style en ligne). Aucune information ne repose sur la couleur seule :
 * chaque état porte son libellé.
 */
const t = fr.widgets;

/** Données imposées (galerie de test des widgets) : le chemin se termine par une clé de la table, aucune requête n'est faite. */
const Override = createContext<Record<string, unknown> | null>(null);
export const WidgetData = Override.Provider;

export function useData<T>(path: string | null): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const override = useContext(Override);
  useEffect(() => {
    if (override) return;
    if (path === null) { setData(null); return; }
    setData(undefined);
    api<T>('GET', path).then(setData).catch(() => setData(null));
  }, [path, override]);
  if (override) {
    const key = path === null ? undefined : Object.keys(override).find((k) => path.endsWith(k));
    return key === undefined ? null : (override[key] as T);
  }
  return data;
}

/** État vide d'un widget : illustration grise, une phrase, un bouton d'action (lien) s'il y a une suite utile. */
export function WidgetEmpty({ text, action, to }: { text: string; action?: string; to?: string }) {
  return (
    <div className="ath-widget-empty">
      <svg className="ath-widget-empty__art" viewBox="0 0 64 46" aria-hidden="true" focusable="false">
        <rect x="6" y="6" width="52" height="34" rx="3" /><path d="M6 16h52" /><path d="M16 27h18M16 33h28" />
      </svg>
      <p>{text}</p>
      {action && to && <Link className="ath-btn ath-btn--ghost ath-btn--sm" to={to}>{action}</Link>}
    </div>
  );
}

/** Ligne commune des listes de tickets : identifiant en police mono, titre tronqué, pastille d'état. */
export function TicketRow({ project, keyName, title, pill, to }: { project: string; keyName: string; title?: string; pill?: ReactNode; to?: string }) {
  return (
    <li className="ath-ticketrow">
      <Link className="ath-link ath-mono" to={to ?? `/p/${project}/a/${keyName}`}>{keyName}</Link>
      {title !== undefined && <span className="ath-clip" title={title}>{title}</span>}
      {pill}
    </li>
  );
}

/** Anneau de progression (0 à 100), le pourcentage au centre. */
export function Ring({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <svg viewBox="0 0 42 42" className="ath-ring" role="img" aria-label={label}>
      <circle className="ath-ring__track" cx="21" cy="21" r="15.915" />
      <circle className="ath-ring__arc" cx="21" cy="21" r="15.915" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset="25" />
      <text x="21" y="21" className="ath-ring__text" textAnchor="middle" dominantBaseline="central">{p} %</text>
    </svg>
  );
}

/** Arc de progression global (demi-cercle), pour l'avancement du projet. */
export function Arc({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <svg viewBox="0 0 100 58" className="ath-ring" role="img" aria-label={label}>
      <path className="ath-ring__track" d="M10 50 A40 40 0 0 1 90 50" pathLength="100" />
      <path className="ath-ring__arc" d="M10 50 A40 40 0 0 1 90 50" pathLength="100" strokeDasharray={`${p} ${100 - p}`} />
      <text x="50" y="48" className="ath-ring__text" textAnchor="middle">{p} %</text>
    </svg>
  );
}

export interface Kpis {
  project: { key: string; name: string; createdAt: string; members: number; managers: string[] };
  progress: { total: number; done: number; inProgress: number; todo: number; percent: number };
  late: number; blocked: number; dueSoon: number; open: number;
  workload: Array<{ assignee: string; count: number }>;
  velocity: { average: number; forecast: number; sprints: number };
  sprint: { id: string; name: string; endsOn: string | null; items: number; doneItems: number; totalPoints: number; donePoints: number; percent: number; daysLeft: number | null } | null;
  health: { state: 'ok' | 'attention' | 'critical'; reasons: string[] };
}
const useKpis = (project: string) => useData<Kpis>(project ? `/v1/projects/${project}/kpis` : null);
const Loading = () => <p role="status">{fr.loading}</p>;
const search = (project: string, q: string) => `/p/${project}/recherche?q=${encodeURIComponent(q)}`;
const noProject = <WidgetEmpty text={fr.home.chooseProject} />;

export function GeneralInfoCard({ project }: { project: string }) {
  const k = useKpis(project);
  if (!project) return noProject;
  if (k === undefined) return <Loading />;
  if (!k) return <WidgetEmpty text={t.unavailable} />;
  return (
    <dl className="ath-kv">
      <dt>{t.name}</dt><dd>{k.project.name} <span className="ath-mono">({k.project.key})</span></dd>
      <dt>{t.managers}</dt><dd>{k.project.managers.length ? k.project.managers.join(', ') : t.none}</dd>
      <dt>{t.members}</dt><dd>{k.project.members}</dd>
      <dt>{t.since}</dt><dd><time dateTime={k.project.createdAt}>{formatDate(k.project.createdAt)}</time></dd>
    </dl>
  );
}

export function GlobalProgressCard({ project }: { project: string }) {
  const k = useKpis(project);
  if (!project) return noProject;
  if (k === undefined) return <Loading />;
  if (!k) return <WidgetEmpty text={t.unavailable} />;
  if (k.progress.total === 0) return <WidgetEmpty text={t.noTickets} action={t.createTicket} to={`/p/${project}/trackers`} />;
  return (
    <div className="ath-donut">
      <Arc percent={k.progress.percent} label={t.progressLabel(k.progress.percent, k.progress.done, k.progress.total)} />
      <ul className="ath-stack">
        <li>{t.doneN(k.progress.done)}</li><li>{t.inProgressN(k.progress.inProgress)}</li><li>{t.todoN(k.progress.todo)}</li>
      </ul>
    </div>
  );
}

export function KeyIndicatorsCard({ project }: { project: string }) {
  const k = useKpis(project);
  if (!project) return noProject;
  if (k === undefined) return <Loading />;
  if (!k) return <WidgetEmpty text={t.unavailable} />;
  const tile = (label: string, value: number | string, to?: string) => (
    <div key={label} className="ath-tile"><span className="ath-tile__value">{value}</span>{to ? <Link className="ath-link" to={to}>{label}</Link> : <span>{label}</span>}</div>
  );
  return (
    <>
      <div className="ath-tiles">
        {tile(t.late, k.late, search(project, 'late()'))}
        {tile(t.dueSoon, k.dueSoon, search(project, 'category != done AND dueDate >= daysFromNow(0) AND dueDate <= daysFromNow(7)'))}
        {tile(t.velocity, k.velocity.sprints === 0 ? '–' : k.velocity.average)}
      </div>
      {k.workload.length > 0 && (
        <>
          <p className="ath-eyebrow">{t.workload}</p>
          <ul className="ath-stack">{k.workload.map((w) => <li key={w.assignee} className="ath-row"><span>{w.assignee}</span><span className="ath-mono">{w.count}</span></li>)}</ul>
        </>
      )}
    </>
  );
}

const HEALTH: Record<Kpis['health']['state'], PillKind> = { ok: 'success', attention: 'warning', critical: 'danger' };
export function HealthCard({ project }: { project: string }) {
  const k = useKpis(project);
  if (!project) return noProject;
  if (k === undefined) return <Loading />;
  if (!k) return <WidgetEmpty text={t.unavailable} />;
  return (
    <>
      <div className="ath-bignum">
        <span className="ath-bignum__value">{k.blocked}</span>
        <Link className="ath-link" to={search(project, 'blocked()')}>{t.blocked}</Link>
        <StatusPill kind={HEALTH[k.health.state]}>{t.health[k.health.state]}</StatusPill>
      </div>
      <dl className="ath-kv">
        <dt>{t.late}</dt><dd><Link className="ath-link" to={search(project, 'late()')}>{k.late}</Link></dd>
        <dt>{t.open}</dt><dd><Link className="ath-link" to={search(project, 'category != done')}>{k.open}</Link></dd>
      </dl>
    </>
  );
}

export function SprintProgressCard({ project }: { project: string }) {
  const k = useKpis(project);
  if (!project) return noProject;
  if (k === undefined) return <Loading />;
  if (!k) return <WidgetEmpty text={t.unavailable} />;
  if (!k.sprint) return <WidgetEmpty text={t.noSprint} action={t.openBacklog} to={`/p/${project}/backlog`} />;
  const s = k.sprint;
  return (
    <div className="ath-donut">
      <Ring percent={s.percent} label={t.sprintLabel(s.name, s.percent)} />
      <dl className="ath-kv">
        <dt>{t.sprint}</dt><dd>{s.name}</dd>
        <dt>{t.tickets}</dt><dd>{s.doneItems} / {s.items}</dd>
        {s.totalPoints > 0 && <><dt>{t.points}</dt><dd>{s.donePoints} / {s.totalPoints}</dd></>}
        {s.daysLeft !== null && <><dt>{t.daysLeft}</dt><dd>{s.daysLeft < 0 ? t.over : s.daysLeft}</dd></>}
      </dl>
    </div>
  );
}

export interface Pipelines {
  configured: boolean; successRate: number | null; running: boolean;
  repos: Array<{ repo: string; successRate: number | null; running: boolean; last: string | null; runs: Array<{ id: number; state: string; ref: string; url: string }> }>;
}
const RUN_KIND: Record<string, PillKind> = { success: 'success', failed: 'danger', running: 'info', pending: 'warning', canceled: 'draft', skipped: 'draft', other: 'draft' };
export function PipelinesCard({ project }: { project: string }) {
  const data = useData<Pipelines>(project ? `/v1/projects/${project}/pipelines` : null);
  if (!project) return noProject;
  if (data === undefined) return <Loading />;
  if (!data || !data.configured || data.repos.length === 0) return <WidgetEmpty text={t.noRepo} action={t.linkRepo} to={`/p/${project}/rapports/code`} />;
  return (
    <>
      <div className="ath-bignum">
        <span className="ath-bignum__value">{data.successRate === null ? '–' : `${data.successRate} %`}</span>
        <span>{t.successRate}</span>
        {data.running && <StatusPill kind="info">{t.runStates.running}</StatusPill>}
      </div>
      {data.repos.map((r) => (
        <div key={r.repo} className="ath-stack">
          <span className="ath-mono">{r.repo}</span>
          {r.runs.length === 0 ? <span>{t.noRuns}</span> : (
            <ul className="ath-runs" aria-label={t.runsOf(r.repo)}>
              {r.runs.map((run) => (
                <li key={run.id} className={run.state === 'running' ? 'ath-run ath-run--running' : 'ath-run'}>
                  <a href={run.url} target="_blank" rel="noreferrer" title={`${run.ref} · #${run.id}`}><StatusPill kind={RUN_KIND[run.state] ?? 'draft'}>{t.runStates[run.state] ?? run.state}</StatusPill></a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

export interface Quality { connected: boolean; provider: string | null; measures: { gate: string; coverage: number | null; bugs: number; vulnerabilities: number; smells: number; debtMinutes: number | null; analyzedAt: string | null } | null }
export function QualityCard({ project }: { project: string }) {
  const q = useData<Quality>(project ? `/v1/projects/${project}/quality` : null);
  if (!project) return noProject;
  if (q === undefined) return <Loading />;
  if (!q || !q.connected || !q.measures) return <WidgetEmpty text={t.noQuality} action={t.linkSonar} to="/admin" />;
  const m = q.measures;
  return (
    <>
      <div className="ath-bignum"><span className="ath-bignum__value">{m.coverage === null ? '–' : `${m.coverage} %`}</span><span>{t.coverage}</span>
        <StatusPill kind={m.gate === 'passed' ? 'success' : m.gate === 'failed' ? 'danger' : 'draft'}>{t.gate[m.gate] ?? m.gate}</StatusPill></div>
      <dl className="ath-kv"><dt>{t.bugs}</dt><dd>{m.bugs}</dd><dt>{t.vulnerabilities}</dt><dd>{m.vulnerabilities}</dd><dt>{t.smells}</dt><dd>{m.smells}</dd></dl>
    </>
  );
}

/** Badges : pipeline GitLab et dernière version publiée, toujours ; la qualité de SonarQube seulement quand il est relié. */
export function BadgesCard({ project }: { project: string }) {
  const runs = useData<Pipelines>(project ? `/v1/projects/${project}/pipelines` : null);
  const q = useData<Quality>(project ? `/v1/projects/${project}/quality` : null);
  const releases = useData<Array<{ name: string; state: string }>>(project ? `/v1/projects/${project}/roadmap` : null);
  if (!project) return noProject;
  if (runs === undefined || q === undefined || releases === undefined) return <Loading />;
  const published = (releases ?? []).filter((r) => r.state === 'published');
  const last = runs?.repos.map((r) => r.last).find((s) => s) ?? null;
  const items: ReactNode[] = [];
  if (last) items.push(<li key="ci"><StatusPill kind={RUN_KIND[last] ?? 'draft'}>{t.badgePipeline(t.runStates[last] ?? last)}</StatusPill></li>);
  if (published.length > 0) items.push(<li key="ver"><StatusPill kind="merged">{t.badgeVersion(published[published.length - 1]!.name)}</StatusPill></li>);
  if (q?.connected && q.measures) items.push(<li key="gate"><StatusPill kind={q.measures.gate === 'passed' ? 'success' : 'danger'}>{t.badgeGate(t.gate[q.measures.gate] ?? q.measures.gate)}</StatusPill></li>);
  if (items.length === 0) return <WidgetEmpty text={t.noBadges} action={t.linkRepo} to={`/p/${project}/rapports/code`} />;
  return <ul className="ath-badges">{items}</ul>;
}
