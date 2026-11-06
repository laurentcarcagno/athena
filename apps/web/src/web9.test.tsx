import { render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { PROJECT_TABS, visibleTabs, type ProjectTabId } from './pages/project/ProjectShell';

const calls: string[] = [];
let modules: string[] | 'error' = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'];

beforeEach(() => {
  calls.length = 0;
  modules = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(input);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/modules$/.test(input)) return modules === 'error' ? new Response('{}', { status: 500 }) : ok({ modules });
    if (/\/dashboard$/.test(input)) return ok({ byCategory: { todo: 3, in_progress: 2, done: 7 }, byTracker: [{ tracker: 'BUG', total: 12, open: 5 }], distribution: null, recent: [] });
    if (/\/velocity$/.test(input)) return ok({ sprints: [], average: 0, forecast: 0 });
    if (/\/flow/.test(input) || /\/roadmap$/.test(input)) return ok([]);
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/v1\/projects\/ARI\/(trackers|filters|boards)$/.test(input) || /\/v1\/projects$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const app = (path: string, roles = ['athena-user']) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const tabNames = () => within(screen.getByRole('navigation', { name: 'Projet ARI' })).getAllByRole('link').map((l) => l.textContent);

describe('onglets d’un projet', () => {
  const all = PROJECT_TABS.map((t) => t.id) as ProjectTabId[];
  it('suivent l’ordre fixe de la spécification', () => {
    expect(visibleTabs(null, all).map((t) => t.id)).toEqual(['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members']);
  });
  it('masquent un module inactif sans décaler les autres, et ignorent ce qui n’a pas de page', () => {
    expect(visibleTabs(['overview', 'trackers', 'planning', 'activity', 'members'], all).map((t) => t.id)).toEqual(['overview', 'trackers', 'planning', 'activity', 'members']);
    expect(visibleTabs(['members', 'overview', 'code'], all).map((t) => t.id)).toEqual(['overview', 'code', 'members']); // l'ordre renvoyé par le serveur n'a pas d'effet
    expect(visibleTabs(all, ['overview', 'planning']).map((t) => t.id)).toEqual(['overview', 'planning']);
    expect(visibleTabs(null, ['overview']).map((t) => t.id)).toEqual(['overview']); // liste inconnue : toutes les pages existantes
  });
});

describe('coquille de projet', () => {
  it('affiche la barre d’onglets avec l’onglet courant signalé', async () => {
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Tableau de bord · ARI' });
    expect(tabNames()).toEqual(['Vue d’ensemble', 'Planification']);
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Planification' })).not.toHaveAttribute('aria-current');
  });

  it('masque l’onglet dont le module est inactif, sans décaler les autres', async () => {
    modules = ['overview', 'trackers', 'activity', 'members']; // planification inactive
    app('/p/ARI');
    await waitFor(() => expect(tabNames()).toEqual(['Vue d’ensemble']));
  });

  it('garde les onglets existants quand la liste des modules est indisponible', async () => {
    modules = 'error';
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Tableau de bord · ARI' });
    expect(tabNames()).toEqual(['Vue d’ensemble', 'Planification']);
  });

  it('se parcourt au clavier : chaque onglet est un lien, atteint par Tab', async () => {
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Tableau de bord · ARI' });
    const link = screen.getByRole('link', { name: 'Planification' });
    link.focus();
    expect(link).toHaveFocus();
    expect(link.tagName).toBe('A');
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Tableau de bord · ARI' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('anciennes adresses', () => {
  it('redirige la liste ATQL de /p/:projet vers la vue Recherche, requête conservée', async () => {
    app('/p/ARI?q=status%3Dopen');
    await screen.findByRole('heading', { level: 1, name: 'ARI' }); // titre de la page Recherche
    await waitFor(() => expect(calls.some((c) => c.includes('/search?q=status%3Dopen'))).toBe(true));
    expect(screen.queryByRole('navigation', { name: 'Projet ARI' })).not.toBeInTheDocument(); // la Recherche est une vue, hors barre d’onglets
  });
  it('accède à la Recherche à sa nouvelle adresse', async () => {
    app('/p/ARI/recherche');
    await screen.findByRole('heading', { level: 1, name: 'ARI' });
    await waitFor(() => expect(calls.some((c) => c.includes('/v1/projects/ARI/search?'))).toBe(true));
  });
  it('redirige /manage vers Planification et /dashboard vers la Vue d’ensemble', async () => {
    const first = app('/p/ARI/manage');
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestion du projet · ARI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planification' })).toHaveAttribute('aria-current', 'page');
    first.unmount();
    app('/p/ARI/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord · ARI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
  });
});
