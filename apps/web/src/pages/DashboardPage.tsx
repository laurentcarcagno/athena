import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CornerFrame, EmptyState, Id, PageHeader, StatCard, StatusPill, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface DashboardData {
  byCategory: { todo: number; in_progress: number; done: number };
  byTracker: Array<{ tracker: string; total: number; open: number }>;
  distribution: Array<{ value: string; count: number }> | null;
  recent: Array<{ key: string; at: string }>;
}
interface VelocityData { sprints: Array<{ sprint: string; committed: number; completed: number }>; average: number; forecast: number }
interface FlowDay { date: string; todo: number; in_progress: number; done: number }
interface Release { id: string; name: string; startsOn: string; endsOn: string; state: string; items: number; doneItems: number; progress: number }

/** Barre horizontale à plat en SVG (attributs de présentation : compatibles avec une CSP sans styles en ligne). */
function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <svg className="ath-bar" role="img" aria-label={`${label} : ${value}`} width="100%" height="10" preserveAspectRatio="none" data-percent={percent}>
      <rect className="ath-bar__track" x="0" y="0" width="100%" height="10" />
      <rect className="ath-bar__fill" x="0" y="0" width={`${percent}%`} height="10" />
    </svg>
  );
}

const DAY = 86_400_000;

/** Calcule la position (en %) de chaque version sur l'axe du temps commun. */
export function ganttLayout(releases: Release[]): Array<{ id: string; left: number; width: number; progress: number }> {
  const spans = releases.map((r) => ({ r, start: Date.parse(r.startsOn), end: Date.parse(r.endsOn) })).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start);
  if (spans.length === 0) return [];
  const min = Math.min(...spans.map((s) => s.start));
  const max = Math.max(...spans.map((s) => s.end + DAY));
  const total = max - min;
  return spans.map(({ r, start, end }) => ({
    id: r.id, left: ((start - min) / total) * 100, width: Math.max(((end + DAY - start) / total) * 100, 1), progress: r.progress,
  }));
}

/** Diagramme de Gantt à plat des versions (SVG, aucun style en ligne). */
function Gantt({ releases }: { releases: Release[] }) {
  const rows = ganttLayout(releases);
  const ROW = 22;
  const name = (id: string) => releases.find((r) => r.id === id)!;
  return (
    <svg className="ath-gantt" role="img" aria-label="Gantt" width="100%" height={rows.length * ROW + 4} preserveAspectRatio="none">
      {rows.map((row, i) => {
        const r = name(row.id);
        return (
          <g key={row.id}>
            <title>{`${r.name} : ${r.startsOn} → ${r.endsOn} (${Math.round(row.progress * 100)} %)`}</title>
            <rect className="ath-gantt__track" x={`${row.left}%`} y={i * ROW + 2} width={`${row.width}%`} height={ROW - 6} />
            <rect className="ath-gantt__fill" x={`${row.left}%`} y={i * ROW + 2} width={`${row.width * row.progress}%`} height={ROW - 6} />
          </g>
        );
      })}
    </svg>
  );
}

