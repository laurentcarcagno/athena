import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Chart, EmptyState, Field, PageHeader, Select, Table, Td, Textarea, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface Line { category: string; budget: number; committed: number; actual: number; forecast: number; eac: number; variance: number }
interface Finance {
  project: string; lines: Line[]; totals: Omit<Line, 'category'>;
  alerts: Array<{ kind: 'exceeded' | 'overrun'; category: string | null; excess: number }>;
  curve: Array<{ period: string; actualCumulative: number; forecastCumulative: number }>;
}
interface Category { key: string; name: string; kind: string }
interface Rate { subject: string | null; roleLabel: string | null; hourlyRate: number; validFrom: string }
interface TimeCost { cost: number; minutes: number; unpricedMinutes: number }
interface ImportReport { fileName: string; rows: number; imported: number; rejected: Array<{ line: number; reason: string }>; alreadyImported: boolean }

export const euros = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))} €`;

/** Finances d'un projet (lot 23, B37) : budget, engagé, réel, prévisions et estimation à terminaison par catégorie, alertes, courbe en S, saisie et import des réels. */
export function FinancePage({ session }: { session: Session }) {
  const t = fr.finance;
  const fail = useFailure();
  const toast = useToast();
  const roles = session.user?.roles ?? [];
  const writer = roles.includes('athena-admin') || roles.includes('athena-finance');
  const [project, setProject] = useState('');
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [data, setData] = useState<Finance | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [kind, setKind] = useState<'budget' | 'actual' | 'forecast'>('budget');
  const [form, setForm] = useState({ category: '', period: '', amount: '', budgetKind: 'initial', reason: '' });
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [timeCost, setTimeCost] = useState<TimeCost | null>(null);
  const [rate, setRate] = useState({ who: '', role: '', hourly: '', from: '' });

  useEffect(() => {
    api<Array<{ key: string; name: string }>>('GET', '/v1/projects').then((p) => setProjects(Array.isArray(p) ? p : [])).catch(() => setProjects([]));
    api<Category[]>('GET', '/v1/finance/categories').then((c) => setCats(Array.isArray(c) ? c : [])).catch(() => setCats([]));
  }, []);
  const loadRates = useCallback(() => {
    if (!writer) return;
    api<Rate[]>('GET', '/v1/finance/rates').then((r) => setRates(Array.isArray(r) ? r : [])).catch(() => setRates([]));
  }, [writer]);
  useEffect(loadRates, [loadRates]);
  const load = useCallback(() => {
    if (!project) { setData(null); return; }
    if (writer) api<TimeCost>('GET', `/v1/finance/projects/${project}/time-cost`).then((r) => setTimeCost(r && typeof r.cost === 'number' ? r : null)).catch(() => setTimeCost(null));
    api<Finance>('GET', `/v1/finance/projects/${project}`).then((d) => setData(d && Array.isArray(d.lines) ? d : null)).catch((e) => { setData(null); fail(e); });
  }, [project, fail, writer]);
  useEffect(load, [load]);

  const chart = useMemo(() => (data && data.lines.length ? { categories: data.lines.map((l) => l.category), series: [{ name: t.budget, data: data.lines.map((l) => l.budget) }, { name: t.actual, data: data.lines.map((l) => l.actual) }, { name: t.eac, data: data.lines.map((l) => l.eac) }] } : null), [data, t]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount.replace(',', '.'));
    try {
      if (kind === 'budget') await api('POST', '/v1/finance/budget', { project, category: form.category, kind: form.budgetKind, amount, reason: form.reason });
      else if (kind === 'actual') await api('POST', '/v1/finance/actuals', { project, category: form.category, period: form.period, amount });
      else await api('PUT', '/v1/finance/forecasts', { project, category: form.category, period: form.period, amount });
      setForm({ ...form, amount: '', reason: '' }); toast('success', t.saved); load();
    } catch (error) { fail(error); }
  };
  const saveRate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('POST', '/v1/finance/rates', { ...(rate.who ? { subject: rate.who.trim() } : { roleLabel: rate.role.trim() }), hourlyRate: Number(rate.hourly.replace(',', '.')), validFrom: rate.from });
      setRate({ who: '', role: '', hourly: '', from: '' }); toast('success', t.rateSaved); loadRates(); load();
    } catch (error) { fail(error); }
  };
  const runImport = async (e: FormEvent) => {
    e.preventDefault();
    try { const r = await api<ImportReport>('POST', '/v1/finance/actuals/import', { fileName: 'saisie.csv', content: csv }); setReport(r); if (!r.alreadyImported) setCsv(''); load(); } catch (error) { fail(error); }
  };

  return (
    <>
      <PageHeader title={t.title} sub={t.sub} />
      <div className="ath-stack">
        <div className="ath-toolbar">
          <label className="ath-field__label" htmlFor="fin-project">{t.project}</label>
          <Select id="fin-project" value={project} onChange={(e) => { setProject(e.target.value); setReport(null); }}><option value="">—</option>{projects.map((p) => <option key={p.key} value={p.key}>{p.key} · {p.name}</option>)}</Select>
        </div>
        {!project ? <EmptyState eyebrow={t.title} title={t.pick} /> : data === null ? <p role="status">{fr.loading}</p> : (
          <>
            {data.alerts.length > 0 && (
              <Card title={t.alerts}>
                <ul>{data.alerts.map((a) => <li key={`${a.kind}-${a.category}`}><strong>{t.alertKinds[a.kind]}</strong> : {a.category} · {t.excess(euros(a.excess))}</li>)}</ul>
              </Card>
            )}
            <Card title={t.byCategory}>
              {data.lines.length === 0 ? <p>{t.none}</p> : (
                <Table caption={t.caption(data.project)}>
                  <thead><tr><Th>{t.category}</Th><Th>{t.budget}</Th><Th>{t.committed}</Th><Th>{t.actual}</Th><Th>{t.forecast}</Th><Th>{t.eac}</Th><Th>{t.variance}</Th></tr></thead>
                  <tbody>
                    {data.lines.map((l) => <tr key={l.category}><Td>{l.category}</Td><Td mono>{euros(l.budget)}</Td><Td mono>{euros(l.committed)}</Td><Td mono>{euros(l.actual)}</Td><Td mono>{euros(l.forecast)}</Td><Td mono>{euros(l.eac)}</Td><Td mono>{euros(l.variance)}{l.variance < 0 ? ` · ${t.over}` : ''}</Td></tr>)}
                    <tr><Td><strong>{t.total}</strong></Td><Td mono>{euros(data.totals.budget)}</Td><Td mono>{euros(data.totals.committed)}</Td><Td mono>{euros(data.totals.actual)}</Td><Td mono>{euros(data.totals.forecast)}</Td><Td mono>{euros(data.totals.eac)}</Td><Td mono>{euros(data.totals.variance)}</Td></tr>
                  </tbody>
                </Table>
              )}
            </Card>
            {chart && <Card title={t.chart}><Chart type="bar" title={t.chart} unit="€" categories={chart.categories} series={chart.series} /></Card>}
            {data.curve.length > 1 && <Card title={t.curve}><Chart type="line" title={t.curve} unit="€" categories={data.curve.map((c) => c.period)} series={[{ name: t.actualCumulative, data: data.curve.map((c) => c.actualCumulative) }, { name: t.eacCumulative, data: data.curve.map((c) => c.forecastCumulative) }]} /></Card>}
            {writer && (
              <Card title={t.input}>
                <div className="ath-stack">
                  <div className="ath-toolbar" role="group" aria-label={t.kindLabel}>
                    {(['budget', 'actual', 'forecast'] as const).map((k) => <Btn key={k} size="sm" variant={kind === k ? 'primary' : 'ghost'} aria-pressed={kind === k} onClick={() => setKind(k)}>{t.kinds[k]}</Btn>)}
                  </div>
                  <form className="ath-toolbar" onSubmit={(e) => void save(e)} aria-label={t.kinds[kind]}>
                    <label className="ath-field__label" htmlFor="fin-cat">{t.category}</label>
                    <Select id="fin-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required><option value="">—</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select>
                    {kind === 'budget' ? (
                      <>
                        <label className="ath-field__label" htmlFor="fin-bk">{t.budgetKind}</label>
                        <Select id="fin-bk" value={form.budgetKind} onChange={(e) => setForm({ ...form, budgetKind: e.target.value })}>{(['initial', 'amendment', 'arbitration'] as const).map((k) => <option key={k} value={k}>{t.budgetKinds[k]}</option>)}</Select>
                        <Field label={t.reason} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                      </>
                    ) : <Field label={t.period} placeholder="2026-07" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required />}
                    <Field label={t.amount} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                    <Btn type="submit" size="sm" disabled={!form.category || !form.amount}>{t.save}</Btn>
                  </form>
                  <form className="ath-stack" onSubmit={(e) => void runImport(e)} aria-label={t.importForm}>
                    <label className="ath-field__label" htmlFor="fin-csv">{t.importHelp}</label>
                    <Textarea id="fin-csv" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} />
                    <div><Btn type="submit" size="sm" disabled={!csv.trim()}>{t.import}</Btn></div>
                  </form>
                  {report && (
                    <div role="status">
                      <p>{report.alreadyImported ? t.alreadyImported(report.imported) : t.imported(report.imported, report.rows)}</p>
                      {report.rejected.length > 0 && <ul>{report.rejected.slice(0, 20).map((r) => <li key={r.line}>{t.line(r.line)} : {r.reason}</li>)}</ul>}
                    </div>
                  )}
                </div>
              </Card>
            )}
            {writer && (
              <Card title={t.ratesTitle}>
                <div className="ath-stack">
                  {timeCost && <p>{t.timeCost(euros(timeCost.cost), Math.round(timeCost.minutes / 60), Math.round(timeCost.unpricedMinutes / 60))}</p>}
                  <form className="ath-toolbar" onSubmit={(e) => void saveRate(e)} aria-label={t.rateForm}>
                    <Field label={t.rateSubject} mono value={rate.who} onChange={(e) => setRate({ ...rate, who: e.target.value })} />
                    <Field label={t.rateRole} value={rate.role} onChange={(e) => setRate({ ...rate, role: e.target.value })} />
                    <Field label={t.hourly} value={rate.hourly} onChange={(e) => setRate({ ...rate, hourly: e.target.value })} required />
                    <Field label={t.validFrom} type="date" value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })} required />
                    <Btn type="submit" size="sm" disabled={(!rate.who && !rate.role) || !rate.hourly || !rate.from}>{t.saveRate}</Btn>
                  </form>
                  {rates.length === 0 ? <p>{t.noRate}</p> : (
                    <Table caption={t.ratesCaption(rates.length)}>
                      <thead><tr><Th>{t.rateWho}</Th><Th>{t.hourly}</Th><Th>{t.validFrom}</Th></tr></thead>
                      <tbody>{rates.map((r, i) => <tr key={`${r.subject ?? r.roleLabel}-${r.validFrom}-${i}`}><Td>{r.subject ?? r.roleLabel}</Td><Td mono>{euros(r.hourlyRate)} / h</Td><Td>{r.validFrom}</Td></tr>)}</tbody>
                    </Table>
                  )}
                  <p><small>{t.rateConfidential}</small></p>
                </div>
              </Card>
            )}
            <p><Link className="ath-link" to={`/p/${project}`}>{t.openProject}</Link></p>
          </>
        )}
      </div>
    </>
  );
}
