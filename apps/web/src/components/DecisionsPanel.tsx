import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Field, Select, Table, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

type Kind = 'continue' | 'suspend' | 'stop' | 'close' | 'change';
interface Decision { id: string; project: string; kind: Kind; rationale: string; conditions: string; owner: string | null; dueOn: string | null; costDelta: number | null; scheduleDeltaDays: number | null; budgetCategory: string | null; appliedAt: string | null; decidedBy: string; decidedAt: string; proposedState: string | null }
interface Alert { kind: string; project: string | null; team: string | null; since: string | null; value: number }

/** Alertes et journal des décisions d'un portefeuille (lot 24, B38). Les alertes sont calculées à la lecture : elles se résolvent seules. */
export function DecisionsPanel({ portfolio, projects, canDecide, canApply }: { portfolio: string; projects: string[]; canDecide: boolean; canApply: boolean }) {
  const t = fr.decisions;
  const fail = useFailure();
  const toast = useToast();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [list, setList] = useState<Decision[] | null>(null);
  const [filter, setFilter] = useState({ project: '', kind: '' });
  const [form, setForm] = useState({ project: '', kind: 'continue' as Kind, rationale: '', conditions: '', cost: '', days: '', category: '' });
  const load = useCallback(() => {
    api<{ alerts: Alert[] }>('GET', `/v1/portfolios/${portfolio}/alerts`).then((r) => setAlerts(Array.isArray(r?.alerts) ? r.alerts : [])).catch(() => setAlerts([]));
    const q = new URLSearchParams({ ...(filter.project ? { project: filter.project } : {}), ...(filter.kind ? { kind: filter.kind } : {}) });
    api<Decision[]>('GET', `/v1/portfolios/${portfolio}/decisions${q.size ? `?${q}` : ''}`).then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([]));
  }, [portfolio, filter]);
  useEffect(load, [load]);
  if (list === null) return null;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('POST', `/v1/portfolios/${portfolio}/decisions`, {
        project: form.project, kind: form.kind, rationale: form.rationale, conditions: form.conditions,
        ...(form.kind === 'change' && form.cost !== '' ? { costDelta: Number(form.cost.replace(',', '.')), budgetCategory: form.category } : {}), ...(form.kind === 'change' && form.days !== '' ? { scheduleDeltaDays: Number(form.days) } : {}),
      });
      setForm({ ...form, rationale: '', conditions: '', cost: '', days: '' }); toast('success', t.saved); load();
    } catch (error) { fail(error); }
  };
  const apply = async (id: string) => { try { await api('POST', `/v1/portfolios/${portfolio}/decisions/${id}/apply`, {}); toast('success', t.applied); load(); } catch (error) { fail(error); } };
  const what = (a: Alert) => (a.project ?? a.team ?? '');

  return (
    <div className="ath-stack">
      <Card title={t.alerts}>
        {alerts === null ? <p role="status">{fr.loading}</p> : alerts.length === 0 ? <p>{t.noAlert}</p> : (
          <Table caption={t.alertsCaption(alerts.length)}>
            <thead><tr><Th>{t.alertKind}</Th><Th>{t.target}</Th><Th>{t.since}</Th><Th>{t.cause}</Th></tr></thead>
            <tbody>{alerts.map((a, i) => (
              <tr key={`${a.kind}-${what(a)}-${i}`}><Td>{t.kinds[a.kind] ?? a.kind}</Td><Td mono>{a.project ? <Link className="ath-link" to={`/p/${a.project}`}>{a.project}</Link> : what(a)}</Td><Td>{a.since ? formatDay(a.since, true) : t.now}</Td><Td>{t.cause_[a.kind]?.(a.value) ?? ''}</Td></tr>
            ))}</tbody>
          </Table>
        )}
        <p><small>{t.autoResolve}</small></p>
      </Card>
      <Card title={t.journal}>
        <div className="ath-stack">
          <div className="ath-toolbar" role="group" aria-label={t.filters}>
            <label className="ath-field__label" htmlFor="dec-fp">{t.project}</label>
            <Select id="dec-fp" value={filter.project} onChange={(e) => setFilter({ ...filter, project: e.target.value })}><option value="">{t.all}</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
            <label className="ath-field__label" htmlFor="dec-fk">{t.kind}</label>
            <Select id="dec-fk" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}><option value="">{t.all}</option>{(['continue', 'suspend', 'stop', 'close', 'change'] as const).map((k) => <option key={k} value={k}>{t.decisionKinds[k]}</option>)}</Select>
          </div>
          {list.length === 0 ? <p>{t.none}</p> : (
            <Table caption={t.journalCaption(list.length)}>
              <thead><tr><Th>{t.date}</Th><Th>{t.project}</Th><Th>{t.kind}</Th><Th>{t.rationale}</Th><Th>{t.proposal}</Th><Th>{t.by}</Th>{canApply && <Th>{t.actions}</Th>}</tr></thead>
              <tbody>{list.map((d) => (
                <tr key={d.id}>
                  <Td>{formatDay(d.decidedAt, true)}</Td><Td mono><Link className="ath-link" to={`/p/${d.project}`}>{d.project}</Link></Td><Td>{t.decisionKinds[d.kind]}</Td>
                  <Td>{d.rationale}{d.conditions ? ` · ${t.conditions} : ${d.conditions}` : ''}{d.dueOn ? ` · ${t.due(formatDay(d.dueOn, true))}` : ''}{d.costDelta !== null ? ` · ${d.costDelta} €` : ''}{d.scheduleDeltaDays !== null ? ` · ${d.scheduleDeltaDays} j` : ''}</Td>
                  <Td>{d.proposedState ? t.proposed(d.proposedState) : '—'}</Td><Td>{d.decidedBy}</Td>
                  {canApply && <Td>{d.kind === 'change' && d.costDelta !== null ? (d.appliedAt ? t.appliedOn(formatDay(d.appliedAt, true)) : <Btn size="sm" variant="ghost" onClick={() => void apply(d.id)}>{t.apply}</Btn>) : null}</Td>}
                </tr>
              ))}</tbody>
            </Table>
          )}
          {canDecide && (
            <form className="ath-stack" onSubmit={(e) => void create(e)} aria-label={t.newDecision}>
              <div className="ath-toolbar">
                <label className="ath-field__label" htmlFor="dec-p">{t.project}</label>
                <Select id="dec-p" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} required><option value="">—</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
                <label className="ath-field__label" htmlFor="dec-k">{t.kind}</label>
                <Select id="dec-k" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>{(['continue', 'suspend', 'stop', 'close', 'change'] as const).map((k) => <option key={k} value={k}>{t.decisionKinds[k]}</option>)}</Select>
                <Field label={t.rationale} value={form.rationale} maxLength={2000} onChange={(e) => setForm({ ...form, rationale: e.target.value })} required />
                <Field label={t.conditions} value={form.conditions} maxLength={2000} onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
              </div>
              {form.kind === 'change' && (
                <div className="ath-toolbar">
                  <Field label={t.costDelta} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                  <Field label={t.category} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  <Field label={t.daysDelta} type="number" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
                </div>
              )}
              {['suspend', 'stop', 'close'].includes(form.kind) && <p><small>{t.proposalNote}</small></p>}
              <div><Btn type="submit" size="sm" disabled={!form.project || !form.rationale.trim()}>{t.record}</Btn></div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
