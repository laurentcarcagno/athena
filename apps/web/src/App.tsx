import { ProtectionBanner } from './components/ProtectionBanner';
import { setProtectionLevel } from './lib/protection';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Sidebar, ToastProvider } from '@athena/ui';
import { loadSession, loginUrl, logout, type Session } from './api';
import { Breadcrumb } from './components/Breadcrumb';
import { CommandPalette } from './components/CommandPalette';
import { CreateButton, CreateProvider } from './components/CreateArtifact';
import { BottomBar, ProjectNavContext } from './components/MobileNav';
import { NotificationCenter } from './components/NotificationCenter';
import { ThemeToggle } from './components/ThemeToggle';
import { useRailSections, useRecordVisits } from './components/Rail';
import { PinsProvider } from './lib/pins';
import { PreferencesProvider, savePreference } from './lib/preferences';
import { loadBrand, logoUrl, markUrl, useBrand, useFavicon } from './lib/brand';
import { useThemeFamily } from './lib/theme';
import { fr, getLocale, setLocale, useLocale } from './i18n';
import { ArtifactPage } from './pages/ArtifactPage';
import { BoardIndexPage, BoardPage } from './pages/BoardPage';
import { BacklogPage } from './pages/BacklogPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { GlobalSearchPage } from './pages/GlobalSearchPage';
import { ListPage } from './pages/ListPage';
import { HelpPage } from './pages/HelpPage';
import { OrgAdminPage } from './pages/OrgAdminPage';
import { HomeRoute } from './pages/HomeRoute';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { OverviewOrLegacySearch, ProjectLayout, ProjectSectionFrame } from './pages/project/ProjectShell';
import { OverviewTab } from './pages/project/OverviewTab';
import { TrackersTab } from './pages/project/TrackersTab';
import { DocumentsTab } from './pages/project/DocumentsTab';
import { TrackerScreen } from './pages/tracker/TrackerScreen';
import { TrackerCreatePage } from './pages/TrackerCreatePage';

/** Projet courant déduit de l'adresse (`/p/<clé>/…`). */
export const projectOf = (pathname: string): string | undefined => (pathname.startsWith('/p/') ? pathname.split('/')[2] : undefined);

/** Couleurs des drapeaux nationaux : hors palette Hemeria par nature. */
const FLAG = {
  frBlue: '#0055A4', // design-lint-ignore : drapeau
  frRed: '#EF4135', // design-lint-ignore : drapeau
  ukBlue: '#012169', // design-lint-ignore : drapeau
  ukRed: '#C8102E', // design-lint-ignore : drapeau
};

/** Drapeaux en SVG (les émojis de drapeaux ne s'affichent pas sous Windows). */
function Flag({ locale }: { locale: 'fr' | 'en' }) {
  return locale === 'fr' ? (
    <svg width="20" height="14" viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill={FLAG.frBlue} /><rect x="1" width="1" height="2" fill="#FFFFFF" /><rect x="2" width="1" height="2" fill={FLAG.frRed} /></svg>
  ) : (
    <svg width="20" height="14" viewBox="0 0 60 30" aria-hidden="true"><rect width="60" height="30" fill={FLAG.ukBlue} /><path d="M0 0L60 30M60 0L0 30" stroke="#FFFFFF" strokeWidth="6" /><path d="M0 0L60 30M60 0L0 30" stroke={FLAG.ukRed} strokeWidth="2.5" /><path d="M30 0V30M0 15H60" stroke="#FFFFFF" strokeWidth="10" /><path d="M30 0V30M0 15H60" stroke={FLAG.ukRed} strokeWidth="6" /></svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><path d="M9 3H4v18h5" /><path d="M16 7l5 5-5 5" /><path d="M21 12H9" /></svg>
  );
}

function ProfileIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-3h16v3" /></svg>;
}

function HelpIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" /><path d="M12 17v.5" /></svg>;
}

