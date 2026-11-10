import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { entriesOf, pinHref } from './lib/pins';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let favorites: Array<Record<string, unknown>> = [];
let recents: Array<Record<string, unknown>> = [];
const pin = (id: string, kind: string, ref: string, label: string, project = 'ARI') => ({ id, kind, project, ref, label });
const views = [
  { id: 'v1', name: 'Bloquants', query: 'severity = majeure ORDER BY key desc', owner: 'x', shared: true, trackerKey: 'BUG', view: 'tableau', columns: null, isDefault: false },
  { id: 'v2', name: 'Privée', query: 'status = open', owner: 'u', shared: false, trackerKey: 'BUG', view: 'tableau', columns: null, isDefault: false },
];

beforeEach(() => {
  sent.length = 0;
  favorites = [];
  recents = [];
  try { localStorage.clear(); } catch { /* sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/v1\/me\/pins$/.test(input)) return ok({ favorites, recents });
    if (/\/v1\/me\/pins\//.test(input)) return new Response(null, { status: 204 });
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning', 'code', 'members'] });
    if (/\/v1\/projects\/ARI\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies', artifacts: 4 }, { key: 'REQ', name: 'Exigences', artifacts: 2 }]);
    if (/\/filters\?tracker=BUG$/.test(input)) return ok(views);
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/trackers\/BUG$/.test(input)) return ok({ key: 'BUG', name: 'Anomalies', typeKey: null, fields: [], statuses: [], transitions: [] });
    if (/\/overview$/.test(input)) return ok({ trackers: [] });
    if (/\/dashboard$/.test(input)) return ok({ byCategory: { todo: 0, in_progress: 0, done: 0 }, byTracker: [], distribution: null, recent: [] });
    if (/\/(velocity)$/.test(input)) return ok({ sprints: [], average: 0, forecast: 0 });
    if (/\/(flow|roadmap)/.test(input) || /\/v1\/projects$/.test(input) || /\/tracker-types$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const Where = () => <span data-testid="where">{useLocation().pathname}{useLocation().search}</span>;
const app = (path: string, roles = ['athena-user']) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const rail = () => screen.getByRole('navigation', { name: 'Navigation principale' });
const openFlyout = async (name: RegExp) => { await userEvent.click(await within(rail()).findByRole('button', { name })); return within(screen.getByRole('group', { name: /, liste$/ })); };
const groupTitles = () => within(rail()).queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('favoris et récents : adresses', () => {
  it('désigne chaque élément par une adresse stable', () => {
    expect(pinHref({ kind: 'project', project: 'ARI', ref: 'ARI', label: '' })).toBe('/p/ARI');
    expect(pinHref({ kind: 'tracker', project: 'ARI', ref: 'BUG', label: '' })).toBe('/p/ARI/t/BUG/tableau');
    expect(pinHref({ kind: 'view', project: 'ARI', ref: 'BUG:v1', label: '' })).toBe('/p/ARI/t/BUG/tableau?v=v1');
    expect(pinHref({ kind: 'item', project: 'ARI', ref: 'ARI-BUG-0001', label: '' })).toBe('/p/ARI/a/ARI-BUG-0001');
  });
  it('note le projet, le tracker et seulement les tickets à clé canonique', () => {
    expect(entriesOf('/p/ARI').map((e) => e.kind)).toEqual(['project']);
    expect(entriesOf('/p/ARI/t/BUG/tableau').map((e) => [e.kind, e.ref])).toEqual([['project', 'ARI'], ['tracker', 'BUG']]);
    expect(entriesOf('/p/ARI/a/ARI-BUG-0001').map((e) => e.kind)).toEqual(['project', 'item']);
    expect(entriesOf('/p/ARI/a/BUG-1').map((e) => e.kind)).toEqual(['project']); // ancienne clé : pas de doublon dans les récents
    expect(entriesOf('/me')).toEqual([]);
  });
});

describe('rail contextuel', () => {
  it('hors projet : seulement les entrées globales (et favoris / récents quand il y en a)', async () => {
    app('/');
    await screen.findByRole('heading', { level: 1 });
    expect(groupTitles()).toEqual([]);
    expect(within(rail()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Favoris (0)›', 'Récents (0)›', 'Projets', 'Mon travail', 'Recherche']);
  });

  it('dans un projet : la rubrique du projet (sections, trackers imbriqués) et les vues partagées sous le tracker ouvert seulement', async () => {
    app('/p/ARI/t/BUG/tableau');
    await within(rail()).findByRole('button', { name: 'Bloquants' });
    expect(groupTitles()).toEqual(['Projet ARI']);
    const labels = within(rail()).getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual([
      'Favoris (0)›', 'Récents (0)›', 'Projets', 'Mon travail', 'Recherche',
      // ADR-0003 : la navigation du projet est au rail ; Planification et Membres, réservés, n’apparaissent pas pour un simple membre
      'Vue d’ensemble', 'Backlog', 'Board', 'Trackers',
      'BUG · Anomalies', 'Bloquants', 'REQ · Exigences', // la vue partagée apparaît sous le tracker ouvert ; la vue personnelle n’y figure pas
      'Roadmap', 'Rapports', 'Recherche',
    ]);
    expect(within(rail()).getByRole('button', { name: 'BUG · Anomalies' })).toHaveAttribute('aria-current', 'page');
  });

  it('une vue du rail applique son filtre et son tri dans le tracker', async () => {
    app('/p/ARI/t/BUG/tableau');
    await userEvent.click(await within(rail()).findByRole('button', { name: 'Bloquants' }));
    await waitFor(() => expect(decodeURIComponent(screen.getByTestId('where').textContent!.replace(/\+/g, ' '))).toContain('f=severity = majeure'));
    expect(screen.getByTestId('where')).toHaveTextContent('sort=key%3Adesc');
    expect(screen.getByTestId('where')).not.toHaveTextContent('v=');
  });

  it('les favoris et les récents sont des menus latéraux, sans doublon', async () => {
    favorites = [pin('f1', 'project', 'ARI', 'ARI'), pin('f2', 'tracker', 'BUG', 'ARI · BUG')];
    recents = [pin('r1', 'item', 'ARI-BUG-0001', 'ARI-BUG-0001'), pin('r2', 'project', 'ARI', 'ARI')];
    app('/');
    const favs = await openFlyout(/^Favoris \(2\)/);
    expect(favs.getAllByRole('button', { name: (n) => !/^(Monter|Descendre)/.test(n) }).map((b) => b.textContent)).toEqual(['ARI', 'ARI · BUG']);
    expect(favs.getByRole('button', { name: 'Monter ARI' })).toBeDisabled();
    expect(favs.getByRole('button', { name: 'Descendre ARI · BUG' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: /, liste$/ })).toBeNull();
    const recent = await openFlyout(/^Récents \(1\)/); // le projet, déjà favori, n'est pas répété
    expect(recent.getAllByRole('button', { name: (n) => !/^(Monter|Descendre)/.test(n) }).map((b) => b.textContent)).toEqual(['ARI-BUG-0001']);
    expect(recent.getByRole('button', { name: 'ARI-BUG-0001' })).toHaveClass('ath-mono');
  });

  it('réordonne les favoris au clavier (boutons) et envoie l’ordre complet', async () => {
    favorites = [pin('f1', 'project', 'ARI', 'ARI'), pin('f2', 'tracker', 'BUG', 'ARI · BUG')];
    app('/');
    const favs = await openFlyout(/^Favoris/);
    await userEvent.click(favs.getByRole('button', { name: 'Descendre ARI' }));
    await waitFor(() => expect(sent.find((s) => s.url.endsWith('/order'))?.body).toEqual({ ids: ['f2', 'f1'] }));
  });

  it('un favori mène à sa page et ferme le menu', async () => {
    favorites = [pin('f1', 'view', 'BUG:v1', 'Bloquants')];
    app('/');
    const favs = await openFlyout(/^Favoris/);
    await userEvent.click(favs.getByRole('button', { name: 'Bloquants' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau'));
    expect(screen.queryByRole('group', { name: /, liste$/ })).toBeNull();
  });

  it('note les ouvertures : projet puis tracker, une seule fois chacun', async () => {
    app('/p/ARI/t/BUG/tableau');
    await waitFor(() => expect(sent.filter((s) => s.url.endsWith('/visit')).map((s) => (s.body as { kind: string }).kind)).toEqual(['project', 'tracker']));
    expect(sent.find((s) => s.url.endsWith('/visit') && (s.body as { kind: string }).kind === 'tracker')!.body).toEqual({ kind: 'tracker', project: 'ARI', ref: 'BUG', label: 'ARI · BUG' });
  });

  it('épingle et désépingle le tracker', async () => {
    app('/p/ARI/t/BUG/tableau');
    const button = await screen.findByRole('button', { name: 'Épingler' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    await waitFor(() => expect(sent.find((s) => s.url.endsWith('/favorite'))?.body).toEqual({ kind: 'tracker', project: 'ARI', ref: 'BUG', label: 'ARI · BUG', favorite: true }));
  });

  it('se replie et se déplie, l’état étant mémorisé', async () => {
    const first = app('/');
    const toggle = await screen.findByRole('button', { name: 'Replier le rail' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Déplier le rail' })).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('athena.rail.collapsed')).toBe('1');
    first.unmount();
    app('/');
    expect(await screen.findByRole('button', { name: 'Déplier le rail' })).toBeInTheDocument();
  });

  it('n’a aucune violation d’accessibilité', async () => {
    favorites = [pin('f1', 'project', 'ARI', 'ARI')];
    recents = [pin('r1', 'item', 'ARI-BUG-0001', 'ARI-BUG-0001')];
    const { container } = app('/p/ARI/t/BUG/tableau');
    await openFlyout(/^Favoris/);
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('tiroir mobile du rail (constat F-09)', () => {
  const menu = () => screen.getByRole('button', { name: 'Menu' });
  const drawer = () => document.getElementById('rail')!;

  it('le bouton Menu ouvre le rail : le focus entre dans le tiroir, la page derrière devient inerte', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('heading', { level: 1, name: 'BUG' }).catch(() => screen.findByRole('heading', { level: 1 }));
    expect(menu()).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).toHaveAttribute('aria-controls', 'rail');
    await userEvent.click(menu());
    expect(menu()).toHaveAttribute('aria-expanded', 'true');
    expect(drawer()).toHaveClass('ath-sidebar--open');
    expect(drawer().contains(document.activeElement)).toBe(true);
    expect(document.getElementById('contenu')).toHaveAttribute('inert');
    expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument();
  });

  it('Échap ferme le tiroir et rend le focus au bouton Menu', async () => {
    app('/');
    await userEvent.click(menu());
    await userEvent.keyboard('{Escape}');
    expect(menu()).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).toHaveFocus();
    expect(document.getElementById('contenu')).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument();
  });

  it('un clic sur le fond ferme le tiroir', async () => {
    app('/');
    await userEvent.click(menu());
    await userEvent.click(screen.getByTestId('drawer-backdrop'));
    expect(menu()).toHaveAttribute('aria-expanded', 'false');
  });

  it('naviguer depuis le tiroir le ferme', async () => {
    app('/');
    await userEvent.click(menu());
    await userEvent.click(within(rail()).getByRole('button', { name: 'Projets' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/projets$/));
    expect(menu()).toHaveAttribute('aria-expanded', 'false');
  });

  it('Tab ne sort pas du tiroir : du dernier contrôle on revient au premier, et inversement avec Maj+Tab', async () => {
    app('/');
    await userEvent.click(menu());
    const controls = [...drawer().querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
    controls.at(-1)!.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(controls[0]);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(controls.at(-1));
  });
});

