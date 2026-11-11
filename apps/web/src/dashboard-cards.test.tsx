import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dashboard, reorder } from './components/Dashboard';
import { PinsProvider } from './lib/pins';

/** T-0153 (ADR-0005 § 2.3) : modèle de carte commun, grille 12 colonnes, cartes vides résumées dans Mon travail. */
let layout: unknown;
beforeEach(() => {
  layout = { widgets: [
    { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
    { id: 'approvals', kind: 'approvals' },
    { id: 'recents', kind: 'recents', size: 'L' },
  ], isDefault: false };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (/\/v1\/me\/dashboard/.test(input)) return ok(layout);
    if (/\/v1\/search/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/v1\/me\/approvals/.test(input)) return ok({ items: [] });
    if (/\/v1\/me\/pins/.test(input)) return ok({ favorites: [], recents: [] });
    return ok([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const mount = (project?: string) => render(<ToastProvider><PinsProvider><MemoryRouter><Dashboard project={project} /></MemoryRouter></PinsProvider></ToastProvider>);

it('toutes les cartes suivent le modèle commun, avec leur largeur sur la grille', async () => {
  const { container } = mount('SAT1');
  await waitFor(() => expect(container.querySelectorAll('.ath-dashgrid > .ath-dashcard')).toHaveLength(3));
  expect(container.querySelector('.ath-layout-grid')).toBeNull();
  const recents = screen.getByRole('group', { name: 'Récents' });
  expect(recents).toHaveClass('ath-dashcard--L');
  expect(screen.getByRole('group', { name: 'Mes tickets' })).toHaveClass('ath-dashcard--S');
  expect(screen.getByRole('link', { name: 'Tout voir' })).toBeInTheDocument(); // le lien du détail est au pied de la carte
});

it('Mon travail : les cartes vides se résument en une ligne « Rien d’urgent »', async () => {
  mount();
  expect(await screen.findByText('Rien d’urgent :')).toBeInTheDocument();
  expect(screen.getByText(/Mes tickets et À approuver : rien pour l’instant\./)).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Mes tickets' })).toBeNull();
  expect(screen.getByRole('group', { name: 'Récents' })).toBeInTheDocument();
});

it('réordonner : une carte déplacée prend la place visée (T-0154)', () => {
  expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  expect(reorder(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  expect(reorder(['a', 'b'], 1, 9)).toEqual(['a', 'b']);
});

it('Organiser : glisser une carte sur une autre la déplace, et l’enregistre (T-0154)', async () => {
  const puts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (/\/v1\/me\/dashboard/.test(input)) { if (init?.method === 'PUT') { const body = JSON.parse(String(init.body)); puts.push(body); return ok({ ...body, isDefault: false }); } return ok(layout); }
    if (/\/v1\/me\/pins/.test(input)) return ok({ favorites: [], recents: [] });
    if (/\/v1\/search/.test(input)) return ok({ total: 1, hits: [] });
    return ok({ items: [] });
  }));
  mount('SAT1');
  await userEvent.click(await screen.findByRole('button', { name: 'Organiser' }));
  const recents = screen.getByRole('group', { name: 'Récents' });
  const first = screen.getByRole('group', { name: 'Mes tickets' });
  fireEvent.dragStart(recents, { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(first);
  fireEvent.drop(first);
  await waitFor(() => expect(puts).toHaveLength(1));
  expect((puts[0] as { widgets: Array<{ id: string }> }).widgets.map((w) => w.id)).toEqual(['recents', 'assigned', 'approvals']);
});
