import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Sidebar, ToastProvider } from '@athena/ui';
import { loadSession, loginUrl, logout, type Session } from './api';
import { ArtifactPage } from './pages/ArtifactPage';
import { BoardPage } from './pages/BoardPage';
import { ListPage } from './pages/ListPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { fr } from './i18n';

function Shell({ session, children }: { session: Session; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { project } = useParams();
  const inProject = location.pathname.startsWith('/p/') ? location.pathname.split('/')[2] : project;
  const items = [{ id: '/', label: fr.nav.projects }, ...(inProject ? [{ id: `/p/${inProject}`, label: fr.nav.search }] : [])];
  const current = items.find((i) => i.id !== '/' && location.pathname.startsWith(i.id))?.id ?? '/';
  const out = async () => { window.location.assign(await logout()); };
  return (
    <div className="ath-page">
      <Sidebar items={items} current={current} onNavigate={(id) => navigate(id)} user={{ name: session.user!.name, role: session.user!.roles.includes('athena-admin') ? 'Admin' : 'Utilisateur' }} />
      <main className="ath-page__main">
        <div className="ath-row">
          <Btn variant="ghost" size="sm" onClick={out}>{fr.nav.logout}</Btn>
        </div>
        {children}
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
        <Route path="/p/:project" element={<ListPage />} />
        <Route path="/p/:project/a/:key" element={<ArtifactPage session={session} />} />
        <Route path="/p/:project/board/:board" element={<BoardPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    loadSession().then((s) => {
      if (!s.authenticated) window.location.assign(loginUrl(window.location.pathname + window.location.search));
      else setSession(s);
    }).catch(() => setSession({ authenticated: false }));
  }, []);
  if (!session) return <div className="ath-root ath-page__main" role="status">{fr.loading}</div>;
  if (!session.authenticated) return <div className="ath-root ath-page__main"><EmptyState eyebrow={fr.errors.unavailableEyebrow} title={fr.errors.unavailable} /></div>;
  return (
    <div className="ath-root">
      <ToastProvider>
        <BrowserRouter>
          <AuthenticatedApp session={session} />
        </BrowserRouter>
      </ToastProvider>
    </div>
  );
}

