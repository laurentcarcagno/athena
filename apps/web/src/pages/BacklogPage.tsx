import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Field, Id, PageHeader, Select, StatusPill, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { fromHere } from '../lib/origin';
import { DateTime, formatDate, formatDay, formatSpan, relativeSpan } from '../lib/dates';

interface BacklogItem { key: string; tracker: string; title: string; status: string; statusName: string; category: string; points: number | null; assignee: string | null }
interface SprintSummary { id: string; name: string; goal: string; state: 'planned' | 'active' | 'closed'; startsOn: string | null; endsOn: string | null }
interface SprintItem { key: string; status: string; statusName?: string; title?: string; done: boolean; points: number }
interface SprintDetail extends SprintSummary { items: SprintItem[]; totalPoints: number; donePoints: number }
interface BurndownPoint { date: string; remaining: number; ideal: number }

const t = fr.backlog;

/** Sprint pas encore commencé (date de début après aujourd’hui) : le burndown n’a pas encore de point (T-0150). */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const notStarted = (startsOn: string | null): startsOn is string => !!startsOn && startsOn > today();

/**
 * Burndown du sprint en cours : une série (« Reste à faire », trait plein et points) et une ligne de référence (« Idéal »,
 * pointillé). La charte Hemeria n'a pas de palette catégorielle : la distinction tient au trait et aux libellés, jamais à la
 * couleur seule. Info-bulle par jour, et tableau des données pour les lecteurs d'écran.
 */
