import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PortfolioHealthTable } from './PortfolioHealthTable';
import { Link } from 'react-router-dom';
import { Btn, DashCard, DashGrid, StatusPill, Tabs, useToast } from '@athena/ui';
import { api, type SearchResult, type TrackerOverview } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { pinHref, usePins } from '../lib/pins';
import { ActivityCard, FlowCard, IndicatorsCard, ReleaseCard, TrackerStatusCard, VelocityCard, velocityFooter } from './ProgressCards';
import { ChartBody } from './ChartCard';
import { useConfirm } from './ConfirmDialog';
import { statusPill } from '../lib/status';
import { BadgesCard, GeneralInfoCard, GlobalProgressCard, HealthCard, KeyIndicatorsCard, PipelinesCard, QualityCard, SprintProgressCard, TicketRow, WidgetEmpty } from './WidgetCards';
import { CapacityCard, PhaseGateCard, PlatformOpsCard, PortfolioFinanceCard, PortfolioGatesCard, PortfolioRequestsCard, ProjectFinanceCard, RiskMatrixCard, RoadmapCard, usePortfolioProjects } from './PilotCards';
import { flowOrder, withBoxes } from '../lib/grid';
import { DashboardEditor } from './DashboardEditor';
import { TemplatePicker } from './TemplatePicker';
import {
  MAIN_TAB, QUIET, builtinFor, missingTarget, searchHref, sizeOf, titleOf, widgetTitle,
  type CatalogEntry, type Layout, type OnEmpty, type Placed, type SavedSearch, type TabInfo, type Widget,
} from './dashboard-model';

export { progressWidgets, reorder, sizeOf, type Period, type Widget, type WidgetKind } from './dashboard-model';

interface Mention { id: string; project: string; key: string; actorName: string; read: boolean }
interface ApprovalRow { project: string; type: string; ref: string }
interface AwaitingItem { project: string; key: string; tracker: string; step: string }

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

/** Liste de lignes, ou l'état vide du genre (illustration, phrase, bouton d'action) quand il n'y en a pas. */
function Rows({ children, empty, action, to }: { children: JSX.Element[]; empty: string; action?: string; to?: string }) {
  return children.length === 0 ? <WidgetEmpty text={empty} {...(action && to ? { action, to } : {})} /> : <ul className="ath-stack">{children}</ul>;
}

