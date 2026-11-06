import { ProtectionBanner } from './components/ProtectionBanner';
import { setProtectionLevel } from './lib/protection';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Sidebar, ToastProvider } from '@athena/ui';
import { loadSession, loginUrl, logout, type Session } from './api';
import { Breadcrumb } from './components/Breadcrumb';
import { CommandPalette } from './components/CommandPalette';
import { useRailSections, useRecordVisits } from './components/Rail';
import { PinsProvider } from './lib/pins';
import { fr, getLocale, setLocale, useLocale } from './i18n';
import { AdminPage } from './pages/AdminPage';
import { ArtifactPage } from './pages/ArtifactPage';
import { BoardPage } from './pages/BoardPage';
import { ListPage } from './pages/ListPage';
import { MyWorkPage } from './pages/MyWorkPage';
import { HelpPage } from './pages/HelpPage';
import { OrgAdminPage } from './pages/OrgAdminPage';
import { ProjectManagePage } from './pages/ProjectManagePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { OverviewOrLegacySearch, ProjectShell } from './pages/project/ProjectShell';
import { OverviewTab } from './pages/project/OverviewTab';
import { TrackersTab } from './pages/project/TrackersTab';
import { ConformityTab } from './pages/project/ConformityTab';
import { TraceabilityTab } from './pages/project/TraceabilityTab';
import { ActivityTab } from './pages/project/ActivityTab';
import { CodeTab } from './pages/project/CodeTab';
import { TrackerScreen } from './pages/tracker/TrackerScreen';
import { MembersTab } from './pages/project/MembersTab';
import { TrackerConfigPage } from './pages/TrackerConfigPage';
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

function Shell({ session, children }: { session: Session; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const project = projectOf(location.pathname);
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  const manager = admin || (session.user?.roles.includes('athena-pm') ?? false);
  const { sections, current } = useRailSections({ pathname: location.pathname, project, admin });
  useRecordVisits(location.pathname);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('athena.rail.collapsed') === '1'; } catch { return false; } });
  const toggleRail = () => { const next = !collapsed; setCollapsed(next); try { localStorage.setItem('athena.rail.collapsed', next ? '1' : '0'); } catch { /* préférence facultative */ } };
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
    <div className="ath-page">
      <a className="ath-skip" href="#contenu" onClick={(e) => { e.preventDefault(); document.getElementById('contenu')?.focus(); }}>{fr.nav.skip}</a>
      <Btn variant="ghost" size="sm" className="ath-menu-btn" aria-expanded={menuOpen} aria-controls="rail" onClick={() => setMenuOpen(!menuOpen)}>{fr.nav.menu}</Btn>
      {menuOpen && <div className="ath-drawer-backdrop" data-testid="drawer-backdrop" onClick={closeMenu} />}
      <Sidebar id="rail" open={menuOpen} collapsed={collapsed} sections={sections} current={current} onNavigate={(id) => { setMenuOpen(false); navigate(id); }} user={{ name: session.user!.name, role: admin ? 'Admin' : manager ? 'Chef de projet' : 'Utilisateur' }}
        userActions={<>
          <button type="button" className="ath-iconbtn ath-collapse-btn" onClick={toggleRail} aria-expanded={!collapsed} aria-label={collapsed ? fr.rail.expand : fr.rail.collapse} title={collapsed ? fr.rail.expand : fr.rail.collapse}>{collapsed ? '»' : '«'}</button>
          <button type="button" className="ath-iconbtn" onClick={() => setLocale(other)} aria-label={fr.language} title={fr.language}><Flag locale={other} /></button>
          <button type="button" className="ath-iconbtn" onClick={out} aria-label={fr.nav.logout} title={fr.nav.logout}><LogoutIcon /></button>
        </>} />
      <main id="contenu" ref={mainRef} tabIndex={-1} className="ath-page__main">
        <Breadcrumb pathname={location.pathname} search={location.search} />
        {children}
        <CommandPalette project={project} />
      </main>
    </div>
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

/** `/p/:projet/t/:tracker` sans vue : la vue Tableau. */
function RedirectToView() {
  const { project, tracker } = useParams();
  return <Navigate replace to={`/p/${project}/t/${tracker}/tableau`} />;
}

export function AuthenticatedApp({ session }: { session: Session }) {
  return (
    <PinsProvider>
    <Shell session={session}>
      <Routes>
        <Route path="/" element={<ProjectsPage session={session} />} />
        <Route path="/me" element={<MyWorkPage session={session} />} />
        <Route path="/org" element={<OrgAdminPage session={session} />} />
        <Route path="/p/:project" element={<ProjectShell />}>
          <Route index element={<OverviewOrLegacySearch><OverviewTab session={session} /></OverviewOrLegacySearch>} />
          <Route path="trackers" element={<TrackersTab />} />
          <Route path="planification" element={<ProjectManagePage session={session} />} />
          <Route path="tracabilite" element={<TraceabilityTab session={session} />} />
          <Route path="conformite" element={<ConformityTab session={session} />} />
          <Route path="code" element={<CodeTab />} />
          <Route path="activite" element={<ActivityTab />} />
          <Route path="membres" element={<MembersTab session={session} />} />
        </Route>
        <Route path="/p/:project/t/:tracker" element={<RedirectToView />} />
        <Route path="/p/:project/t/:tracker/:vue" element={<TrackerScreen session={session} />} />
        <Route path="/p/:project/recherche" element={<ListPage session={session} />} />
        <Route path="/p/:project/manage" element={<RedirectTo to="planification" />} />
        <Route path="/p/:project/dashboard" element={<RedirectTo to="" />} />
        <Route path="/p/:project/admin" element={<AdminPage session={session} />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/p/:project/a/:key" element={<ArtifactPage session={session} />} />
        <Route path="/p/:project/board/:board" element={<BoardPage />} />
        <Route path="/p/:project/trackers/new" element={<TrackerCreatePage session={session} />} />
        <Route path="/p/:project/trackers/:tracker/config" element={<TrackerConfigPage session={session} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
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