function Shell({ session, children }: { session: Session; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const project = projectOf(location.pathname);
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  const manager = admin || (session.user?.roles.includes('athena-pm') ?? false);
  const { sections, current, projectNav } = useRailSections({ pathname: location.pathname, project, roles: session.user?.roles ?? [] });
  useRecordVisits(location.pathname);
  // Rail replié en icônes : choix de l'utilisateur s'il existe, sinon replié sur tablette (769 à 1024 px, T-0136).
  const tablet = useMemo(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 769px) and (max-width: 1024px)') : null), []);
  const [narrow, setNarrow] = useState(() => tablet?.matches ?? false);
  const [choice, setChoice] = useState<boolean | null>(() => { try { const v = localStorage.getItem('athena.rail.collapsed'); return v === null ? null : v === '1'; } catch { return null; } });
  useEffect(() => {
    if (!tablet) return undefined;
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    tablet.addEventListener?.('change', onChange);
    return () => tablet.removeEventListener?.('change', onChange);
  }, [tablet]);
  const collapsed = choice ?? narrow;
  const toggleRail = () => { const next = !collapsed; setChoice(next); try { localStorage.setItem('athena.rail.collapsed', next ? '1' : '0'); } catch { /* préférence facultative */ } };
  // Marque (T-0137) : icône du thème actif ou de l'organisation, dans le rail et en favicon.
  const family = useThemeFamily();
  useBrand();
  useEffect(() => { void loadBrand(); }, []);
  useFavicon(family);
  const mark = markUrl(family);
  const logo = logoUrl(family);
  // Logo horizontal (rail déplié) s'il existe, sinon icône et nom ; rail replié : l'icône seule.
  const brand = <>{mark && <img className="ath-sidebar__mark" src={mark} alt="" />}{logo ? <img className="ath-sidebar__logo" src={logo} alt="ATHENA" /> : <span className="ath-sidebar__name">ATHENA</span>}</>;
  const out = async () => { window.location.assign(await logout()); };
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const closeMenu = () => { setMenuOpen(false); document.querySelector<HTMLElement>('.ath-menu-btn')?.focus(); };
  // Tiroir (sous 768 px) : le focus y entre, Tab y reste, Échap le ferme et rend le focus au bouton ; la page derrière est inerte.
  useEffect(() => {
    const main = mainRef.current;
    if (!menuOpen) { main?.removeAttribute('inert'); return undefined; }
    main?.setAttribute('inert', '');
    const rail = document.getElementById('rail');
    const focusable = () => [...(rail?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? [])];
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); main?.removeAttribute('inert'); };
  }, [menuOpen]);
  const other = getLocale() === 'fr' ? 'en' : 'fr';
  return (
    <CreateProvider>
    <div className="ath-page">
      <a className="ath-skip" href="#contenu" onClick={(e) => { e.preventDefault(); document.getElementById('contenu')?.focus(); }}>{fr.nav.skip}</a>
      {menuOpen && <div className="ath-drawer-backdrop" data-testid="drawer-backdrop" onClick={closeMenu} />}
      <Sidebar id="rail" open={menuOpen} collapsed={collapsed} brand={brand} sections={sections} current={current} onNavigate={(id) => { setMenuOpen(false); navigate(id); }} user={{ name: session.user!.name, role: admin ? 'Administrateur' : manager ? 'Chef de projet' : 'Utilisateur', roleKind: admin ? 'admin' : manager ? 'manager' : 'user' }}
        userActions={<>
          <button type="button" className="ath-iconbtn ath-iconbtn--inverse ath-collapse-btn" onClick={toggleRail} aria-expanded={!collapsed} aria-label={collapsed ? fr.rail.expand : fr.rail.collapse} title={collapsed ? fr.rail.expand : fr.rail.collapse}>{collapsed ? '»' : '«'}</button>
          <ThemeToggle />
          <button type="button" className="ath-iconbtn ath-iconbtn--inverse" onClick={() => { setLocale(other); savePreference({ locale: other }); }} aria-label={fr.language} title={fr.language}><Flag locale={other} /></button>
          <Link className="ath-iconbtn ath-iconbtn--inverse" to="/profil" aria-label={fr.profile.title} title={fr.profile.title}><ProfileIcon /></Link>
          <Link className="ath-iconbtn ath-iconbtn--inverse" to="/help" aria-label={fr.nav.help} title={fr.nav.help}><HelpIcon /></Link>
          <button type="button" className="ath-iconbtn ath-iconbtn--inverse" onClick={out} aria-label={fr.nav.logout} title={fr.nav.logout}><LogoutIcon /></button>
        </>} />
      <main id="contenu" ref={mainRef} tabIndex={-1} className="ath-page__main">
        <div className="ath-topbar">
          <Breadcrumb pathname={location.pathname} search={location.search} />
          <div className="ath-topbar__actions"><CreateButton /><NotificationCenter /></div>
        </div>
        <ProjectNavContext.Provider value={projectNav}>{children}</ProjectNavContext.Provider>
        <CommandPalette project={project} />
      </main>
      <BottomBar menuOpen={menuOpen} onMenu={() => setMenuOpen(!menuOpen)} />
    </div>
    </CreateProvider>
  );
}

function NotFound() {
  return (
    <>
      <PageHeader title={fr.errors.notFoundTitle} />
      <EmptyState eyebrow={fr.errors.notFoundEyebrow} title={fr.errors.notFound} />
    </>
  );
}

/** Ancienne adresse d'un projet : redirige vers sa nouvelle place (relative à `/p/:projet`). */
function RedirectTo({ to }: { to: string }) {
  const { project } = useParams();
  return <Navigate replace to={to === '' ? `/p/${project}` : `/p/${project}/${to}`} />;
}

