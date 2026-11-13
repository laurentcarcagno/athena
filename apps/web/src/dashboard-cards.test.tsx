import userEvent from '@testing-library/user-event';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dashboard } from './components/Dashboard';
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

it('Organiser : glisser une carte sur la grille la place, repousse la voisine, et ne s’enregistre qu’avec « Enregistrer » (T-0172)', async () => {
  const puts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (/\/v1\/me\/dashboard\/catalog/.test(input)) return ok({ kinds: [] });
    if (/\/v1\/me\/dashboard/.test(input)) { if (init?.method === 'PUT') { const body = JSON.parse(String(init.body)); puts.push(body); return ok({ ...body, isDefault: false }); } return ok(layout); }
    if (/\/v1\/me\/pins/.test(input)) return ok({ favorites: [], recents: [] });
    if (/\/v1\/search/.test(input)) return ok({ total: 1, hits: [] });
    return ok({ items: [] });
  }));
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
  try {
    mount('SAT1');
    await userEvent.click(await screen.findByRole('button', { name: 'Organiser' }));
    const recents = screen.getByRole('group', { name: 'Récents' });
    const grid = recents.parentElement!;
    // jsdom n’a pas de DragEvent : les coordonnées du pointeur sont posées à la main.
    const drag = (type: 'dragStart' | 'dragOver' | 'drop', target: Element, x: number, y: number) => {
      const event = createEvent[type](target, { dataTransfer: { effectAllowed: '' } });
      Object.defineProperty(event, 'clientX', { value: x });
      Object.defineProperty(event, 'clientY', { value: y });
      fireEvent(target, event);
    };
    drag('dragStart', recents, 0, 0);
    drag('dragOver', grid, 850, 100);
    expect(grid.querySelector('.ath-dashdrop')).not.toBeNull(); // aperçu de la case visée
    drag('drop', grid, 850, 100);
    expect(grid.querySelector('.ath-dashdrop')).toBeNull();
    expect(puts).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    const saved = (puts[0] as { widgets: Array<{ id: string; x: number; y: number }> }).widgets;
    expect(saved.find((w) => w.id === 'recents')).toMatchObject({ x: 4, y: 1 });
    expect(saved.find((w) => w.id === 'approvals')!.y).toBeGreaterThanOrEqual(4); // repoussée sous la carte posée
  } finally { rect.mockRestore(); }
});

it('sur téléphone, l’ordre du DOM suit les lignes puis les colonnes (T-0171)', async () => {
  layout = { widgets: [
    { id: 'recents', kind: 'recents', x: 0, y: 3, w: 12, h: 3 },
    { id: 'approvals', kind: 'approvals', x: 6, y: 0, w: 6, h: 3 },
    { id: 'assigned', kind: 'search', query: 'x', x: 0, y: 0, w: 6, h: 3 },
  ], isDefault: false };
  mount('SAT1');
  await screen.findByRole('group', { name: 'Récents' });
  expect([...document.querySelectorAll('.ath-dashcard')].map((c) => c.getAttribute('aria-label'))).toEqual(['Mes tickets', 'À approuver', 'Récents']);
});
