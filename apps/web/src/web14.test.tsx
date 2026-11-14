import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

const calls: string[] = [];
const node = (n: number, title: string, childCount = 0, extra: Record<string, unknown> = {}) => ({ key: `ARI-REQ-000${n}`, title, status: 'draft', statusName: 'Brouillon', category: 'todo', childCount, suspect: false, ...extra });
const TREE: Record<string, unknown[]> = {
  '': [node(1, 'Exigence mère', 2), node(5, 'Exigence seule', 0, { suspect: true })],
  'ARI-REQ-0001': [node(2, 'Fille A', 1), node(3, 'Fille B', 1)],
  'ARI-REQ-0002': [node(4, 'Petite-fille', 0)],
  'ARI-REQ-0003': [node(4, 'Petite-fille', 0)],
};

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(input);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const tree = /\/trackers\/REQ\/tree(?:\?parent=([^&]*))?$/.exec(input);
    if (tree) { const items = TREE[decodeURIComponent(tree[1] ?? '')] ?? []; return ok({ items, total: items.length }); }
    if (/\/tracker-types$/.test(input)) return ok([{ key: 'requirement', name: 'Exigence', description: '', category: 'engineering', defaultViews: ['tableau', 'arbre'], baseFields: [], builtin: true, modified: false }]);
    if (/\/trackers\/REQ$/.test(input)) return ok({ key: 'REQ', name: 'Exigences', typeKey: 'requirement', fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }], statuses: [{ id: 's', key: 'draft', name: 'Brouillon', category: 'todo' }], transitions: [] });
    if (/\/artifacts\/ARI-REQ-\d{4}$/.test(input)) return ok({ id: 'a', key: /(ARI-REQ-\d{4})$/.exec(input)![1], trackerKey: 'REQ', status: 'draft', version: 1, values: { title: 'Contenu' } });
    if (/\/artifacts\/[^/]+\/(links|doc-links|comments|history|code-refs)$/.test(input)) return ok([]);
    if (/\/overview$/.test(input)) return ok({ trackers: [{ key: 'REQ', name: 'Exigences', typeKey: 'requirement', category: 'engineering', artifacts: 5, mine: 0, lastActivity: null, statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo', count: 5 }] }] });
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/(modules)$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning'] });
    if (/\/(filters|boards)/.test(input) || /\/v1\/projects$/.test(input) || /\/trackers$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-team-member'], groups: [] } };
const Where = () => <span data-testid="where">{useLocation().pathname}{useLocation().search}</span>;
const app = (path: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session} /></MemoryRouter></ToastProvider>);
const items = () => screen.getAllByRole('treeitem');
const label = (el: HTMLElement) => `${within(el).queryAllByText(/^\d+(\.\d+)*$/)[0]?.textContent} ${within(el).queryAllByText(/^ARI-REQ-\d{4}$/)[0]?.textContent}`;

describe('vue Arbre', () => {
  it('propose la vue pour un type qui la déclare et affiche les racines numérotées, sans charger les enfants', async () => {
    app('/p/ARI/t/REQ/arbre');
    await screen.findByRole('tree', { name: 'Arbre des tickets' });
    expect(screen.getByRole('link', { name: 'Arbre' })).toHaveAttribute('aria-current', 'page');
    expect(items().map(label)).toEqual(['1 ARI-REQ-0001', '2 ARI-REQ-0005']);
    expect(items()[0]).toHaveAttribute('aria-expanded', 'false');
    expect(items()[1]).not.toHaveAttribute('aria-expanded'); // feuille
    expect(within(items()[1]!).getByText('Suspect')).toBeInTheDocument();
    expect(calls.filter((c) => /\/tree/.test(c))).toHaveLength(1); // seulement les racines
  });

  it('déplie un niveau à la demande, numérote les chapitres et montre un ticket à plusieurs parents sous chacun', async () => {
    app('/p/ARI/t/REQ/arbre');
    await screen.findByRole('tree');
    await userEvent.click(within(items()[0]!).getByText('▸'));
    await waitFor(() => expect(items()).toHaveLength(4));
    expect(items().map(label)).toEqual(['1 ARI-REQ-0001', '1.1 ARI-REQ-0002', '1.2 ARI-REQ-0003', '2 ARI-REQ-0005']);
    expect(items()[1]).toHaveAttribute('aria-level', '2');
    await userEvent.click(within(items()[1]!).getByText('▸'));
    await userEvent.click(within(items()[3]!).getByText('▸'));
    await waitFor(() => expect(items()).toHaveLength(6));
    expect(items().map(label)).toEqual(['1 ARI-REQ-0001', '1.1 ARI-REQ-0002', '1.1.1 ARI-REQ-0004', '1.2 ARI-REQ-0003', '1.2.1 ARI-REQ-0004', '2 ARI-REQ-0005']);
    expect(calls.filter((c) => /parent=ARI-REQ-0001/.test(c))).toHaveLength(1);
    await userEvent.click(within(items()[0]!).getByText('▾')); // replier cache toute la descendance
    await waitFor(() => expect(items()).toHaveLength(2));
  });

  it('se parcourt au clavier selon le motif ARIA tree', async () => {
    app('/p/ARI/t/REQ/arbre');
    await screen.findByRole('tree');
    items()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}'); // déplie
    await waitFor(() => expect(items()).toHaveLength(4));
    expect(items()[0]).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowRight}'); // entre dans le premier enfant
    expect(items()[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(items()[2]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}'); // feuille ou replié : remonte au parent
    expect(items()[0]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(items().at(-1)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(items()[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}'); // replie
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items().filter((i) => i.tabIndex === 0)).toHaveLength(1); // un seul arrêt de tabulation (tabindex itinérant)
  });

  it('Entrée ou un clic ouvre le panneau de détail du ticket, qui reste dans l’arbre', async () => {
    app('/p/ARI/t/REQ/arbre');
    await screen.findByRole('tree');
    items()[1]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('complementary', { name: 'Détail du ticket' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/REQ/arbre?i=ARI-REQ-0005');
    expect(items()[1]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(items()[0]!).getByText('Exigence mère'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('i=ARI-REQ-0001'));
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI/t/REQ/arbre');
    await screen.findByRole('tree');
    await userEvent.click(within(items()[0]!).getByText('▸'));
    await waitFor(() => expect(items()).toHaveLength(4));
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
