import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Btn, DASH_SIZES, DashCard, DashGrid, Select, StatusPill, useToast, type DashSize } from '@athena/ui';
import { api, type Hit, type SearchResult, type TrackerOverview } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { pinHref, usePins } from '../lib/pins';
import { ActivityCard, FlowCard, IndicatorsCard, ReleaseCard, TrackerStatusCard, VelocityCard, velocityFooter } from './ProgressCards';
import { ChartBody, ChartForm, type ChartForm as ChartFormKind } from './ChartCard';
import { pillKind } from '../pages/ListPage';
import { useConfirm } from './ConfirmDialog';
import { statusPill } from '../lib/status';

export type WidgetKind = 'search' | 'mentions' | 'approvals' | 'favorites' | 'recents' | 'trackers'
  | 'indicators' | 'flow' | 'velocity' | 'release' | 'tracker-status' | 'activity' | 'chart';
/** Cartes d'avancement d'un projet (T-0155) : elles portent la clé du projet dans `projects`. */
const PROGRESS: WidgetKind[] = ['indicators', 'flow', 'velocity', 'release', 'tracker-status', 'activity'];
export interface Widget { id: string; kind: WidgetKind; title?: string; query?: string; projects?: string[]; size?: DashSize; field?: string; form?: ChartFormKind }
/** Largeur par défaut d'une carte (T-0153) : trois cartes par rangée. */
export const sizeOf = (w: Widget): DashSize => w.size ?? 'S';
/** Cartes qui, vides, se résument dans la ligne « Rien d'urgent » de Mon travail (T-0153, revue O3). */
const QUIET: WidgetKind[] = ['search', 'approvals', 'mentions'];
type OnEmpty = (empty: boolean) => void;
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
  { id: 'indicators', kind: 'indicators', projects: [project], size: 'XL' },
];
/** Cartes par défaut de l'Avancement d'un projet (T-0155), variantes retenues à la revue ; miroir de l'API. */
export const progressWidgets = (project: string): Widget[] => [
  { id: 'indicators', kind: 'indicators', projects: [project], size: 'L' },
  { id: 'release', kind: 'release', projects: [project], size: 'S' },
  { id: 'flow', kind: 'flow', projects: [project], size: 'M' },
  { id: 'tracker-status', kind: 'tracker-status', projects: [project], size: 'M' },
  { id: 'velocity', kind: 'velocity', projects: [project], size: 'M' },
  { id: 'activity', kind: 'activity', projects: [project], size: 'M' },
];
/** Cartes proposées par « + Ajouter une carte » : celles de la page, plus, dans un projet, toutes les cartes d'avancement. */
const builtinFor = (project?: string, page?: string): Widget[] => (project && page ? progressWidgets(project)
  : project ? [...projectWidgets(project), ...progressWidgets(project).filter((w) => w.id !== 'indicators')] : HOME_WIDGETS);
/** Pied propre à une carte (lien vers le détail, T-0155). */
const footerOf = (w: Widget, project: string | undefined): ReactNode => {
  const p = w.projects?.[0] ?? project ?? '';
  switch (w.kind) {
    case 'indicators': return <Link className="ath-link" to={`/p/${p}/recherche?q=${encodeURIComponent('category != done')}`}>{fr.progress.seeTickets}</Link>;
    case 'velocity': return velocityFooter(p);
    case 'release': return <Link className="ath-link" to={`/p/${p}/roadmap`}>{fr.progress.seeRoadmap}</Link>;
    case 'tracker-status': return <Link className="ath-link" to={`/p/${p}/trackers`}>{fr.progress.seeTrackers}</Link>;
    case 'activity': return <Link className="ath-link" to={`/p/${p}/rapports/activite`}>{fr.progress.seeHistory}</Link>;
    case 'chart': return <Link className="ath-link" to={searchHref(w)}>{fr.chart.openSearch}</Link>;
    default: return undefined;
  }
};

const titleOf = (hit: Hit) => String(hit.values['title'] ?? hit.values['name'] ?? '');
const widgetTitle = (w: Widget) => w.title ?? fr.home.titles[w.id] ?? fr.home.kinds[w.kind] ?? w.id;
/** Lien « tout voir » d'un widget de recherche : la recherche globale pré-remplie. */
const searchHref = (w: Widget) => `/recherche?q=${encodeURIComponent(w.query ?? '')}${w.projects?.length ? `&p=${w.projects.join(',')}` : ''}`;

