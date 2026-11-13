import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Btn, DASH_SIZES, boxClasses, DashCard, DashGrid, Select, StatusPill, useToast, type DashSize } from '@athena/ui';
import { api, type Hit, type SearchResult, type TrackerOverview } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { pinHref, usePins } from '../lib/pins';
import { ActivityCard, FlowCard, IndicatorsCard, ReleaseCard, TrackerStatusCard, VelocityCard, velocityFooter } from './ProgressCards';
import { ChartBody, ChartForm, type ChartForm as ChartFormKind } from './ChartCard';
import { pillKind } from '../pages/ListPage';
import { useConfirm } from './ConfirmDialog';
import { statusPill } from '../lib/status';
import { BadgesCard, GeneralInfoCard, GlobalProgressCard, HealthCard, KeyIndicatorsCard, PipelinesCard, QualityCard, SprintProgressCard, TicketRow, WidgetEmpty } from './WidgetCards';
import { GRID_COLUMNS, DEFAULT_ROWS, MAX_ROWS, SIZE_COLUMNS, flowOrder, nextRow, placeAt, resizeTo, withBoxes } from '../lib/grid';

export type WidgetKind = 'search' | 'mentions' | 'approvals' | 'favorites' | 'recents' | 'trackers'
  | 'indicators' | 'flow' | 'velocity' | 'release' | 'tracker-status' | 'activity' | 'chart'
  | 'general-info' | 'global-progress' | 'key-indicators' | 'health' | 'sprint-progress' | 'pipelines' | 'quality' | 'badges';
/** Cartes d'avancement d'un projet (T-0155) : elles portent la clé du projet dans `projects`. */
const PROGRESS: WidgetKind[] = ['indicators', 'flow', 'velocity', 'release', 'tracker-status', 'activity'];
export type Period = '7d' | '30d' | 'sprint';
export interface Widget { id: string; kind: WidgetKind; title?: string; query?: string; projects?: string[]; size?: DashSize; field?: string; form?: ChartFormKind; x?: number; y?: number; w?: number; h?: number; project?: string; period?: Period }
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

/** Toutes les cartes de l'accueil que chaque rôle peut avoir (l'API en choisit selon le rôle) : sert à les réajouter après un retrait. */
const HOME_WIDGETS: Widget[] = [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
  { id: 'mylate', kind: 'search', query: 'assignee = currentUser() AND late()' },
  { id: 'late', kind: 'search', query: 'late() ORDER BY dueDate' },
  { id: 'critical', kind: 'search', query: 'critical() AND category != done ORDER BY startDate' },
  { id: 'risks', kind: 'search', query: 'type = risk AND category != done ORDER BY criticality DESC' },
  { id: 'approvals', kind: 'approvals' },
  { id: 'mentions', kind: 'mentions' },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)' },
  { id: 'ncr', kind: 'search', query: 'type = nonconformity AND category != done' },
  { id: 'rid', kind: 'search', query: 'type = action AND category != done' },
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
    case 'release': return <Link className="ath-link" to={`/p/${p}/planning?vue=versions`}>{fr.progress.seeRoadmap}</Link>;
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

