import { render, screen, waitFor } from '@testing-library/react';
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
