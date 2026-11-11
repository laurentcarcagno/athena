import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { whoOf } from './components/AccessNotice';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TrackerCreatePage } from './pages/TrackerCreatePage';

/** T-0144 (ADR-0005) : une page ou une section non autorisée dit qui peut agir et comment revenir ; plus de bascule silencieuse. */
const as = (...roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'U', email: null, roles, groups: [] } });
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (/\/modules$/.test(input)) return new Response(JSON.stringify({ modules: ['traceability', 'activity'] }), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const at = (path: string, element: JSX.Element, pattern: string) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /><Route path="*" element={<p>autre page</p>} /></Routes></MemoryRouter></ToastProvider>,
);

it('chef de projet sur la configuration d’un tracker : la section est dite réservée aux administrateurs, avec un retour', () => {
  at('/p/SAT1/parametres/trackers/BUG', <SettingsPage session={as('athena-user', 'athena-pm')} />, '/p/:project/parametres/:section/:tracker');
  expect(screen.getByRole('heading', { name: 'La section Trackers est réservée aux administrateurs.' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Retour aux paramètres' }).getAttribute('href')).toBe('/p/SAT1/parametres/membres');
  expect(screen.queryByText('autre page')).toBeNull();
});

it('membre sans aucune section : message et retour au projet', () => {
  at('/p/SAT1/parametres', <SettingsPage session={as('athena-user')} />, '/p/:project/parametres');
  expect(screen.getByRole('heading', { name: /réservés aux administrateurs, aux chefs de projet et à l’assurance qualité/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Retour au projet' }).getAttribute('href')).toBe('/p/SAT1');
});

it('rapport dont le module est inactif : message, et non l’Avancement à sa place', async () => {
  at('/p/SAT1/rapports/conformite', <ReportsPage session={as('athena-qa')} />, '/p/:project/rapports/:report');
  expect(await screen.findByRole('heading', { name: 'Le rapport Conformité n’est pas activé pour ce projet.' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Retour aux rapports' }).getAttribute('href')).toBe('/p/SAT1/rapports/avancement');
});

it('ajout de tracker sans être administrateur : qui peut le faire et retour aux trackers', () => {
  at('/p/SAT1/trackers/new', <TrackerCreatePage session={as('athena-user', 'athena-pm')} />, '/p/:project/trackers/new');
  expect(screen.getByRole('heading', { name: 'Seul un administrateur peut ajouter un tracker.' })).toBeTruthy();
  expect(screen.getByText(/Décrivez votre besoin à un administrateur/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Retour aux trackers' }).getAttribute('href')).toBe('/p/SAT1/trackers');
});

it('les rôles se disent en clair', () => {
  expect(whoOf(['athena-admin'])).toBe('aux administrateurs');
  expect(whoOf(['athena-admin', 'athena-pm', 'athena-qa'])).toBe('aux administrateurs, aux chefs de projet et à l’assurance qualité');
});