function Rows({ children, empty }: { children: JSX.Element[]; empty: string }) {
  return children.length === 0 ? <p>{empty}</p> : <ul className="ath-stack">{children}</ul>;
}

function SearchBody({ widget, onEmpty }: { widget: Widget; onEmpty?: OnEmpty }) {
  const [res, setRes] = useState<SearchResult | null>(null);
  useEffect(() => { if (res) onEmpty?.(res.total === 0); }, [res, onEmpty]);
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
            <StatusPill {...statusPill(h.category, h.statusColor)}>{h.statusName ?? h.status}</StatusPill>
          </li>
        ))}
      </Rows>
    </div>
  );
}

function MentionsBody({ onEmpty }: { onEmpty?: OnEmpty }) {
  const [items, setItems] = useState<Mention[] | null>(null);
  useEffect(() => { if (items) onEmpty?.(items.length === 0); }, [items, onEmpty]);
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

function ApprovalsBody({ objects, onEmpty }: { objects: boolean; onEmpty?: OnEmpty }) {
  const [items, setItems] = useState<AwaitingItem[] | null>(null);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  useEffect(() => { if (items) onEmpty?.(items.length + rows.length === 0); }, [items, rows, onEmpty]);
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
    </div>
  );
}

function PinsBody({ kind }: { kind: 'favorites' | 'recents' }) {
  const pins = usePins();
  const list = (kind === 'favorites' ? pins.favorites : pins.recents).slice(0, 5);
  return <Rows empty={kind === 'favorites' ? fr.rail.noFavorites : fr.rail.noRecents}>{list.map((p) => <li key={p.id}><Link className={`ath-link${p.kind === 'item' ? ' ath-mono' : ''}`} to={pinHref(p)}>{p.label}</Link></li>)}</Rows>;
}

function Body({ widget, objects, onEmpty, project }: { widget: Widget; objects: boolean; project?: string | undefined; onEmpty?: OnEmpty | undefined }) {
  const p = widget.projects?.[0] ?? project ?? '';
  switch (widget.kind) {
    case 'indicators': return <IndicatorsCard project={p} />;
    case 'flow': return <FlowCard project={p} />;
    case 'velocity': return <VelocityCard project={p} />;
    case 'release': return <ReleaseCard project={p} />;
    case 'tracker-status': return <TrackerStatusCard project={p} />;
    case 'activity': return <ActivityCard project={p} />;
    case 'chart': return <ChartBody spec={{ query: widget.query, projects: widget.projects, field: widget.field, form: widget.form }} />;
    case 'search': return <SearchBody widget={widget} onEmpty={onEmpty} />;
    case 'mentions': return <MentionsBody onEmpty={onEmpty} />;
    case 'approvals': return <ApprovalsBody objects={objects} onEmpty={onEmpty} />;
    case 'trackers': return <TrackersBody project={widget.projects?.[0] ?? ''} />;
    case 'favorites': case 'recents': return <PinsBody kind={widget.kind} />;
    default: return null;
  }
}

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ') || undefined;

/** Déplace la carte `from` à la place `to` (glisser-déposer ou clavier, T-0154). */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item!);
  return next;
}

/**
 * Tableau de bord organisable (ADR-0005 § 2.3, T-0153 et T-0154) : Mon travail, Vue d'ensemble d'un projet et Avancement.
 * « Organiser » déplie la grille : chaque carte se déplace par sa poignée (glisser-déposer, ou clavier : Entrée pour la saisir,
 * flèches pour la déplacer, Entrée ou Échap pour la poser), change de largeur (S, M, L, XL) ou se masque ; « + Ajouter une carte »
 * propose les cartes disponibles ; la disposition est enregistrée aussitôt sur le compte, par page.
 */
