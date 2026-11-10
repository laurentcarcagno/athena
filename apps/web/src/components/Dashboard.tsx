import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Select, StatusPill, useToast } from '@athena/ui';
import { api, type Hit, type SearchResult, type TrackerOverview } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { pinHref, usePins } from '../lib/pins';
import { pillKind } from '../pages/ListPage';
import { useConfirm } from './ConfirmDialog';

export type WidgetKind = 'search' | 'mentions' | 'approvals' | 'favorites' | 'recents' | 'trackers';
export interface Widget { id: string; kind: WidgetKind; title?: string; query?: string; projects?: string[] }
interface Layout { widgets: Widget[]; isDefault: boolean }
interface SavedSearch { id: string; name: string; query: string; projects: string[] }
interface Mention { id: string; project: string; key: string; actorName: string; read: boolean }
interface ApprovalRow { project: string; type: string; ref: string }
interface AwaitingItem { project: string; key: string; tracker: string; step: string }

/** Widgets par défaut, dans l'ordre de la disposition initiale (miroir de l'API) : sert à les réajouter après un retrait. */
const HOME_WIDGETS: Widget[] = [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
  { id: 'approvals', kind: 'approvals' },
  { id: 'mentions', kind: 'mentions' },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)' },
  { id: 'favorites', kind: 'favorites' },
  { id: 'recents', kind: 'recents' },
];

/** Widgets par défaut de la Vue d'un projet : mes tickets et échéances de ce projet, ses trackers, mes mentions. */
const projectWidgets = (project: string): Widget[] => [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done', projects: [project] },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)', projects: [project] },
  { id: 'trackers', kind: 'trackers', projects: [project] },
  { id: 'mentions', kind: 'mentions' },
];
const builtinFor = (project?: string): Widget[] => (project ? projectWidgets(project) : HOME_WIDGETS);

const titleOf = (hit: Hit) => String(hit.values['title'] ?? hit.values['name'] ?? '');
const widgetTitle = (w: Widget) => w.title ?? fr.home.titles[w.id] ?? fr.home.kinds[w.kind] ?? w.id;
/** Lien « tout voir » d'un widget de recherche : la recherche globale pré-remplie. */
const searchHref = (w: Widget) => `/recherche?q=${encodeURIComponent(w.query ?? '')}${w.projects?.length ? `&p=${w.projects.join(',')}` : ''}`;

function Rows({ children, empty }: { children: JSX.Element[]; empty: string }) {
  return children.length === 0 ? <p>{empty}</p> : <ul className="ath-stack">{children}</ul>;
}

function SearchBody({ widget }: { widget: Widget }) {
  const [res, setRes] = useState<SearchResult | null>(null);
  const scope = widget.projects?.join(',') ?? '';
  useEffect(() => {
    setRes(null);
    api<SearchResult>('GET', `/v1/search?q=${encodeURIComponent(widget.query ?? '')}&limit=5${scope ? `&project=${scope}` : ''}`).then((r) => setRes({ total: r.total ?? 0, hits: Array.isArray(r.hits) ? r.hits : [] })).catch(() => setRes({ total: 0, hits: [] }));
  }, [widget.query, scope]);
  if (res === null) return <p role="status">{fr.loading}</p>;
  return (
    <div className="ath-stack">
      <Rows empty={fr.home.empty}>
        {res.hits.map((h) => (
          <li key={`${h.project}-${h.key}`} className="ath-row">
            <Link className="ath-link ath-mono" to={`/p/${h.project}/a/${h.key}`}>{h.key}</Link>
            <span className="ath-clip" title={titleOf(h)}>{titleOf(h)}</span>
            <StatusPill kind={pillKind(h.category)}>{h.statusName ?? h.status}</StatusPill>
          </li>
        ))}
      </Rows>
      <Link className="ath-link" to={searchHref(widget)}>{fr.home.seeAll}</Link>
    </div>
  );
}

function MentionsBody() {
  const [items, setItems] = useState<Mention[] | null>(null);
  useEffect(() => {
    api<{ items: Mention[] }>('GET', '/v1/me/notifications?event=mention&limit=5').then((r) => setItems(Array.isArray(r.items) ? r.items : [])).catch(() => setItems([]));
  }, []);
  if (items === null) return <p role="status">{fr.loading}</p>;
  return (
    <Rows empty={fr.work.mentionsNone}>
      {items.map((m) => (
        <li key={m.id} className="ath-row">
          <Link className="ath-link ath-mono" to={`/p/${m.project}/a/${m.key}`} onClick={() => { if (!m.read) void api('POST', '/v1/me/notifications/read', { ids: [m.id], read: true }).catch(() => undefined); }}>{m.key}</Link>
          <span>{m.actorName}</span>
          {!m.read && <span className="ath-eyebrow">{fr.work.unread}</span>}
        </li>
      ))}
    </Rows>
  );
}

