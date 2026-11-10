import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { relationGroup, type LinkRow } from './components/LinkEditor';
import { originOf } from './lib/origin';
import { ArtifactPage } from './pages/ArtifactPage';

// T-0113 : relations groupées, retour à l'origine, précédent et suivant.

const def = {
  key: 'BUG', name: 'Anomalies', typeKey: null,
  fields: [{ id: 'f1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
  statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
};
const row = (id: string, type: string, direction: 'outward' | 'inward', label: string, other: string | null, extra: Partial<LinkRow> = {}): LinkRow =>
  ({ id, type, direction, label, other, suspect: false, hierarchical: false, propagatesSuspect: false, ...extra });
let links: Record<string, LinkRow[]> = {};

beforeEach(() => {
  links = {};
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const own = /\/artifacts\/([A-Z0-9-]+)\/links$/.exec(input);
    if (own) return ok(links[own[1]!] ?? []);
    if (/\/sprint$/.test(input)) return ok({ sprint: null });
    const item = /\/artifacts\/([A-Z0-9-]+)$/.exec(input);
    if (item) return ok({ id: item[1], key: item[1], trackerKey: 'BUG', status: 'open', version: 1, values: { title: `Titre ${item[1]}` } });
    if (/\/trackers\/BUG$/.test(input)) return ok(def);
    if (/\/link-types$/.test(input)) return ok([]);
    if (/\/artifacts\/[^/]+\/(doc-links|comments|history|code-refs|attachments)$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
const fromSearch = { from: { href: '/p/ARI/recherche?q=bug', label: 'Recherche', keys: ['ARI-BUG-0001', 'ARI-BUG-0002', 'ARI-BUG-0003'] } };
const mount = (entry: { pathname: string; search?: string; state?: unknown }) => {
  const router = createMemoryRouter([
    { path: '/p/:project/a/:key', element: <><ArtifactPage session={session} /><Where /></> },
    { path: '/p/:project/recherche', element: <><h1>Liste de recherche</h1><Where /></> },
  ], { initialEntries: [entry] });
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  return router;
};
const heading = (key: string) => screen.findByRole('heading', { level: 1, name: new RegExp(key) });

describe('relations groupées', () => {
  it('classe chaque lien par les propriétés de son type', () => {
    expect(relationGroup(row('1', 'refines', 'outward', 'raffine', 'A', { hierarchical: true }))).toBe('parent');
    expect(relationGroup(row('2', 'refines', 'inward', 'est raffiné par', 'A', { hierarchical: true }))).toBe('children');
    expect(relationGroup(row('3', 'blocks', 'outward', 'bloque', 'A'))).toBe('blocks');
    expect(relationGroup(row('4', 'blocks', 'inward', 'est bloqué par', 'A'))).toBe('blockedBy');
    expect(relationGroup(row('5', 'duplicates', 'inward', 'duplique', 'A', { propagatesSuspect: true }))).toBe('duplicates');
    expect(relationGroup(row('6', 'verifies', 'inward', 'est vérifié par', 'A', { propagatesSuspect: true }))).toBe('traceability');
    expect(relationGroup(row('7', 'concerns', 'outward', 'concerne', 'A'))).toBe('related');
  });

  it('affiche les groupes dans l’ordre, titrés et comptés, sans groupe vide', async () => {
    links['ARI-BUG-0001'] = [
      row('a', 'concerns', 'outward', 'concerne', 'ARI-BUG-0009'),
      row('b', 'verifies', 'outward', 'vérifie', 'ARI-REQ-0001', { propagatesSuspect: true }),
      row('c', 'verifies', 'outward', 'vérifie', 'ARI-REQ-0002', { propagatesSuspect: true }),
      row('d', 'refines', 'inward', 'est raffiné par', 'ARI-BUG-0004', { hierarchical: true }),
      row('e', 'refines', 'outward', 'raffine', 'ARI-BUG-0003', { hierarchical: true }),
      row('f', 'blocks', 'inward', 'est bloqué par', null, { restricted: true }),
    ];
    mount({ pathname: '/p/ARI/a/ARI-BUG-0001', search: '?onglet=links' });
    const group = await screen.findByRole('group', { name: 'Relations' });
    expect(within(group).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Parent 1', 'Enfants 1', 'Est bloqué par 1', 'Traçabilité 2', 'Relié à 1']);
    expect(within(within(group).getByRole('list', { name: 'Traçabilité' })).getAllByRole('listitem')).toHaveLength(2);
    expect(within(group).getByRole('list', { name: 'Parent' })).toHaveTextContent('ARI-BUG-0003');
    expect(within(group).getByRole('list', { name: 'Est bloqué par' })).toHaveTextContent('lien vers un item sous contrôle export');
  });
});

describe('origine de la fiche : retour, précédent et suivant', () => {
  it('depuis une liste : retour en 1 action, position, précédent et suivant (boutons et J / K)', async () => {
    const router = mount({ pathname: '/p/ARI/a/ARI-BUG-0002', state: fromSearch });
    await heading('ARI-BUG-0002');
    const nav = screen.getByRole('navigation', { name: 'Navigation depuis l’origine' });
    expect(within(nav).getByText('2 / 3')).toBeInTheDocument();
    await userEvent.click(within(nav).getByRole('button', { name: 'Suivant' }));
    await heading('ARI-BUG-0003');
    expect(within(screen.getByRole('navigation', { name: 'Navigation depuis l’origine' })).getByRole('button', { name: 'Suivant' })).toBeDisabled();
    await userEvent.keyboard('k');
    await heading('ARI-BUG-0002');
    await userEvent.keyboard('k');
    await heading('ARI-BUG-0001');
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();
    await userEvent.click(screen.getByRole('link', { name: 'Retour : Recherche' }));
    expect(await screen.findByRole('heading', { name: 'Liste de recherche' })).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe('/p/ARI/recherche?q=bug'); // filtres conservés
  });

  it('précédent et suivant gardent l’onglet ; changer d’onglet garde l’origine', async () => {
    mount({ pathname: '/p/ARI/a/ARI-BUG-0001', state: fromSearch });
    await heading('ARI-BUG-0001');
    await userEvent.click(screen.getByRole('tab', { name: 'Historique' }));
    expect(screen.getByRole('link', { name: 'Retour : Recherche' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await heading('ARI-BUG-0002');
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/a/ARI-BUG-0002?onglet=history');
  });

  it('d’un ticket à un ticket lié en 1 action, puis retour en 1 action, avec l’origine du premier', async () => {
    links['ARI-BUG-0001'] = [row('a', 'blocks', 'outward', 'bloque', 'ARI-BUG-0005')];
    mount({ pathname: '/p/ARI/a/ARI-BUG-0001', search: '?onglet=links', state: fromSearch });
    await heading('ARI-BUG-0001');
    await userEvent.click(within(await screen.findByRole('list', { name: 'Bloque' })).getByRole('link', { name: 'ARI-BUG-0005' }));
    await heading('ARI-BUG-0005');
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument(); // un ticket n'est pas une liste
    await userEvent.click(screen.getByRole('link', { name: 'Retour : ARI-BUG-0001' }));
    await heading('ARI-BUG-0001');
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/a/ARI-BUG-0001?onglet=links');
    expect(screen.getByRole('link', { name: 'Retour : Recherche' })).toBeInTheDocument();
  });

  it('sans origine (adresse saisie, nouvel onglet), ni retour ni précédent', async () => {
    mount({ pathname: '/p/ARI/a/ARI-BUG-0001' });
    await heading('ARI-BUG-0001');
    expect(screen.queryByRole('navigation', { name: 'Navigation depuis l’origine' })).not.toBeInTheDocument();
    await userEvent.keyboard('j');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/a/ARI-BUG-0001'));
  });

  it('refuse une origine qui sortirait de l’application', () => {
    expect(originOf({ state: { from: { href: '//exemple.org/x', label: 'x' } } })).toBeNull();
    expect(originOf({ state: { from: { href: 'https://exemple.org', label: 'x' } } })).toBeNull();
    expect(originOf({ state: { from: { href: '/p/ARI/recherche', label: 'R', keys: ['A', 3] } } })).toEqual({ href: '/p/ARI/recherche', label: 'R', keys: ['A'] });
  });
});
