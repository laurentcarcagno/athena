import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { AuthenticatedApp } from './App';
import { setLocale } from './i18n';
import { parseColumns } from './pages/ProjectManagePage';

const calls: Array<{ method: string; url: string; body: unknown }> = [];
let routes: Array<[string, RegExp, unknown]> = [];

beforeEach(() => {
  calls.length = 0;
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const hit = routes.find(([m, re]) => m === method && re.test(input));
    return new Response(hit ? JSON.stringify(hit[2]) : JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: hit ? 200 : 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); setLocale('fr'); });

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Uma', email: null, roles, groups: [] } });
const app = (path: string, roles: string[]) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const nav = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('saisie des colonnes d’un board', () => {
  it('lit « nom=statuts|limite » ligne par ligne', () => {
    expect(parseColumns('À faire=open\nEn cours=in_progress,in_review|3\n\n')).toEqual([
      { name: 'À faire', statuses: ['open'] },
      { name: 'En cours', statuses: ['in_progress', 'in_review'], wipLimit: 3 },
    ]);
  });
  it('ignore une limite invalide', () => {
    expect(parseColumns('A=x|abc')[0]).toEqual({ name: 'A', statuses: ['x'] });
  });
});

describe('fenêtres par rôle', () => {
  it('l’utilisateur voit Mon travail mais ni Organisation ni Gestion de projet', async () => {
    routes.push(['GET', /\/v1\/projects$/, []]);
    app('/p/ARI', ['athena-user']);
    expect(nav()).toEqual(expect.arrayContaining(['Mon travail', 'Recherche']));
    expect(nav()).not.toContain('Organisation');
    expect(nav()).not.toContain('Gestion de projet');
  });

  it('le chef de projet ne voit ni Organisation ni Administration', () => {
    routes.push(['GET', /\/v1\/projects$/, []]);
    app('/p/ARI', ['athena-user', 'athena-pm']);
    expect(nav()).toContain('Mon travail');
    expect(nav()).not.toContain('Organisation');
    expect(nav()).not.toContain('Administration');
  });

  it('l’administrateur voit Organisation et Administration', () => {
    routes.push(['GET', /\/v1\/projects$/, []]);
    app('/p/ARI', ['athena-user', 'athena-admin']);
    expect(nav()).toEqual(expect.arrayContaining(['Organisation', 'Administration']));
  });

  it('refuse la gestion de projet à un simple utilisateur', () => {
    app('/p/ARI/manage', ['athena-user']);
    expect(screen.getByText('Réservé aux chefs de projet et aux administrateurs.')).toBeInTheDocument();
  });

  it('refuse l’administration de l’organisation à un chef de projet', () => {
    app('/org', ['athena-user', 'athena-pm']);
    expect(screen.getByText('Réservé aux administrateurs.')).toBeInTheDocument();
  });

  it('l’administrateur crée un projet puis nomme un chef de projet', async () => {
    routes.push(['GET', /\/v1\/users$/, [{ subject: 's1', username: 'pm.dev', displayName: 'Chef Projet', email: null }]]);
    routes.push(['GET', /\/v1\/projects$/, [{ key: 'ARI', name: 'Ariane' }]]);
    routes.push(['GET', /\/v1\/projects\/ARI\/members$/, []]);
    routes.push(['POST', /\/v1\/projects$/, {}]);
    routes.push(['PUT', /\/members\/s1$/, []]);
    app('/org', ['athena-user', 'athena-admin']);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Clé du projet (2 à 10 majuscules)'), 'pay');
    await user.type(screen.getByLabelText('Nom du projet'), 'Paiement');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/projects'))?.body).toEqual({ key: 'PAY', name: 'Paiement' }));
    await user.selectOptions(await screen.findByLabelText('Nommer chef de projet'), 's1');
    await user.click(screen.getAllByRole('button', { name: 'Nommer chef de projet' })[0]!);
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ role: 'manager' }));
  });
});
