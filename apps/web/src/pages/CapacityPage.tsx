import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Checkbox, Chart, EmptyState, Field, PageHeader, Select, Table, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

type Level = 'free' | 'normal' | 'tight' | 'overload';
interface Cell { period: string; capacityMinutes: number; loadMinutes: number; level: Level; projects: Array<{ project: string; minutes: number }> }
interface View {
  granularity: 'week' | 'month'; overloadPercent: number; periods: Array<{ key: string; from: string; to: string }>;
  people: Array<{ subject: string; name: string; teams: string[]; cells: Cell[] }>;
  teams: Array<{ team: string; name: string; cells: Array<{ period: string; capacityMinutes: number; nominativeMinutes: number; genericMinutes: number; freeMinutes: number; level: Level }>; needs: Array<{ roleLabel: string; minutes: number[] }> }>;
  bottlenecks: Array<{ team: string; name: string; period: string; saturationPercent: number; projects: Array<{ project: string; minutes: number }> }>;
}
interface Absence { id: string; from: string; to: string; halfDay: boolean; kind: string | null }

export const hours = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;
const percent = (load: number, cap: number) => (cap > 0 ? `${Math.round((load / cap) * 100)} %` : load > 0 ? '∞' : '0 %');
const toIso = (d: Date) => d.toISOString().split('T')[0]!;

