import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Field, Id, PageHeader, StatusPill, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { Bar, Timeline } from '../components/ReleaseCharts';
import { formatSpan } from '../lib/dates';
import { useFailure } from '../hooks';
import { fr, getLocale } from '../i18n';
import { fromHere } from '../lib/origin';

interface Release { id: string; name: string; startsOn: string; endsOn: string; state: string; items: number; doneItems: number; totalPoints: number; donePoints: number; progress: number }
interface ReleaseItem { key: string; title: string; statusName: string; done: boolean; points: number }

const t = fr.roadmap;

/**
 * Page Roadmap `/p/:projet/roadmap` (ADR-0003, T-0117) : calendrier des versions, avancement de chacune (tickets et points),
 * tickets rattachés, ajout et retrait, publication et création d'une version, sans quitter la page.
 * Planifier est réservé aux administrateurs et aux chefs de projet (le serveur le vérifie aussi).
 */
export function RoadmapPage({ session }: { session: Session }) {
  const { project = '' } = useParams();
  const location = useLocation();
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  const roles = session.user?.roles ?? [];
  const canPlan = roles.includes('athena-admin') || roles.includes('athena-pm');
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [items, setItems] = useState<Record<string, ReleaseItem[]>>({});
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '' });
  const base = `/v1/projects/${project}`;

  const load = useCallback(async () => {
    const list = await api<Release[]>('GET', `${base}/roadmap`);
    const all = Array.isArray(list) ? list : [];
    const lists = await Promise.all(all.map((r) => api<ReleaseItem[]>('GET', `${base}/releases/${r.id}/items`).catch(() => [])));
    setItems(Object.fromEntries(all.map((r, i) => [r.id, lists[i] ?? []])));
    setReleases(all);
  }, [base]);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  const act = async (run: () => Promise<unknown>, message: string) => {
    try { await run(); toast('success', message); await load(); } catch (error) { fail(error); }
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => { await api('POST', `${base}/releases`, form); setForm({ name: '', startsOn: '', endsOn: '' }); }, t.created);
  };
  const add = (event: FormEvent, release: string) => {
    event.preventDefault();
    const key = (adding[release] ?? '').trim();
    void act(async () => { await api('POST', `${base}/releases/${release}/items`, { artifact: key }); setAdding({ ...adding, [release]: '' }); }, t.added);
  };
  const publish = async (r: Release) => {
    if (!(await confirm.ask({ title: t.publishTitle(r.name), body: t.publishBody, confirm: t.publish }))) return;
    await act(() => api('POST', `${base}/releases/${r.id}/publish`), t.published);
  };

  const card = (r: Release) => {
    const percent = Math.round(r.progress * 100);
    const list = items[r.id] ?? [];
    const open = r.state !== 'released';
    return (
      <Card key={r.id} title={r.name} meta={formatSpan(r.startsOn, r.endsOn)}>
        <div className="ath-stack">
          <div className="ath-row">
            <StatusPill kind={open ? 'info' : 'success'}>{open ? t.planned : t.released}</StatusPill>
            <strong>{t.progress(percent)}</strong>
            <span className="ath-mono">{t.counts(r.doneItems, r.items)}</span>
            <Id>{t.points(r.donePoints, r.totalPoints)}</Id>
          </div>
          <Bar value={percent} max={100} label={`${r.name}, ${t.progress(percent)}`} />
          {list.length === 0 ? <p>{t.noItem}</p> : (
            <ul className="ath-stack" aria-label={r.name}>
              {list.map((i) => (
                <li key={i.key} className="ath-row">
                  <Link className="ath-link ath-mono" to={`/p/${project}/a/${i.key}`} state={fromHere(location, r.name, list.map((x) => x.key))}>{i.key}</Link>
                  <span>{i.title === i.key ? '' : i.title}</span>
                  <StatusPill kind={i.done ? 'success' : 'info'}>{i.statusName}</StatusPill>
                  {i.points > 0 && <Id>{fr.backlog.points(i.points)}</Id>}
                  {canPlan && open && <Btn size="sm" variant="ghost" icon="close" aria-label={t.remove(i.key)} title={t.remove(i.key)} onClick={() => void act(() => api('DELETE', `${base}/releases/${r.id}/items/${i.key}`), t.removed)} />} {/* sans confirmation : réversible, le ticket peut être ajouté de nouveau */}
                </li>
              ))}
            </ul>
          )}
          {canPlan && open && (
            <div className="ath-toolbar">
              <form className="ath-toolbar" aria-label={`${t.add} · ${r.name}`} onSubmit={(e) => add(e, r.id)}>
                <Field label={t.ticketKey} mono value={adding[r.id] ?? ''} onChange={(e) => setAdding({ ...adding, [r.id]: e.target.value })} />
                <Btn type="submit" icon="plus" disabled={!(adding[r.id] ?? '').trim()}>{t.add}</Btn>
              </form>
              <Btn variant="deep" onClick={() => void publish(r)}>{t.publish}</Btn>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader title={t.title} />
      {releases === null ? <p role="status">{fr.loading}</p> : (
        <div className="ath-stack">
          {releases.length === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : (
            <>
              <section aria-labelledby="rm-timeline" className="ath-stack">
                <h2 id="rm-timeline" className="ath-section-title">{t.timeline}</h2>
                <Timeline releases={releases} label={t.timeline} locale={getLocale()} todayLabel={fr.when.today}
                  counts={Object.fromEntries(releases.map((r) => [r.id, t.counts(r.doneItems, r.items)]))} />
              </section>
              {releases.map(card)}
            </>
          )}
          {canPlan && (
            <form className="ath-toolbar" aria-label={t.newVersion} onSubmit={create}>
              <Field label={t.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Field label={t.starts} type="date" mono value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
              <Field label={t.ends} type="date" mono value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
              <Btn type="submit" icon="plus" disabled={!form.name.trim() || !form.startsOn || !form.endsOn}>{t.create}</Btn>
            </form>
          )}
        </div>
      )}
      {confirm.dialog}
    </>
  );
}
