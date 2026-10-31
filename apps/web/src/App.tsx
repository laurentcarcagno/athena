import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Sidebar, ToastProvider } from '@athena/ui';
import { loadSession, loginUrl, logout, type Session } from './api';
import { CommandPalette } from './components/CommandPalette';
import { fr, getLocale, setLocale, useLocale } from './i18n';
import { AdminPage } from './pages/AdminPage';
import { ArtifactPage } from './pages/ArtifactPage';
import { BoardPage } from './pages/BoardPage';
import { DashboardPage } from './pages/DashboardPage';
import { ListPage } from './pages/ListPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TrackerConfigPage } from './pages/TrackerConfigPage';

/** Projet courant déduit de l'adresse (`/p/<clé>/…`). */
export const projectOf = (pathname: string): string | undefined => (pathname.startsWith('/p/') ? pathname.split('/')[2] : undefined);

function Shell({ session, children }: { session: Session; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const project = projectOf(location.pathname);
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  const items = [
    { id: '/', label: fr.nav.projects },
    ...(project ? [
      { id: `/p/${project}`, label: fr.nav.search },
      { id: `/p/${project}/dashboard`, label: fr.nav.dashboard },
      ...(admin ? [{ id: `/p/${project}/admin`, label: fr.nav.admin }] : []),
    ] : []),
  ];
  // La page courante est l'entrée la plus spécifique dont l'adresse est un préfixe.
  const current = [...items].sort((a, b) => b.id.length - a.id.length).find((i) => i.id !== '/' && location.pathname.startsWith(i.id))?.id ?? '/';
  const out = async () => { window.location.assign(await logout()); };
  const other = getLocale() === 'fr' ? 'en' : 'fr';
  return (
    <div className="ath-page">
      <Sidebar items={items} current={current} onNavigate={(id) => navigate(id)} user={{ name: session.user!.name, role: admin ? 'Admin' : 'Utilisateur' }} />
      <main className="ath-page__main">
        <div className="ath-row">
          <Btn variant="ghost" size="sm" onClick={() => setLocale(other)} aria-label={`${fr.language}`}>{fr.language}</Btn>
          <Btn variant="ghost" size="sm" onClick={out}>{fr.nav.logout}</Btn>
          <span className="ath-eyebrow">{fr.nav.palette} · <span className="ath-mono">Ctrl+K</span></span>
        </div>
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
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/p/:project" element={<ListPage session={session} />} />
        <Route path="/p/:project/dashboard" element={<DashboardPage />} />
        <Route path="/p/:project/admin" element={<AdminPage />} />
        <Route path="/p/:project/a/:key" element={<ArtifactPage session={session} />} />
        <Route path="/p/:project/board/:board" element={<BoardPage />} />
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
