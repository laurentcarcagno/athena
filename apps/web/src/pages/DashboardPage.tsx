import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CornerFrame, EmptyState, Id, PageHeader, StatCard, StatusPill, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { Bar, Gantt, type ReleaseSpan } from '../components/ReleaseCharts';
import { DateTime } from '../lib/dates';

interface DashboardData {
  byCategory: { todo: number; in_progress: number; done: number };
  byTracker: Array<{ tracker: string; total: number; open: number }>;
  distribution: Array<{ value: string; count: number }> | null;
  recent: Array<{ key: string; at: string }>;
}
interface VelocityData { sprints: Array<{ sprint: string; committed: number; completed: number }>; average: number; forecast: number }
interface FlowDay { date: string; todo: number; in_progress: number; done: number }
type Release = ReleaseSpan & { state: string; items: number; doneItems: number }

export { ganttLayout } from '../components/ReleaseCharts';

/** Modèles de widget acceptés : le plugin fournit des données, jamais du HTML. */
export type WidgetModel = { kind: 'stat'; label: string; value: string | number } | { kind: 'list'; title: string; items: string[] }
  | { kind: 'table'; title: string; columns: string[]; rows: string[][] };

export function parseWidgetModel(raw: unknown): WidgetModel | null {
  const m = raw as { kind?: unknown; label?: unknown; value?: unknown; title?: unknown; items?: unknown } | null;
  if (!m || typeof m !== 'object') return null;
  if (m.kind === 'stat' && typeof m.label === 'string' && (typeof m.value === 'string' || typeof m.value === 'number')) return { kind: 'stat', label: m.label.slice(0, 100), value: typeof m.value === 'string' ? m.value.slice(0, 100) : m.value };
  if (m.kind === 'list' && typeof m.title === 'string' && Array.isArray(m.items)) return { kind: 'list', title: m.title.slice(0, 100), items: m.items.slice(0, 20).map((i) => String(i).slice(0, 200)) };
  if (m.kind === 'table' && typeof m.title === 'string' && Array.isArray((m as { columns?: unknown }).columns) && Array.isArray((m as { rows?: unknown }).rows)) {
    const columns = ((m as { columns: unknown[] }).columns).slice(0, 8).map((c) => String(c).slice(0, 60));
    const rows = ((m as { rows: unknown[] }).rows).slice(0, 50).map((r) => (Array.isArray(r) ? r : []).slice(0, columns.length).map((v) => String(v).slice(0, 200)));
    return { kind: 'table', title: m.title.slice(0, 100), columns, rows };
  }
  return null;
}

function PluginWidgets({ project }: { project: string }) {
  const [models, setModels] = useState<Array<{ id: string; title: string; model: WidgetModel }>>([]);
  useEffect(() => {
    (async () => {
      const list = await api<Array<{ plugin: string; name: string; title: string }>>('GET', '/v1/widgets');
      const loaded = await Promise.all((Array.isArray(list) ? list : []).map(async (w) => {
        const result = await api<{ model: unknown }>('GET', `/v1/plugins/${w.plugin}/widgets/${w.name}?project=${encodeURIComponent(project)}`).catch(() => null);
        const model = result ? parseWidgetModel(result.model) : null;
        return model ? { id: `${w.plugin}/${w.name}`, title: w.title, model } : null;
      }));
      setModels(loaded.filter((x): x is NonNullable<typeof x> => x !== null));
    })().catch(() => setModels([]));
  }, [project]);
  if (models.length === 0) return null;
  return (
    <Card title={fr.dashboard.extensions}>
      <div className="ath-stack">
        {models.map(({ id, title, model }) => model.kind === 'stat'
          ? <StatCard key={id} label={model.label} value={model.value} />
          : model.kind === 'table'
          ? <div key={id}><span className="ath-eyebrow">{model.title}</span>
              <Table><thead><tr>{model.columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
                <tbody>{model.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <Td key={j}>{cell}</Td>)}</tr>)}</tbody></Table></div>
          : <div key={id}><span className="ath-eyebrow">{model.title}</span><ul>{model.items.map((item, i) => <li key={i}>{item}</li>)}</ul><span className="ath-mono">{title}</span></div>)}
      </div>
    </Card>
  );
}

/** Indicateurs du projet ; `embedded` retire l'en-tête quand la page est une partie de la Vue d'ensemble. */
export function DashboardPage({ embedded = false, tabs, title = fr.dashboard.title }: { embedded?: boolean; tabs?: ReactNode; title?: string } = {}) {
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
      {!embedded && <PageHeader title={title} />}
      {tabs}
      {/* Composition asymétrique : un indicateur principal large, deux secondaires (pas de grille de tuiles identiques). */}
      <div className="ath-dash">
        <div className="ath-dash__main"><StatCard label={fr.dashboard.open} value={data.byCategory.todo + data.byCategory.in_progress} delta={`${total} ${fr.dashboard.total.toLowerCase()}`} /></div>
        <StatCard label={fr.dashboard.inProgress} value={data.byCategory.in_progress} />
        <StatCard label={fr.dashboard.done} value={data.byCategory.done} />
      </div>

      <CornerFrame>
        <h2 className="ath-section-title">{fr.dashboard.flow}</h2>
        <Table>
          <thead><tr><Th>{fr.artifact.date}</Th><Th>{fr.dashboard.todo}</Th><Th>{fr.dashboard.inProgress}</Th><Th>{fr.dashboard.done}</Th></tr></thead>
          <tbody>
            {flow.map((d) => (
              <tr key={d.date}><Td mono><DateTime iso={d.date} date /></Td><Td mono>{d.todo}</Td><Td mono>{d.in_progress}</Td><Td mono>{d.done}</Td></tr>
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
        <PluginWidgets project={String(project)} />
        <Card title="Trackers">
          <div className="ath-stack">
            {data.byTracker.map((t) => (
              <div key={t.tracker} className="ath-row">
                <Link className="ath-link ath-mono" to={`/p/${project}/t/${t.tracker}/tableau`}>{t.tracker}</Link>
                <span className="ath-mono">{t.open} / {t.total}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={fr.dashboard.recent}>
          {data.recent.length === 0 ? <EmptyState eyebrow={fr.dashboard.recent} title={fr.admin.empty} /> : (
            <div className="ath-stack">
              {data.recent.slice(0, 6).map((r, i) => (
                <div key={`${r.key}-${i}`} className="ath-row"><Link className="ath-link ath-mono" to={`/p/${project}/a/${r.key}`}>{r.key}</Link> <Id><DateTime iso={r.at} /></Id></div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
