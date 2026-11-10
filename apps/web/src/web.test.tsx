import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, UnauthorizedError, api, loadSession } from './api';
import { ArtifactPage, parseValue } from './pages/ArtifactPage';
import { BoardPage } from './pages/BoardPage';
import { ListPage, joinOrder, splitOrder } from './pages/ListPage';
import { ProjectsPage } from './pages/ProjectsPage';

type Handler = (url: string, init: RequestInit) => { status?: number; body?: unknown } | undefined;
const calls: Array<{ method: string; url: string; body: unknown; headers: Record<string, string> }> = [];
let handlers: Handler[] = [];

function mockFetch() {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init.method ?? 'GET', url: input, body, headers: (init.headers ?? {}) as Record<string, string> });
    for (const handler of handlers) {
      const hit = handler(input, init);
      if (hit) return new Response(hit.status === 204 ? null : JSON.stringify(hit.body ?? {}), { status: hit.status ?? 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
}
const route = (method: string, path: RegExp | string, reply: { status?: number; body?: unknown } | (() => { status?: number; body?: unknown })): Handler =>
  (url, init) => ((init.method ?? 'GET') === method && (typeof path === 'string' ? url === path : path.test(url)) ? (typeof reply === 'function' ? reply() : reply) : undefined);

beforeEach(() => { handlers = []; mockFetch(); });
afterEach(() => vi.unstubAllGlobals());

describe('client API', () => {
  it('ajoute le jeton CSRF aux écritures uniquement, après chargement de la session', async () => {
    handlers = [route('GET', '/auth/session', { body: { authenticated: true, csrf: 'jeton-csrf' } }), route('GET', '/v1/x', { body: {} }), route('POST', '/v1/x', { body: {} })];
    await loadSession();
    await api('GET', '/v1/x');
    await api('POST', '/v1/x', { a: 1 });
    expect(calls[1]!.headers['X-CSRF-Token']).toBeUndefined();
    expect(calls[2]!.headers['X-CSRF-Token']).toBe('jeton-csrf');
  });
  it('signale session expirée et erreurs détaillées', async () => {
    handlers = [route('GET', '/v1/a', { status: 401 }), route('POST', '/v1/b', { status: 422, body: { error: 'validation', message: 'Données invalides.', details: ['title : obligatoire'] } })];
    await expect(api('GET', '/v1/a')).rejects.toBeInstanceOf(UnauthorizedError);
    const error = await api('POST', '/v1/b', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).readable).toBe('Données invalides. title : obligatoire');
  });
});

describe('utilitaires', () => {
  it('sépare et recompose la clause ORDER BY', () => {
    expect(splitOrder('status = open ORDER BY key DESC')).toEqual({ where: 'status = open', order: { field: 'key', dir: 'desc' } });
    expect(splitOrder('status = open')).toEqual({ where: 'status = open', order: null });
    expect(joinOrder('status = open', { field: 'key', dir: 'asc' })).toBe('status = open ORDER BY key asc');
    expect(joinOrder('', { field: 'key', dir: 'asc' })).toBe('ORDER BY key asc');
  });
  it('convertit la saisie selon le type de champ', () => {
    const field = (type: string) => ({ id: '1', key: 'k', label: 'K', type, config: {}, required: false, semanticRole: null });
    expect(parseValue(field('number'), '12')).toBe(12);
    expect(parseValue(field('text'), '  ')).toBeNull();
    expect(parseValue(field('multiselect'), 'a, b')).toEqual(['a', 'b']);
  });
});

const hit = (key: string, status: string, category: string, title: string) => ({ key, tracker: 'BUG', status, category, version: 1, updatedAt: '2026-10-31T10:00:00.000Z', values: { title } });
const renderAt = (path: string, element: JSX.Element, pattern: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /></Routes></MemoryRouter>
    </ToastProvider>,
  );

describe('page de recherche', () => {
  it('affiche les résultats avec clés en mono et pastilles de statut', async () => {
    handlers = [route('GET', /\/search\?/, { body: { total: 2, hits: [hit('BUG-1', 'open', 'todo', 'Crash'), hit('BUG-2', 'done', 'done', 'Lent')] } })];
    renderAt('/p/ARI', <ListPage />, '/p/:project');
    expect(await screen.findByText('Crash')).toBeInTheDocument();
    expect(screen.getByText('BUG-1')).toHaveClass('ath-mono');
    expect(screen.getByText('2 résultats')).toBeInTheDocument();
    expect(screen.getByText('done').closest('.ath-pill')).toHaveClass('ath-pill--success');
  });
  it('trie par colonne en modifiant la requête ATQL', async () => {
    handlers = [route('GET', /\/search\?/, { body: { total: 1, hits: [hit('BUG-1', 'open', 'todo', 'Crash')] } })];
    renderAt('/p/ARI?q=status%20%3D%20open', <ListPage />, '/p/:project');
    await screen.findByText('Crash');
    await userEvent.click(screen.getByRole('columnheader', { name: /Clé/ }));
    await waitFor(() => expect(calls.at(-1)!.url).toContain(encodeURIComponent('status = open ORDER BY key asc')));
  });
  it('affiche l’erreur de syntaxe ATQL et l’état vide', async () => {
    handlers = [route('GET', /\/search\?/, { status: 422, body: { error: 'validation', message: 'Données invalides.', details: ['Valeur attendue (position 8)'] } })];
    renderAt('/p/ARI?q=status%20%3D', <ListPage />, '/p/:project');
    expect(await screen.findByRole('alert')).toHaveTextContent('Valeur attendue');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ total: 0, hits: [] }), { status: 200 })));
    render(<ToastProvider><MemoryRouter initialEntries={['/p/ARI?q=x%20%3D%201']}><Routes><Route path="/p/:project" element={<ListPage />} /></Routes></MemoryRouter></ToastProvider>);
    expect(await screen.findByText('Aucun ticket ne correspond à la requête.')).toBeInTheDocument();
  });
});