/** Ancienne configuration de tracker (T-0120) : Paramètres › Trackers › le tracker. */
function RedirectToTrackerSettings() {
  const { project, tracker } = useParams();
  return <Navigate replace to={`/p/${project}/parametres/trackers/${tracker}`} />;
}

/** `/p/:projet/t/:tracker` sans vue : la vue Tableau. */
function RedirectToView() {
  const { project, tracker } = useParams();
  return <Navigate replace to={`/p/${project}/t/${tracker}/tableau`} />;
}

export function AuthenticatedApp({ session }: { session: Session }) {
  return (
    <PinsProvider>
    <PreferencesProvider>
    <Shell session={session}>
      <Routes>
        <Route path="/" element={<HomeRoute session={session} />} />
        <Route path="/projets" element={<ProjectsPage session={session} />} />
        <Route path="/profil" element={<ProfilePage session={session} />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/admin" element={<OrgAdminPage session={session} />} />
        <Route path="/me" element={<Navigate replace to="/" />} />
        <Route path="/org" element={<Navigate replace to="/admin" />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/recherche" element={<GlobalSearchPage session={session} />} />
        {/* Toutes les adresses d'un projet ont le même parent : la navigation du projet reste au rail (ADR-0003). */}
        <Route path="/p/:project" element={<ProjectLayout />}>
          <Route element={<ProjectSectionFrame />}>
            <Route index element={<OverviewOrLegacySearch><OverviewTab session={session} /></OverviewOrLegacySearch>} />
            <Route path="trackers" element={<TrackersTab />} />
            <Route path="documents" element={<DocumentsTab />} />
            <Route path="documents/:doc" element={<DocumentsTab />} />
          </Route>
          <Route path="t/:tracker" element={<RedirectToView />} />
          <Route path="t/:tracker/:vue" element={<TrackerScreen session={session} />} />
          <Route path="recherche" element={<ListPage session={session} />} />
          {/* T-0120 : anciennes adresses de réglage, redirigées pour toujours vers Paramètres. */}
          <Route path="rapports" element={<ReportsPage session={session} />} />
          <Route path="rapports/:report" element={<ReportsPage session={session} />} />
          <Route path="tracabilite" element={<RedirectTo to="rapports/tracabilite" />} />
          <Route path="conformite" element={<RedirectTo to="rapports/conformite" />} />
          <Route path="code" element={<RedirectTo to="rapports/livraison" />} />
          <Route path="activite" element={<RedirectTo to="rapports/activite" />} />
          <Route path="manage" element={<RedirectTo to="parametres" />} />
          <Route path="planification" element={<RedirectTo to="parametres" />} />
          <Route path="membres" element={<RedirectTo to="parametres/membres" />} />
          <Route path="admin" element={<RedirectTo to="parametres/automatisations" />} />
          <Route path="trackers/:tracker/config" element={<RedirectToTrackerSettings />} />
          <Route path="parametres" element={<SettingsPage session={session} />} />
          <Route path="parametres/:section" element={<SettingsPage session={session} />} />
          <Route path="parametres/:section/:tracker" element={<SettingsPage session={session} />} />
          <Route path="dashboard" element={<RedirectTo to="" />} />
          <Route path="a/:key" element={<ArtifactPage session={session} />} />
          <Route path="backlog" element={<BacklogPage session={session} />} />
          <Route path="roadmap" element={<RoadmapPage session={session} />} />
          <Route path="board" element={<BoardIndexPage />} />
          <Route path="board/:board" element={<BoardPage session={session} />} />
          <Route path="trackers/new" element={<TrackerCreatePage session={session} />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
    </PreferencesProvider>
    </PinsProvider>
  );
}

export function App() {
  const locale = useLocale(); // redessine l'arbre entier au changement de langue
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    document.documentElement.lang = getLocale();
    loadSession().then((s) => {
      if (!s.authenticated) window.location.assign(loginUrl(window.location.pathname + window.location.search));
      else setSession(s);
      setProtectionLevel(s.protectionLevel);
    }).catch(() => setSession({ authenticated: false }));
  }, []);
  if (!session) return <div className="ath-root ath-page__main" role="status">{fr.loading}</div>;
  setProtectionLevel(session.protectionLevel);
  if (!session.authenticated) return <div className="ath-root"><ProtectionBanner level={session.protectionLevel} /><div className="ath-page__main"><EmptyState eyebrow={fr.errors.unavailableEyebrow} title={fr.errors.unavailable} /></div></div>;
  return (
    <div className={session.protectionLevel ? 'ath-root ath-root--protected' : 'ath-root'} key={locale}>
      <ProtectionBanner level={session.protectionLevel} />
      <ToastProvider>
        <BrowserRouter>
          <AuthenticatedApp session={session} />
        </BrowserRouter>
      </ToastProvider>
    </div>
  );
}
