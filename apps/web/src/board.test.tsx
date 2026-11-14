import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { CreateProvider } from './components/CreateArtifact';
import { BoardIndexPage, BoardPage, rememberBoard } from './pages/BoardPage';

// T-0114 : carte enrichie, clic = panneau, filtres rapides dans l'adresse, création par colonne, index des boards.

const card = (key: string, extra: Record<string, unknown> = {}) => ({
  key, tracker: 'BUG', trackerName: 'Anomalies', title: `Titre ${key}`, status: 'open', statusName: 'Ouvert', assignee: null, assigneeName: null,
  priority: null, priorityLabel: null, due: null, blocked: false, version: 1, ...extra,
});
const board = {
  key: 'kanban', name: 'Kanban', unmapped: 0, trackers: ['BUG'],
  columns: [
    { name: 'À faire', wipLimit: null, count: 2, overLimit: false, creatable: true, cards: [
      card('ARI-BUG-0001', { assignee: 'sub-u', assigneeName: 'Ulysse Dev', priority: 'majeure', priorityLabel: 'Sévérité', due: '2026-12-01', blocked: true }),
      card('ARI-BUG-0002', { title: 'Crash au démarrage' }),
    ] },
    { name: 'En cours', wipLimit: null, count: 1, overLimit: false, creatable: false, cards: [card('ARI-BUG-0003', { status: 'doing', statusName: 'En cours' })] },
  ],
};
const def = {
  key: 'BUG', name: 'Anomalies', typeKey: null,
  fields: [{ id: 'f1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
  statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/boards\/kanban$/.test(input)) return ok(board);
    if (/\/v1\/projects\/ARI\/boards$/.test(input)) return ok([{ key: 'kanban', name: 'Kanban', trackerKeys: ['BUG'] }]);
    if (/\/overview$/.test(input)) return ok({ trackers: [{ key: 'BUG', name: 'Anomalies', typeKey: null, category: 'development', artifacts: 3, mine: 0, lastActivity: null, statuses: [] }] });
    if (/\/sprint$/.test(input)) return ok({ sprint: null });
    const item = /\/artifacts\/([A-Z0-9-]+)$/.exec(input);
    if (item) return ok({ id: item[1], key: item[1], trackerKey: 'BUG', status: 'open', version: 1, values: { title: `Titre ${item[1]}` } });
    if (/\/trackers\/BUG$/.test(input)) return ok(def);
    if (/\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies' }]);
    if (/\/artifacts\/[^/]+\/(links|doc-links|comments|history|code-refs)$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { id: 'sub-u', username: 'ulysse', name: 'Ulysse', email: null, roles: ['athena-team-member'], groups: [] } } as Session;
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
const mount = (entry = '/p/ARI/board/kanban') => {
  const router = createMemoryRouter([
    { path: '/p/:project/board', element: <><BoardIndexPage /><Where /></> },
    { path: '/p/:project/board/:board', element: <CreateProvider><BoardPage session={session} /><Where /></CreateProvider> },
  ], { initialEntries: [entry] });
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  return router;
};
const column = (name: string) => screen.getByRole('region', { name });

describe('board : carte et panneau', () => {
  it('la carte montre type, priorité, échéance, responsable lisible et blocage', async () => {
    mount();
    const first = (await screen.findByText('Titre ARI-BUG-0001')).closest('article')!;
    expect(within(first).getByText('Anomalies')).toBeInTheDocument();
    expect(within(first).getByText('majeure')).toHaveAttribute('title', 'Sévérité');
    expect(within(first).getByText('01/12/2026').closest('.ath-mono')).toHaveClass('ath-mono');
    expect(within(first).getByText('Ulysse Dev')).toBeInTheDocument();
    expect(within(first).getByText('Bloqué')).toBeInTheDocument();
    expect(within(screen.getByText('Crash au démarrage').closest('article')!).queryByText('Bloqué')).not.toBeInTheDocument();
  });

  it('un clic sur la carte ouvre le panneau sans quitter le board ; Échap le ferme et garde les filtres', async () => {
    mount('/p/ARI/board/kanban?q=titre');
    await userEvent.click(await screen.findByRole('link', { name: 'ARI-BUG-0003' }));
    const panel = await screen.findByRole('complementary', { name: 'Détail du ticket' });
    expect(await within(panel).findByRole('heading', { level: 2, name: /ARI-BUG-0003/ })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/board/kanban?q=titre&i=ARI-BUG-0003');
    expect(column('À faire')).toBeInTheDocument(); // le board reste affiché
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Détail du ticket' })).not.toBeInTheDocument());
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/board/kanban?q=titre');
    await waitFor(() => expect(screen.getByRole('link', { name: 'ARI-BUG-0003' })).toHaveFocus());
  });

  it('« Déplacer vers » reste disponible au clavier sur chaque carte', async () => {
    mount();
    await screen.findByText('Crash au démarrage');
    expect(screen.getAllByLabelText('Déplacer vers')).toHaveLength(3);
  });
});

describe('board : filtres rapides dans l’adresse', () => {
  it('filtre par texte, « Mes tickets » et « Bloqués », et l’adresse porte les filtres', async () => {
    mount();
    await screen.findByText('Crash au démarrage');
    await userEvent.type(screen.getByLabelText('Filtrer les cartes (clé ou titre)'), 'crash');
    expect(screen.getByTestId('where')).toHaveTextContent('q=crash');
    expect(screen.queryByText('Titre ARI-BUG-0001')).not.toBeInTheDocument();
    expect(screen.getByText('Crash au démarrage')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Filtrer les cartes (clé ou titre)'));
    await userEvent.click(screen.getByRole('button', { name: 'Mes tickets' }));
    expect(screen.getByRole('button', { name: 'Mes tickets' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('where')).toHaveTextContent('moi=1');
    expect(screen.getByText('Titre ARI-BUG-0001')).toBeInTheDocument();
    expect(screen.queryByText('Crash au démarrage')).not.toBeInTheDocument();
  });

  it('applique les filtres de l’adresse à l’ouverture, et signale l’absence de résultat', async () => {
    mount('/p/ARI/board/kanban?bloques=1&q=inexistant');
    expect(await screen.findByText('Aucune carte ne correspond aux filtres.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Bloqués' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('les couloirs sont dans l’adresse et utilisent le nom lisible', async () => {
    mount('/p/ARI/board/kanban?couloir=assignee');
    expect(await screen.findByRole('region', { name: 'Ulysse Dev' })).toBeInTheDocument();
    expect(screen.getByLabelText('Couloirs')).toHaveValue('assignee');
  });
});

describe('board : création par colonne et index', () => {
  it('seule la colonne au statut initial propose « Créer », qui ouvre la création dans le tracker du board', async () => {
    mount();
    await screen.findByText('Crash au démarrage');
    expect(within(column('En cours')).queryByRole('button', { name: /Créer un ticket/ })).not.toBeInTheDocument();
    await userEvent.click(within(column('À faire')).getByRole('button', { name: 'Créer un ticket dans « À faire »' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('/p/:p/board présente les boards du projet et le board de chaque tracker en cartes (T-0150)', async () => {
    localStorage.removeItem('athena.lastBoard.ARI');
    mount('/p/ARI/board');
    expect(await within(await screen.findByRole('group', { name: 'Boards du projet' })).findByRole('link', { name: 'Ouvrir le board Kanban' })).toHaveAttribute('href', '/p/ARI/board/kanban');
    expect(within(await screen.findByRole('group', { name: 'Board de chaque tracker' })).getByRole('link', { name: 'Ouvrir le board Anomalies' })).toHaveAttribute('href', '/p/ARI/t/BUG/board');
  });
  it('Board mène au dernier board consulté ; « tous » affiche l’index (T-0150)', async () => {
    rememberBoard('ARI', '/p/ARI/board/kanban');
    mount('/p/ARI/board');
    expect(await screen.findByRole('heading', { level: 1, name: 'Kanban' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tous les boards' })).toHaveAttribute('href', '/p/ARI/board?tous=1');
    localStorage.removeItem('athena.lastBoard.ARI');
  });
});
