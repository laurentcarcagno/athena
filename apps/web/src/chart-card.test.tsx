import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChartBody } from './components/ChartCard';
import { Dashboard } from './components/Dashboard';
import { PinsProvider } from './lib/pins';

/** T-0156 (ADR-0005 § 2.3) : cartes graphiques sur une recherche : anneau, barres, indicateur ; ajout depuis « Organiser ». */
const facets = { total: 12, field: 'severity', buckets: [{ value: 'mineure', label: 'mineure', count: 6 }, { value: 'majeure', label: 'majeure', count: 4 }], others: 2 };
let calls: string[];
let puts: unknown[];
beforeEach(() => {
  calls = [];
  puts = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push(input);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (input.startsWith('/v1/search/facets')) return ok(facets);
    if (/\/v1\/me\/dashboard/.test(input)) {
      if (init?.method === 'PUT') { const body = JSON.parse(String(init.body)); puts.push(body); return ok({ ...body, isDefault: false }); }
      return ok({ widgets: [{ id: 'recents', kind: 'recents' }], isDefault: false });
    }
    if (/\/v1\/me\/pins/.test(input)) return ok({ favorites: [], recents: [] });
    return ok([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const body = (spec: Parameters<typeof ChartBody>[0]['spec']) => render(<MemoryRouter><ChartBody spec={spec} /></MemoryRouter>);

it('anneau : total au centre, légende chiffrée, « Autres » au-delà de 7 valeurs, chaque valeur ouvre la recherche filtrée', async () => {
  body({ query: 'tracker = BUG', projects: ['SAT1'], field: 'severity', form: 'donut' });
  expect(await screen.findByRole('img', { name: '12 tickets : mineure 6, majeure 4, Autres 2' })).toBeInTheDocument();
  expect(calls[0]).toBe('/v1/search/facets?q=tracker%20%3D%20BUG&field=severity&project=SAT1');
  expect(screen.getByRole('link', { name: 'mineure' })).toHaveAttribute('href', `/recherche?q=${encodeURIComponent('tracker = BUG AND severity = "mineure"')}&p=SAT1`);
  expect(screen.getByRole('link', { name: 'Autres' })).toBeInTheDocument();
  expect(document.querySelectorAll('[style]')).toHaveLength(0);
});

it('barres par valeur et indicateur chiffré', async () => {
  const { unmount } = body({ query: '', field: 'severity', form: 'bars' });
  const bars = await screen.findByRole('list', { name: 'Répartition de 12 tickets' });
  expect(within(bars).getAllByRole('listitem')).toHaveLength(3);
  unmount();
  body({ query: 'category != done', form: 'count' });
  expect(await screen.findByText('12')).toHaveClass('ath-tile__value');
  expect(screen.getByText('tickets correspondants')).toBeInTheDocument();
});

it('Organiser : « Graphique sur une recherche… » ajoute une carte anneau, barres ou indicateur dans la portée de la page', async () => {
  render(<ToastProvider><PinsProvider><MemoryRouter><Dashboard project="SAT1" /></MemoryRouter></PinsProvider></ToastProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'Organiser' }));
  await userEvent.selectOptions(screen.getByLabelText('+ Ajouter une carte'), 'Graphique sur une recherche…');
  await userEvent.type(screen.getByLabelText('Titre de la carte'), 'Bugs par sévérité');
  await userEvent.type(screen.getByLabelText('Recherche (ATQL, vide : tous les tickets)'), 'tracker = BUG');
  await userEvent.selectOptions(screen.getByLabelText('Forme'), 'Barres par valeur');
  await userEvent.selectOptions(screen.getByLabelText('Répartir par'), 'Sévérité');
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter le graphique' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  const added = (puts[0] as { widgets: Array<Record<string, unknown>> }).widgets.at(-1)!;
  expect(added).toMatchObject({ kind: 'chart', title: 'Bugs par sévérité', query: 'tracker = BUG', field: 'severity', form: 'bars', size: 'S', projects: ['SAT1'] });
  expect(await screen.findByRole('group', { name: 'Bugs par sévérité' })).toBeInTheDocument();
});
