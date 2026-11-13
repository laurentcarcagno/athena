import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { plainName } from './components/Rail';

// Audit des rôles : le rail ne se noie pas sous les trackers d'un gabarit (regroupés par métier, repliés), le nom perd son code.

const TRACKERS = [
  { key: 'SYS', name: 'Exigences système (RB, IRD)', typeKey: 'requirement', category: 'engineering' },
  { key: 'SRS', name: 'Exigences logicielles (TS)', typeKey: 'requirement', category: 'engineering' },
  { key: 'SDD', name: 'Conception (DDF)', typeKey: 'design', category: 'engineering' },
  { key: 'TSK', name: 'Tâches', typeKey: 'task', category: 'development' },
  { key: 'SPR', name: 'Anomalies logicielles (SPR)', typeKey: 'bug', category: 'development' },
  { key: 'VER', name: 'Vérification et validation (DJF)', typeKey: 'test', category: 'verification' },
  { key: 'RSK', name: 'Risques', typeKey: 'risk', category: 'management' },
  { key: 'MISC', name: 'Divers', typeKey: null, category: null },
];

beforeEach(() => {
  try { localStorage.clear(); } catch { /* sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/v1\/me\/pins$/.test(input)) return ok({ favorites: [], recents: [] });
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning'] });
    if (/\/v1\/projects\/LUM\/trackers$/.test(input)) return ok(TRACKERS);
    if (/\/trackers\/TSK$/.test(input)) return ok({ key: 'TSK', name: 'Tâches', typeKey: 'task', fields: [], statuses: [], transitions: [] });
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/overview$/.test(input)) return ok({ trackers: [] });
    if (/\/dashboard$/.test(input)) return ok({ byCategory: { todo: 0, in_progress: 0, done: 0 }, byTracker: [], distribution: null, recent: [] });
    if (/\/velocity$/.test(input)) return ok({ sprints: [], average: 0, forecast: 0 });
    return ok([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const app = (path: string, roles = ['athena-user']) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const rail = () => screen.getByRole('navigation', { name: 'Navigation principale' });
const labels = () => within(rail()).getAllByRole('button').map((b) => b.textContent);

describe('nom d’un tracker au rail', () => {
  it('retire le code entre parenthèses de fin, rien d’autre', () => {
    expect(plainName('Conception (DDF)')).toBe('Conception');
    expect(plainName('Exigences système (RB, IRD)')).toBe('Exigences système');
    expect(plainName('Tâches')).toBe('Tâches');
    expect(plainName('Version (1) de test (T)')).toBe('Version (1) de test');
    expect(plainName('(X)')).toBe('(X)'); // jamais un libellé vide
  });
});

describe('trackers regroupés par métier', () => {
  it('au-delà de cinq trackers : groupes repliés avec leur effectif, aucun tracker affiché', async () => {
    app('/p/LUM');
    await within(rail()).findByRole('button', { name: /Exigences et conception \(3\)/ });
    expect(labels()).toEqual(expect.arrayContaining(['Exigences et conception (3)▸', 'Développement (2)▸', 'Vérification et qualité (1)▸', 'Gestion (1)▸', 'Autres (1)▸']));
    expect(within(rail()).queryByRole('button', { name: 'Conception' })).toBeNull();
    expect(within(rail()).queryByRole('button', { name: 'Tâches' })).toBeNull();
    // les groupes se suivent dans un ordre fixe, sous « Trackers »
    const order = labels().filter((l) => /▸$/.test(l ?? ''));
    expect(order).toEqual(['Exigences et conception (3)▸', 'Développement (2)▸', 'Vérification et qualité (1)▸', 'Gestion (1)▸', 'Autres (1)▸']);
  });

  it('un groupe s’ouvre et se referme au clic, avec aria-expanded, sans changer de page', async () => {
    app('/p/LUM');
    const group = await within(rail()).findByRole('button', { name: /Exigences et conception/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(within(rail()).getByRole('button', { name: 'Exigences système' })).toBeInTheDocument();
    expect(within(rail()).getByRole('button', { name: 'Conception' })).toBeInTheDocument();
    expect(within(rail()).queryByRole('button', { name: 'Tâches' })).toBeNull(); // les autres groupes restent repliés
    await userEvent.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(within(rail()).queryByRole('button', { name: 'Conception' })).toBeNull();
  });

  it('le groupe du tracker ouvert est déplié et son tracker marqué comme page courante', async () => {
    app('/p/LUM/t/TSK/tableau');
    const task = await within(rail()).findByRole('button', { name: 'Tâches' });
    expect(task).toHaveAttribute('aria-current', 'page');
    expect(within(rail()).getByRole('button', { name: /Développement/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(rail()).getByRole('button', { name: /Exigences et conception/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('deux entrées de recherche distinctes : globale et projet', async () => {
    app('/p/LUM');
    await within(rail()).findByRole('button', { name: 'Chercher dans le projet' });
    expect(within(rail()).getByRole('button', { name: 'Recherche' })).toBeInTheDocument();
  });

  it('assurance produit seule : l’entrée Paramètres s’appelle Approbations', async () => {
    app('/p/LUM', ['athena-qa']);
    await waitFor(() => expect(within(rail()).getByRole('button', { name: 'Approbations' })).toBeInTheDocument());
    expect(within(rail()).queryByRole('button', { name: 'Paramètres' })).toBeNull();
  });

  it('un chef de projet garde Paramètres', async () => {
    app('/p/LUM', ['athena-pm', 'athena-user']);
    await waitFor(() => expect(within(rail()).getByRole('button', { name: 'Paramètres' })).toBeInTheDocument());
  });
});