export function DashboardPage() {
  const { project } = useParams();
  const fail = useFailure();
  const [data, setData] = useState<DashboardData | null>(null);
  const [velocity, setVelocity] = useState<VelocityData | null>(null);
  const [flow, setFlow] = useState<FlowDay[]>([]);
  const [roadmap, setRoadmap] = useState<Release[]>([]);

  useEffect(() => {
    const base = `/v1/projects/${project}`;
    Promise.all([
      api<DashboardData>('GET', `${base}/dashboard`), api<VelocityData>('GET', `${base}/velocity`),
      api<FlowDay[]>('GET', `${base}/flow?days=7`), api<Release[]>('GET', `${base}/roadmap`),
    ]).then(([d, v, f, r]) => { setData(d); setVelocity(v); setFlow(f); setRoadmap(r); }).catch(fail);
  }, [project, fail]);

  if (!data || !velocity) return <p role="status">{fr.loading}</p>;
  const total = data.byCategory.todo + data.byCategory.in_progress + data.byCategory.done;
  const maxPoints = Math.max(1, ...velocity.sprints.flatMap((s) => [s.committed, s.completed]));

  return (
    <>
      <PageHeader eyebrow={fr.dashboard.eyebrow} title={`${fr.dashboard.title} · ${project}`} />
      {/* Composition asymétrique : un indicateur principal large, deux secondaires (pas de grille de tuiles identiques). */}
      <div className="ath-dash">
        <div className="ath-dash__main"><StatCard label={fr.dashboard.open} value={data.byCategory.todo + data.byCategory.in_progress} delta={`${total} ${fr.dashboard.total.toLowerCase()}`} /></div>
        <StatCard label={fr.dashboard.inProgress} value={data.byCategory.in_progress} />
        <StatCard label={fr.dashboard.done} value={data.byCategory.done} />
      </div>

      <CornerFrame>
        <h2 className="ath-label">{fr.dashboard.flow}</h2>
        <Table>
          <thead><tr><Th>{fr.artifact.date}</Th><Th>{fr.dashboard.todo}</Th><Th>{fr.dashboard.inProgress}</Th><Th>{fr.dashboard.done}</Th></tr></thead>
          <tbody>
            {flow.map((d) => (
              <tr key={d.date}><Td mono>{d.date}</Td><Td mono>{d.todo}</Td><Td mono>{d.in_progress}</Td><Td mono>{d.done}</Td></tr>
            ))}
          </tbody>
        </Table>
      </CornerFrame>

      <div className="ath-grid-2 ath-dash__sections">
        <Card title={fr.dashboard.velocity} meta={`${fr.dashboard.forecast} : ${velocity.forecast} ${fr.dashboard.points}`}>
          {velocity.sprints.length === 0 ? <p>{fr.dashboard.noSprint}</p> : (
            <div className="ath-stack">
              {velocity.sprints.map((s) => (
                <div key={s.sprint}>
                  <span className="ath-eyebrow">{s.sprint}</span>
                  <Bar value={s.committed} max={maxPoints} label={`${s.sprint} ${fr.dashboard.committed}`} />
                  <Bar value={s.completed} max={maxPoints} label={`${s.sprint} ${fr.dashboard.completed}`} />
                  <span className="ath-mono">{s.completed} / {s.committed}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title={fr.dashboard.roadmap}>
          {roadmap.length === 0 ? <p>{fr.dashboard.noRelease}</p> : (
            <div className="ath-stack">
              <Gantt releases={roadmap} />
              {roadmap.map((r) => (
                <div key={r.id}>
                  <div className="ath-row"><strong>{r.name}</strong> <StatusPill kind={r.state === 'released' ? 'success' : 'info'}>{r.state}</StatusPill> <span className="ath-mono">{r.startsOn} → {r.endsOn}</span></div>
                  <Bar value={Math.round(r.progress * 100)} max={100} label={r.name} />
                  <span className="ath-mono">{r.doneItems} / {r.items}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Trackers">
          <div className="ath-stack">
            {data.byTracker.map((t) => (
              <div key={t.tracker} className="ath-row">
                <Link className="ath-link ath-mono" to={`/p/${project}?q=${encodeURIComponent(`tracker = ${t.tracker}`)}`}>{t.tracker}</Link>
                <span className="ath-mono">{t.open} / {t.total}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={fr.dashboard.recent}>
          {data.recent.length === 0 ? <EmptyState eyebrow={fr.dashboard.recent} title={fr.admin.empty} /> : (
            <div className="ath-stack">
              {data.recent.slice(0, 6).map((r, i) => (
                <div key={`${r.key}-${i}`} className="ath-row"><Link className="ath-link ath-mono" to={`/p/${project}/a/${r.key}`}>{r.key}</Link> <Id>{r.at.slice(0, 16).replace('T', ' ')}</Id></div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
