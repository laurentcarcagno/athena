import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { GlobalSearchPage, toggleClause } from './pages/GlobalSearchPage';

// T-0119 : recherche globale, filtres rapides en puces, ATQL, périmètre de projets, vues enregistrées.

const calls: Array<{ method: string; url: string; body: unknown }> = [];
let views: Array<{ id: string; name: string; query: string; projects: string[] }> = [];
const hits = [
  { key: 'ARI-BUG-0001', project: 'ARI', title: 'Crash', tracker: 'BUG', status: 'open', statusName: 'Ouvert', category: 'todo', values: {}, version: 1, updatedAt: '' },
  { key: 'NOVA-TSK-0002', project: 'NOVA', title: 'NOVA-TSK-0002', tracker: 'TSK', status: 'done', statusName: 'Terminé', category: 'done', values: {}, version: 1, updatedAt: '' },
];

beforeEach(() => {
  calls.length = 0;
  views = [{ id: 'v1', name: 'Mes ouverts NOVA', query: 'category != done', projects: ['NOVA'] }];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (method === 'POST') return ok({ id: 'v2' });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (/\/v1\/projects$/.test(input)) return ok([{ key: 'ARI', name: 'Ariane' }, { key: 'NOVA', name: 'Nova' }]);
    if (/\/v1\/searches$/.test(input)) return ok(views);
    if (/\/v1\/search\?/.test(input)) return ok({ total: 2, hits });
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { username: 'alice', name: 'Alice', email: null, roles: ['athena-user'], groups: [] } };
function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + decodeURIComponent(l.search.replace(/\+/g, ' '))}</span>; }
const page = (path = '/recherche') => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/recherche" element={<><GlobalSearchPage session={session} /><Where /></>} /><Route path="/p/:p/a/:k" element={<Where />} /></Routes></MemoryRouter></ToastProvider>,
);
const lastSearch = () => decodeURIComponent([...calls].reverse().find((c) => c.url.startsWith('/v1/search?'))!.url);

describe('recherche globale', () => {
  it('écrit les puces dans la requête ATQL : ajout, puis retrait', () => {
    expect(toggleClause('', 'category != done')).toBe('category != done');
    expect(toggleClause('category != done', 'updated > daysAgo(7)')).toBe('category != done AND updated > daysAgo(7)');
    expect(toggleClause('category != done AND updated > daysAgo(7)', 'category != done')).toBe('updated > daysAgo(7)');
  });

  it('montre les tickets de tous les projets, avec projet et lien vers la fiche', async () => {
    page();
    const link = await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(link).toHaveAttribute('href', '/p/ARI/a/ARI-BUG-0001');
    expect(screen.getByRole('link', { name: 'NOVA-TSK-0002' })).toHaveAttribute('href', '/p/NOVA/a/NOVA-TSK-0002');
    expect(lastSearch()).toMatch(/^\/v1\/search\?q=&limit=50&offset=0$/);
  });

  it('filtres rapides et périmètre de projets dans l’adresse et dans la requête', async () => {
    page();
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    const quick = screen.getByRole('group', { name: 'Filtres rapides' });
    await userEvent.click(within(quick).getByRole('button', { name: 'Mes tickets' }));
    await userEvent.click(within(quick).getByRole('button', { name: 'Ouverts' }));
    expect(within(quick).getByRole('button', { name: 'Ouverts' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(screen.getByRole('group', { name: 'Projets' })).getByRole('button', { name: 'NOVA' }));
    await waitFor(() => expect(lastSearch()).toContain('q=assignee = "alice" AND category != done&project=NOVA'));
    expect(screen.getByTestId('where')).toHaveTextContent('/recherche?q=assignee = "alice" AND category != done&p=NOVA');
    await userEvent.click(screen.getByRole('button', { name: 'Requête avancée (ATQL)' })); // T-0149 : l’ATQL complet est en requête avancée
    expect(screen.getByRole('textbox', { name: 'Requête ATQL' })).toHaveValue('assignee = "alice" AND category != done');
  });

  it('recherche simple (T-0149) : des mots deviennent text ~ « … » sans toucher aux puces ; une clé ouvre la fiche', async () => {
    page('/recherche?q=category != done');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Rechercher un ticket' }), 'bus CAN{enter}');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('q=category != done AND text ~ "bus CAN"'));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Rechercher un ticket' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Rechercher un ticket' }), 'sat1-bug-0002{enter}');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/SAT1/a/SAT1-BUG-0002'));
  });

  it('vues enregistrées : appliquer, enregistrer la recherche courante, supprimer après confirmation', async () => {
    page();
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.selectOptions(screen.getByLabelText('Vues enregistrées'), 'Mes ouverts NOVA');
    expect(screen.getByTestId('where')).toHaveTextContent('/recherche?q=category != done&p=NOVA');
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la vue' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(calls.at(-2)).toMatchObject({ method: 'DELETE', url: '/v1/searches/v1' }));

    views = [];
    await userEvent.click(within(screen.getByRole('group', { name: 'Filtres rapides' })).getByRole('button', { name: 'Modifiés depuis 7 jours' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la vue' }));
    const form = screen.getByRole('form', { name: 'Enregistrer la vue' });
    await userEvent.type(within(form).getByLabelText('Nom de la vue'), 'Récents NOVA');
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer la vue' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/v1/searches', body: { name: 'Récents NOVA', query: 'category != done AND updated > daysAgo(7)', projects: ['NOVA'] } }));
  });

  it('reste sans violation axe (WCAG A et AA)', async () => {
    const { container } = page();
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
