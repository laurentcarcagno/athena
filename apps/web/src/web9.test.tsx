import { render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { PROJECT_TABS, visibleTabs, type ProjectTabId } from './pages/project/ProjectShell';

const OVERVIEW = [
  { key: 'REQ', name: 'Exigences', typeKey: 'requirement', category: 'engineering', artifacts: 10, mine: 0, lastActivity: '2026-11-05T10:00:00.000Z', statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo', count: 2 }, { key: 'approved', name: 'Approuvée', category: 'in_progress', count: 3 }, { key: 'verified', name: 'Vérifiée', category: 'done', count: 5 }] },
  { key: 'BUG', name: 'Anomalies', typeKey: 'bug', category: 'development', artifacts: 4, mine: 2, lastActivity: null, statuses: [{ key: 'open', name: 'Ouvert', category: 'todo', count: 4 }] },
  { key: 'NOTE', name: 'Notes', typeKey: null, category: 'other', artifacts: 0, mine: 0, lastActivity: null, statuses: [{ key: 'new', name: 'Nouveau', category: 'todo', count: 0 }] },
];
const calls: string[] = [];
let repos: Array<{ path: string; defaultBranch: string }> = [];
let modules: string[] | 'error' = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'];

beforeEach(() => {
  calls.length = 0;
  repos = [];
  modules = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(input);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/modules$/.test(input)) return modules === 'error' ? new Response('{}', { status: 500 }) : ok({ modules });
    if (/\/code-repos$/.test(input)) return ok(repos);
    if (/\/dora\?/.test(input)) return ok({ windowDays: 30, deployments: 6, deploymentFrequency: 0.2, leadTimeHours: 12.5, changeFailureRate: 0.25, mttrHours: null });
    if (/\/overview$/.test(input)) return ok({ trackers: OVERVIEW });
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
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    expect(tabNames()).toEqual(['Vue d’ensemble', 'Trackers', 'Planification', 'Code et intégration', 'Membres']);
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Planification' })).not.toHaveAttribute('aria-current');
  });

  it('masque l’onglet dont le module est inactif, sans décaler les autres', async () => {
    modules = ['overview', 'trackers', 'activity']; // planification, code et membres inactifs
    app('/p/ARI');
    await waitFor(() => expect(tabNames()).toEqual(['Vue d’ensemble', 'Trackers']));
  });

  it('garde les onglets existants quand la liste des modules est indisponible', async () => {
    modules = 'error';
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    expect(tabNames()).toEqual(['Vue d’ensemble', 'Trackers', 'Planification', 'Code et intégration', 'Membres']);
  });

  it('se parcourt au clavier : chaque onglet est un lien, atteint par Tab', async () => {
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    const link = screen.getByRole('link', { name: 'Planification' });
    link.focus();
    expect(link).toHaveFocus();
    expect(link.tagName).toBe('A');
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
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
    expect(await screen.findByRole('heading', { level: 1, name: 'Planification · ARI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planification' })).toHaveAttribute('aria-current', 'page');
    first.unmount();
    app('/p/ARI/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('onglet Trackers', () => {
  it('groupe les trackers par catégorie dans l’ordre fixe, avec compteurs par état et éléments à moi', async () => {
    app('/p/ARI/trackers');
    await screen.findByRole('heading', { level: 1, name: 'Trackers · ARI' });
    const groups = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent).filter((t) => ['Ingénierie', 'Développement', 'Autres', 'Pilotage'].includes(String(t)));
    expect(groups).toEqual(['Ingénierie', 'Développement', 'Autres']); // catégories vides absentes
    const req = screen.getByRole('region', { name: 'Ingénierie' });
    expect(within(req).getByText('Exigences')).toBeInTheDocument();
    expect(within(req).getByText('10 items')).toHaveClass('ath-mono');
    expect(within(req).getByRole('img', { name: /Brouillon 2, Approuvée 3, Vérifiée 5/ })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Développement' })).getByText('2 à moi')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Autres' })).getByText(/Aucune activité/)).toBeInTheDocument();
    expect(within(req).getByRole('link', { name: 'Ouvrir Exigences' })).toHaveAttribute('href', '/p/ARI/recherche?q=tracker%20%3D%20REQ');
  });
  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI/trackers');
    await screen.findByRole('heading', { level: 1, name: 'Trackers · ARI' });
    await screen.findByRole('region', { name: 'Ingénierie' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('Vue d’ensemble', () => {
  it('liste les trackers et mes items, même sans aucune donnée', async () => {
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    expect(await screen.findByText('Rien n’est assigné à votre nom.')).toBeInTheDocument();
    const card = screen.getByRole('link', { name: 'REQ' }).closest('section')!;
    expect(within(card).getByRole('link', { name: 'REQ' })).toHaveAttribute('href', '/p/ARI/recherche?q=tracker%20%3D%20REQ');
    expect(within(card).getByText('5 ouverts / 10')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tout voir dans la Recherche' })).toHaveAttribute('href', '/p/ARI/recherche?q=assignee%20%3D%20%22u%22');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('onglets Planification, Membres et Code', () => {
  it('Membres : les acteurs sont réservés aux chefs de projet et administrateurs', async () => {
    app('/p/ARI/membres');
    await screen.findByRole('heading', { level: 1, name: 'Membres · ARI' });
    expect(screen.getByText('Réservé aux chefs de projet et aux administrateurs.')).toBeInTheDocument();
  });
  it('Membres : un chef de projet voit la liste des acteurs', async () => {
    app('/p/ARI/membres', ['athena-user', 'athena-pm']);
    await screen.findByRole('heading', { level: 1, name: 'Membres · ARI' });
    expect(screen.queryByText('Réservé aux chefs de projet et aux administrateurs.')).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.endsWith('/v1/projects/ARI/members'))).toBe(true));
  });
  it('Planification n’affiche plus les acteurs : sprints, versions, boards', async () => {
    app('/p/ARI/planification', ['athena-user', 'athena-pm']);
    await screen.findByRole('heading', { level: 1, name: 'Planification · ARI' });
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Sprints', 'Versions', 'Boards']);
  });
  it('Code : dépôts liés et indicateurs de livraison, vide sinon', async () => {
    app('/p/ARI/code');
    await screen.findByRole('heading', { level: 1, name: 'Code et intégration · ARI' });
    expect(await screen.findByText('Aucun dépôt lié à ce projet.')).toBeInTheDocument();
  });
  it('Code : liste les dépôts en mono et les indicateurs DORA', async () => {
    repos = [{ path: 'ariane/obc', defaultBranch: 'main' }];
    app('/p/ARI/code');
    expect(await screen.findByText('ariane/obc')).toHaveClass('ath-mono');
    const row = (await screen.findByText('Taux d’échec')).closest('tr')!;
    expect(within(row).getByText('25 %')).toBeInTheDocument();
    expect(within(screen.getByText('Rétablissement (h)').closest('tr')!).getByText('—')).toBeInTheDocument();
  });
});
