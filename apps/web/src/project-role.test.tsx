import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { forgetProjectRoles, useProjectManager, useProjectManagerState } from './lib/project-role';
import { SettingsPage } from './pages/SettingsPage';
import { TrackerCreatePage } from './pages/TrackerCreatePage';

// Un chef de projet n'agit que sur les projets dont il est responsable : les formulaires de gestion ne s'affichent pas ailleurs.

const session = (roles: string[], username = 'claire', id = 'sub-claire'): Session => ({ authenticated: true, user: { id, username, name: 'Claire', email: null, roles, groups: [] } });
let members: Array<{ subject: string; username: string; role: string }> = [];
let membersCalls = 0;

beforeEach(() => {
  members = [];
  membersCalls = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/members$/.test(input)) { membersCalls++; return ok(members); }
    return ok([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('responsable du projet', () => {
  it('l’administrateur l’est toujours, sans appel réseau ; un simple utilisateur, jamais', () => {
    expect(renderHook(() => useProjectManager('LUM', session(['athena-admin']))).result.current).toBe(true);
    expect(renderHook(() => useProjectManager('LUM', session(['athena-user']))).result.current).toBe(false);
    expect(renderHook(() => useProjectManagerState('LUM', session(['athena-qa', 'athena-user']))).result.current).toBe(false);
    expect(membersCalls).toBe(0);
  });

  it('un chef de projet l’est s’il est « manager » du projet, pas s’il en est un simple membre', async () => {
    members = [{ subject: 'sub-claire', username: 'claire', role: 'manager' }];
    const yes = renderHook(() => useProjectManagerState('LUM', session(['athena-pm', 'athena-user'])));
    expect(yes.result.current).toBeUndefined(); // en cours de chargement
    await waitFor(() => expect(yes.result.current).toBe(true));
    forgetProjectRoles();
    members = [{ subject: 'sub-claire', username: 'claire', role: 'member' }, { subject: 'sub-marc', username: 'marc', role: 'manager' }];
    const no = renderHook(() => useProjectManagerState('OTH', session(['athena-pm', 'athena-user'])));
    await waitFor(() => expect(no.result.current).toBe(false));
  });

  it('met la réponse en cache par projet et par personne', async () => {
    members = [{ subject: 'sub-claire', username: 'claire', role: 'manager' }];
    const first = renderHook(() => useProjectManagerState('LUM', session(['athena-pm'])));
    await waitFor(() => expect(first.result.current).toBe(true));
    const second = renderHook(() => useProjectManagerState('LUM', session(['athena-pm'])));
    expect(second.result.current).toBe(true); // immédiat, sans nouvel appel
    expect(membersCalls).toBe(1);
  });

  it('un échec de chargement vaut « pas responsable »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const r = renderHook(() => useProjectManagerState('LUM', session(['athena-pm'])));
    await waitFor(() => expect(r.result.current).toBe(false));
  });
});

const at = (path: string, route: string, ui: React.ReactElement) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={ui} /><Route path={`${route}/:section`} element={ui} /></Routes></MemoryRouter></ToastProvider>,
);

describe('formulaires masqués pour un chef de projet non responsable', () => {
  it('création de tracker : formulaire pour le responsable, message sinon', async () => {
    members = [{ subject: 'sub-claire', username: 'claire', role: 'manager' }];
    at('/p/LUM/trackers/new', '/p/:project/trackers/new', <TrackerCreatePage session={session(['athena-pm', 'athena-user'])} />);
    await waitFor(() => expect(screen.queryByRole('heading', { name: /Seuls un administrateur ou un chef de projet/ })).toBeNull());
  });

  it('création de tracker pour un chef de projet d’un autre projet : message, aucun formulaire', async () => {
    members = [{ subject: 'sub-claire', username: 'claire', role: 'member' }];
    at('/p/LUM/trackers/new', '/p/:project/trackers/new', <TrackerCreatePage session={session(['athena-pm', 'athena-user'])} />);
    expect(await screen.findByRole('heading', { name: /Seuls un administrateur ou un chef de projet/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Créer le tracker|Ajouter/ })).toBeNull();
  });

  it('Paramètres : le chef de projet non responsable ne garde que les approbations ; le responsable a les six sections', async () => {
    members = [{ subject: 'sub-claire', username: 'claire', role: 'member' }];
    const view = at('/p/LUM/parametres', '/p/:project/parametres', <SettingsPage session={session(['athena-pm', 'athena-user'])} />);
    await waitFor(() => expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Approbations']));
    view.unmount();
    forgetProjectRoles();
    members = [{ subject: 'sub-claire', username: 'claire', role: 'manager' }];
    at('/p/LUM/parametres/membres', '/p/:project/parametres/:section', <SettingsPage session={session(['athena-pm', 'athena-user'])} />);
    await waitFor(() => expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Membres', 'Trackers', 'Boards', 'Automatisations', 'Baselines', 'Approbations']));
  });

  it('Paramètres : pendant le chargement, ni message d’accès ni formulaire', () => {
    at('/p/LUM/parametres/trackers', '/p/:project/parametres/:section', <SettingsPage session={session(['athena-pm', 'athena-user'])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /réservée/ })).toBeNull();
  });
});
