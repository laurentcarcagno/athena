import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { DashCard, DashGrid, PageHeader, StatCard, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { Dashboard } from '../components/Dashboard';
import { fr } from '../i18n';

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

/** Widgets d'extension : chacun suit le modèle de carte commun (ADR-0005 § 2.3, T-0155) ; le plugin fournit des données, jamais du HTML. */
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
    <section className="ath-stack" aria-label={fr.dashboard.extensions}>
      <h2 className="ath-section-title">{fr.dashboard.extensions}</h2>
      <DashGrid>
        {models.map(({ id, title, model }) => (
          <DashCard key={id} title={model.kind === 'stat' ? title : model.title} sub={model.kind === 'stat' ? undefined : title} size="M">
            {model.kind === 'stat' ? <StatCard label={model.label} value={model.value} />
              : model.kind === 'table' ? (
                <Table><thead><tr>{model.columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
                  <tbody>{model.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <Td key={j}>{cell}</Td>)}</tr>)}</tbody></Table>
              ) : <ul className="ath-stack">{model.items.map((item, i) => <li key={i}>{item}</li>)}</ul>}
          </DashCard>
        ))}
      </DashGrid>
    </section>
  );
}

/**
 * Avancement du projet (ADR-0005 § 2.3, T-0155) : des cartes organisables (indicateurs, prochaine version, flux cumulé,
 * trackers par statut, vélocité, activité récente), sur le moteur des tableaux de bord, puis les widgets d'extension.
 */
export function DashboardPage({ tabs, title = fr.reports.names.avancement }: { tabs?: ReactNode; title?: string } = {}) {
  const { project } = useParams();
  return (
    <>
      <PageHeader title={title} />
      {tabs}
      <Dashboard project={String(project)} page="avancement" />
      <PluginWidgets project={String(project)} />
    </>
  );
}
