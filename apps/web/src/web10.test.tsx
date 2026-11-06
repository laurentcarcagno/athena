import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

const calls: string[] = [];
const hit = (n: number, status = 'open') => ({ key: `ARI-BUG-${String(n).padStart(4, '0')}`, tracker: 'BUG', status, statusName: status === 'open' ? 'Ouvert' : 'En cours', category: status === 'open' ? 'todo' : 'in_progress', version: 1, updatedAt: '2026-11-05T10:00:00.000Z', values: { title: `Anomalie ${n}` } });
const def = {
  key: 'BUG', name: 'Anomalies', typeKey: 'bug',
  fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
  statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }, { id: 's2', key: 'in_progress', name: 'En cours', category: 'in_progress' }, { id: 's3', key: 'done', name: 'Fini', category: 'done' }],
  transitions: [],
};
const overview = { trackers: [{ key: 'BUG', name: 'Anomalies', typeKey: 'bug', category: 'development', artifacts: 40, mine: 0, lastActivity: null, statuses: [{ key: 'open', name: 'Ouvert', category: 'todo', count: 25 }, { key: 'in_progress', name: 'En cours', category: 'in_progress', count: 10 }, { key: 'done', name: 'Fini', category: 'done', count: 5 }] }] };

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${input}`);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/search\?/.test(input)) {
      const q = decodeURIComponent(/q=([^&]*)/.exec(input)![1]!);
      const offset = Number(/offset=(\d+)/.exec(input)?.[1] ?? '0');
      const inProgress = q.includes('status = in_progress');
      const hits = inProgress ? [hit(3, 'in_progress')] : Array.from({ length: 25 }, (_, i) => hit(offset + i + 1));
      return ok({ total: inProgress ? 1 : 40, hits });
    }
    if (/\/overview$/.test(input)) return ok(overview);
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning', 'activity', 'members'] });
    if (/\/trackers\/BUG$/.test(input)) return ok(def);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const Where = () => <span data-testid="where">{useLocation().pathname}{useLocation().search}</span>;
const app = (path: string, roles = ['athena-user']) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const lastSearch = () => decodeURIComponent([...calls].reverse().find((c) => c.includes('/search?'))!);

describe('écran Tracker', () => {
  it('affiche l’en-tête (nom, préfixe, total), le mini-workflow et les items du tracker seulement', async () => {
    app('/p/ARI/t/BUG/tableau');
    expect(await screen.findByRole('heading', { level: 1, name: 'Anomalies' })).toBeInTheDocument();
    expect(screen.getByText('ARI-BUG')).toHaveClass('ath-mono');
    expect(screen.getByText('40 items')).toBeInTheDocument();
    const workflow = screen.getByRole('list', { name: 'Workflow' });
    expect(within(workflow).getAllByRole('button').map((b) => b.textContent)).toEqual(['Ouvert 25', 'En cours 10', 'Fini 5']);
    expect(await screen.findByRole('link', { name: 'ARI-BUG-0001' })).toHaveAttribute('href', '/p/ARI/a/ARI-BUG-0001');
    expect(lastSearch()).toContain('q=tracker = BUG&limit=25&offset=0');
    expect(screen.getByRole('link', { name: 'Tableau' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '+ Nouvel item' })).toBeInTheDocument();
  });

  it('filtre sur un état du mini-workflow, puis retire le filtre', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'En cours 10' }));
    await screen.findByRole('link', { name: 'ARI-BUG-0003' });
    expect(lastSearch()).toContain('tracker = BUG AND status = in_progress');
    expect(screen.getByRole('button', { name: 'En cours 10' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('where')).toHaveTextContent('?s=in_progress');
    await userEvent.click(screen.getByRole('button', { name: 'En cours 10' }));
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(lastSearch()).toContain('q=tracker = BUG&');
  });

  it('trie par colonne et pagine, l’état restant dans l’adresse', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('columnheader', { name: /Clé/ }));
    await waitFor(() => expect(lastSearch()).toContain('ORDER BY key asc'));
    expect(screen.getByTestId('where')).toHaveTextContent('sort=key%3Aasc');
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await waitFor(() => expect(lastSearch()).toContain('offset=25'));
    expect(lastSearch()).toContain('ORDER BY key asc');
  });

  it('« + Nouvel item » ouvre la création sur ce tracker', async () => {
    app('/p/ARI/t/BUG/tableau');
    await userEvent.click(await screen.findByRole('button', { name: '+ Nouvel item' }));
    expect(await screen.findByLabelText('Titre (obligatoire)')).toBeInTheDocument();
    expect(calls).toContain('GET /v1/projects/ARI/trackers/BUG');
  });

  it('propose Configurer aux seuls administrateurs', async () => {
    const view = app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('heading', { level: 1, name: 'Anomalies' });
    expect(screen.queryByRole('button', { name: 'Configurer' })).not.toBeInTheDocument();
    view.unmount();
    app('/p/ARI/t/BUG/tableau', ['athena-user', 'athena-admin']);
    await userEvent.click(await screen.findByRole('button', { name: 'Configurer' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/trackers/BUG/config');
  });

  it('redirige un tracker sans vue ou une vue inconnue vers le Tableau', async () => {
    const first = app('/p/ARI/t/BUG');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau'));
    first.unmount();
    app('/p/ARI/t/BUG/inconnue');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau'));
  });

  it('la Recherche existante garde son tableau', async () => {
    app('/p/ARI/recherche?q=status%3Dopen');
    expect(await screen.findByRole('link', { name: 'ARI-BUG-0001' })).toBeInTheDocument();
    expect(lastSearch()).toContain('q=status=open');
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
