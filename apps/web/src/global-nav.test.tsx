import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { initTheme } from './lib/theme';

/** T-0123 : navigation globale (ADR-0003 § 2) : `/` = Mon travail, `/projets`, `/profil`, `/notifications`, `/admin`, rail ≤ 6. */
const calls: string[] = [];
let stored: { home: string | null; locale: string | null; theme: string | null; density?: string | null };
let preferencesGate: Promise<void> | null = null;
let puts: unknown[];
beforeEach(() => {
  calls.length = 0;
  stored = { home: null, locale: null, theme: null };
  preferencesGate = null;
  puts = [];
  try { localStorage.clear(); } catch { /* sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${input}`);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/v1\/me\/preferences$/.test(input)) {
      if (method !== 'PUT' && preferencesGate) {
        // Comme un vrai serveur : la réponse décrit l'état au moment de la requête, même si elle arrive après un PUT.
        const atRequest = { ...stored };
        await preferencesGate;
        return ok(atRequest);
      }
      if (method === 'PUT') { const patch = JSON.parse(String(init?.body)); puts.push(patch); stored = { ...stored, ...patch }; }
      return ok(stored);
    }
    if (/\/v1\/me\/pins$/.test(input)) return ok({ favorites: [], recents: [] });
    if (/\/v1\/me\/dashboard$/.test(input)) return ok({ widgets: [{ id: 'mentions', kind: 'mentions' }], isDefault: true });
    if (/\/v1\/me\/notification-prefs$/.test(input)) return ok({ transition: true, mention: true, suspect: true, comment: true, approval: true });
    if (/\/v1\/me\/notification-digest$/.test(input)) return ok({ available: true, enabled: false, hour: 8, timezone: 'UTC', locale: 'fr' });
    if (/\/v1\/me\/notifications/.test(input)) return ok({ unread: 1, items: [{ id: 'n1', event: 'comment', project: 'ARI', key: 'ARI-BUG-0001', actor: 'a', actorName: 'Alice', payload: {}, read: false, createdAt: '2026-11-07T09:30:00.000Z' }] });
    if (/\/v1\/projects$/.test(input)) return ok([]);
    return ok([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname}</span>; }
const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const app = (path: string, roles = ['athena-user']) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>);
const where = () => screen.getByTestId('where').textContent;
const rail = () => screen.getByRole('navigation', { name: /Navigation principale|Menu/ });

describe('adresses globales', () => {
  it('/ est Mon travail ; /me y mène', async () => {
    app('/me');
    await screen.findByRole('heading', { level: 1, name: 'Mon travail' });
    expect(where()).toBe('/');
  });
  it('/projets est la liste des projets', async () => {
    app('/projets');
    await screen.findByRole('heading', { level: 1, name: 'Projets' });
  });
  it('/admin est l’administration de l’organisation ; /org y mène', async () => {
    app('/org', ['athena-user', 'athena-admin']);
    await screen.findByRole('heading', { level: 1, name: /Administration de l’organisation/ });
    expect(where()).toBe('/admin');
  });
  it('le rail global d’un administrateur compte au plus 6 entrées, Profil et Aide étant au bas du rail', async () => {
    app('/', ['athena-user', 'athena-admin']);
    await screen.findByRole('heading', { level: 1, name: 'Mon travail' });
    const entries = within(document.getElementById('rail')!).getAllByRole('button').filter((b) => b.getAttribute('data-depth') === null || b.getAttribute('data-depth') === '0');
    const names = entries.map((b) => b.textContent).filter((t) => ['Favoris (0)›', 'Récents (0)›', 'Projets', 'Mon travail', 'Recherche', 'Administration'].includes(t ?? ''));
    expect(names).toEqual(['Favoris (0)›', 'Récents (0)›', 'Projets', 'Mon travail', 'Recherche', 'Administration']);
    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/profil');
    expect(screen.getByRole('link', { name: 'Aide' })).toHaveAttribute('href', '/help');
  });
});

describe('Profil et notifications', () => {
  it('/profil regroupe langue, thème, page d’accueil et notifications', async () => {
    app('/profil');
    await screen.findByRole('heading', { level: 1, name: 'Profil' });
    expect(screen.getByLabelText('Langue')).toBeInTheDocument();
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
    // Thème (T-0136) : vignettes en boutons radio, le thème courant est coché.
    const themes = screen.getByRole('group', { name: 'Thème' });
    expect(within(themes).getByRole('radio', { name: 'Hemeria' })).toBeChecked();
    expect(within(themes).getAllByRole('radio').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByLabelText('Page d’accueil')).toHaveValue('work');
    expect(await screen.findByRole('group', { name: 'Événements à notifier' })).toBeInTheDocument();
  });
  it('choisir un thème dans le Profil l’applique et l’enregistre sur le compte (T-0136)', async () => {
    app('/profil');
    await userEvent.click(await screen.findByRole('radio', { name: 'Nord' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('nord'));
    await waitFor(() => expect(puts).toContainEqual({ family: 'nord' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Hemeria' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('hemeria'));
  });
  it('la page d’accueil choisie dans le Profil s’applique à /', async () => {
    const first = app('/profil');
    await userEvent.selectOptions(await screen.findByLabelText('Page d’accueil'), 'Projets');
    first.unmount();
    app('/');
    await waitFor(() => expect(where()).toBe('/projets'));
  });
  it('la page d’accueil est enregistrée sur le compte, pas seulement dans le navigateur', async () => {
    app('/profil');
    await userEvent.selectOptions(await screen.findByLabelText('Page d’accueil'), 'Projets');
    await waitFor(() => expect(puts).toContainEqual({ home: 'projects' }));
    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'sombre');
    await waitFor(() => expect(puts).toContainEqual({ theme: 'dark' }));
  });
  it('une préférence du compte s’applique sur un navigateur neuf (accueil, thème)', async () => {
    stored = { home: 'projects', locale: null, theme: 'dark' };
    localStorage.clear();
    app('/');
    await waitFor(() => expect(where()).toBe('/projets'));
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
    document.documentElement.removeAttribute('data-mode');
  });
  it('la densité du compte s’applique sur un navigateur neuf ; le Profil la règle et l’enregistre (T-0135)', async () => {
    stored = { home: null, locale: null, theme: null, density: 'compact' };
    localStorage.clear();
    initTheme();
    const first = app('/profil');
    await waitFor(() => expect(document.documentElement.getAttribute('data-density')).toBe('compact'));
    const select = await screen.findByLabelText('Densité');
    expect(select).toHaveValue('compact');
    await userEvent.selectOptions(select, 'Normale');
    expect(document.documentElement.getAttribute('data-density')).toBe('normal');
    await waitFor(() => expect(puts).toContainEqual({ density: 'normal' }));
    first.unmount();
  });
  it('un thème choisi pendant le chargement des préférences n’est pas écrasé par celui du compte', async () => {
    stored = { home: null, locale: null, theme: 'dark' };
    let release: () => void = () => undefined;
    preferencesGate = new Promise<void>((resolve) => { release = resolve; });
    localStorage.clear();
    initTheme(); // repart de « système » : le contrôleur garde sinon le mode du test précédent
    app('/projets');
    await userEvent.click(await screen.findByRole('button', { name: /^Thème : système/ }));
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    release();
    await waitFor(() => expect(calls).toContain('GET /v1/me/preferences'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    document.documentElement.removeAttribute('data-mode');
  });
  it('tablette (769 à 1024 px) : rail replié en icônes par défaut, entrées nommées ; un choix explicite l’emporte (T-0136)', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('max-width: 1024px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      localStorage.removeItem('athena.rail.collapsed');
      const first = app('/projets');
      const rail = document.getElementById('rail')!;
      expect(rail).toHaveClass('ath-sidebar--collapsed');
      expect(within(rail).getByRole('button', { name: 'Projets' }).querySelector('.ath-nav-item__icon svg')).not.toBeNull();
      await userEvent.click(within(rail).getByRole('button', { name: 'Déplier le rail' }));
      expect(rail).not.toHaveClass('ath-sidebar--collapsed');
      first.unmount();
      app('/projets');
      expect(document.getElementById('rail')).not.toHaveClass('ath-sidebar--collapsed');
    } finally {
      window.matchMedia = original;
      localStorage.removeItem('athena.rail.collapsed');
    }
  });
  it('/notifications liste les notifications, marque lu, et mène aux réglages du Profil', async () => {
    app('/notifications');
    await screen.findByRole('heading', { level: 1, name: 'Notifications' });
    expect(await screen.findByRole('link', { name: 'ARI-BUG-0001' })).toHaveAttribute('href', '/p/ARI/a/ARI-BUG-0001');
    await userEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    await waitFor(() => expect(calls).toContain('POST /v1/me/notifications/read'));
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/profil');
  });
});