function SearchBody({ widget, onEmpty }: { widget: Widget; onEmpty?: OnEmpty }) {
  const [res, setRes] = useState<SearchResult | null>(null);
  useEffect(() => { if (res) onEmpty?.(res.total === 0); }, [res, onEmpty]);
  const portfolioProjects = usePortfolioProjects(widget.portfolio);
  const scope = widget.projects?.join(',') ?? (portfolioProjects ? portfolioProjects.join(',') : '');
  useEffect(() => {
    if (widget.portfolio && portfolioProjects === null) return; // portefeuille pas encore résolu
    if (widget.portfolio && !widget.projects?.length && portfolioProjects && portfolioProjects.length === 0) { setRes({ total: 0, hits: [] }); return; } // portefeuille sans projet : rien à chercher
    setRes(null);
    api<SearchResult>('GET', `/v1/search?q=${encodeURIComponent(widget.query ?? '')}&limit=5${scope ? `&project=${scope}` : ''}`).then((r) => setRes({ total: r.total ?? 0, hits: Array.isArray(r.hits) ? r.hits : [] })).catch(() => setRes({ total: 0, hits: [] }));
  }, [widget.query, scope, widget.portfolio, portfolioProjects]);
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

export function Body({ widget, objects, onEmpty, project, portfolio }: { widget: Widget; objects: boolean; project?: string | undefined; portfolio?: string | undefined; onEmpty?: OnEmpty | undefined }) {
  const p = widget.project ?? widget.projects?.[0] ?? project ?? '';
  const q = widget.portfolio ?? portfolio ?? '';
  switch (widget.kind) {
    case 'portfolio-health': return <PortfolioHealthTable portfolio={q} view="table" bare />;
    case 'portfolio-tiles': return <PortfolioHealthTable portfolio={q} view="tiles" bare />;
    case 'portfolio-finance': return <PortfolioFinanceCard portfolio={q} />;
    case 'project-finance': return <ProjectFinanceCard project={p} />;
    case 'capacity': return <CapacityCard project={p} portfolio={q} />;
    case 'roadmap': return <RoadmapCard project={p} portfolio={q} />;
    case 'phase-gate': return <PhaseGateCard project={p} />;
    case 'portfolio-gates': return <PortfolioGatesCard portfolio={q} />;
    case 'portfolio-requests': return <PortfolioRequestsCard portfolio={q} />;
    case 'risk-matrix': return <RiskMatrixCard project={p} portfolio={q} />;
    case 'platform-ops': return <PlatformOpsCard />;
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

/**
 * Tableau de bord modulaire (ADR-0007, T-0171 et T-0172) : grille de 12 colonnes à lignes de 88 px, une colonne sous 720 px dans
 * l'ordre de lecture, classeur à onglets (migration 093). « Organiser » ouvre un brouillon : l'éditeur de grille (`DashboardEditor`), la gestion des
 * onglets et « Partir d'un gabarit » (ADR-0010). Rien n'est enregistré avant « Enregistrer » ; « Annuler » restaure ; « Rétablir » revient au défaut.
 */
export function Dashboard({ project, page, portfolio, qa = false }: { project?: string; page?: 'avancement'; portfolio?: string; qa?: boolean } = {}) {
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [draft, setDraft] = useState<Placed[] | null>(null);
  const [views, setViews] = useState<SavedSearch[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const [tabs, setTabs] = useState<TabInfo[]>([MAIN_TAB]);
  const [tab, setTab] = useState('');
  const [tabForm, setTabForm] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null);
  const [reload, setReload] = useState(0);
  const reportEmpty = useCallback((id: string) => (value: boolean) => setEmpty((st) => (st[id] === value ? st : { ...st, [id]: value })), []);
  const BUILTIN = builtinFor(project, page, portfolio);
  const scopeQuery = portfolio ? `portfolio=${portfolio}` : project ? `project=${project}${page ? `&page=${page}` : ''}` : '';
  const withQuery = (path: string, ...parts: string[]) => { const q = [scopeQuery, ...parts].filter(Boolean).join('&'); return q ? `${path}?${q}` : path; };
  const endpoint = withQuery('/v1/me/dashboard', tab ? `tab=${tab}` : '');
  const tabsEndpoint = withQuery('/v1/me/dashboard/tabs');
  const editing = draft !== null;

  useEffect(() => {
    let live = true;
    const blank = tab ? [] : builtinFor(project, page, portfolio);
    api<Layout>('GET', endpoint).then((r) => { if (live) setLayout(Array.isArray(r?.widgets) ? r : { widgets: blank, isDefault: true }); }).catch((e) => { if (live) { setLayout({ widgets: blank, isDefault: true }); fail(e); } });
    return () => { live = false; };
  }, [fail, endpoint, project, page, portfolio, tab, reload]);
  // Changer de portée ramène à l'onglet principal ; la liste des onglets est celle de la portée.
  useEffect(() => { setTab(''); setTabForm(null); }, [project, page, portfolio]);
  useEffect(() => {
    let live = true;
    api<{ tabs: TabInfo[] }>('GET', tabsEndpoint).then((r) => { if (live) setTabs(Array.isArray(r?.tabs) && r.tabs.length ? r.tabs : [MAIN_TAB]); }).catch(() => { if (live) setTabs([MAIN_TAB]); });
    return () => { live = false; };
  }, [tabsEndpoint, reload]);
  useEffect(() => {
    if (!editing) return;
    api<SavedSearch[]>('GET', '/v1/searches').then((r) => setViews(Array.isArray(r) ? r : [])).catch(() => setViews([]));
    api<{ kinds: CatalogEntry[] }>('GET', '/v1/me/dashboard/catalog').then((r) => setCatalog(Array.isArray(r?.kinds) ? r.kinds : [])).catch(() => setCatalog([]));
  }, [editing]);

  if (layout === null) return <p role="status">{fr.loading}</p>;
  const shown: Placed[] = draft ?? (withBoxes(layout.widgets) as Placed[]);
  const quiet = shown.filter((w) => QUIET.includes(w.kind) && empty[w.id]);
  // Hors édition (Mon travail), les cartes vides masquées ne laissent pas de trou : les autres se replacent à leur suite.
  const compact = !draft && !project && quiet.length > 0;
  const packed = compact ? new Map(withBoxes(flowOrder(shown).filter((w) => !quiet.includes(w)).map(({ x: _x, y: _y, ...rest }) => rest)).map((w) => [w.id, w as Placed])) : null;
  const widgets = flowOrder(shown.map((w) => packed?.get(w.id) ?? w));
  const start = () => setDraft(withBoxes(layout.widgets) as Placed[]);
  const stop = () => { setDraft(null); };
  const save = async () => {
    if (!draft) return;
    try {
      const saved = await api<Layout>('PUT', endpoint, { widgets: draft });
      setLayout(saved);
      stop();
      toast('success', fr.home.saved);
    } catch (error) { fail(error); }
  };
  const tabName = (t: TabInfo) => t.title ?? fr.home.tabMain;
  const currentTab = tabs.find((t) => t.id === tab) ?? MAIN_TAB;
  const submitTab = async () => {
    if (!tabForm) return;
    const title = tabForm.value.trim();
    if (!title) return;
    try {
      if (tabForm.mode === 'create') {
        const made = await api<TabInfo>('POST', tabsEndpoint, { title });
        setTabs((list) => [...list, made]); if (!editing) setTab(made.id); toast('success', fr.home.tabCreated);
      } else {
        await api('PATCH', withQuery(`/v1/me/dashboard/tabs/${tab || 'main'}`), { title });
        setTabs((list) => list.map((t) => (t.id === tab ? { ...t, title } : t))); toast('success', fr.home.tabRenamed);
      }
      setTabForm(null);
    } catch (error) { fail(error); }
  };
  const deleteTab = async () => {
    if (!(await confirm.ask({ title: fr.home.tabDeleteTitle(tabName(currentTab)), body: fr.home.tabDeleteBody, confirm: fr.home.tabDelete }))) return;
    try { await api('DELETE', withQuery(`/v1/me/dashboard/tabs/${tab}`)); setTabs((list) => list.filter((t) => t.id !== tab)); stop(); setTab(''); toast('success', fr.home.tabDeleted); } catch (error) { fail(error); }
  };
  const reset = async () => {
    if (!(await confirm.ask({ title: fr.home.resetTitle, body: fr.home.resetBody, confirm: fr.home.reset }))) return;
    try { await api('DELETE', endpoint); setLayout(await api<Layout>('GET', endpoint)); stop(); toast('success', fr.home.resetDone); } catch (error) { fail(error); }
  };
  /** Un gabarit vient d'être copié dans le tableau de bord (ajout ou remplacement) : on quitte le brouillon et on relit tout. */
  const applied = (firstTab: string | undefined) => { stop(); setTab(firstTab ?? ''); setReload((n) => n + 1); };

  const body = (w: Widget) => <Body widget={w} objects={qa} project={project} portfolio={portfolio} onEmpty={QUIET.includes(w.kind) ? reportEmpty(w.id) : undefined} />;
  const footer = (w: Widget) => (w.kind === 'search' ? <Link className="ath-link" to={searchHref(w)}>{fr.home.seeAll}</Link>
    : w.kind === 'trackers' ? <Link className="ath-link" to={`/p/${w.projects?.[0] ?? ''}/trackers`}>{fr.overview.openTrackers}</Link> : footerOf(w, project));

  const grid = (
    <DashGrid>
      {widgets.map((w) => {
        const title = widgetTitle(w);
        const lacks = missingTarget(w, project, portfolio);
        return (
          <DashCard key={w.id} size={sizeOf(w)} box={{ x: w.x, y: w.y, w: w.w, h: w.h }} title={title} role="group" aria-label={title} hidden={!project && quiet.includes(w)}
            footer={footer(w)}>
            {lacks ? <p>{lacks === 'project' ? fr.home.chooseProject : lacks === 'portfolio' ? fr.home.choosePortfolio : fr.home.chooseTarget}</p> : body(w)}
          </DashCard>
        );
      })}
    </DashGrid>
  );

  return (
    <section aria-label={page ? fr.home.progressLabel : project ? fr.home.projectLabel : fr.home.label} className="ath-stack">
      {!editing && (
        <div className="ath-toolbar ath-dash-tabs">
          <Tabs tabs={tabs.map((t) => ({ id: t.id, label: tabName(t) }))} active={tab} onChange={(id) => { setTab(id); setTabForm(null); }} />
        </div>
      )}
      {editing && (
        <div className="ath-toolbar ath-dash-tabs" role="group" aria-label={fr.home.tabsLabel}>
          <strong>{tabName(currentTab)}</strong>
          <Btn variant="ghost" size="sm" onClick={() => setTabForm({ mode: 'create', value: '' })}>{fr.home.tabNew}</Btn>
          <Btn variant="ghost" size="sm" onClick={() => setTabForm({ mode: 'rename', value: currentTab.title ?? '' })}>{fr.home.tabRenameDo}</Btn>
          {tab !== '' && <Btn variant="ghost" size="sm" onClick={() => void deleteTab()}>{fr.home.tabDelete}</Btn>}
        </div>
      )}
      {tabForm && (
        <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); void submitTab(); }}>
          <label className="ath-field">{fr.home.tabName}<input className="ath-input" autoFocus value={tabForm.value} maxLength={60} onChange={(e) => setTabForm({ ...tabForm, value: e.target.value })} /></label>
          <Btn size="sm" type="submit" disabled={!tabForm.value.trim()}>{tabForm.mode === 'create' ? fr.home.tabCreate : fr.home.tabRename}</Btn>
          <Btn variant="ghost" size="sm" type="button" onClick={() => setTabForm(null)}>{fr.home.cancel}</Btn>
        </form>
      )}
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
      {editing && <TemplatePicker scopeQuery={scopeQuery} onApplied={applied} />}
      {widgets.length === 0 && !editing && <p>{tab ? fr.home.tabBlank : fr.home.noWidget}</p>}
      {/* Mon travail : les cartes vides se résument en une ligne, la liste utile remonte (T-0153, revue O3). */}
      {!editing && !project && quiet.length > 0 && <p className="ath-card ath-dash-quiet"><strong>{fr.home.quietLead}</strong> {fr.home.quiet(quiet.map((w) => widgetTitle(w)))}</p>}
      {editing
        ? <DashboardEditor widgets={shown} onChange={setDraft} project={project} portfolio={portfolio} catalog={catalog} views={views} builtin={BUILTIN} renderBody={body} renderFooter={footer} />
        : grid}
      {confirm.dialog}
    </section>
  );
}
