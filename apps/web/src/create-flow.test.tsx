import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { targetOf } from './lib/create-target';

/** T-0111 : création contextuelle, sans quitter la page (ADR-0003 § 2.5). */
const calls: string[] = [];
const DEF = { key: 'BUG', name: 'Anomalies', typeKey: null, fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }], statuses: [{ id: 's', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [] };
beforeEach(() => {
  calls.length = 0;
  try { localStorage.clear(); } catch { /* sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${input}`);
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (method === 'POST' && /\/trackers\/BUG\/artifacts$/.test(input)) return ok({ id: 'n', key: 'ARI-BUG-0009', trackerKey: 'BUG', status: 'open', version: 1, values: { title: 'Nouveau' } }, 201);
    if (/\/v1\/me\/pins$/.test(input)) return ok({ favorites: [], recents: [] });
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers'] });
    if (/\/v1\/projects$/.test(input)) return ok([{ key: 'ARI', name: 'Ariane' }, { key: 'SAT', name: 'Satellite' }]);
    if (/\/v1\/projects\/(ARI|SAT)\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies' }]);
    if (/\/v1\/projects\/(ARI|SAT)\/trackers\/BUG$/.test(input)) return ok(DEF);
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/overview$/.test(input)) return ok({ trackers: [{ key: 'BUG', name: 'Anomalies', typeKey: null, category: 'other', artifacts: 0, mine: 0, lastActivity: null, statuses: [] }] });
    if (/\/(filters|boards)/.test(input) || /\/tracker-types$/.test(input)) return ok([]);
    if (/\/artifacts\/ARI-BUG-0009$/.test(input)) return ok({ id: 'n', key: 'ARI-BUG-0009', trackerKey: 'BUG', status: 'open', version: 1, values: { title: 'Nouveau' } });
    if (/\/artifacts\/[^/]+\/(links|doc-links|comments|history|code-refs)$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname}{l.search}</span>; }
const session: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const app = (path: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session} /></MemoryRouter></ToastProvider>);
const dialog = () => screen.findByRole('dialog', { name: 'Nouveau ticket' });
const where = () => screen.getByTestId('where').textContent;

describe('cible de création déduite de l’adresse', () => {
  it('globale hors projet, projet dans un projet, tracker sur un écran de tracker, sa configuration ou une fiche', () => {
    expect(targetOf('/me')).toEqual({ scope: 'global' });
    expect(targetOf('/p/ARI/activite')).toEqual({ scope: 'project', project: 'ARI' });
    expect(targetOf('/p/ARI/t/BUG/board')).toEqual({ scope: 'tracker', project: 'ARI', tracker: 'BUG' });
    expect(targetOf('/p/ARI/trackers/BUG/config')).toEqual({ scope: 'tracker', project: 'ARI', tracker: 'BUG' });
    expect(targetOf('/p/ARI/a/ARI-BUG-0002')).toEqual({ scope: 'tracker', project: 'ARI', tracker: 'BUG' });
  });
});

describe('« Créer » de la barre haute', () => {
  it('hors projet : choisir le projet puis le tracker, créer, rester sur la page ; le message ouvre le ticket', async () => {
    app('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Créer un ticket' }));
    const form = within(await dialog());
    await userEvent.selectOptions(await form.findByLabelText('Projet'), 'ARI');
    expect(await form.findByLabelText('Tracker')).toHaveValue('BUG');
    await userEvent.type(await form.findByLabelText('Titre (obligatoire)'), 'Nouveau');
    await userEvent.click(form.getByRole('button', { name: 'Créer le ticket' }));
    expect(await screen.findByText('ARI-BUG-0009 créé.')).toBeInTheDocument();
    expect(calls).toContain('POST /v1/projects/ARI/trackers/BUG/artifacts');
    expect(where()).toBe('/'); // on reste sur la page
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir ARI-BUG-0009' }));
    await waitFor(() => expect(where()).toBe('/p/ARI/a/ARI-BUG-0009'));
  });

  it('dans un projet : le projet est fixé, seul le tracker est à choisir', async () => {
    app('/p/ARI');
    await userEvent.click(await screen.findByRole('button', { name: 'Créer un ticket' }));
    const form = within(await dialog());
    expect(await form.findByLabelText('Tracker')).toHaveValue('BUG');
    expect(form.queryByLabelText('Projet')).not.toBeInTheDocument();
  });

  it('s’ouvre aussi par la touche N, jamais pendant une saisie', async () => {
    app('/p/ARI/recherche');
    const field = await screen.findByRole('textbox', { name: 'Requête ATQL' });
    await userEvent.type(field, 'n');
    expect(screen.queryByRole('dialog', { name: 'Nouveau ticket' })).not.toBeInTheDocument();
    field.blur();
    await userEvent.keyboard('n');
    expect(await dialog()).toBeInTheDocument();
  });
});

describe('après création, on reste dans la liste', () => {
  it('écran Tracker : « + Nouveau ticket » crée dans ce tracker, la liste se recharge et le ticket s’ouvre dans le panneau', async () => {
    app('/p/ARI/t/BUG/tableau');
    await userEvent.click(await screen.findByRole('button', { name: '+ Nouveau ticket' }));
    const form = within(await dialog());
    expect(await form.findByLabelText('Tracker')).toHaveValue('BUG');
    await userEvent.type(await form.findByLabelText('Titre (obligatoire)'), 'Nouveau');
    const searches = calls.filter((c) => c.includes('/search?')).length;
    await userEvent.click(form.getByRole('button', { name: 'Créer le ticket' }));
    await waitFor(() => expect(where()).toBe('/p/ARI/t/BUG/tableau?i=ARI-BUG-0009'));
    await waitFor(() => expect(calls.filter((c) => c.includes('/search?')).length).toBeGreaterThan(searches));
  });

  it('Recherche : « Nouveau ticket » crée dans le projet et reste sur la recherche, rechargée', async () => {
    app('/p/ARI/recherche?q=status%20%3D%20open');
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau ticket' }));
    const form = within(await dialog());
    await userEvent.type(await form.findByLabelText('Titre (obligatoire)'), 'Nouveau');
    const searches = calls.filter((c) => c.includes('/search?')).length;
    await userEvent.click(form.getByRole('button', { name: 'Créer le ticket' }));
    expect(await screen.findByText('ARI-BUG-0009 créé.')).toBeInTheDocument();
    expect(where()).toBe('/p/ARI/recherche?q=status%20%3D%20open');
    await waitFor(() => expect(calls.filter((c) => c.includes('/search?')).length).toBeGreaterThan(searches));
  });
});
