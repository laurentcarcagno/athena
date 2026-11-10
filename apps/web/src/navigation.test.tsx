import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

/**
 * Critère du lot 1 : tout item s'atteint en moins de 3 actions sans écrire de requête. Une « action » est un clic ou un
 * raccourci clavier ; la saisie d'une clé dans la palette compte pour une action (ce n'est pas une requête ATQL).
 */
const KEY = 'ARI-BUG-0002';
let favorites: Array<Record<string, unknown>> = [];

beforeEach(() => {
  favorites = [];
  try { localStorage.clear(); } catch { /* sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const hit = (n: number) => ({ key: `ARI-BUG-000${n}`, project: 'ARI', title: `Anomalie ${n}`, tracker: 'BUG', status: 'open', statusName: 'Ouvert', category: 'todo', version: 1, updatedAt: '2026-11-05T10:00:00.000Z', values: { title: `Anomalie ${n}` } });
    if (/\/v1\/me\/pins$/.test(input)) return ok({ favorites, recents: [] });
    if (/\/v1\/me\/pins\//.test(input)) return new Response(null, { status: 204 });
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning'] });
    if (/\/v1\/projects$/.test(input)) return ok([{ key: 'ARI', name: 'Ariane' }]);
    if (/\/v1\/projects\/ARI\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies', artifacts: 3 }]);
    if (/\/v1\/projects\/ARI\/boards$/.test(input)) return ok([]);
    if (/\/v1\/projects\/ARI\/trackers\/BUG$/.test(input)) return ok({ key: 'BUG', name: 'Anomalies', typeKey: null, fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }], statuses: [{ id: 's', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [] });
    if (/\/search\?/.test(input)) {
      const q = decodeURIComponent(input);
      return ok(q.includes('key =') ? { total: 1, hits: [hit(2)] } : { total: 3, hits: [hit(1), hit(2), hit(3)] });
    }
    if (/\/artifacts\/ARI-BUG-000\d$/.test(input)) { const n = /000(\d)$/.exec(input)![1]; return ok({ id: 'a', key: `ARI-BUG-000${n}`, trackerKey: 'BUG', status: 'open', version: 1, values: { title: `Anomalie ${n}` } }); }
    if (/\/artifacts\/[^/]+\/(links|doc-links|comments|history|code-refs)$/.test(input)) return ok([]);
    if (/\/overview$/.test(input)) return ok({ trackers: [{ key: 'BUG', name: 'Anomalies', typeKey: null, category: 'other', artifacts: 3, mine: 0, lastActivity: null, statuses: [{ key: 'open', name: 'Ouvert', category: 'todo', count: 3 }] }] });
    if (/\/(filters|boards)/.test(input) || /\/tracker-types$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const app = (path: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={session} /></MemoryRouter></ToastProvider>);
const shown = () => screen.findByRole('heading', { name: new RegExp(KEY) });

describe('accès à un ticket en moins de 3 actions, sans requête', () => {
  it('depuis « Mon travail » : Projets, le tracker, le ticket (3 actions)', async () => {
    app('/me');
    await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Navigation principale' })).findByRole('button', { name: 'Projets' })); // 1
    await userEvent.click(await screen.findByRole('link', { name: /Anomalies/ })); // 2
    await userEvent.click(await screen.findByRole('link', { name: KEY })); // 3
    expect(await shown()).toBeInTheDocument();
  });

  it('avec un favori du rail : 2 actions', async () => {
    favorites = [{ id: 'f1', kind: 'item', project: 'ARI', ref: KEY, label: KEY }];
    app('/me');
    const nav = within(await screen.findByRole('navigation', { name: 'Navigation principale' }));
    await userEvent.click(await nav.findByRole('button', { name: /^Favoris/ })); // 1 : le menu latéral
    await userEvent.click(within(screen.getByRole('group', { name: /, liste$/ })).getByRole('button', { name: KEY })); // 2
    expect(await shown()).toBeInTheDocument();
  });

  it('depuis un projet, par la palette : Ctrl+K, puis la clé et Entrée (2 actions, T-0119)', async () => {
    app('/p/ARI');
    await userEvent.keyboard('{Control>}k{/Control}'); // 1
    const input = await screen.findByRole('combobox');
    await userEvent.type(input, KEY); // 2 : une clé, pas une requête…
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveTextContent(new RegExp(`^${KEY}`))); // le ticket, avant l'action « Rechercher… »
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}'); // … validée par Entrée : la clé exacte est en tête
    expect(await shown()).toBeInTheDocument();
  });

  it('hors projet aussi (Mon travail) : la palette cherche dans tous les projets (2 actions)', async () => {
    app('/me');
    await userEvent.keyboard('{Control>}k{/Control}'); // 1
    await userEvent.type(await screen.findByRole('combobox'), KEY); // 2
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveTextContent(new RegExp(`^${KEY}`))); // le ticket, avant l'action « Rechercher… »
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(await shown()).toBeInTheDocument();
  });

  it('depuis l’accueil du projet : Trackers au rail, le tracker, le ticket (3 actions), puis le fil d’Ariane ramène en 1', async () => {
    app('/p/ARI');
    await userEvent.click(await within(await screen.findByRole('group', { name: 'Projet ARI' })).findByRole('button', { name: 'Trackers' })); // 1
    await userEvent.click(await screen.findByRole('link', { name: 'Ouvrir Anomalies' })); // 2
    await userEvent.click(await screen.findByRole('link', { name: KEY })); // 3 (panneau de détail)
    expect(await shown()).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).getByRole('link', { name: 'ARI' })); // 1 action pour revenir au projet
    expect(await screen.findByRole('heading', { level: 1, name: /Vue d’ensemble · ARI/ })).toBeInTheDocument();
  });
});
