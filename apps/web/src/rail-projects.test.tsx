import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

// Projets est un menu comme Favoris et Récents : « Nouveau projet » d'abord, puis les projets ; favoris et récents montrent aussi le titre.

const PROJECTS = [{ key: 'ARI', name: 'Ariane' }, { key: 'LUMEN', name: 'LUMEN : nanosatellite d’observation de la Terre' }];
let favorites: Array<Record<string, unknown>> = [];
let recents: Array<Record<string, unknown>> = [];
let searches: string[] = [];
const pin = (id: string, kind: string, project: string, ref: string, label: string) => ({ id, kind, project, ref, label });

beforeEach(() => {
  favorites = [];
  recents = [];
  searches = [];
  try { localStorage.clear(); } catch { /* sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/v1\/me\/pins$/.test(input)) return ok({ favorites, recents });
    if (/\/v1\/projects$/.test(input)) return ok(PROJECTS);
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers'] });
    if (/\/v1\/projects\/ARI\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies logicielles (SPR)' }]);
    if (/\/v1\/projects\/LUMEN\/trackers$/.test(input)) return ok([{ key: 'RSK', name: 'Risques' }]);
    if (/\/me\/dashboard/.test(input)) return ok({ widgets: [], isDefault: true });
    if (/\/search\?/.test(input)) {
      searches.push(decodeURIComponent(input));
      return ok({ total: 1, hits: [{ key: 'LUMEN-TSK-0007', title: 'Modèle thermique 1D du satellite', tracker: 'TSK', status: 'todo', statusName: 'À faire', category: 'todo', values: {}, version: 1, updatedAt: '2026-11-13T10:00:00Z' }] });
    }
    if (/\/overview$/.test(input)) return ok({ trackers: [] });
    if (/\/dashboard$/.test(input)) return ok({ byCategory: { todo: 0, in_progress: 0, done: 0 }, byTracker: [], distribution: null, recent: [] });
    return ok([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;
const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const app = (path: string, roles = ['athena-team-member']) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const rail = () => screen.getByRole('navigation', { name: 'Navigation principale' });
const menu = async (name: RegExp) => { await userEvent.click(await within(rail()).findByRole('button', { name })); return within(screen.getByRole('group', { name: /, liste$/ })); };

describe('menu Projets', () => {
  it('administrateur : « Nouveau projet » en première option, puis les projets (clé et nom), puis la liste complète', async () => {
    app('/', ['athena-team-member', 'athena-admin']);
    const list = await menu(/^Projets \(2\)/);
    expect(list.getAllByRole('button').map((b) => b.textContent)).toEqual(['Nouveau projet', 'ARI Ariane', 'LUMEN LUMEN : nanosatellite d’observation de la Terre', 'Tous les projets']);
  });

  it('« Nouveau projet » mène à la création de projet (Administration)', async () => {
    app('/', ['athena-team-member', 'athena-admin']);
    await userEvent.click((await menu(/^Projets/)).getByRole('button', { name: 'Nouveau projet' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/admin'));
  });

  it('un projet du menu ouvre ce projet, et le menu se referme', async () => {
    app('/');
    await userEvent.click((await menu(/^Projets/)).getByRole('button', { name: /^LUMEN/ }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/LUMEN'));
    expect(screen.queryByRole('group', { name: /, liste$/ })).toBeNull();
  });

  it('sans droit de création : pas de « Nouveau projet », mais la liste des projets', async () => {
    app('/');
    const list = await menu(/^Projets \(2\)/);
    expect(list.queryByRole('button', { name: 'Nouveau projet' })).toBeNull();
    expect(list.getAllByRole('button').map((b) => b.textContent)).toEqual(['ARI Ariane', 'LUMEN LUMEN : nanosatellite d’observation de la Terre', 'Tous les projets']);
  });

  it('« Tous les projets » ouvre la page des projets', async () => {
    app('/');
    await userEvent.click((await menu(/^Projets/)).getByRole('button', { name: 'Tous les projets' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/projets'));
  });

  it('le menu a un nom accessible et se ferme avec Échap', async () => {
    app('/');
    const toggle = await within(rail()).findByRole('button', { name: /^Projets \(2\)/ });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('titres des favoris et des récents', () => {
  it('projet, tracker et ticket : l’identifiant, puis le titre en clair', async () => {
    favorites = [pin('f1', 'project', 'LUMEN', 'LUMEN', 'LUMEN'), pin('f2', 'tracker', 'ARI', 'BUG', 'ARI · BUG')];
    recents = [pin('r1', 'item', 'LUMEN', 'LUMEN-TSK-0007', 'LUMEN-TSK-0007')];
    app('/');
    const fav = await menu(/^Favoris \(2\)/);
    await waitFor(() => expect(fav.getAllByRole('button', { name: (n) => !/^(Monter|Descendre)/.test(n) }).map((b) => b.textContent)).toEqual([
      'LUMEN LUMEN : nanosatellite d’observation de la Terre', 'ARI · BUG Anomalies logicielles',
    ]));
    await userEvent.keyboard('{Escape}');
    const rec = await menu(/^Récents \(1\)/);
    await waitFor(() => expect(rec.getAllByRole('button').map((b) => b.textContent)).toEqual(['LUMEN-TSK-0007 Modèle thermique 1D du satellite']));
    const titleSearches = searches.filter((q) => q.includes('key IN'));
    expect(titleSearches).toHaveLength(1); // une seule recherche par projet pour les titres des tickets
    expect(titleSearches[0]).toContain('key IN ("LUMEN-TSK-0007")');
  });

  it('sans titre connu, l’identifiant seul', async () => {
    favorites = [pin('f1', 'project', 'ZZZ', 'ZZZ', 'ZZZ')];
    app('/');
    const fav = await menu(/^Favoris \(1\)/);
    expect(fav.getAllByRole('button', { name: (n) => !/^(Monter|Descendre)/.test(n) }).map((b) => b.textContent)).toEqual(['ZZZ']);
  });
});