export function Burndown({ points }: { points: BurndownPoint[] }) {
  if (points.length === 0) return <p>{t.noBurndown}</p>;
  const W = 560; const H = 180; const L = 32; const B = 22; const R = 70; const T = 8;
  const max = Math.max(1, ...points.map((p) => Math.max(p.remaining, p.ideal)));
  const x = (i: number) => L + (points.length === 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = (pick: (p: BurndownPoint) => number) => points.map((p, i) => `${x(i)},${y(pick(p))}`).join(' ');
  const last = points.length - 1;
  const step = points.length > 1 ? (W - L - R) / (points.length - 1) : W - L - R;
  return (
    <figure className="ath-stack">
      <ul className="ath-burndown__legend" aria-hidden="true">
        <li><span className="ath-burndown__swatch" />{t.remaining}</li>
        <li><span className="ath-burndown__swatch ath-burndown__swatch--ideal" />{t.ideal}</li>
      </ul>
      <svg className="ath-burndown" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.burndown} : ${t.remaining} ${points[last]!.remaining}, ${t.ideal} ${points[last]!.ideal}`}>
        <line className="ath-burndown__axis" x1={L} y1={H - B} x2={W - R} y2={H - B} />
        <line className="ath-burndown__axis" x1={L} y1={T} x2={L} y2={H - B} />
        <text className="ath-burndown__label" x={L - 6} y={y(max) + 4} textAnchor="end">{max}</text>
        <text className="ath-burndown__label" x={L - 6} y={H - B + 4} textAnchor="end">0</text>
        <text className="ath-burndown__label" x={L} y={H - 6}>{points[0]!.date.slice(5)}</text>
        <text className="ath-burndown__label" x={W - R} y={H - 6} textAnchor="end">{points[last]!.date.slice(5)}</text>
        <polyline className="ath-burndown__ideal" points={line((p) => p.ideal)} />
        <polyline className="ath-burndown__remaining" points={line((p) => p.remaining)} />
        {points.map((p, i) => <circle key={p.date} className="ath-burndown__dot" cx={x(i)} cy={y(p.remaining)} r={4} />)}
        <text className="ath-burndown__label" x={x(last) + 8} y={y(points[last]!.remaining) + 4}>{t.remaining}</text>
        <text className="ath-burndown__label" x={x(last) + 8} y={y(points[last]!.ideal) + 14}>{t.ideal}</text>
        {points.map((p, i) => (
          <g key={`h-${p.date}`}>
            <rect className="ath-burndown__hit" x={x(i) - step / 2} y={T} width={step} height={H - T - B}><title>{`${formatDate(p.date)} · ${t.remaining} ${p.remaining} · ${t.ideal} ${p.ideal}`}</title></rect>
            <line className="ath-burndown__guide" x1={x(i)} y1={T} x2={x(i)} y2={H - B} />
          </g>
        ))}
      </svg>
      <details>
        <summary>{t.data}</summary>
        <Table>
          <thead><tr><Th>{t.day}</Th><Th>{t.remaining}</Th><Th>{t.ideal}</Th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.date}><Td mono><DateTime iso={p.date} date /></Td><Td mono>{p.remaining}</Td><Td mono>{p.ideal}</Td></tr>)}</tbody>
        </Table>
      </details>
    </figure>
  );
}

/**
 * Page Backlog `/p/:projet/backlog` (ADR-0003, T-0116) : sprint en cours (burndown, clôture), sprints à venir (démarrer,
 * retirer), backlog ordonné (monter, descendre, ajouter à un sprint) et création d'un sprint, sans quitter la page.
 * Les actions de planification sont réservées aux administrateurs et aux chefs de projet (le serveur le vérifie aussi).
 */
export function BacklogPage({ session }: { session: Session }) {
  const { project = '' } = useParams();
  const location = useLocation();
  const toast = useToast();
  const fail = useFailure();
  const roles = session.user?.roles ?? [];
  const canPlan = roles.includes('athena-admin') || roles.includes('athena-pm');
  const [items, setItems] = useState<BacklogItem[] | null>(null);
  const [sprints, setSprints] = useState<SprintDetail[]>([]);
  const [burndown, setBurndown] = useState<BurndownPoint[]>([]);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [closeTo, setCloseTo] = useState('');
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '' });
  const focusAfter = useRef<string | null>(null);
  const base = `/v1/projects/${project}`;

  const load = useCallback(async () => {
    const [backlog, list] = await Promise.all([
      api<{ items: BacklogItem[] }>('GET', `${base}/backlog`), api<SprintSummary[]>('GET', `${base}/sprints`),
    ]);
    const open = (Array.isArray(list) ? list : []).filter((s) => s.state !== 'closed');
    const details = await Promise.all(open.map((s) => api<SprintDetail>('GET', `${base}/sprints/${s.id}`)));
    // Sprint en cours d'abord, puis les sprints à venir par date de début.
    details.sort((a, b) => (a.state === b.state ? String(a.startsOn).localeCompare(String(b.startsOn)) : a.state === 'active' ? -1 : 1));
    setItems(backlog.items);
    setSprints(details);
    const active = details.find((s) => s.state === 'active');
    setBurndown(active ? await api<BurndownPoint[]>('GET', `${base}/sprints/${active.id}/burndown`).catch(() => []) : []);
  }, [base]);
  useEffect(() => { load().catch(fail); }, [load, fail]);
  // Après un réordonnancement, le focus revient sur le même bouton du ticket déplacé (clavier).
  useEffect(() => {
    if (!focusAfter.current) return;
    // Arrivé en tête ou en queue, le bouton est désactivé : le focus passe à l'autre sens, sur la même ligne.
    const wanted = document.getElementById(focusAfter.current) as HTMLButtonElement | null;
    const other = document.getElementById(focusAfter.current.replace(/^(up|down)-/, (_, d: string) => (d === 'up' ? 'down-' : 'up-'))) as HTMLButtonElement | null;
    (wanted && !wanted.disabled ? wanted : other)?.focus();
    focusAfter.current = null;
  });

  const act = async <R,>(run: () => Promise<R>, message: string | ((result: R) => string)) => {
    try { const result = await run(); toast('success', typeof message === 'string' ? message : message(result)); await load(); } catch (error) { fail(error); }
  };
  const move = (index: number, delta: -1 | 1) => {
    const list = items ?? [];
    const key = list[index]!.key;
    const after = delta === -1 ? (index >= 2 ? list[index - 2]!.key : null) : list[index + 1]!.key;
    focusAfter.current = `${delta === -1 ? 'up' : 'down'}-${key}`;
    void act(() => api('POST', `${base}/backlog/rank`, { key, after }), t.moved);
  };
  const createSprint = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => { await api('POST', `${base}/sprints`, form); setForm({ name: '', startsOn: '', endsOn: '' }); }, t.created);
  };

  const active = sprints.find((s) => s.state === 'active');
  const planned = sprints.filter((s) => s.state === 'planned');
  const keys = (items ?? []).map((i) => i.key);
  const sprintCard = (s: SprintDetail) => (
    <Card key={s.id} title={s.name} meta={s.startsOn && s.endsOn ? `${formatSpan(s.startsOn, s.endsOn)} · ${relativeSpan(s.startsOn, s.endsOn)}` : '—'}>
      <div className="ath-stack">
        {s.goal && <p>{s.goal}</p>}
        <p className="ath-mono">{t.totals(s.donePoints, s.totalPoints)}</p>
        {s.items.length === 0 ? <p>{t.sprintEmpty}</p> : (
          <ul className="ath-stack" aria-label={s.name}>
            {s.items.map((i) => (
              <li key={i.key} className="ath-row">
                <Link className="ath-link ath-mono" to={`/p/${project}/a/${i.key}`} state={fromHere(location, s.name, s.items.map((x) => x.key))}>{i.key}</Link>
                <span>{i.title ?? ''}</span>
                <StatusPill kind={i.done ? 'success' : 'info'}>{i.statusName ?? i.status}</StatusPill>
                <Id>{t.points(i.points)}</Id>
                {canPlan && <Btn size="sm" variant="ghost" icon="close" aria-label={t.remove(i.key)} title={t.remove(i.key)} onClick={() => void act(() => api('DELETE', `${base}/sprints/${s.id}/items/${i.key}`), t.removed)} />} {/* sans confirmation : réversible, le ticket revient au backlog avec son rang */}
              </li>
            ))}
          </ul>
        )}
        {canPlan && s.state === 'planned' && <div><Btn variant="deep" disabled={s.items.length === 0} onClick={() => void act(() => api('POST', `${base}/sprints/${s.id}/start`), t.started)}>{t.start}</Btn></div>}
        {canPlan && s.state === 'active' && (
          <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await api<{ returned: string[] }>('POST', `${base}/sprints/${s.id}/close`, closeTo ? { moveTo: closeTo } : {}); setCloseTo(''); return r; }, (r) => t.closed(r.returned.length)); }}>
            <label className="ath-field__label" htmlFor="close-to">{t.closeRest}</label>
            <Select id="close-to" value={closeTo} onChange={(e) => setCloseTo(e.target.value)}>
              <option value="">{t.toBacklog}</option>
              {planned.map((p) => <option key={p.id} value={p.id}>{t.toSprint(p.name)}</option>)}
            </Select>
            <Btn type="submit" variant="deep">{t.close}</Btn>
          </form>
        )}
        {s.state === 'active' && <><h3 className="ath-subsection-title">{t.burndown}</h3>{notStarted(s.startsOn) ? <p>{t.burndownSoon(formatDay(s.startsOn))}</p> : <Burndown points={burndown} />}</>}
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader title={t.title} />
      {items === null ? <p role="status">{fr.loading}</p> : (
        <div className="ath-stack">
          <section aria-labelledby="bk-active" className="ath-stack">
            <h2 id="bk-active" className="ath-section-title">{t.active}</h2>
            {active ? sprintCard(active) : <p>{t.noSprint}</p>}
          </section>
          <section aria-labelledby="bk-planned" className="ath-stack">
            <h2 id="bk-planned" className="ath-section-title">{t.planned}</h2>
            {planned.length === 0 && <p>{canPlan ? t.noPlannedPlan : t.noPlanned}</p>}
            {planned.map(sprintCard)}
            {canPlan && (
              <form className="ath-toolbar" aria-label={t.newSprint} onSubmit={createSprint}>
                <Field label={t.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Field label={t.starts} type="date" mono value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
                <Field label={t.ends} type="date" mono value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
                <Btn type="submit" icon="plus" disabled={!form.name.trim() || !form.startsOn || !form.endsOn}>{t.create}</Btn>
              </form>
            )}
          </section>
          <section aria-labelledby="bk-list" className="ath-stack">
            <h2 id="bk-list" className="ath-section-title">{t.list} <Id>{items.length}</Id></h2>
            {items.length === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : (
              <ol className="ath-stack" aria-label={t.list}>
                {items.map((item, index) => (
                  <li key={item.key} className="ath-row">
                    <Link className="ath-link ath-mono" to={`/p/${project}/a/${item.key}`} state={fromHere(location, t.title, keys)}>{item.key}</Link>
                    <span>{item.title}</span>
                    <Tag variant="ghost">{item.tracker}</Tag>
                    {item.points !== null && <Id>{t.points(item.points)}</Id>}
                    {canPlan && <>
                      <Btn id={`up-${item.key}`} size="sm" variant="ghost" icon="previous" aria-label={t.up(item.key)} title={t.up(item.key)} disabled={index === 0} onClick={() => move(index, -1)} />
                      <Btn id={`down-${item.key}`} size="sm" variant="ghost" icon="next" aria-label={t.down(item.key)} title={t.down(item.key)} disabled={index === items.length - 1} onClick={() => move(index, 1)} />
                      {sprints.length > 0 && <>
                        <label className="ath-visually-hidden" htmlFor={`to-${item.key}`}>{t.addTo(item.key)}</label>
                        <Select id={`to-${item.key}`} value={target[item.key] ?? sprints[0]!.id} onChange={(e) => setTarget({ ...target, [item.key]: e.target.value })}>
                          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                        <Btn size="sm" variant="ghost" icon="plus" onClick={() => void act(() => api('POST', `${base}/sprints/${target[item.key] ?? sprints[0]!.id}/items`, { artifact: item.key }), t.added)}>{t.add}</Btn>
                      </>}
                    </>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </>
  );
}