export function Dashboard({ project, page, qa = false }: { project?: string; page?: 'avancement'; qa?: boolean } = {}) {
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [editing, setEditing] = useState(false);
  const [views, setViews] = useState<SavedSearch[]>([]);
  const [choice, setChoice] = useState('');
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const reportEmpty = useCallback((id: string) => (value: boolean) => setEmpty((s) => (s[id] === value ? s : { ...s, [id]: value })), []);
  const BUILTIN = builtinFor(project, page);
  const endpoint = `/v1/me/dashboard${project ? `?project=${project}${page ? `&page=${page}` : ''}` : ''}`;

  useEffect(() => { api<Layout>('GET', endpoint).then((r) => setLayout(Array.isArray(r?.widgets) ? r : { widgets: builtinFor(project, page), isDefault: true })).catch((e) => { setLayout({ widgets: builtinFor(project, page), isDefault: true }); fail(e); }); }, [fail, endpoint, project, page]);
  useEffect(() => { if (editing) api<SavedSearch[]>('GET', '/v1/searches').then((r) => setViews(Array.isArray(r) ? r : [])).catch(() => setViews([])); }, [editing]);
  // Après un déplacement au clavier, le focus reste sur la poignée de la carte déplacée.
  useEffect(() => { if (grabbed) document.getElementById(`dash-handle-${grabbed}`)?.focus(); }, [layout, grabbed]);

  // Seule la réponse du dernier enregistrement s'applique : deux gestes rapprochés (déplacer puis élargir) ne s'écrasent pas.
  const latest = useRef(0);
  const save = useCallback(async (widgets: Widget[]) => {
    const ticket = ++latest.current;
    setLayout((l) => (l ? { ...l, widgets } : l)); // affichage immédiat, puis la réponse du serveur
    try {
      const saved = await api<Layout>('PUT', endpoint, { widgets });
      if (ticket === latest.current) setLayout(saved);
    } catch (error) { fail(error); }
  }, [fail, endpoint]);

  if (layout === null) return <p role="status">{fr.loading}</p>;
  const { widgets } = layout;
  const quiet = widgets.filter((w) => QUIET.includes(w.kind) && empty[w.id]);
  const moveTo = (from: number, to: number) => (to < 0 || to >= widgets.length || to === from ? undefined : save(reorder(widgets, from, to)));
  const resize = (i: number, size: DashSize) => save(widgets.map((w, k) => (k === i ? { ...w, size } : w)));
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
  // Carte graphique sur une recherche (T-0156), dans la portée de la page.
  const addChart = async (c: { title: string; query: string; field: string; form: ChartFormKind }) => {
    await save([...widgets, { id: `chart-${Date.now().toString(36)}`, kind: 'chart', title: c.title, query: c.query, form: c.form, size: 'S',
      ...(c.form === 'count' ? {} : { field: c.field }), ...(project ? { projects: [project] } : {}) }]);
    setChoice('');
    toast('success', fr.home.added);
  };
  const reset = async () => {
    if (!(await confirm.ask({ title: fr.home.resetTitle, body: fr.home.resetBody, confirm: fr.home.reset }))) return;
    try { await api('DELETE', endpoint); setLayout(await api<Layout>('GET', endpoint)); toast('success', fr.home.resetDone); } catch (error) { fail(error); }
  };
  // Clavier sur la poignée : Entrée ou Espace saisit et pose, les flèches déplacent, Échap pose.
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, i: number, w: Widget) => {
    const title = widgetTitle(w);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (grabbed === w.id) { setGrabbed(null); setAnnounce(fr.home.dropped(title, i + 1, widgets.length)); }
      else { setGrabbed(w.id); setAnnounce(fr.home.grabbed(title)); }
    } else if (event.key === 'Escape' && grabbed === w.id) {
      setGrabbed(null); setAnnounce(fr.home.dropped(title, i + 1, widgets.length));
    } else if (grabbed === w.id && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const to = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? i - 1 : i + 1;
      if (to >= 0 && to < widgets.length) { void moveTo(i, to); setAnnounce(fr.home.moved(title, to + 1, widgets.length)); }
    }
  };

  return (
    <section aria-label={page ? fr.home.progressLabel : project ? fr.home.projectLabel : fr.home.label} className="ath-stack">
      <div className="ath-toolbar ath-dash-toolbar">
        {editing ? (
          <>
            <Btn variant="ghost" size="sm" disabled={layout.isDefault} onClick={() => void reset()}>{fr.home.resetLong}</Btn>
            <Btn size="sm" onClick={() => { setEditing(false); setGrabbed(null); }}>{fr.home.done}</Btn>
          </>
        ) : <Btn variant="ghost" size="sm" onClick={() => setEditing(true)}>{fr.home.organize}</Btn>}
      </div>
      {editing && <p className="ath-notice">{fr.home.organizeHint}</p>}
      <p className="ath-visually-hidden" aria-live="assertive">{announce}</p>
      {widgets.length === 0 && !editing && <p>{fr.home.noWidget}</p>}
      {/* Mon travail : les cartes vides se résument en une ligne, la liste utile remonte (T-0153, revue O3). */}
      {!editing && !project && quiet.length > 0 && <p className="ath-card ath-dash-quiet"><strong>{fr.home.quietLead}</strong> {fr.home.quiet(quiet.map((w) => widgetTitle(w)))}</p>}
      <DashGrid className={editing ? 'ath-dashgrid ath-dashgrid--editing' : 'ath-dashgrid'}>
        {widgets.map((w, i) => {
          const title = widgetTitle(w);
          return (
            <DashCard key={w.id} size={sizeOf(w)} title={title} role="group" aria-label={title} hidden={!editing && !project && quiet.includes(w)}
              className={cx(grabbed === w.id && 'ath-dashcard--grabbed', dragging === i && 'ath-dashcard--dragging')}
              draggable={editing} onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragging(null)}
              onDragOver={(e) => { if (dragging !== null) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragging !== null) void moveTo(dragging, i); setDragging(null); }}
              handle={editing ? <button type="button" id={`dash-handle-${w.id}`} className="ath-dashcard__handle" aria-pressed={grabbed === w.id}
                aria-label={fr.home.handle(title)} title={fr.home.handle(title)} onKeyDown={(e) => onHandleKey(e, i, w)}
                onClick={() => { if (grabbed === w.id) setGrabbed(null); }}>⠿</button> : undefined}
              actions={editing ? (
                <>
                  <span className="ath-segmented" role="group" aria-label={fr.home.width(title)}>
                    {DASH_SIZES.map((s) => <button key={s} type="button" className="ath-segmented__item" aria-pressed={sizeOf(w) === s} aria-label={fr.home.sizeLabel(s, title)} onClick={() => void resize(i, s)}>{s}</button>)}
                  </span>
                  {w.kind === 'search' && <Btn variant="ghost" size="sm" aria-label={`${fr.home.duplicate} ${title}`} onClick={() => void duplicate(i)}>{fr.home.duplicate}</Btn>}
                  <Btn variant="ghost" size="sm" aria-label={`${fr.home.hide} ${title}`} onClick={() => void hide(i)}>{fr.home.hide}</Btn>
                </>
              ) : undefined}
              footer={w.kind === 'search' ? <Link className="ath-link" to={searchHref(w)}>{fr.home.seeAll}</Link>
                : w.kind === 'trackers' ? <Link className="ath-link" to={`/p/${w.projects?.[0] ?? ''}/trackers`}>{fr.overview.openTrackers}</Link> : footerOf(w, project)}>
              <Body widget={w} objects={qa} project={project} onEmpty={QUIET.includes(w.kind) ? reportEmpty(w.id) : undefined} />
            </DashCard>
          );
        })}
        {editing && (
          <div className="ath-dashadd">
            <label className="ath-dashadd__title" htmlFor="dash-add">{fr.home.addCard}</label>
            <p className="ath-field__hint">{fr.home.addCardHelp}</p>
            <Select id="dash-add" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{fr.home.choose}</option>
              {missing.map((b) => <option key={b.id} value={`builtin:${b.id}`}>{widgetTitle(b)}</option>)}
              {views.map((v) => <option key={v.id} value={`view:${v.id}`}>{fr.home.viewOption(v.name)}</option>)}
              <option value="chart:new">{fr.chart.newOption}</option>
            </Select>
            {choice === 'chart:new' ? <ChartForm onAdd={(c) => void addChart(c)} />
              : <div><Btn size="sm" disabled={choice === ''} onClick={() => void add()}>{fr.home.add}</Btn></div>}
          </div>
        )}
      </DashGrid>
      {confirm.dialog}
    </section>
  );
}
