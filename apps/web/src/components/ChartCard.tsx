import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Field, Select } from '@athena/ui';
import { api } from '../api';
import { fr } from '../i18n';

/**
 * Carte graphique sur une recherche (ADR-0005 § 2.3, T-0156) : anneau de répartition par un champ (total au centre, légende
 * chiffrée), barres par valeur, ou indicateur chiffré. Au-delà de 7 valeurs, les plus petites forment « Autres ». Couleurs :
 * palette de données du thème, jamais l'action ni un signal. SVG sans style en ligne ; chaque valeur ouvre la recherche filtrée.
 */
export type ChartForm = 'donut' | 'bars' | 'count';
export interface ChartSpec { query?: string | undefined; projects?: string[] | undefined; field?: string | undefined; form?: ChartForm | undefined }
interface Facets { total: number; buckets: Array<{ value: string; label: string; count: number }>; others: number }

const t = fr.chart;
/** Champs proposés : ceux qui se répartissent en peu de valeurs lisibles. */
export const CHART_FIELDS = ['status', 'category', 'tracker', 'project', 'priority', 'severity'] as const;
const fieldClause = (field: string, value: string) => (field === 'category' ? `category = ${value}` : field === 'tracker' ? `tracker = ${value}` : field === 'project' ? `project = ${value}` : `${field} = "${value.replace(/["\\]/g, '\\$&')}"`);
const searchOf = (spec: ChartSpec, extra?: string) => {
  const q = [spec.query?.trim(), extra].filter(Boolean).join(' AND ');
  return `/recherche?q=${encodeURIComponent(q)}${spec.projects?.length ? `&p=${spec.projects.join(',')}` : ''}`;
};
const labelOf = (field: string | undefined, b: { value: string; label: string }) => (b.value === '' ? t.empty : field === 'category' ? fr.chart.categories[b.value] ?? b.label : b.label);

export function ChartBody({ spec }: { spec: ChartSpec }) {
  const [data, setData] = useState<Facets | null | undefined>(undefined);
  const field = spec.form === 'count' ? 'status' : spec.field ?? 'status';
  const scope = spec.projects?.join(',') ?? '';
  useEffect(() => {
    setData(undefined);
    api<Facets>('GET', `/v1/search/facets?q=${encodeURIComponent(spec.query ?? '')}&field=${field}${scope ? `&project=${scope}` : ''}`).then(setData).catch(() => setData(null));
  }, [spec.query, field, scope]);
  if (data === undefined) return <p role="status">{fr.loading}</p>;
  if (data === null) return <p>{t.unavailable}</p>;
  if (spec.form === 'count') {
    return <div className="ath-chart-count"><span className="ath-tile__value">{data.total}</span><span className="ath-field__hint">{t.tickets(data.total)}</span></div>;
  }
  if (data.total === 0) return <p>{t.none}</p>;
  const parts = [...data.buckets.map((b, i) => ({ key: b.value, label: labelOf(spec.field, b), count: b.count, series: String(i + 1), href: searchOf(spec, fieldClause(field, b.value)) })),
    ...(data.others > 0 ? [{ key: '__others', label: t.others, count: data.others, series: 'others', href: searchOf(spec) }] : [])];
  const legend = (
    <ul className="ath-legend ath-legend--column">
      {parts.map((p) => (
        <li key={p.key}><span className={`ath-legend__swatch ath-series--${p.series}`} aria-hidden="true" /><Link className="ath-link" to={p.href}>{p.label}</Link> <span className="ath-num">{p.count}</span></li>
      ))}
    </ul>
  );
  if (spec.form === 'bars') {
    const max = Math.max(...parts.map((p) => p.count));
    return (
      <ul className="ath-stack ath-list-plain" aria-label={t.barsLabel(data.total)}>
        {parts.map((p) => (
          <li key={p.key} className="ath-chart-bar">
            <Link className="ath-link ath-chart-bar__label" to={p.href}>{p.label}</Link>
            <svg className="ath-chart-bar__track" width="100%" height="12" aria-hidden="true"><rect className={`ath-series--${p.series}`} x="0" y="0" width={`${(p.count / max) * 100}%`} height="12" /></svg>
            <span className="ath-num">{p.count}</span>
          </li>
        ))}
      </ul>
    );
  }
  // Anneau : un arc par valeur (circonférence normalisée à 100), le total au centre.
  let offset = 25;
  return (
    <div className="ath-donut">
      <svg viewBox="0 0 42 42" className="ath-donut__svg" role="img" aria-label={t.donutLabel(data.total, parts.map((p) => `${p.label} ${p.count}`).join(', '))}>
        <circle className="ath-donut__hole" cx="21" cy="21" r="15.915" />
        {parts.map((p) => {
          const share = (p.count / data.total) * 100;
          const arc = <circle key={p.key} className={`ath-donut__arc ath-series--${p.series}`} cx="21" cy="21" r="15.915" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={offset} />;
          offset -= share;
          return arc;
        })}
        <text x="21" y="21" className="ath-donut__total" textAnchor="middle" dominantBaseline="central">{data.total}</text>
      </svg>
      {legend}
    </div>
  );
}

/** Ajout d'une carte graphique depuis « Organiser » : titre, recherche, champ, forme. */
export function ChartForm({ onAdd }: { onAdd: (chart: { title: string; query: string; field: string; form: ChartForm }) => void }) {
  const id = useId();
  const [form, setForm] = useState<{ title: string; query: string; field: string; kind: ChartForm }>({ title: '', query: '', field: 'status', kind: 'donut' });
  return (
    <div className="ath-stack">
      <Field label={t.title} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t.titleExample} />
      <Field label={t.query} value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} mono placeholder={t.queryExample} />
      <div className="ath-field">
        <label className="ath-field__label" htmlFor={`${id}-form`}>{t.form}</label>
        <Select id={`${id}-form`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ChartForm })}>
          {(['donut', 'bars', 'count'] as const).map((k) => <option key={k} value={k}>{t.forms[k]}</option>)}
        </Select>
      </div>
      {form.kind !== 'count' && (
        <div className="ath-field">
          <label className="ath-field__label" htmlFor={`${id}-field`}>{t.field}</label>
          <Select id={`${id}-field`} value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}>
            {CHART_FIELDS.map((f) => <option key={f} value={f}>{t.fields[f]}</option>)}
          </Select>
        </div>
      )}
      <div><Btn size="sm" disabled={!form.title.trim()} onClick={() => onAdd({ title: form.title.trim(), query: form.query.trim(), field: form.field, form: form.kind })}>{t.add}</Btn></div>
    </div>
  );
}
