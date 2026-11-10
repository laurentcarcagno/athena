import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { AuthenticatedApp } from './App';
import { setLocale } from './i18n';
import { SettingsPage } from './pages/SettingsPage';
import { suggest } from './pages/ListPage';
import { OrgAdminPage } from './pages/OrgAdminPage';

const calls: Array<{ method: string; url: string }> = [];
let routes: Array<[string, RegExp, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url: input });
    const hit = routes.find(([m, re]) => m === method && re.test(input));
    return new Response(hit && method !== 'DELETE' ? JSON.stringify(hit[2]) : null, { status: hit ? (method === 'DELETE' ? 204 : 200) : 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); setLocale('fr'); });
const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Uma', email: null, roles, groups: [] } });
const admin = session(['athena-user', 'athena-admin']);

describe('F-01 : confirmation avant suppression irréversible', () => {
  const templates = [
    { key: 'vide', name: 'Projet vide', description: '', builtin: true, trackers: [] },
    { key: 'mien', name: 'Mon modèle', description: '', builtin: false, trackers: [] },
  ];
  it('ne supprime rien tant que l’on n’a pas confirmé, et rien si l’on annule', async () => {
    routes.push(['GET', /\/v1\/users$/, []], ['GET', /\/v1\/projects$/, []], ['GET', /\/v1\/tracker-templates$/, []], ['GET', /\/v1\/project-templates$/, templates], ['DELETE', /\/project-templates\/mien$/, {}]);
    render(<ToastProvider><MemoryRouter><OrgAdminPage session={admin} /></MemoryRouter></ToastProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Templates' }));
    await user.click(await screen.findByRole('button', { name: 'Supprimer Mon modèle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer « mien »' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Supprimer Mon modèle' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/project-templates/mien'))).toBe(true));
  });
});

describe('F-13 : Paramètres réservés', () => {
  it('affiche le refus sans aucun appel réseau pour un simple utilisateur', () => {
    render(<ToastProvider><MemoryRouter initialEntries={['/p/ARI/parametres/automatisations']}><Routes><Route path="/p/:project/parametres/:section" element={<SettingsPage session={session(['athena-user'])} />} /></Routes></MemoryRouter></ToastProvider>);
    expect(screen.getByText(/Réservé aux administrateurs, aux chefs de projet/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('F-04 et F-12 : lien d’évitement et aide', () => {
  const app = (path: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={admin} /></MemoryRouter></ToastProvider>);
  it('le lien « Aller au contenu » est le premier élément focalisable et cible le contenu', async () => {
    routes.push(['GET', /\/v1\/projects$/, []]);
    app('/');
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(document.getElementById('contenu')).toHaveFocus();
  });
  it('l’aide est dans la navigation et liste les raccourcis', async () => {
    app('/help');
    expect(screen.getByRole('link', { name: 'Aide' })).toHaveAttribute('href', '/help'); // T-0123 : l'aide est au bas du rail, avec le profil
    expect((await screen.findAllByText('Ctrl+K')).length).toBeGreaterThan(0);
    expect(screen.getByText('status = in_progress')).toBeInTheDocument();
  });
});

describe('F-10 : suggestion des valeurs ATQL', () => {
  const values = { status: ['open', 'in_progress', 'done'], severity: ['mineure', 'majeure'], tracker: ['BUG', 'REQ'] };
  it('propose les clés de statut après « status = »', () => {
    expect(suggest('status = ', [], values).items).toEqual(['open', 'in_progress', 'done']);
    expect(suggest('status = in', [], values).items).toEqual(['in_progress']);
    expect(suggest('x = 1 AND severity = maj', [], values).items).toEqual(['majeure']);
  });
  it('sans valeur connue ou hors opérateur, reste sur les champs et mots-clés', () => {
    expect(suggest('titre = ', ['titre'], values).items).toEqual([]);
    expect(suggest('severity = majeure AND sta', ['status'], values).items).toContain('status');
  });
});