/** Liste de lignes, ou l'état vide du genre (illustration, phrase, bouton d'action) quand il n'y en a pas. */
function Rows({ children, empty, action, to }: { children: JSX.Element[]; empty: string; action?: string; to?: string }) {
  return children.length === 0 ? <WidgetEmpty text={empty} {...(action && to ? { action, to } : {})} /> : <ul className="ath-stack">{children}</ul>;
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
      <Rows empty={fr.widgets.empty['search']!} action={fr.widgets.openSearch} to={searchHref(widget)}>
        {res.hits.map((h) => (
          <TicketRow key={`${h.project}-${h.key}`} project={h.project ?? ''} keyName={h.key} title={titleOf(h)}
            pill={<StatusPill {...statusPill(h.category, h.statusColor)}>{h.statusName ?? h.status}</StatusPill>} />
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
    <Rows empty={fr.widgets.empty['mentions']!} action={fr.widgets.openNotifications} to="/notifications">
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
    <Rows empty={fr.widgets.empty['approvals']!} action={fr.widgets.openSearch} to="/recherche">
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

function PinsBody({ kind }: { kind: 'favorites' | 'recents' }) {
  const pins = usePins();
  const list = (kind === 'favorites' ? pins.favorites : pins.recents).slice(0, 5);
  return <Rows empty={fr.widgets.empty[kind]!} action={fr.widgets.browseProjects} to="/projets">{list.map((p) => <li key={p.id}><Link className={`ath-link${p.kind === 'item' ? ' ath-mono' : ''}`} to={pinHref(p)}>{p.label}</Link></li>)}</Rows>;
}

function Body({ widget, objects, onEmpty, project }: { widget: Widget; objects: boolean; project?: string | undefined; onEmpty?: OnEmpty | undefined }) {
  const p = widget.project ?? widget.projects?.[0] ?? project ?? '';
  switch (widget.kind) {
    case 'indicators': return <IndicatorsCard project={p} />;
    case 'flow': return <FlowCard project={p} />;
    case 'velocity': return <VelocityCard project={p} />;
    case 'release': return <ReleaseCard project={p} />;
    case 'tracker-status': return <TrackerStatusCard project={p} />;
    case 'activity': return <ActivityCard project={p} />;
    case 'general-info': return <GeneralInfoCard project={p} />;
    case 'global-progress': return <GlobalProgressCard project={p} />;
    case 'key-indicators': return <KeyIndicatorsCard project={p} />;
    case 'health': return <HealthCard project={p} />;
    case 'sprint-progress': return <SprintProgressCard project={p} />;
    case 'pipelines': return <PipelinesCard project={p} />;
    case 'quality': return <QualityCard project={p} />;
    case 'badges': return <BadgesCard project={p} />;
    case 'chart': return <ChartBody spec={{ query: widget.query, projects: widget.projects, field: widget.field, form: widget.form }} />;
    case 'search': return <SearchBody widget={widget} onEmpty={onEmpty} />;
    case 'mentions': return <MentionsBody onEmpty={onEmpty} />;
    case 'approvals': return <ApprovalsBody objects={objects} onEmpty={onEmpty} />;
    // Même rendu que la carte « Trackers par statut » de l’Avancement (T-0157, uniformité des cartes).
    case 'trackers': return <TrackerStatusCard project={p} />;
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

const PERIODS: Period[] = ['7d', '30d', 'sprint'];
/** Genres rattachés à un projet (clé dans `projects` / `project`). */
const PROJECT_KINDS = new Set<WidgetKind>(['chart', 'trackers', ...PROGRESS, 'general-info', 'global-progress', 'key-indicators', 'health', 'sprint-progress', 'pipelines', 'quality', 'badges']);
/** Genres qui ne servent qu'avec un projet choisi (les cartes d'avancement et les trackers en ont toujours un). */
const NEEDS_PROJECT = new Set<WidgetKind>(['general-info', 'global-progress', 'key-indicators', 'health', 'sprint-progress']);
/** Genres ajoutés depuis leur propre commande (recherche enregistrée, graphique) plutôt que depuis la liste des genres. */
const SPECIAL = new Set<string>(['search', 'chart']);
interface CatalogEntry { kind: WidgetKind; project: boolean }
type Placed = Widget & { x: number; y: number; w: number; h: number };

/**
 * Tableau de bord modulaire (ADR-0007, T-0171 et T-0172) : grille de 12 colonnes à lignes de 88 px, une colonne sous 720 px dans
 * l'ordre de lecture. « Organiser » ouvre un brouillon : glisser-déposer sur la grille, ou clavier (Entrée pour saisir la poignée,
 * flèches pour déplacer, Entrée ou Échap pour poser), engrenage (titre, projet, taille, période), retrait, tiroir « Catalogue »
 * des genres permis au rôle. Rien n'est enregistré avant « Enregistrer » ; « Annuler » restaure ; « Rétablir » revient au défaut.
 */
export function Dashboard({ project, page, qa = false }: { project?: string; page?: 'avancement'; qa?: boolean } = {}) {
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [draft, setDraft] = useState<Placed[] | null>(null);
  const [views, setViews] = useState<SavedSearch[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [chartOpen, setChartOpen] = useState(false);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const reportEmpty = useCallback((id: string) => (value: boolean) => setEmpty((st) => (st[id] === value ? st : { ...st, [id]: value })), []);
  const BUILTIN = builtinFor(project, page);
  const endpoint = `/v1/me/dashboard${project ? `?project=${project}${page ? `&page=${page}` : ''}` : ''}`;
  const editing = draft !== null;

  useEffect(() => { api<Layout>('GET', endpoint).then((r) => setLayout(Array.isArray(r?.widgets) ? r : { widgets: builtinFor(project, page), isDefault: true })).catch((e) => { setLayout({ widgets: builtinFor(project, page), isDefault: true }); fail(e); }); }, [fail, endpoint, project, page]);
  useEffect(() => {
    if (!editing) return;
    api<SavedSearch[]>('GET', '/v1/searches').then((r) => setViews(Array.isArray(r) ? r : [])).catch(() => setViews([]));
    api<{ kinds: CatalogEntry[] }>('GET', '/v1/me/dashboard/catalog').then((r) => setCatalog(Array.isArray(r?.kinds) ? r.kinds : [])).catch(() => setCatalog([]));
  }, [editing]);
  // Après un déplacement au clavier, le focus reste sur la poignée de la carte déplacée.
  useEffect(() => { if (grabbed) document.getElementById(`dash-handle-${grabbed}`)?.focus(); }, [draft, grabbed]);

  if (layout === null) return <p role="status">{fr.loading}</p>;
  const shown: Placed[] = draft ?? (withBoxes(layout.widgets) as Placed[]);
  const quiet = shown.filter((w) => QUIET.includes(w.kind) && empty[w.id]);
  // Hors édition (Mon travail), les cartes vides masquées ne laissent pas de trou : les autres se replacent à leur suite.
  const compact = !draft && !project && quiet.length > 0;
  const packed = compact ? new Map(withBoxes(flowOrder(shown).filter((w) => !quiet.includes(w)).map(({ x: _x, y: _y, ...rest }) => rest)).map((w) => [w.id, w as Placed])) : null;
  const widgets = flowOrder(shown.map((w) => packed?.get(w.id) ?? w));
  const edit = (next: Placed[]) => setDraft(next);
  const start = () => setDraft(withBoxes(layout.widgets) as Placed[]);
  const stop = () => { setDraft(null); setGrabbed(null); setSettings(null); setPreview(null); setChartOpen(false); };
  const save = async () => {
    if (!draft) return;
    try {
      const saved = await api<Layout>('PUT', endpoint, { widgets: draft });
      setLayout(saved);
      stop();
      toast('success', fr.home.saved);
    } catch (error) { fail(error); }
  };
  const patch = (id: string, change: Partial<Widget>) => edit(shown.map((w) => (w.id === id ? { ...w, ...change } : w)));
  const remove = (id: string) => { edit(shown.filter((w) => w.id !== id)); if (settings === id) setSettings(null); };
  const addWidget = (widget: Widget) => {
    const placed = withBoxes([{ ...widget, w: SIZE_COLUMNS[widget.size ?? 'S'], h: DEFAULT_ROWS, x: 0, y: nextRow(shown) }])[0] as Placed;
    edit([...shown, placed]);
    toast('success', fr.home.added);
  };
  const uid = (base: string) => `${base.replace(/[^a-z0-9-]/g, '').slice(0, 28)}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const addKind = (kind: WidgetKind) => addWidget({ id: uid(kind), kind, ...(project && PROJECT_KINDS.has(kind) ? { projects: [project], project } : {}) });
  const duplicate = (id: string) => {
    const { x: _x, y: _y, ...w } = shown.find((c) => c.id === id)!;
    addWidget({ ...w, id: uid(w.id.replace(/-[a-z0-9]{6,}$/, '')), title: fr.home.copyOf(widgetTitle(w)) });
  };
  const missing = BUILTIN.filter((b) => !shown.some((w) => w.id === b.id));
  const addView = (view: SavedSearch) => addWidget({ id: uid(`v-${view.id.slice(0, 8)}`), kind: 'search', title: view.name, query: view.query, ...(project ? { projects: [project] } : view.projects.length ? { projects: view.projects } : {}) });
  const addChart = (c: { title: string; query: string; field: string; form: ChartFormKind }) => {
    addWidget({ id: uid('chart'), kind: 'chart', title: c.title, query: c.query, form: c.form, size: 'S', ...(c.form === 'count' ? {} : { field: c.field }), ...(project ? { projects: [project] } : {}) });
    setChartOpen(false);
  };
  const reset = async () => {
    if (!(await confirm.ask({ title: fr.home.resetTitle, body: fr.home.resetBody, confirm: fr.home.reset }))) return;
    try { await api('DELETE', endpoint); setLayout(await api<Layout>('GET', endpoint)); stop(); toast('success', fr.home.resetDone); } catch (error) { fail(error); }
  };

  // Clavier sur la poignée : Entrée ou Espace saisit et pose, les flèches déplacent d'une case, Échap pose.
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, w: Placed) => {
    const title = widgetTitle(w);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (grabbed === w.id) { setGrabbed(null); setAnnounce(fr.home.dropped(title, w.x + 1, w.y + 1)); }
      else { setGrabbed(w.id); setAnnounce(fr.home.grabbed(title)); }
    } else if (event.key === 'Escape' && grabbed === w.id) {
      setGrabbed(null); setAnnounce(fr.home.dropped(title, w.x + 1, w.y + 1));
    } else if (grabbed === w.id && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      const next = placeAt(shown, w.id, w.x + dx, w.y + dy);
      edit(next);
      const moved = next.find((c) => c.id === w.id)!;
      setAnnounce(fr.home.at(title, moved.x + 1, moved.y + 1));
    }
  };

  /** Case de la grille sous le pointeur. */
  const cellAt = (event: DragEvent): { x: number; y: number } | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const style = window.getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 0;
    const rowHeight = parseFloat(style.gridAutoRows) || 88;
    const colWidth = (rect.width + gap) / GRID_COLUMNS;
    if (!(colWidth > 0) || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    return { x: Math.floor((event.clientX - rect.left) / colWidth), y: Math.floor((event.clientY - rect.top) / (rowHeight + gap)) };
  };
  const onDragOver = (event: DragEvent) => {
    if (!dragging) return;
    event.preventDefault();
    const cell = cellAt(event);
    if (cell) setPreview({ x: cell.x - dragging.dx, y: cell.y - dragging.dy });
  };
  const onDrop = (event: DragEvent) => {
    if (!dragging) return;
    event.preventDefault();
    const cell = cellAt(event);
    const target = cell ? { x: cell.x - dragging.dx, y: cell.y - dragging.dy } : preview;
    if (target) {
      const next = placeAt(shown, dragging.id, target.x, target.y);
      edit(next);
      const moved = next.find((c) => c.id === dragging.id)!;
      setAnnounce(fr.home.at(widgetTitle(moved), moved.x + 1, moved.y + 1));
    }
    setDragging(null); setPreview(null);
  };
  const dragged = dragging ? shown.find((w) => w.id === dragging.id) : undefined;
  const ghost = dragged && preview ? placeAt(shown, dragged.id, preview.x, preview.y).find((c) => c.id === dragged.id)! : null;
  const current = settings ? shown.find((w) => w.id === settings) : undefined;

  const grid = (
    <DashGrid ref={gridRef} className={editing ? 'ath-dashgrid--editing' : undefined} onDragOver={onDragOver} onDrop={onDrop}>
      {widgets.map((w) => {
        const title = widgetTitle(w);
        const needsProject = NEEDS_PROJECT.has(w.kind) && !(w.projects?.[0] ?? w.project ?? project);
        return (
          <DashCard key={w.id} size={sizeOf(w)} box={{ x: w.x, y: w.y, w: w.w, h: w.h }} title={title} role="group" aria-label={title} hidden={!editing && !project && quiet.includes(w)}
            className={cx(grabbed === w.id && 'ath-dashcard--grabbed', dragging?.id === w.id && 'ath-dashcard--dragging')}
            draggable={editing && grabbed === null} onDragStart={(e) => { const cell = cellAt(e); setDragging({ id: w.id, dx: cell ? Math.max(0, Math.min(w.w - 1, cell.x - w.x)) : 0, dy: cell ? Math.max(0, Math.min(w.h - 1, cell.y - w.y)) : 0 }); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => { setDragging(null); setPreview(null); }}
            handle={editing ? <button type="button" id={`dash-handle-${w.id}`} className="ath-dashcard__handle" aria-pressed={grabbed === w.id}
              aria-label={fr.home.handle(title)} title={fr.home.handle(title)} onKeyDown={(e) => onHandleKey(e, w)}
              onClick={() => { if (grabbed === w.id) setGrabbed(null); }}>⠿</button> : undefined}
            actions={editing ? (
              <>
                <Btn variant="ghost" size="sm" aria-label={fr.home.settingsOf(title)} aria-expanded={settings === w.id} onClick={() => setSettings(settings === w.id ? null : w.id)}>{fr.home.settings}</Btn>
                <Btn variant="ghost" size="sm" aria-label={`${fr.home.hide} ${title}`} onClick={() => remove(w.id)}>{fr.home.hide}</Btn>
              </>
            ) : undefined}
            footer={w.kind === 'search' ? <Link className="ath-link" to={searchHref(w)}>{fr.home.seeAll}</Link>
              : w.kind === 'trackers' ? <Link className="ath-link" to={`/p/${w.projects?.[0] ?? ''}/trackers`}>{fr.overview.openTrackers}</Link> : footerOf(w, project)}>
            {needsProject ? <p>{fr.home.chooseProject}</p> : <Body widget={w} objects={qa} project={project} onEmpty={QUIET.includes(w.kind) ? reportEmpty(w.id) : undefined} />}
          </DashCard>
        );
      })}
      {ghost && <div className={cx('ath-dashdrop', ...boxClasses(ghost))} aria-hidden="true" />}
    </DashGrid>
  );

  return (
    <section aria-label={page ? fr.home.progressLabel : project ? fr.home.projectLabel : fr.home.label} className="ath-stack">
      <div className="ath-toolbar ath-dash-toolbar">
        {editing ? (
          <>
            <Btn variant="ghost" size="sm" disabled={layout.isDefault && JSON.stringify(shown) === JSON.stringify(withBoxes(layout.widgets))} onClick={() => void reset()}>{fr.home.resetLong}</Btn>
            <Btn variant="ghost" size="sm" onClick={stop}>{fr.home.cancel}</Btn>
            <Btn size="sm" onClick={() => void save()}>{fr.home.save}</Btn>
          </>
        ) : <Btn variant="ghost" size="sm" onClick={start}>{fr.home.organize}</Btn>}
      </div>
      {editing && <p className="ath-notice">{fr.home.organizeHint}</p>}
      <p className="ath-visually-hidden" aria-live="assertive">{announce}</p>
      {widgets.length === 0 && !editing && <p>{fr.home.noWidget}</p>}
      {/* Mon travail : les cartes vides se résument en une ligne, la liste utile remonte (T-0153, revue O3). */}
      {!editing && !project && quiet.length > 0 && <p className="ath-card ath-dash-quiet"><strong>{fr.home.quietLead}</strong> {fr.home.quiet(quiet.map((w) => widgetTitle(w)))}</p>}
      {editing ? (
        <div className="ath-dashedit">
          {grid}
          <div role="group" className="ath-dashdrawer" aria-label={fr.home.catalog}>
            {current && (
              <section className="ath-stack" aria-label={fr.home.settingsOf(widgetTitle(current))}>
                <h3 className="ath-subsection-title">{fr.home.settingsOf(widgetTitle(current))}</h3>
                <label className="ath-field">{fr.home.fieldTitle}<input className="ath-input" value={current.title ?? ''} placeholder={widgetTitle({ ...current, title: undefined })} maxLength={100} onChange={(e) => patch(current.id, { title: e.target.value || undefined })} /></label>
                {PROJECT_KINDS.has(current.kind) && (
                  <label className="ath-field">{fr.home.fieldProject}<input className="ath-input ath-mono" value={current.project ?? current.projects?.[0] ?? ''} maxLength={10} placeholder="NOVA"
                    onChange={(e) => { const key = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); patch(current.id, key ? { project: key, projects: [key] } : { project: undefined, projects: undefined }); }} /></label>
                )}
                <label className="ath-field">{fr.home.fieldWidth}
                  <Select value={String(current.size ?? 'M')} onChange={(e) => edit(resizeTo(shown, current.id, SIZE_COLUMNS[e.target.value as DashSize], current.h))}>
                    {DASH_SIZES.map((sz) => <option key={sz} value={sz}>{fr.home.sizeOption(sz, SIZE_COLUMNS[sz])}</option>)}
                  </Select>
                </label>
                <label className="ath-field">{fr.home.fieldHeight}
                  <Select value={String(current.h)} onChange={(e) => edit(resizeTo(shown, current.id, current.w, Number(e.target.value)))}>
                    {Array.from({ length: MAX_ROWS }, (_, i) => i + 1).map((r) => <option key={r} value={r}>{fr.home.rows(r)}</option>)}
                  </Select>
                </label>
                <label className="ath-field">{fr.home.fieldPeriod}
                  <Select value={current.period ?? ''} onChange={(e) => patch(current.id, { period: (e.target.value || undefined) as Period | undefined })}>
                    <option value="">{fr.home.periodDefault}</option>
                    {PERIODS.map((pd) => <option key={pd} value={pd}>{fr.home.periods[pd]}</option>)}
                  </Select>
                </label>
                {current.kind === 'search' && <div><Btn variant="ghost" size="sm" aria-label={`${fr.home.duplicate} ${widgetTitle(current)}`} onClick={() => duplicate(current.id)}>{fr.home.duplicate}</Btn></div>}
                <div><Btn variant="ghost" size="sm" onClick={() => setSettings(null)}>{fr.home.close}</Btn></div>
              </section>
            )}
            <h3 className="ath-subsection-title">{fr.home.catalog}</h3>
            <p className="ath-field__hint">{fr.home.catalogHelp}</p>
            <ul className="ath-stack">
              {catalog.filter((c) => !SPECIAL.has(c.kind)).map((c) => (
                <li key={c.kind} className="ath-row"><span>{fr.home.kinds[c.kind] ?? c.kind}</span>
                  <Btn variant="ghost" size="sm" aria-label={fr.home.addKind(fr.home.kinds[c.kind] ?? c.kind)} onClick={() => addKind(c.kind)}>{fr.home.add}</Btn></li>
              ))}
              {missing.filter((b) => b.kind === 'search' || !catalog.some((c) => c.kind === b.kind)).map((b) => (
                <li key={b.id} className="ath-row"><span>{widgetTitle(b)}</span><Btn variant="ghost" size="sm" aria-label={fr.home.addKind(widgetTitle(b))} onClick={() => addWidget(b)}>{fr.home.add}</Btn></li>
              ))}
              {views.map((v) => (
                <li key={v.id} className="ath-row"><span>{fr.home.viewOption(v.name)}</span><Btn variant="ghost" size="sm" aria-label={fr.home.addKind(v.name)} onClick={() => addView(v)}>{fr.home.add}</Btn></li>
              ))}
              <li className="ath-row"><span>{fr.chart.newOption}</span><Btn variant="ghost" size="sm" aria-expanded={chartOpen} aria-label={fr.home.addKind(fr.chart.newOption)} onClick={() => setChartOpen(!chartOpen)}>{fr.home.add}</Btn></li>
            </ul>
            {chartOpen && <ChartForm onAdd={addChart} />}
          </div>
        </div>
      ) : grid}
      {confirm.dialog}
    </section>
  );
}
