import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { fr, getLocale } from '../i18n';
import { formatDay, formatSpan } from '../lib/dates';

/**
 * Cartes de l'Avancement (ADR-0005 § 2.3, T-0155), variantes retenues à la revue : indicateurs avec variation sur 7 jours,
 * flux cumulé, vélocité engagé / réalisé, prochaine version, répartition par tracker, activité récente sans doublon.
 * Graphiques en SVG à positions en pourcentage (aucun style en ligne) ; couleurs : catégories de statut et palette de données.
 */
interface FlowDay { date: string; todo: number; in_progress: number; done: number }
interface Velocity { sprints: Array<{ sprint: string; committed: number; completed: number }>; average: number; forecast: number }
interface Release { id: string; name: string; startsOn: string; endsOn: string; state: string; items: number; doneItems: number; progress: number }
interface TrackerOverview { key: string; name: string; artifacts: number; statuses: Array<{ category: string; count: number }> }
interface ActivityItem { id: string; kind: 'created' | 'updated' | 'transition' | 'comment'; at: string; key: string; actorName: string; fields: string[]; to: string | null }

const t = fr.progress;
const Loading = () => <p role="status">{fr.loading}</p>;
function useData<T>(path: string): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => { setData(undefined); api<T>('GET', path).then(setData).catch(() => setData(null)); }, [path]);
  return data;
}
const CATS = ['todo', 'in_progress', 'done'] as const;
const catLabel = (c: (typeof CATS)[number]) => (c === 'todo' ? t.todo : c === 'in_progress' ? t.inProgress : t.done);
function Legend({ items }: { items: Array<[string, string]> }) {
  return <ul className="ath-legend" aria-hidden="true">{items.map(([label, cls]) => <li key={label}><span className={`ath-legend__swatch ${cls}`} />{label}</li>)}</ul>;
}

/** Indicateurs : trois tuiles égales, avec la variation sur 7 jours (variante A). */
export function IndicatorsCard({ project }: { project: string }) {
  const flow = useData<FlowDay[]>(`/v1/projects/${project}/flow?days=7`);
  const dash = useData<{ byCategory: Record<'todo' | 'in_progress' | 'done', number> }>(`/v1/projects/${project}/dashboard`);
  if (dash === undefined || flow === undefined) return <Loading />;
  if (!dash) return <p>{t.unavailable}</p>;
  const c = dash.byCategory;
  const first = flow?.[0];
  const delta = (now: number, then: number | undefined) => (then === undefined ? null : now - then);
  const tiles: Array<[string, number, number | null]> = [
    [t.open, c.todo + c.in_progress, delta(c.todo + c.in_progress, first ? first.todo + first.in_progress : undefined)],
    [t.inProgress, c.in_progress, delta(c.in_progress, first?.in_progress)],
    [t.done, c.done, delta(c.done, first?.done)],
  ];
  return (
    <>
      <div className="ath-tiles">
        {tiles.map(([label, value, d]) => (
          <div key={label} className="ath-tile">
            <span className="ath-tile__label">{label}</span>
            <span className="ath-tile__value">{value}</span>
            {d !== null && <span className="ath-tile__delta">{t.delta(d)}</span>}
          </div>
        ))}
      </div>
      <p className="ath-field__hint">{t.total(c.todo + c.in_progress + c.done)}</p>
    </>
  );
}

