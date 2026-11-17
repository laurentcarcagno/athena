import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Field, Table, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

interface Link_ { id: string; from: { key: string; project: string }; to: { key: string; project: string }; lagDays: number; slackDays: number | null; critical: boolean }
interface Graph { projects: string[]; links: Link_[]; matrix: Array<{ from: string; to: string; count: number; critical: number }> }
interface Propagation { origin: string; shiftDays: number; impacts: Array<{ key: string; project: string; shiftDays: number; newStart: string | null; newEnd: string | null }> }

/** Dépendances entre projets (lot 22, B36) : matrice, liens avec leur marge, propagation d'un retard en lecture seule, création par le PMO. */
export function DependenciesPanel({ portfolio, canEdit }: { portfolio: string; canEdit: boolean }) {
  const t = fr.dependencies;
  const fail = useFailure();
  const toast = useToast();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [form, setForm] = useState({ from: '', to: '', lag: '0' });
  const [prop, setProp] = useState({ ticket: '', shift: '3' });
  const [result, setResult] = useState<Propagation | null>(null);
  const load = useCallback(() => { api<Graph>('GET', `/v1/portfolios/${portfolio}/dependencies`).then((g) => setGraph(g && Array.isArray(g.links) ? g : null)).catch(() => setGraph(null)); }, [portfolio]);
  useEffect(load, [load]);
  if (!graph) return null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', '/v1/dependencies', { from: form.from.trim(), to: form.to.trim(), lagDays: Number(form.lag) }); setForm({ from: '', to: '', lag: '0' }); toast('success', t.added); load(); } catch (error) { fail(error); }
  };
  const remove = async (id: string) => { try { await api('DELETE', `/v1/dependencies/${id}`) /* sans confirmation : réversible (le lien se recrée) */; load(); } catch (error) { fail(error); } };
  const propagate = async (e: FormEvent) => {
    e.preventDefault();
    try { setResult(await api<Propagation>('POST', '/v1/dependencies/propagate', { ticket: prop.ticket.trim(), shiftDays: Number(prop.shift) })); } catch (error) { fail(error); }
  };
  const cell = (from: string, to: string) => graph.matrix.find((m) => m.from === from && m.to === to);

  return (
    <Card title={t.title}>
      <div className="ath-stack">
        {graph.links.length === 0 ? <p>{t.none}</p> : (
          <>
            <Table caption={t.matrixCaption(graph.projects.length)}>
              <thead><tr><Th>{t.predecessor}</Th>{graph.projects.map((p) => <Th key={p}>{p}</Th>)}</tr></thead>
              <tbody>{graph.projects.map((from) => (
                <tr key={from}><Td mono>{from}</Td>{graph.projects.map((to) => { const m = cell(from, to); return <Td key={to} mono>{m ? `${m.count}${m.critical ? ` · ${t.criticalCount(m.critical)}` : ''}` : '·'}</Td>; })}</tr>
              ))}</tbody>
            </Table>
            <Table caption={t.linksCaption(graph.links.length)}>
              <thead><tr><Th>{t.predecessor}</Th><Th>{t.successor}</Th><Th>{t.lag}</Th><Th>{t.slack}</Th>{canEdit && <Th>{t.actions}</Th>}</tr></thead>
              <tbody>{graph.links.map((l) => (
                <tr key={l.id}>
                  <Td mono><Link className="ath-link" to={`/p/${l.from.project}/a/${l.from.key}`}>{l.from.key}</Link></Td><Td mono><Link className="ath-link" to={`/p/${l.to.project}/a/${l.to.key}`}>{l.to.key}</Link></Td>
                  <Td mono>{l.lagDays}</Td><Td>{l.slackDays === null ? t.noDates : `${l.slackDays} ${t.days}${l.critical ? ` · ${l.slackDays < 0 ? t.violated : t.critical}` : ''}`}</Td>
                  {canEdit && <Td><Btn size="sm" variant="ghost" aria-label={t.removeLink(l.from.key, l.to.key)} onClick={() => void remove(l.id)}>{t.remove}</Btn></Td>}
                </tr>
              ))}</tbody>
            </Table>
          </>
        )}
        {canEdit && (
          <form className="ath-toolbar" onSubmit={(e) => void add(e)} aria-label={t.addForm}>
            <Field label={t.predecessorKey} mono value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required />
            <Field label={t.successorKey} mono value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} required />
            <Field label={t.lag} type="number" value={form.lag} onChange={(e) => setForm({ ...form, lag: e.target.value })} />
            <Btn type="submit" size="sm" disabled={!form.from || !form.to}>{t.add}</Btn>
          </form>
        )}
        {graph.links.length > 0 && (
          <form className="ath-toolbar" onSubmit={(e) => void propagate(e)} aria-label={t.propagateForm}>
            <Field label={t.propagateTicket} mono value={prop.ticket} onChange={(e) => setProp({ ...prop, ticket: e.target.value })} required />
            <Field label={t.propagateShift} type="number" value={prop.shift} onChange={(e) => setProp({ ...prop, shift: e.target.value })} required />
            <Btn type="submit" size="sm" variant="ghost" disabled={!prop.ticket}>{t.propagate}</Btn>
          </form>
        )}
        {result && (result.impacts.length === 0 ? <p>{t.noImpact}</p> : (
          <Table caption={t.impactCaption(result.origin, result.shiftDays, result.impacts.length)}>
            <thead><tr><Th>{t.ticket}</Th><Th>{t.shift}</Th><Th>{t.newStart}</Th><Th>{t.newEnd}</Th></tr></thead>
            <tbody>{result.impacts.map((i) => <tr key={i.key}><Td mono><Link className="ath-link" to={`/p/${i.project}/a/${i.key}`}>{i.key}</Link></Td><Td mono>+{i.shiftDays} {t.days}</Td><Td>{i.newStart ? formatDay(i.newStart, true) : '—'}</Td><Td>{i.newEnd ? formatDay(i.newEnd, true) : '—'}</Td></tr>)}</tbody>
          </Table>
        ))}
        <p><small>{t.readOnly}</small></p>
      </div>
    </Card>
  );
}