/** Capacité (lot 21, B35) : carte de chaleur personne × période (valeur écrite et palier en toutes lettres), charge de l'équipe, goulots, mes absences. */
export function CapacityPage({ session }: { session: Session }) {
  const t = fr.capacity;
  const fail = useFailure();
  const toast = useToast();
  const start = new Date();
  const [from, setFrom] = useState(toIso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))));
  const [to, setTo] = useState(toIso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 5, 0))));
  const [granularity, setGranularity] = useState<'week' | 'month'>('month');
  const [team, setTeam] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [draft, setDraft] = useState({ from: '', to: '', halfDay: false });
  const me = session.user?.id ?? '';
  const load = useCallback(() => {
    const q = new URLSearchParams({ from, to, granularity, ...(team ? { team } : {}) });
    api<View>('GET', `/v1/capacity?${q}`).then((v) => setView(v && Array.isArray(v.people) ? v : null)).catch((e) => { setView(null); fail(e); });
  }, [from, to, granularity, team, fail]);
  useEffect(load, [load]);
  const loadAbsences = useCallback(() => { api<Absence[]>('GET', '/v1/capacity/absences').then((r) => setAbsences(Array.isArray(r) ? r : [])).catch(() => setAbsences([])); }, []);
  useEffect(loadAbsences, [loadAbsences]);

  const chart = useMemo(() => {
    const row = view?.teams.find((x) => x.team === team) ?? view?.teams[0];
    if (!view || !row) return null;
    return { name: row.name, categories: view.periods.map((p) => p.key), series: [{ name: t.capacityLabel, data: row.cells.map((c) => Math.round(c.capacityMinutes / 60)) }, { name: t.loadLabel, data: row.cells.map((c) => Math.round((c.nominativeMinutes + c.genericMinutes) / 60)) }] };
  }, [view, team, t]);

  const addAbsence = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', '/v1/capacity/absences', { subject: me, from: draft.from, to: draft.halfDay ? draft.from : draft.to, kind: 'leave', halfDay: draft.halfDay }); setDraft({ from: '', to: '', halfDay: false }); toast('success', t.absenceAdded); loadAbsences(); load(); } catch (error) { fail(error); }
  };
  const removeAbsence = async (id: string) => { try { await api('DELETE', `/v1/capacity/absences/${id}`) /* sans confirmation : réversible (l'absence se ressaisit) */; loadAbsences(); load(); } catch (error) { fail(error); } };

  return (
    <>
      <PageHeader title={t.title} sub={t.sub} actions={<Link className="ath-link" to="/charge">{fr.steer.nav.teams}</Link>} />
      <div className="ath-stack">
        <div className="ath-toolbar" role="group" aria-label={t.filters}>
          <Field label={t.from} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label={t.to} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <label className="ath-field__label" htmlFor="cap-granularity">{t.granularity}</label>
          <Select id="cap-granularity" value={granularity} onChange={(e) => setGranularity(e.target.value as 'week' | 'month')}><option value="month">{t.month}</option><option value="week">{t.week}</option></Select>
          {view && view.teams.length > 1 && (
            <>
              <label className="ath-field__label" htmlFor="cap-team">{t.team}</label>
              <Select id="cap-team" value={team} onChange={(e) => setTeam(e.target.value)}><option value="">{t.allTeams}</option>{view.teams.map((x) => <option key={x.team} value={x.team}>{x.name}</option>)}</Select>
            </>
          )}
        </div>
        {view === null ? <p role="status">{fr.loading}</p> : view.people.length === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : (
          <>
            <Card title={t.heatmap}>
              <p>{t.legend(view.overloadPercent)}</p>
              <Table caption={t.heatmapCaption(view.people.length)}>
                <thead><tr><Th>{t.person}</Th>{view.periods.map((p) => <Th key={p.key}>{p.key}</Th>)}</tr></thead>
                <tbody>{view.people.map((p) => (
                  <tr key={p.subject}>
                    <Td>{p.name}</Td>
                    {p.cells.map((c) => (
                      <td key={c.period} className={`ath-load ath-load--${c.level}`} title={`${hours(c.loadMinutes)} / ${hours(c.capacityMinutes)}${c.projects.length ? ` : ${c.projects.map((x) => `${x.project} ${hours(x.minutes)}`).join(', ')}` : ''}`}>
                        <strong className="ath-mono">{percent(c.loadMinutes, c.capacityMinutes)}</strong> <small>{t.levels[c.level]}</small>
                      </td>
                    ))}
                  </tr>
                ))}</tbody>
              </Table>
            </Card>
            {chart && <Card title={t.teamChart(chart.name)}><Chart type="bar" title={t.teamChart(chart.name)} unit={t.hoursUnit} categories={chart.categories} series={chart.series} /></Card>}
            <Card title={t.bottlenecks}>
              {view.bottlenecks.length === 0 ? <p>{t.noBottleneck}</p> : (
                <Table caption={t.bottleneckCaption(view.bottlenecks.length)}>
                  <thead><tr><Th>{t.team}</Th><Th>{t.period}</Th><Th>{t.saturation}</Th><Th>{t.projects}</Th></tr></thead>
                  <tbody>{view.bottlenecks.slice(0, 15).map((b) => (
                    <tr key={`${b.team}-${b.period}`}><Td>{b.name}</Td><Td mono>{b.period}</Td><Td mono>{b.saturationPercent} %</Td>
                      <Td>{b.projects.map((p, i) => <span key={p.project}>{i > 0 ? ', ' : ''}<Link className="ath-link ath-mono" to={`/p/${p.project}`}>{p.project}</Link> ({hours(p.minutes)})</span>)}</Td></tr>
                  ))}</tbody>
                </Table>
              )}
            </Card>
          </>
        )}
        <Card title={t.myAbsences}>
          <form className="ath-toolbar" onSubmit={(e) => void addAbsence(e)}>
            <Field label={t.absenceFrom} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} required />
            <Field label={t.absenceTo} type="date" value={draft.halfDay ? draft.from : draft.to} disabled={draft.halfDay} onChange={(e) => setDraft({ ...draft, to: e.target.value })} required={!draft.halfDay} />
            <label className="ath-notify__pref"><Checkbox checked={draft.halfDay} onChange={(e) => setDraft({ ...draft, halfDay: e.target.checked })} />{t.halfDay}</label>
            <Btn type="submit" size="sm" disabled={!draft.from}>{t.addAbsence}</Btn>
          </form>
          {absences.length === 0 ? <p>{t.noAbsence}</p> : (
            <ul>{absences.map((a) => <li key={a.id}>{formatDay(a.from, true)}{a.to !== a.from ? ` → ${formatDay(a.to, true)}` : ''}{a.halfDay ? ` · ${t.halfDayShort}` : ''} <Btn size="sm" variant="ghost" onClick={() => void removeAbsence(a.id)}>{t.removeAbsence}</Btn></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
