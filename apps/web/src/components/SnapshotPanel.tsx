import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Field, Select, Table, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

interface SnapshotView { id: string; kind: string; period: string | null; label: string; takenAt: string; takenBy: string; projects: number }
interface Change {
  key: string; name: string; change: 'added' | 'removed' | 'changed' | 'same';
  health: { from: string | null; to: string | null }; phase: { from: string | null; to: string | null }; plannedEnd: { from: string | null; to: string | null };
  late: { from: number | null; to: number | null }; progress: { from: number | null; to: number | null };
}
interface Comparison { from: SnapshotView; to: SnapshotView; changes: Change[] }

/** Instantanés d'un portefeuille (lot 20, B32) : liste, instantané manuel (PMO, administrateur) et comparaison de deux dates. */
export function SnapshotPanel({ portfolio, canTake }: { portfolio: string; canTake: boolean }) {
  const t = fr.snapshots;
  const fail = useFailure();
  const toast = useToast();
  const [list, setList] = useState<SnapshotView[] | null>(null);
  const [label, setLabel] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [reviews, setReviews] = useState<Array<{ id: string; heldOn: string; state: string; summary: string }>>([]);
  const [heldOn, setHeldOn] = useState('');
  const [agenda, setAgenda] = useState('');
  const loadReviews = useCallback(() => { api<Array<{ id: string; heldOn: string; state: string; summary: string }>>('GET', `/v1/portfolios/${portfolio}/reviews`).then((r) => setReviews(Array.isArray(r) ? r : [])).catch(() => setReviews([])); }, [portfolio]);
  useEffect(loadReviews, [loadReviews]);
  const load = useCallback(() => { api<SnapshotView[]>('GET', `/v1/portfolios/${portfolio}/snapshots`).then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([])); }, [portfolio]);
  useEffect(load, [load]);
  if (list === null) return null;

  const take = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', `/v1/portfolios/${portfolio}/snapshots`, { kind: 'manual', ...(label.trim() ? { label: label.trim() } : {}) }); setLabel(''); toast('success', t.taken); load(); } catch (error) { fail(error); }
  };
  const createReview = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', `/v1/portfolios/${portfolio}/reviews`, { heldOn, summary: agenda }); setHeldOn(''); setAgenda(''); toast('success', t.reviewCreated); load(); loadReviews(); } catch (error) { fail(error); }
  };
  const markHeld = async (id: string) => { try { await api('PATCH', `/v1/portfolios/${portfolio}/reviews/${id}`, { state: 'held' }); loadReviews(); } catch (error) { fail(error); } };
  const compare = async (e: FormEvent) => {
    e.preventDefault();
    try { setCmp(await api<Comparison>('GET', `/v1/portfolios/${portfolio}/snapshots/compare?a=${a}&b=${b}`)); } catch (error) { fail(error); }
  };
  const name = (s: SnapshotView) => `${formatDay(s.takenAt, true)} · ${t.kinds[s.kind] ?? s.kind}${s.label ? ` · ${s.label}` : ''}`;
  const arrow = (x: string | number | null, y: string | number | null) => (x === y ? String(y ?? '—') : `${x ?? '—'} → ${y ?? '—'}`);

  return (
    <Card title={t.title}>
      <div className="ath-stack">
        {canTake && (
          <form className="ath-toolbar" onSubmit={(e) => void take(e)}>
            <Field label={t.label} value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
            <Btn type="submit" size="sm">{t.take}</Btn>
          </form>
        )}
        {list.length === 0 ? <p>{t.none}</p> : (
          <>
            <Table caption={t.caption(list.length)}>
              <thead><tr><Th>{t.date}</Th><Th>{t.kind}</Th><Th>{t.labelCol}</Th><Th>{t.projects}</Th></tr></thead>
              <tbody>{list.map((s) => <tr key={s.id}><Td>{formatDay(s.takenAt, true)}</Td><Td>{t.kinds[s.kind] ?? s.kind}</Td><Td>{s.label || '—'}</Td><Td mono>{s.projects}</Td></tr>)}</tbody>
            </Table>
            {list.length > 1 && (
              <form className="ath-toolbar" onSubmit={(e) => void compare(e)}>
                <label className="ath-field__label" htmlFor="snap-a">{t.compareFrom}</label>
                <Select id="snap-a" value={a} onChange={(e) => setA(e.target.value)}><option value="">—</option>{list.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}</Select>
                <label className="ath-field__label" htmlFor="snap-b">{t.compareTo}</label>
                <Select id="snap-b" value={b} onChange={(e) => setB(e.target.value)}><option value="">—</option>{list.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}</Select>
                <Btn type="submit" size="sm" disabled={!a || !b || a === b}>{t.compare}</Btn>
              </form>
            )}
          </>
        )}
        {cmp && (
          <Table caption={t.compareCaption(formatDay(cmp.from.takenAt, true), formatDay(cmp.to.takenAt, true))}>
            <thead><tr><Th>{fr.steer.project}</Th><Th>{t.change}</Th><Th>{t.health}</Th><Th>{t.phase}</Th><Th>{t.plannedEnd}</Th><Th>{fr.steer.late}</Th><Th>{fr.steer.progress}</Th></tr></thead>
            <tbody>{cmp.changes.filter((c) => c.change !== 'same').map((c) => (
              <tr key={c.key}>
                <Td mono><Link className="ath-link" to={`/p/${c.key}`}>{c.key}</Link></Td><Td>{t.changes[c.change]}</Td>
                <Td>{arrow(c.health.from ? fr.steer.health[c.health.from] ?? c.health.from : null, c.health.to ? fr.steer.health[c.health.to] ?? c.health.to : null)}</Td>
                <Td>{arrow(c.phase.from, c.phase.to)}</Td><Td>{arrow(c.plannedEnd.from, c.plannedEnd.to)}</Td><Td mono>{arrow(c.late.from, c.late.to)}</Td><Td mono>{arrow(c.progress.from, c.progress.to)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <h3 className="ath-subsection-title">{t.reviewsTitle}</h3>
        {canTake && (
          <form className="ath-stack" onSubmit={(e) => void createReview(e)} aria-label={t.newReview}>
            <div className="ath-toolbar"><Field label={t.heldOn} type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} required /></div>
            <Field label={t.summaryField} value={agenda} maxLength={4000} onChange={(e) => setAgenda(e.target.value)} />
            <div><Btn type="submit" size="sm" disabled={!heldOn}>{t.createReview}</Btn></div>
          </form>
        )}
        {reviews.length === 0 ? <p>{t.noReview}</p> : (
          <Table caption={t.reviewCaption(reviews.length)}>
            <thead><tr><Th>{t.date}</Th><Th>{fr.dossier.state}</Th><Th>{fr.dossier.summary}</Th><Th>{t.openDossier}</Th></tr></thead>
            <tbody>{reviews.map((r) => (
              <tr key={r.id}><Td>{formatDay(r.heldOn, true)}</Td><Td>{fr.dossier.states[r.state] ?? r.state}</Td><Td>{r.summary || '—'}</Td>
                <Td><Link className="ath-link" to={`/portefeuilles/${portfolio}/revues/${r.id}`}>{t.openDossier}</Link>{canTake && r.state === 'draft' && <> <Btn size="sm" variant="ghost" onClick={() => void markHeld(r.id)}>{t.markHeld}</Btn></>}</Td></tr>
            ))}</tbody>
          </Table>
        )}
        {cmp && cmp.changes.every((c) => c.change === 'same') && <p>{t.noChange}</p>}
      </div>
    </Card>
  );
}