const definition = {
  key: 'BUG', name: 'Bugs',
  fields: [
    { id: 'f1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: 'f2', key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure'] }, required: false, semanticRole: null },
  ],
  statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }, { id: 's2', key: 'doing', name: 'En cours', category: 'in_progress' }],
  transitions: [{ id: 't1', name: 'Démarrer', fromStatusId: 's1', toStatusId: 's2' }, { id: 't2', name: 'Revue', fromStatusId: 's2', toStatusId: 's1' }],
};
function artifactHandlers(extra: Handler[] = []) {
  handlers = [
    ...extra,
    route('GET', '/v1/projects/ARI/artifacts/BUG-1', { body: { id: 'a1', key: 'BUG-1', trackerKey: 'BUG', status: 'open', version: 1, values: { title: 'Crash', severity: 'mineure' } } }),
    route('GET', '/v1/projects/ARI/trackers/BUG', { body: definition }),
    route('GET', /\/links$/, { body: [{ id: 'l1', type: 'verifies', direction: 'outward', label: 'vérifie', other: 'REQ-1', suspect: true }] }),
    route('GET', /\/doc-links$/, { body: [] }),
    route('GET', /\/comments$/, { body: [{ id: 'c1', author: 'u1', body: 'Premier commentaire', createdAt: '2026-10-31T10:00:00.000Z' }] }),
    route('GET', /\/history$/, { body: [{ version: 1, actor: 'Alice Martin', at: '2026-10-31T10:00:00.000Z', gitSha: 'abcdef1234567890', diff: { title: { from: null, to: 'Crash' } } }] }),
    route('GET', /\/code-refs$/, { body: [{ kind: 'mr', ref: '7', title: 'Fixes BUG-1', state: 'opened', pipeline: 'failed' }] }),
  ];
}
const session = { authenticated: true, user: { username: 'alice', name: 'Alice', email: null, roles: ['athena-user'], groups: [] } };

