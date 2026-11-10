import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

/** T-0110 : navigation mobile. Le CSS n'est pas chargé ici : on vérifie la structure, les liens, le clavier et l'accessibilité. */
beforeEach(() => {
  try { localStorage.clear(); } catch { /* sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning', 'activity', 'members'] });
    if (/\/v1\/me\/pins$/.test(input)) return ok({ favorites: [], recents: [] });
    if (/\/v1\/projects$/.test(input)) return ok([{ key: 'ARI', name: 'Ariane' }]);
    if (/\/v1\/projects\/ARI\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies' }]);
    if (/\/overview$/.test(input)) return ok({ trackers: [] });
    if (/\/activity\?/.test(input)) return ok({ items: [], next: null, people: [] });
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/dashboard$/.test(input)) return ok({ byCategory: { todo: 0, in_progress: 0, done: 0 }, byTracker: [], distribution: null, recent: [] });
    if (/\/velocity$/.test(input)) return ok({ sprints: [], average: 0, forecast: 0 });
    if (/\/(flow|roadmap|filters|boards)/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const app = (path: string, roles = ['athena-user']) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>);
const picker = () => screen.findByRole('navigation', { name: 'Sections du projet ARI' });

describe('sélecteur de section du projet', () => {
  it('annonce le projet et la section courante, et liste les sections visibles en liens', async () => {
    app('/p/ARI/activite');
    const nav = within(await picker());
    const toggle = await nav.findByRole('button', { name: /ARI · Activité/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Simple membre : Planification et Membres, réservés, n'y figurent pas (même source que le rail)
    expect(nav.getAllByRole('link').map((l) => l.textContent)).toEqual(['Vue d’ensemble', 'Board', 'Trackers', 'Activité', 'Recherche']);
    expect(nav.getByRole('link', { name: 'Activité' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Trackers' })).toHaveAttribute('href', '/p/ARI/trackers');
  });

  it('mène à la section choisie et se referme', async () => {
    app('/p/ARI/activite');
    const nav = within(await picker());
    await userEvent.click(await nav.findByRole('button', { name: /ARI · Activité/ }));
    await userEvent.click(nav.getByRole('link', { name: 'Vue d’ensemble' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' })).toBeInTheDocument();
    expect(await nav.findByRole('button', { name: /ARI · Vue d’ensemble/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('se ferme sur Échap et rend le focus au bouton', async () => {
    app('/p/ARI');
    const toggle = await within(await picker()).findByRole('button', { name: /ARI · Vue d’ensemble/ });
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole('link', { name: 'Activité' })).not.toBeInTheDocument(); // liste refermée (le rail n'a que des boutons)
  });

  it('reste sur l’écran Tracker avec la section Trackers comme courante', async () => {
    app('/p/ARI/t/BUG/tableau');
    expect(await within(await picker()).findByRole('button', { name: /ARI · Trackers/ })).toBeInTheDocument();
  });

  it('n’existe pas hors d’un projet', async () => {
    app('/me');
    await screen.findByRole('navigation', { name: 'Navigation rapide' });
    expect(screen.queryByRole('navigation', { name: /^Sections du projet/ })).not.toBeInTheDocument();
  });
});

describe('barre basse', () => {
  it('propose Mon travail, Projets, Chercher et Menu, la page courante signalée', async () => {
    app('/me');
    const bar = within(await screen.findByRole('navigation', { name: 'Navigation rapide' }));
    expect(bar.getAllByRole('link').map((l) => l.textContent)).toEqual(['Mon travail', 'Projets']);
    expect(bar.getByRole('link', { name: 'Mon travail' })).toHaveAttribute('aria-current', 'page');
    expect(bar.getByRole('button', { name: 'Chercher' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-controls', 'rail');
  });

  it('« Chercher » ouvre la palette de commandes', async () => {
    app('/p/ARI');
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Navigation rapide' })).getByRole('button', { name: 'Chercher' }));
    const field = await screen.findByRole('combobox');
    await waitFor(() => expect(field).toHaveFocus()); // le clavier du téléphone s'affiche
  });

  it('« Menu » ouvre le tiroir ; Échap le ferme et rend le focus à Menu', async () => {
    app('/p/ARI');
    const menu = within(await screen.findByRole('navigation', { name: 'Navigation rapide' })).getByRole('button', { name: 'Menu' });
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(menu).toHaveAttribute('aria-expanded', 'false'));
    expect(menu).toHaveFocus();
  });
});

it('sélecteur et barre basse : aucune violation d’accessibilité', async () => {
  const { container } = app('/p/ARI');
  await userEvent.click(await within(await picker()).findByRole('button', { name: /ARI · Vue d’ensemble/ }));
  const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
});
