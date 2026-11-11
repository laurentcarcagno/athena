import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Select, Table, Td, Th } from '@athena/ui';
import { api } from '../../api';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';
import { DateTime } from '../../lib/dates';

type Kind = 'created' | 'updated' | 'transition' | 'comment';
interface Item { id: string; kind: Kind; at: string; key: string; tracker: string; actor: string; actorName: string; fields: string[]; from: string | null; to: string | null }
interface Feed { items: Item[]; next: string | null; people: Array<{ subject: string; name: string }> }

const KINDS: Kind[] = ['created', 'updated', 'transition', 'comment'];

/** Phrase de l'événement : les clés techniques (champs, états) restent en mono. */
function Sentence({ item }: { item: Item }) {
  const a = fr.activity;
  if (item.kind === 'created') return <>{a.created}</>;
  if (item.kind === 'comment') return <>{a.commented}</>;
  if (item.kind === 'transition') return <>{a.transitioned} <span className="ath-mono">{item.from}</span> {a.to} <span className="ath-mono">{item.to}</span></>;
  return <>{a.updated}{item.fields.length > 0 && <> : {item.fields.map((f, i) => <span key={f}>{i > 0 && ', '}<span className="ath-mono">{f}</span></span>)}</>}</>;
}

/** Onglet Activité : flux chronologique du projet, filtrable par tracker, personne et type d'événement. */
export function ActivityTab({ tabs }: { tabs?: ReactNode } = {}) {
  const { project } = useParams();
  const fail = useFailure();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Item[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [people, setPeople] = useState<Feed['people']>([]);
  const [trackers, setTrackers] = useState<string[]>([]);
  const tracker = params.get('t') ?? '';
  const actor = params.get('a') ?? '';
  const kind = params.get('k') ?? '';

  const query = useCallback((before?: string) => {
    const q = new URLSearchParams();
    if (tracker) q.set('tracker', tracker);
    if (actor) q.set('actor', actor);
    if (kind) q.set('kind', kind);
    if (before) q.set('before', before);
    return `/v1/projects/${project}/activity?${q.toString()}`;
  }, [project, tracker, actor, kind]);

  useEffect(() => {
    setItems(null);
    api<Feed>('GET', query()).then((f) => { setItems(f.items); setNext(f.next); setPeople(f.people); }).catch(fail);
  }, [query, fail]);
  useEffect(() => { api<Array<{ key: string }>>('GET', `/v1/projects/${project}/trackers`).then((r) => setTrackers(Array.isArray(r) ? r.map((t) => t.key) : [])).catch(() => setTrackers([])); }, [project]);
  const more = () => { if (next) api<Feed>('GET', query(next)).then((f) => { setItems((cur) => [...(cur ?? []), ...f.items]); setNext(f.next); }).catch(fail); };
  const set = (name: string, value: string) => { const copy = new URLSearchParams(params); if (value) copy.set(name, value); else copy.delete(name); setParams(copy); };

  return (
    <>
      <PageHeader title={fr.activity.title} />
      {tabs}
      <div className="ath-toolbar" role="search" aria-label={fr.activity.filters}>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="act-tracker">{fr.activity.tracker}</label>
          <Select id="act-tracker" value={tracker} onChange={(e) => set('t', e.target.value)}>
            <option value="">{fr.filters.all}</option>
            {trackers.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="act-actor">{fr.activity.person}</label>
          <Select id="act-actor" value={actor} onChange={(e) => set('a', e.target.value)}>
            <option value="">{fr.filters.all}</option>
            {people.map((p) => <option key={p.subject} value={p.subject}>{p.name}</option>)}
          </Select>
        </div>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="act-kind">{fr.activity.kind}</label>
          <Select id="act-kind" value={kind} onChange={(e) => set('k', e.target.value)}>
            <option value="">{fr.filters.all}</option>
            {KINDS.map((k) => <option key={k} value={k}>{fr.activity.kinds[k]}</option>)}
          </Select>
        </div>
      </div>
      {items === null ? <p role="status">{fr.loading}</p> : items.length === 0 ? (
        <EmptyState eyebrow={fr.activity.title} title={fr.activity.empty} />
      ) : (
        <>
          <Table>
            <thead><tr><Th>{fr.activity.date}</Th><Th>{fr.activity.person}</Th><Th>{fr.activity.event}</Th><Th>{fr.activity.item}</Th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <Td mono mute><DateTime iso={i.at} /></Td>
                  <Td>{i.actorName}</Td>
                  <Td><Sentence item={i} /></Td>
                  <Td><Link className="ath-link ath-mono" to={`/p/${project}/a/${i.key}`}>{i.key}</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="ath-toolbar"><Btn variant="ghost" size="sm" disabled={next === null} onClick={more}>{fr.activity.older}</Btn></div>
        </>
      )}
    </>
  );
}