/** Flux cumulé (aires empilées) sur 7 jours (variante A) : une épaisseur qui grossit signale un goulet. */
export function FlowCard({ project }: { project: string }) {
  const flow = useData<FlowDay[]>(`/v1/projects/${project}/flow?days=7`);
  if (flow === undefined) return <Loading />;
  if (!flow || flow.length === 0) return <p>{t.noFlow}</p>;
  const max = Math.max(1, ...flow.map((d) => d.todo + d.in_progress + d.done));
  const x = (i: number) => (flow.length === 1 ? 50 : 4 + (i * 92) / (flow.length - 1));
  const y = (v: number) => 90 - (v / max) * 80;
  const layer = (upTo: number) => flow.map((d, i) => `${x(i)},${y([d.todo, d.in_progress, d.done].slice(0, upTo).reduce((a, b) => a + b, 0))}`);
  const area = (k: number) => `${layer(k + 1).join(' ')} ${layer(k).reverse().join(' ')}`;
  return (
    <>
      <svg className="ath-flow" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t.flowLabel(flow.at(-1)!.todo, flow.at(-1)!.in_progress, flow.at(-1)!.done)}>
        <polygon className="ath-flow__done" points={area(2)} />
        <polygon className="ath-flow__in-progress" points={area(1)} />
        <polygon className="ath-flow__todo" points={area(0)} />
      </svg>
      <div className="ath-flow__axis" aria-hidden="true"><span>{formatDay(flow[0]!.date)}</span><span>{formatDay(flow.at(-1)!.date)}</span></div>
      <Legend items={CATS.map((c) => [catLabel(c), `ath-legend__swatch--${c}`])} />
      <details className="ath-flow__data">
        <summary>{t.seeData}</summary>
        <Table>
          <thead><tr><Th>{t.day}</Th>{CATS.map((c) => <Th key={c}>{catLabel(c)}</Th>)}</tr></thead>
          <tbody>{flow.map((d) => <tr key={d.date}><Td>{formatDay(d.date)}</Td><Td mono>{d.todo}</Td><Td mono>{d.in_progress}</Td><Td mono>{d.done}</Td></tr>)}</tbody>
        </Table>
      </details>
    </>
  );
}

/** Vélocité : engagé et réalisé par sprint, moyenne (variante A) ; sans sprint clos, un message utile (variante C). */
export function VelocityCard({ project }: { project: string }) {
  const v = useData<Velocity>(`/v1/projects/${project}/velocity`);
  if (v === undefined) return <Loading />;
  const sprints = v?.sprints.filter((s) => s.committed > 0 || s.completed > 0).slice(-6) ?? [];
  if (sprints.length === 0) return <div className="ath-stack"><p>{t.noVelocity}</p><div><Link className="ath-btn ath-btn--ghost ath-btn--sm" to={`/p/${project}/backlog`}>{t.openBacklog}</Link></div></div>;
  const max = Math.max(1, ...sprints.flatMap((s) => [s.committed, s.completed]));
  const w = 100 / sprints.length;
  return (
    <>
      <svg className="ath-velocity" width="100%" height="140" role="img" aria-label={t.velocityLabel(v!.average)}>
        {sprints.map((s, i) => (
          <g key={s.sprint}>
            <title>{t.velocityBar(s.sprint, s.committed, s.completed)}</title>
            <rect className="ath-velocity__committed" x={`${i * w + w * 0.15}%`} y={`${100 - (s.committed / max) * 80 - 12}%`} width={`${w * 0.33}%`} height={`${(s.committed / max) * 80}%`} />
            <rect className="ath-velocity__completed" x={`${i * w + w * 0.52}%`} y={`${100 - (s.completed / max) * 80 - 12}%`} width={`${w * 0.33}%`} height={`${(s.completed / max) * 80}%`} />
            <text className="ath-velocity__label" x={`${i * w + w / 2}%`} y="98%" textAnchor="middle">{s.sprint}</text>
          </g>
        ))}
        <line className="ath-velocity__average" x1="0" x2="100%" y1={`${100 - (v!.average / max) * 80 - 12}%`} y2={`${100 - (v!.average / max) * 80 - 12}%`} />
      </svg>
      <Legend items={[[t.committed, 'ath-legend__swatch--committed'], [t.completed, 'ath-legend__swatch--completed'], [t.average(v!.average), 'ath-legend__swatch--average']]} />
    </>
  );
}
export const velocityFooter = (project: string) => <Link className="ath-link" to={`/p/${project}/backlog`}>{t.seeSprints}</Link>;

