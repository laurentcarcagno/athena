import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Sidebar, ToastProvider } from '@athena/ui';
import { loadSession, loginUrl, logout, type Session } from './api';
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
  const other = getLocale() === 'fr' ? 'en' : 'fr';
  return (
    <div className="ath-page">
      <a className="ath-skip" href="#contenu" onClick={(e) => { e.preventDefault(); document.getElementById('contenu')?.focus(); }}>{fr.nav.skip}</a>
      <Btn variant="ghost" size="sm" className="ath-menu-btn" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{fr.nav.menu}</Btn>
      <Sidebar open={menuOpen} collapsed={collapsed} sections={sections} current={current} onNavigate={(id) => { setMenuOpen(false); navigate(id); }} user={{ name: session.user!.name, role: admin ? 'Admin' : manager ? 'Chef de projet' : 'Utilisateur' }}
        userActions={<>
          <button type="button" className="ath-iconbtn" onClick={toggleRail} aria-expanded={!collapsed} aria-label={collapsed ? fr.rail.expand : fr.rail.collapse} title={collapsed ? fr.rail.expand : fr.rail.collapse}>{collapsed ? '»' : '«'}</button>
          <button type="button" className="ath-iconbtn" onClick={() => setLocale(other)} aria-label={fr.language} title={fr.language}><Flag locale={other} /></button>
          <button type="button" className="ath-iconbtn" onClick={out} aria-label={fr.nav.logout} title={fr.nav.logout}><LogoutIcon /></button>
        </>} />
      <main id="contenu" tabIndex={-1} className="ath-page__main">
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
          <Route path="code" element={<CodeTab />} />
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
    }).catch(() => setSession({ authenticated: false }));
  }, []);
  if (!session) return <div className="ath-root ath-page__main" role="status">{fr.loading}</div>;
  if (!session.authenticated) return <div className="ath-root ath-page__main"><EmptyState eyebrow={fr.errors.unavailableEyebrow} title={fr.errors.unavailable} /></div>;
  return (
    <div className="ath-root" key={locale}>
      <ToastProvider>
        <BrowserRouter>
          <AuthenticatedApp session={session} />
        </BrowserRouter>
      </ToastProvider>
    </div>
  );
}
