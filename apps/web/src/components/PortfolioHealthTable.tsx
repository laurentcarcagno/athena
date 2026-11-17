import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Checkbox, EmptyState, Select, StatusPill, Table, Td, Th, type PillKind } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

export type Health = 'ok' | 'attention' | 'critical';
export interface HealthRowData {
  key: string; name: string; lifecycle: { key: string; name: string; category: string };
  health: Health; computedHealth: Health; overridden: boolean; declaredHealth: Health | null; declaredAt: string | null; gap: boolean;
  reasons: string[]; note: string; plannedStart: string | null; plannedEnd: string | null; sponsor: string | null; phase: string | null; nextReview: string | null;
  progress: number; open: number; late: number; blocked: number; dueSoon: number; maxRisk: number | null;
}
export interface PortfolioHealthData {
  portfolio: { key: string; name: string; projects: number };
  rows: HealthRowData[];
  totals: { projects: number; byHealth: Record<Health, number>; gaps: number; late: number; blocked: number; open: number; progress: number };
  hiddenByState: number;
}

const KIND: Record<Health, PillKind> = { ok: 'success', attention: 'warning', critical: 'danger' };
const CATEGORIES = ['pipeline', 'active', 'suspended', 'closed', 'cancelled', 'archived'] as const;

/** Pastille de santé, libellée ; une santé forcée est encadrée en pointillés et le dit en toutes lettres. */
export const HealthPill = ({ health, forced = false }: { health: Health; forced?: boolean }) => (
  <span className={forced ? 'ath-health--forced' : undefined}><StatusPill kind={KIND[health]}>{fr.steer.health[health]}</StatusPill>{forced && <small> {fr.steerHealth.forced}</small>}</span>
);

const day = (iso: string | null) => (iso ? <time dateTime={iso}>{formatDay(iso, true)}</time> : <span>{fr.steerHealth.notSet}</span>);

/** Tableau de santé d'un portefeuille (lot 18, B20) : calculée, déclarée et forcée côte à côte, dates, phase, risque, filtres dans l'adresse non requis. */
export function PortfolioHealthTable({ portfolio }: { portfolio: string }) {
  const t = fr.steerHealth;
  const fail = useFailure();
  const [data, setData] = useState<PortfolioHealthData | null>(null);
  const [state, setState] = useState('');
  const [health, setHealth] = useState('');
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams();
    if (state) q.set('state', state);
    if (health) q.set('health', health);
    if (closed) q.set('includeClosed', '1');
    setError(false);
    api<PortfolioHealthData>('GET', `/v1/portfolios/${portfolio}/health?${q}`).then((d) => setData(d && Array.isArray(d.rows) ? d : null)).catch((e) => { setError(true); fail(e); });
  }, [portfolio, state, health, closed, fail]);

  if (error) return <Card title={t.title}><p role="alert">{t.degraded}</p></Card>;
  if (!data) return <p role="status">{fr.loading}</p>;
  return (
    <Card title={t.title}>
      <div className="ath-stack">
        <p>{t.scope} · {t.shown(data.rows.length)}{data.hiddenByState > 0 && !closed ? ` · ${t.hiddenClosed(data.hiddenByState)}` : ''}</p>
        <ul className="ath-tiles" aria-label={t.tiles}>
          {([
            ['projects', data.totals.projects, () => setHealth('')],
            ['critical', data.totals.byHealth.critical, () => setHealth('critical')],
            ['attention', data.totals.byHealth.attention, () => setHealth('attention')],
            ['ok', data.totals.byHealth.ok, () => setHealth('ok')],
            ['gaps', data.totals.gaps, null],
            ['late', data.totals.late, null],
          ] as const).map(([id, value, action]) => (
            <li key={id} className="ath-tile">
              <span className="ath-tile__value ath-mono">{value}</span>
              {action ? <button type="button" className="ath-link" onClick={action}>{t.tile[id]}</button> : <span>{t.tile[id]}</span>}
            </li>
          ))}
        </ul>
        <div className="ath-toolbar">
          <label className="ath-field__label" htmlFor="ph-state">{t.stateFilter}</label>
          <Select id="ph-state" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">{t.all}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t.categories[c]}</option>)}
          </Select>
          <label className="ath-field__label" htmlFor="ph-health">{t.healthFilter}</label>
          <Select id="ph-health" value={health} onChange={(e) => setHealth(e.target.value)}>
            <option value="">{t.all}</option>
            {(['critical', 'attention', 'ok'] as const).map((h) => <option key={h} value={h}>{fr.steer.health[h]}</option>)}
          </Select>
          <label className="ath-notify__pref"><Checkbox checked={closed} onChange={(e) => setClosed(e.target.checked)} />{t.includeClosed}</label>
        </div>
        {data.rows.length === 0 ? <EmptyState eyebrow={t.title} title={data.portfolio.projects === 0 ? t.emptyPortfolio : t.emptyFilter} /> : (
          <Table caption={t.caption(data.rows.length)}>
            <thead><tr>
              <Th>{fr.steer.project}</Th><Th>{t.health}</Th><Th>{t.declared}</Th><Th>{t.state}</Th><Th>{t.phase}</Th><Th>{t.nextReview}</Th><Th>{t.plannedEnd}</Th>
              <Th>{fr.steer.progress}</Th><Th>{fr.steer.late}</Th><Th>{fr.steer.blocked}</Th><Th>{t.maxRisk}</Th><Th>{t.sponsor}</Th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key}>
                  <Td mono><Link className="ath-link" to={`/p/${r.key}`}>{r.key}</Link> <span>{r.name}</span></Td>
                  <Td><HealthPill health={r.health} forced={r.overridden} />{r.overridden && <> <small>{t.computed} : {fr.steer.health[r.computedHealth]}</small></>}</Td>
                  <Td>{r.declaredHealth ? <><HealthPill health={r.declaredHealth} />{r.gap && <> <small>{t.gap}</small></>}</> : <span>{t.noWeather}</span>}</Td>
                  <Td>{r.lifecycle.name}</Td>
                  <Td mono>{r.phase ? <Link className="ath-link" to={`/p/${r.key}`}>{r.phase}</Link> : t.notSet}</Td>
                  <Td>{day(r.nextReview)}</Td>
                  <Td>{day(r.plannedEnd)}</Td>
                  <Td mono>{r.progress} %</Td>
                  <Td mono>{r.late > 0 ? <Link className="ath-link" to={`/p/${r.key}/board`}>{r.late}</Link> : r.late}</Td>
                  <Td mono>{r.blocked}</Td>
                  <Td mono>{r.maxRisk === null ? '—' : <Link className="ath-link" to={`/p/${r.key}/rapports/risques`}>{r.maxRisk}</Link>}</Td>
                  <Td>{r.sponsor ?? t.notSet}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