function ApprovalsBody({ objects }: { objects: boolean }) {
  const [items, setItems] = useState<AwaitingItem[] | null>(null);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  useEffect(() => {
    api<{ items: AwaitingItem[] }>('GET', '/v1/me/approvals').then((r) => setItems(Array.isArray(r.items) ? r.items : [])).catch(() => setItems([]));
    if (!objects) return;
    // Assurance qualité : jalons et baselines en attente de sa décision, en plus des tickets.
    api<Array<{ key: string }>>('GET', '/v1/projects').then(async (projects) => {
      const all = await Promise.all(projects.map(async (p) => {
        const list = await api<Array<{ type: string; ref: string; state: string }>>('GET', `/v1/projects/${p.key}/approvals`).catch(() => []);
        return (Array.isArray(list) ? list : []).filter((o) => o.state === 'pending').map((o) => ({ project: p.key, type: o.type, ref: o.ref }));
      }));
      setRows(all.flat());
    }).catch(() => setRows([]));
  }, [objects]);
  if (items === null) return <p role="status">{fr.loading}</p>;
  return (
    <Rows empty={fr.home.noApprovals}>
      {[
        ...items.slice(0, 5).map((r) => (
          <li key={`${r.project}-${r.key}`} className="ath-row">
            <Link className="ath-link ath-mono" to={`/p/${r.project}/a/${r.key}?onglet=approval`}>{r.key}</Link>
            <span className="ath-clip">{r.step}</span>
          </li>
        )),
        ...rows.slice(0, 5).map((r) => (
          <li key={`${r.project}-${r.type}-${r.ref}`} className="ath-row">
            <span className="ath-mono">{r.project}</span>
            <Link className="ath-link" to={`/p/${r.project}/parametres/approbations`}>{r.ref}</Link>
          </li>
        )),
      ]}
    </Rows>
  );
}

function TrackersBody({ project }: { project: string }) {
  const [trackers, setTrackers] = useState<TrackerOverview[] | null>(null);
  useEffect(() => { api<{ trackers: TrackerOverview[] }>('GET', `/v1/projects/${project}/overview`).then((r) => setTrackers(Array.isArray(r.trackers) ? r.trackers : [])).catch(() => setTrackers([])); }, [project]);
  if (trackers === null) return <p role="status">{fr.loading}</p>;
  return (
    <div className="ath-stack">
      <Rows empty={fr.home.noTracker}>
        {trackers.map((t) => (
          <li key={t.key} className="ath-row">
            <Link className="ath-link ath-mono" to={`/p/${project}/t/${t.key}/tableau`}>{t.key}</Link>
            <span className="ath-mono">{t.statuses.filter((s) => s.category !== 'done').reduce((n, s) => n + s.count, 0)} {fr.overview.open} / {t.artifacts}</span>
          </li>
        ))}
      </Rows>
      <Link className="ath-link" to={`/p/${project}/trackers`}>{fr.overview.openTrackers}</Link>
    </div>
  );
}

function PinsBody({ kind }: { kind: 'favorites' | 'recents' }) {
  const pins = usePins();
  const list = (kind === 'favorites' ? pins.favorites : pins.recents).slice(0, 5);
  return <Rows empty={kind === 'favorites' ? fr.rail.noFavorites : fr.rail.noRecents}>{list.map((p) => <li key={p.id}><Link className={`ath-link${p.kind === 'item' ? ' ath-mono' : ''}`} to={pinHref(p)}>{p.label}</Link></li>)}</Rows>;
}

function Body({ widget, objects }: { widget: Widget; objects: boolean }) {
  switch (widget.kind) {
    case 'search': return <SearchBody widget={widget} />;
    case 'mentions': return <MentionsBody />;
    case 'approvals': return <ApprovalsBody objects={objects} />;
    case 'trackers': return <TrackersBody project={widget.projects?.[0] ?? ''} />;
    default: return <PinsBody kind={widget.kind} />;
  }
}

/**
 * Tableau de bord personnel (ADR-0003 § 2.1, T-0122) : grille fixe, widgets par défaut sans réglage. « Personnaliser » ouvre les
 * commandes : monter, descendre, masquer, dupliquer (recherches), ajouter une vue enregistrée ou un widget masqué, réinitialiser.
 * Chaque changement est enregistré aussitôt ; la disposition est propre à la personne.
 */
