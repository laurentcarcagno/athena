import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader, Sidebar, ToastProvider } from '@athena/ui';
import { loadSession, loginUrl, logout, type Session } from './api';
import { CommandPalette } from './components/CommandPalette';
import { fr, getLocale, setLocale, useLocale } from './i18n';
import { AdminPage } from './pages/AdminPage';
import { ArtifactPage } from './pages/ArtifactPage';
import { BoardPage } from './pages/BoardPage';
import { DashboardPage } from './pages/DashboardPage';
import { ListPage } from './pages/ListPage';
import { MyWorkPage } from './pages/MyWorkPage';
import { OrgAdminPage } from './pages/OrgAdminPage';
import { ProjectManagePage } from './pages/ProjectManagePage';
import { ProjectsPage } from './pages/ProjectsPage';
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
  const items = [
    { id: '/', label: fr.nav.projects },
    { id: '/me', label: fr.nav.work },
    ...(admin ? [{ id: '/org', label: fr.nav.organization }] : []),
    ...(project ? [
      { id: `/p/${project}`, label: fr.nav.search },
      { id: `/p/${project}/dashboard`, label: fr.nav.dashboard },
      ...(manager ? [{ id: `/p/${project}/manage`, label: fr.nav.manage }] : []),
      ...(admin ? [{ id: `/p/${project}/admin`, label: fr.nav.admin }] : []),
    ] : []),
  ];
  // La page courante est l'entrée la plus spécifique dont l'adresse est un préfixe.
  const current = [...items].sort((a, b) => b.id.length - a.id.length).find((i) => i.id !== '/' && location.pathname.startsWith(i.id))?.id ?? '/';
  const out = async () => { window.location.assign(await logout()); };
  const other = getLocale() === 'fr' ? 'en' : 'fr';
  return (
    <div className="ath-page">
      <Sidebar items={items} current={current} onNavigate={(id) => navigate(id)} user={{ name: session.user!.name, role: admin ? 'Admin' : manager ? 'Chef de projet' : 'Utilisateur' }}
        userActions={<>
          <button type="button" className="ath-iconbtn" onClick={() => setLocale(other)} aria-label={fr.language} title={fr.language}><Flag locale={other} /></button>
          <button type="button" className="ath-iconbtn" onClick={out} aria-label={fr.nav.logout} title={fr.nav.logout}><LogoutIcon /></button>
        </>} />
      <main className="ath-page__main">
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

export function AuthenticatedApp({ session }: { session: Session }) {
  return (
    <Shell session={session}>
      <Routes>
        <Route path="/" element={<ProjectsPage session={session} />} />
        <Route path="/me" element={<MyWorkPage session={session} />} />
        <Route path="/org" element={<OrgAdminPage session={session} />} />
        <Route path="/p/:project" element={<ListPage session={session} />} />
        <Route path="/p/:project/manage" element={<ProjectManagePage session={session} />} />
        <Route path="/p/:project/dashboard" element={<DashboardPage />} />
        <Route path="/p/:project/admin" element={<AdminPage />} />
        <Route path="/p/:project/a/:key" element={<ArtifactPage session={session} />} />
        <Route path="/p/:project/board/:board" element={<BoardPage />} />
        <Route path="/p/:project/trackers/new" element={<TrackerCreatePage session={session} />} />
        <Route path="/p/:project/trackers/:tracker/config" element={<TrackerConfigPage session={session} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
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