/** Prochaine version : jours restants, tickets à terminer et rythme (variante C). */
export function ReleaseCard({ project, today = new Date() }: { project: string; today?: Date }) {
  const releases = useData<Release[]>(`/v1/projects/${project}/roadmap`);
  if (releases === undefined) return <Loading />;
  const next = (releases ?? []).filter((r) => r.state !== 'released').sort((a, b) => a.endsOn.localeCompare(b.endsOn))[0];
  if (!next) return <p>{t.noRelease}</p>;
  const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const left = Math.max(0, Math.round((day(next.endsOn) - now) / 86_400_000));
  const elapsed = Math.min(1, Math.max(0, (now - day(next.startsOn)) / Math.max(1, day(next.endsOn) - day(next.startsOn))));
  const late = next.progress + 0.1 < elapsed;
  return (
    <>
      <p className="ath-dashcard__lead"><strong>{next.name}</strong> · {formatSpan(next.startsOn, next.endsOn)}</p>
      <div className="ath-tiles ath-tiles--two">
        <div className="ath-tile"><span className="ath-tile__value">{left}</span><span className="ath-tile__label">{t.daysLeft(left)}</span></div>
        <div className="ath-tile"><span className="ath-tile__value">{next.items - next.doneItems}</span><span className="ath-tile__label">{t.toFinish(next.items - next.doneItems)}</span></div>
      </div>
      <svg className="ath-progressbar" width="100%" height="10" role="img" aria-label={t.progressLabel(Math.round(next.progress * 100))}>
        <rect className="ath-progressbar__track" x="0" y="0" width="100%" height="10" />
        <rect className="ath-progressbar__fill" x="0" y="0" width={`${Math.round(next.progress * 100)}%`} height="10" />
      </svg>
      <p className="ath-field__hint">{t.pace(Math.round(next.progress * 100), Math.round(elapsed * 100))} <strong className={late ? 'ath-text-warning' : undefined}>{late ? t.late : t.onPace}</strong></p>
    </>
  );
}

/** Trackers : une barre par tracker, répartie par catégorie de statut (variante B). */
export function TrackerStatusCard({ project }: { project: string }) {
  const overview = useData<{ trackers: TrackerOverview[] }>(`/v1/projects/${project}/overview`);
  if (overview === undefined) return <Loading />;
  const trackers = overview?.trackers ?? [];
  if (trackers.length === 0) return <p>{fr.home.noTracker}</p>;
  return (
    <>
      <ul className="ath-stack ath-list-plain">
        {trackers.map((tr) => {
          const count = (c: string) => tr.statuses.filter((s) => s.category === c).reduce((n, s) => n + s.count, 0);
          const total = Math.max(1, tr.artifacts);
          let at = 0;
          return (
            <li key={tr.key} className="ath-stack ath-stack--tight">
              <div className="ath-row ath-row--between"><Link className="ath-link" to={`/p/${project}/t/${tr.key}/tableau`}>{tr.name}</Link><span className="ath-field__hint">{t.openOf(count('todo') + count('in_progress'), tr.artifacts)}</span></div>
              <svg className="ath-stackbar" width="100%" height="10" role="img" aria-label={t.trackerLabel(tr.name, count('todo'), count('in_progress'), count('done'))}>
                {CATS.map((c) => { const width = (count(c) / total) * 100; const x = at; at += width; return <rect key={c} className={`ath-stackbar__${c}`} x={`${x}%`} y="0" width={`${width}%`} height="10" />; })}
              </svg>
            </li>
          );
        })}
      </ul>
      <Legend items={CATS.map((c) => [catLabel(c), `ath-legend__swatch--${c}`])} />
    </>
  );
}

/** Activité récente : qui a fait quoi, quand, une ligne par ticket (variante A). */
export function ActivityCard({ project, now = Date.now() }: { project: string; now?: number }) {
  const feed = useData<{ items: ActivityItem[] }>(`/v1/projects/${project}/activity?limit=30`);
  if (feed === undefined) return <Loading />;
  const seen = new Set<string>();
  const items = (feed?.items ?? []).filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true))).slice(0, 6);
  if (items.length === 0) return <p>{t.noActivity}</p>;
  const ago = (iso: string) => {
    const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
    return new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(-(minutes < 60 ? minutes : minutes < 1440 ? Math.round(minutes / 60) : Math.round(minutes / 1440)), minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day');
  };
  return (
    <ul className="ath-stack ath-list-plain">
      {items.map((i) => (
        <li key={i.id}>
          <strong>{i.actorName}</strong> {t.did(i.kind, i.fields, i.to)} <Link className="ath-link ath-mono" to={`/p/${project}/a/${i.key}`}>{i.key}</Link> <span className="ath-field__hint">· {ago(i.at)}</span>
        </li>
      ))}
    </ul>
  );
}