describe('fiche d’ticket', () => {
  it('propose les transitions du workflow et les applique avec la version courante', async () => {
    artifactHandlers([route('POST', /\/transitions$/, { body: { status: 'doing', version: 2 } })]);
    renderAt('/p/ARI/a/BUG-1', <ArtifactPage session={session} />, '/p/:project/a/:key');
    expect(await screen.findByRole('heading', { level: 1, name: /BUG-1 · Crash/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revue' })).not.toBeInTheDocument(); // transition d’un autre état
    await userEvent.click(screen.getByRole('button', { name: 'Démarrer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/transitions'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/transitions'))!.body).toEqual({ name: 'Démarrer', version: 1 });
    expect(await screen.findByText('Transition « Démarrer » appliquée.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Revue' })).toBeInTheDocument();
  });
  it('enregistre un champ modifié et recharge après un conflit de version', async () => {
    artifactHandlers([route('PATCH', '/v1/projects/ARI/artifacts/BUG-1', { status: 409, body: { error: 'conflict', message: 'Version attendue 1, version courante 2.', details: [] } })]);
    renderAt('/p/ARI/a/BUG-1', <ArtifactPage session={session} />, '/p/:project/a/:key');
    const title = await screen.findByLabelText('Titre (obligatoire)');
    await userEvent.clear(title);
    await userEvent.type(title, 'Nouveau titre');
    await userEvent.tab();
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ values: { title: 'Nouveau titre' }, version: 1 }));
    expect(await screen.findByText(/Version attendue 1, version courante 2/)).toBeInTheDocument();
  });
  it('affiche historique avec SHA en mono, liens suspects et références de code', async () => {
    artifactHandlers();
    renderAt('/p/ARI/a/BUG-1', <ArtifactPage session={session} />, '/p/:project/a/:key');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('tab', { name: 'Historique' }));
    expect(screen.getByText('abcdef12')).toHaveClass('ath-mono');
    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Liens' }));
    expect(screen.getByText('REQ-1')).toHaveClass('ath-mono');
    expect(screen.getByText('Suspect')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Développement' }));
    expect(screen.getByText('failed').closest('.ath-pill')).toHaveClass('ath-pill--danger');
  });
  it('ajoute un commentaire', async () => {
    artifactHandlers([route('POST', /\/comments$/, { status: 201, body: {} })]);
    renderAt('/p/ARI/a/BUG-1', <ArtifactPage session={session} />, '/p/:project/a/:key');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('tab', { name: 'Commentaires' }));
    expect(screen.getByText('Premier commentaire')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Commentaire'), 'Vu en prod');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/comments'))?.body).toEqual({ body: 'Vu en prod' }));
  });
});

describe('board et projets', () => {
  const board = {
    key: 'kanban', name: 'Kanban', unmapped: 0,
    columns: [
      { name: 'À faire', wipLimit: null, count: 1, overLimit: false, cards: [{ key: 'BUG-1', tracker: 'BUG', title: 'Crash', status: 'open', assignee: 'alice', version: 4 }] },
      { name: 'En cours', wipLimit: 1, count: 1, overLimit: false, cards: [] },
    ],
  };
  it('déplace une carte via le sélecteur accessible, avec sa version', async () => {
    handlers = [route('GET', '/v1/projects/ARI/boards/kanban', { body: board }), route('POST', /\/move$/, { body: {} })];
    renderAt('/p/ARI/board/kanban', <BoardPage session={session} />, '/p/:project/board/:board');
    await screen.findByText('Crash');
    await userEvent.selectOptions(screen.getByLabelText('Déplacer vers'), 'En cours');
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/move'))?.body).toEqual({ column: 'En cours', version: 4 }));
    expect(await screen.findByText('Carte déplacée.')).toBeInTheDocument();
  });
  it('affiche la limite WIP et le message d’erreur du serveur', async () => {
    handlers = [route('GET', '/v1/projects/ARI/boards/kanban', { body: board }), route('POST', /\/move$/, { status: 409, body: { error: 'conflict', message: 'Limite WIP atteinte pour « En cours » (1).', details: [] } })];
    renderAt('/p/ARI/board/kanban', <BoardPage session={session} />, '/p/:project/board/:board');
    await screen.findByText('Crash');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Déplacer vers'), 'En cours');
    expect(await screen.findByText(/Limite WIP atteinte/)).toBeInTheDocument();
  });
  it('liste les projets avec trackers et boards', async () => {
    handlers = [
      route('GET', '/v1/projects', { body: [{ key: 'ARI', name: 'Ariane' }] }),
      route('GET', '/v1/projects/ARI/trackers', { body: [{ key: 'BUG', name: 'Bugs', description: '', artifacts: 12 }] }),
      route('GET', '/v1/projects/ARI/boards', { body: [{ key: 'kanban', name: 'Kanban' }] }),
    ];
    renderAt('/', <ProjectsPage />, '/');
    const row = (await screen.findByText('Ariane')).closest('tr')!;
    expect(within(row).getByRole('link', { name: 'Kanban' })).toHaveAttribute('href', '/p/ARI/board/kanban');
    expect(within(row).getByRole('link', { name: 'Ariane' })).toHaveAttribute('href', '/p/ARI');
    expect(within(row).getByRole('button', { name: 'Replier les trackers de Ariane' })).toHaveAttribute('aria-expanded', 'true'); // un seul projet : déplié d’office
    const tracker = (await screen.findByRole('link', { name: 'Bugs' })).closest('tr')!;
    expect(within(tracker).getByText('12')).toHaveClass('ath-mono');
    expect(within(tracker).queryByText('BUG')).toBeNull(); // pas de tag de clé à côté du nom
  });
});