export function Dashboard({ project, qa = false }: { project?: string; qa?: boolean } = {}) {
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [editing, setEditing] = useState(false);
  const [views, setViews] = useState<SavedSearch[]>([]);
  const [choice, setChoice] = useState('');
  const BUILTIN = builtinFor(project);
  const endpoint = `/v1/me/dashboard${project ? `?project=${project}` : ''}`;

  useEffect(() => { api<Layout>('GET', endpoint).then((r) => setLayout(Array.isArray(r?.widgets) ? r : { widgets: builtinFor(project), isDefault: true })).catch((e) => { setLayout({ widgets: builtinFor(project), isDefault: true }); fail(e); }); }, [fail, endpoint, project]);
  useEffect(() => { if (editing) api<SavedSearch[]>('GET', '/v1/searches').then((r) => setViews(Array.isArray(r) ? r : [])).catch(() => setViews([])); }, [editing]);

  const save = useCallback(async (widgets: Widget[]) => {
    try { setLayout(await api<Layout>('PUT', endpoint, { widgets })); } catch (error) { fail(error); }
  }, [fail, endpoint]);

  if (layout === null) return <p role="status">{fr.loading}</p>;
  const { widgets } = layout;
  const move = (i: number, d: -1 | 1) => { const next = [...widgets]; [next[i], next[i + d]] = [next[i + d]!, next[i]!]; return save(next); };
  const hide = (i: number) => save(widgets.filter((_, k) => k !== i));
  const duplicate = (i: number) => {
    const w = widgets[i]!;
    const id = `${w.id.replace(/-c[a-z0-9]+$/, '').slice(0, 28)}-c${Date.now().toString(36)}`;
    const next = [...widgets];
    next.splice(i + 1, 0, { ...w, id, title: fr.home.copyOf(widgetTitle(w)) });
    return save(next);
  };
  const missing = BUILTIN.filter((b) => !widgets.some((w) => w.id === b.id));
  const add = async () => {
    const view = views.find((v) => `view:${v.id}` === choice);
    const builtin = missing.find((b) => `builtin:${b.id}` === choice);
    if (view) await save([...widgets, { id: `v-${view.id.slice(0, 8)}-${Date.now().toString(36)}`, kind: 'search', title: view.name, query: view.query, ...(project ? { projects: [project] } : view.projects.length ? { projects: view.projects } : {}) }]);
    else if (builtin) await save([...widgets, builtin]);
    else return;
    setChoice('');
    toast('success', fr.home.added);
  };
  const reset = async () => {
    if (!(await confirm.ask({ title: fr.home.resetTitle, body: fr.home.resetBody, confirm: fr.home.reset }))) return;
    try { await api('DELETE', endpoint); setLayout(await api<Layout>('GET', endpoint)); toast('success', fr.home.resetDone); } catch (error) { fail(error); }
  };

  return (
    <section aria-label={project ? fr.home.projectLabel : fr.home.label} className="ath-stack">
      <div className="ath-toolbar">
        <Btn variant="ghost" size="sm" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? fr.home.done : fr.home.customize}</Btn>
        {editing && (
          <>
            <label className="ath-label" htmlFor="dash-add">{fr.home.addLabel}</label>
            <Select id="dash-add" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{fr.home.choose}</option>
              {missing.map((b) => <option key={b.id} value={`builtin:${b.id}`}>{fr.home.titles[b.id]}</option>)}
              {views.map((v) => <option key={v.id} value={`view:${v.id}`}>{v.name}</option>)}
            </Select>
            <Btn variant="ghost" size="sm" disabled={choice === ''} onClick={() => void add()}>{fr.home.add}</Btn>
            <Btn variant="ghost" size="sm" disabled={layout.isDefault} onClick={() => void reset()}>{fr.home.reset}</Btn>
          </>
        )}
      </div>
      {widgets.length === 0 && <p>{fr.home.noWidget}</p>}
      <div className="ath-layout-grid">
        {widgets.map((w, i) => (
          <div key={w.id} className="ath-span-1" role="group" aria-label={widgetTitle(w)}>
            <Card title={widgetTitle(w)}>
              <div className="ath-stack">
                <Body widget={w} objects={qa} />
                {editing && (
                  <div className="ath-toolbar">
                    <Btn variant="ghost" size="sm" disabled={i === 0} aria-label={`${fr.home.up} ${widgetTitle(w)}`} onClick={() => void move(i, -1)}>↑</Btn>
                    <Btn variant="ghost" size="sm" disabled={i === widgets.length - 1} aria-label={`${fr.home.down} ${widgetTitle(w)}`} onClick={() => void move(i, 1)}>↓</Btn>
                    {w.kind === 'search' && <Btn variant="ghost" size="sm" aria-label={`${fr.home.duplicate} ${widgetTitle(w)}`} onClick={() => void duplicate(i)}>{fr.home.duplicate}</Btn>}
                    <Btn variant="ghost" size="sm" aria-label={`${fr.home.hide} ${widgetTitle(w)}`} onClick={() => void hide(i)}>{fr.home.hide}</Btn>
                  </div>
                )}
              </div>
            </Card>
          </div>
        ))}
      </div>
      {confirm.dialog}
    </section>
  );
}
