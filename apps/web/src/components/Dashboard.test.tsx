import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard, type Widget } from './Dashboard';

// T-0122 : tableau de bord personnel : disposition par défaut sans réglage, masquer, réordonner, dupliquer, ajouter une vue, réinitialiser.

const DEFAULTS: Widget[] = [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
  { id: 'approvals', kind: 'approvals' },
  { id: 'mentions', kind: 'mentions' },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)' },
  { id: 'favorites', kind: 'favorites' },
  { id: 'recents', kind: 'recents' },
];
let stored: Widget[] | null;
let calls: Array<{ method: string; url: string; body: unknown }>;

beforeEach(() => {
  stored = null;
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.endsWith('/v1/me/dashboard')) {
      if (method === 'PUT') { stored = (body as { widgets: Widget[] }).widgets; return json({ widgets: stored, isDefault: false }); }
      if (method === 'DELETE') { stored = null; return new Response(null, { status: 204 }); }
      return json({ widgets: stored ?? DEFAULTS, isDefault: stored === null });
    }
    if (url.startsWith('/v1/search?')) return json({ total: 1, hits: [{ key: 'ARI-BUG-0001', project: 'ARI', tracker: 'BUG', status: 'open', statusName: 'Ouvert', category: 'todo', values: { title: 'Fuite mémoire' }, version: 1, updatedAt: '' }] });
    if (url.startsWith('/v1/me/notifications')) return json({ items: [], unread: 0 });
    if (url === '/v1/me/approvals') return json({ items: [{ project: 'ARI', key: 'ARI-REQ-0001', tracker: 'REQ', step: 'Relecture technique' }] });
    if (url === '/v1/projects') return json([]);
    if (url === '/v1/searches') return json([{ id: '11111111-aaaa-bbbb-cccc-222222222222', name: 'Bloquants NOVA', query: 'priority = high', projects: ['NOVA'] }]);
    return json({}, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const page = () => render(<ToastProvider><MemoryRouter><Dashboard /></MemoryRouter></ToastProvider>);
const groups = () => screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'));
const DEFAULT_TITLES = ['Mes tickets', 'À approuver', 'Mentions', 'Échéances de la semaine', 'Projets favoris', 'Récents'];

describe('tableau de bord personnel', () => {
  it('affiche la disposition par défaut sans aucun réglage, avec un lien vers la liste complète', async () => {
    page();
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    expect(await within(screen.getByRole('group', { name: 'Mes tickets' })).findByText('Fuite mémoire')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Mes tickets' })).getByRole('link', { name: 'Tout voir' })).toHaveAttribute('href', `/recherche?q=${encodeURIComponent('assignee = currentUser() AND category != done')}`);
    const approvals = within(screen.getByRole('group', { name: 'À approuver' }));
    expect(await approvals.findByRole('link', { name: 'ARI-REQ-0001' })).toHaveAttribute('href', '/p/ARI/a/ARI-REQ-0001?onglet=approval');
    expect(approvals.getByText('Relecture technique')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Monter/ })).not.toBeInTheDocument(); // les commandes n'apparaissent qu'en mode Personnaliser
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('masque, réordonne et duplique, chaque changement étant enregistré', async () => {
    page();
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    await userEvent.click(screen.getByRole('button', { name: 'Personnaliser' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descendre Mes tickets' }));
    await waitFor(() => expect(stored?.map((w) => w.id).slice(0, 2)).toEqual(['approvals', 'assigned']));
    await userEvent.click(screen.getByRole('button', { name: 'Masquer Récents' }));
    await waitFor(() => expect(groups()).not.toContain('Récents'));
    await userEvent.click(screen.getByRole('button', { name: 'Dupliquer Mes tickets' }));
    await waitFor(() => expect(groups()).toContain('Mes tickets (copie)'));
    const ids = stored!.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stored!.find((w) => w.title === 'Mes tickets (copie)')?.query).toBe(DEFAULTS[0]!.query);
    expect(screen.queryByRole('button', { name: 'Dupliquer Mentions' })).not.toBeInTheDocument(); // seules les recherches se dupliquent
  });

  it('ajoute une vue enregistrée ou un widget masqué, puis réinitialise après confirmation', async () => {
    stored = DEFAULTS.filter((w) => w.id !== 'recents');
    page();
    await waitFor(() => expect(groups()).not.toContain('Récents'));
    await userEvent.click(screen.getByRole('button', { name: 'Personnaliser' }));
    await userEvent.selectOptions(await screen.findByLabelText('Ajouter un widget'), 'Bloquants NOVA');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(groups()).toContain('Bloquants NOVA'));
    const added = stored!.find((w) => w.title === 'Bloquants NOVA')!;
    expect([added.kind, added.query, added.projects]).toEqual(['search', 'priority = high', ['NOVA']]);
    await userEvent.selectOptions(screen.getByLabelText('Ajouter un widget'), 'Récents');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(groups()).toContain('Récents'));
    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    expect(stored).toBeNull();
  });

  it('n’a pas de défaut d’accessibilité en mode Personnaliser', async () => {
    const { container } = page();
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    await userEvent.click(screen.getByRole('button', { name: 'Personnaliser' }));
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
