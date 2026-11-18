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
let tabs: Array<{ id: string; title: string | null }>;
let tabWidgets: Record<string, Widget[]>;

beforeEach(() => {
  stored = null;
  calls = [];
  tabs = [{ id: '', title: null }];
  tabWidgets = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url === '/v1/me/dashboard/tabs') {
      if (method === 'POST') { const made = { id: 'risques', title: (body as { title: string }).title }; tabs = [...tabs, made]; return json(made); }
      return json({ tabs });
    }
    if (url.startsWith('/v1/me/dashboard/tabs/')) {
      const id = url.split('/').pop()!;
      if (method === 'PATCH') { tabs = tabs.map((t) => (t.id === id ? { ...t, title: (body as { title: string }).title } : t)); return json({ id, title: (body as { title: string }).title }); }
      if (method === 'DELETE') { tabs = tabs.filter((t) => t.id !== id); return new Response(null, { status: 204 }); }
    }
    if (url.startsWith('/v1/me/dashboard?tab=')) {
      const id = url.split('=')[1]!;
      if (method === 'PUT') { tabWidgets[id] = (body as { widgets: Widget[] }).widgets; return json({ widgets: tabWidgets[id], isDefault: false }); }
      return json({ widgets: tabWidgets[id] ?? [], isDefault: !tabWidgets[id] });
    }
    if (url.endsWith('/v1/me/dashboard')) {
      if (method === 'PUT') { stored = (body as { widgets: Widget[] }).widgets; return json({ widgets: stored, isDefault: false }); }
      if (method === 'DELETE') { stored = null; return new Response(null, { status: 204 }); }
      return json({ widgets: stored ?? DEFAULTS, isDefault: stored === null });
    }
    if (url.startsWith('/v1/search?')) return json({ total: 1, hits: [{ key: 'ARI-BUG-0001', project: 'ARI', tracker: 'BUG', status: 'open', statusName: 'Ouvert', category: 'todo', values: { title: 'Fuite mémoire' }, version: 1, updatedAt: '' }] });
    if (url.startsWith('/v1/me/notifications')) return json({ items: [], unread: 0 });
    if (url === '/v1/me/approvals') return json({ items: [{ project: 'ARI', key: 'ARI-REQ-0001', tracker: 'REQ', step: 'Relecture technique' }] });
    if (url === '/v1/me/dashboard/catalog') return json({ kinds: ['search', 'mentions', 'approvals', 'favorites', 'recents', 'health', 'pipelines'].map((kind) => ({ kind, project: kind === 'health' || kind === 'pipelines' })) });
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
    expect(screen.queryByRole('button', { name: /^Déplacer la carte/ })).not.toBeInTheDocument(); // les commandes n'apparaissent qu'en mode Organiser
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('Organiser (T-0172) : déplacer au clavier, régler la taille, retirer, dupliquer ; rien n’est enregistré avant « Enregistrer »', async () => {
    page();
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    await userEvent.click(screen.getByRole('button', { name: 'Organiser' }));
    const handle = screen.getByRole('button', { name: 'Déplacer la carte Mes tickets' });
    handle.focus();
    await userEvent.keyboard('{Enter}');
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Mes tickets : colonne 2, ligne 1.')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByText('Mes tickets : colonne 2, ligne 2.')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Déplacer la carte Mes tickets' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Mes tickets' })).toHaveClass('ath-gx-2', 'ath-gy-2');
    await userEvent.click(screen.getByRole('button', { name: 'Réglages de Mes tickets' }));
    await userEvent.selectOptions(screen.getByLabelText('Largeur'), 'XL (12 colonnes)');
    expect(screen.getByRole('group', { name: 'Mes tickets' })).toHaveClass('ath-dashcard--XL', 'ath-gx-1', 'ath-gw-12');
    await userEvent.type(screen.getByLabelText('Titre'), 'perso');
    await userEvent.click(screen.getByRole('button', { name: 'Dupliquer perso' }));
    await userEvent.click(screen.getByRole('button', { name: 'Masquer Récents' }));
    expect(groups()).not.toContain('Récents');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(stored).not.toBeNull());
    const ids = stored!.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stored!.find((w) => w.id === 'assigned')).toMatchObject({ title: 'perso', w: 12, x: 0 });
    expect(stored!.some((w) => w.title === 'perso (copie)')).toBe(true);
    expect(stored!.some((w) => w.id === 'recents')).toBe(false);
    expect(screen.queryByRole('button', { name: /^Déplacer la carte/ })).not.toBeInTheDocument();
  });

  it('Annuler restaure la disposition ; Enregistrer est le seul geste qui écrit', async () => {
    page();
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    await userEvent.click(screen.getByRole('button', { name: 'Organiser' }));
    await userEvent.click(screen.getByRole('button', { name: 'Masquer Mentions' }));
    expect(groups()).not.toContain('Mentions');
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect([...document.querySelectorAll('.ath-dashcard')].map((c) => c.getAttribute('aria-label'))).toEqual(DEFAULT_TITLES));
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('Catalogue : genres du rôle, recherche enregistrée ou carte retirée ; puis retour au défaut après confirmation', async () => {
    stored = DEFAULTS.filter((w) => w.id !== 'recents');
    page();
    await waitFor(() => expect(groups()).not.toContain('Récents'));
    await userEvent.click(screen.getByRole('button', { name: 'Organiser' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter Bloquants NOVA' }));
    expect(groups()).toContain('Bloquants NOVA');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter Santé du projet' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter Santé du projet' })); // un même genre, deux exemplaires
    expect(groups().filter((g) => g === 'Santé du projet')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Ajouter Progression du sprint' })).toBeNull(); // hors du catalogue de ce rôle
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter Récents' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(stored!.map((w) => w.kind)).toContain('health'));
    const added = stored!.find((w) => w.title === 'Bloquants NOVA')!;
    expect([added.kind, added.query, added.projects]).toEqual(['search', 'priority = high', ['NOVA']]);
    await userEvent.click(screen.getByRole('button', { name: 'Organiser' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir la disposition par défaut' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect([...document.querySelectorAll('.ath-dashcard')].map((c) => c.getAttribute('aria-label'))).toEqual(DEFAULT_TITLES));
    expect(stored).toBeNull();
  });

  it('n’a pas de défaut d’accessibilité en mode Organiser', async () => {
    const { container } = page();
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    await userEvent.click(screen.getByRole('button', { name: 'Organiser' }));
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('classeur à onglets', () => {
  it('gère les onglets depuis Organiser : crée, renomme l’onglet principal, remplit un onglet sans toucher au principal, supprime', async () => {
    const user = userEvent.setup();
    page();
    await waitFor(() => expect(groups()).toEqual(DEFAULT_TITLES));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Principal']);
    expect(screen.queryByRole('button', { name: 'Nouvel onglet' })).not.toBeInTheDocument(); // la gestion se fait dans Organiser
    await user.click(screen.getByRole('button', { name: 'Organiser' }));
    // renommer l'onglet principal
    await user.click(screen.getByRole('button', { name: 'Renommer l’onglet' }));
    await user.type(screen.getByLabelText('Nom de l’onglet'), 'Quotidien');
    await user.click(screen.getByRole('button', { name: 'Renommer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.url).toBe('/v1/me/dashboard/tabs/'));
    expect(screen.queryByRole('button', { name: 'Supprimer l’onglet' })).not.toBeInTheDocument(); // le principal ne se supprime pas
    // créer un onglet (on reste sur le brouillon en cours), puis l'ouvrir
    await user.click(screen.getByRole('button', { name: 'Nouvel onglet' }));
    await user.type(screen.getByLabelText('Nom de l’onglet'), 'Risques');
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ title: 'Risques' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(await screen.findByRole('tab', { name: 'Risques' }));
    expect(await screen.findByText(/Onglet vide/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Organiser' }));
    await user.click(await screen.findByRole('button', { name: 'Ajouter Mentions' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/v1/me/dashboard?tab=risques')).toBe(true));
    expect(tabWidgets['risques']!.map((w) => w.kind)).toEqual(['mentions']);
    expect(stored).toBeNull(); // l'onglet principal n'a pas été écrit
    // supprimer l'onglet
    await user.click(screen.getByRole('button', { name: 'Organiser' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer l’onglet' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer l’onglet' }));
    await waitFor(() => expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Quotidien']));
    await waitFor(() => expect(groups()).toContain('Mes tickets'));
  });
});
