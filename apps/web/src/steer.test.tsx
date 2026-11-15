import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { primaryRole } from './lib/roles';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { TeamLoadPage, loadLevel } from './pages/TeamLoadPage';

/** Rôles manager et directeur, équipes et portefeuilles (ADR-0008, lot 16). */
const session = (roles: string[]): Session => ({ authenticated: true, user: { id: 'u', username: 'u', name: 'U', email: null, roles, groups: [] }, csrf: 'x' }) as unknown as Session;
const calls: string[] = [];
const project = (key: string, health: string, over = false) => ({
  key, name: `Projet ${key}`, health, computedHealth: over ? 'critical' : health, overridden: over, reasons: [], note: over ? 'Fournisseur' : '',
  progress: 40, open: 8, late: 3, blocked: 1, dueSoon: 2, managers: ['Chef'], members: 3, sprint: null,
});
const summary = {
  portfolio: { key: 'spatial', name: 'Programmes spatiaux', description: 'Tous les satellites', owner: 'Dir', projects: 2 },
  projects: [project('BAD', 'attention', true), project('ARI', 'ok')],
  totals: { projects: 2, byHealth: { ok: 1, attention: 1, critical: 0 }, progress: 40, open: 16, late: 6, blocked: 2 },
};

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${input}${init?.body ? ` ${String(init.body)}` : ''}`);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/v1\/teams$/.test(input)) return ok([{ key: 'alpha', name: 'Équipe Alpha', description: '', members: 2, managers: ['Manager Dev'] }]);
    if (/\/v1\/teams\/[a-z0-9-]+\/load$/.test(input)) {
      return ok({
        team: { key: 'alpha', name: 'Équipe Alpha' }, average: 2,
        members: [
          { subject: 's1', name: 'Ana Martin', role: 'member', open: 5, late: 2, remaining: 12, byProject: [{ project: 'ARI', open: 5 }] },
          { subject: 's2', name: 'Bob Durand', role: 'member', open: 0, late: 0, remaining: 0, byProject: [] },
        ],
        totals: { open: 5, late: 2, remaining: 12 },
      });
    }
    if (/\/v1\/users$/.test(input)) return ok([{ subject: 's3', username: 'cy', displayName: 'Cy Petit' }]);
    if (/\/v1\/portfolios\/summary$/.test(input)) return ok([summary]);
    if (/\/v1\/portfolios\/spatial$/.test(input)) return ok(summary);
    if (/\/v1\/projects$/.test(input)) return ok([{ key: 'ARI', name: 'Ariane' }, { key: 'NEW', name: 'Nouveau' }]);
    return ok({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

const renderAt = (path: string, roles: string[], element: 'team' | 'portfolios') => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/charge" element={<TeamLoadPage session={session(roles)} />} />
    <Route path="/portefeuilles" element={<PortfoliosPage session={session(roles)} />} />
    <Route path="/portefeuilles/:key" element={<PortfoliosPage session={session(roles)} />} />
  </Routes></MemoryRouter></ToastProvider>,
);

describe('rôle affiché et niveau de charge', () => {
  it('le rôle principal est le plus étendu des rôles portés', () => {
    expect(primaryRole(['athena-team-member']).label).toBe('Membre d’équipe');
    expect(primaryRole(['athena-manager', 'athena-team-member'])).toEqual({ label: 'Manager', kind: 'lead' });
    expect(primaryRole(['athena-director'])).toEqual({ label: 'Directeur', kind: 'director' });
    expect(primaryRole(['athena-pm', 'athena-manager']).kind).toBe('manager');
    expect(primaryRole(['athena-admin', 'athena-director']).kind).toBe('admin');
    expect(primaryRole(['athena-pmo', 'athena-team-member'])).toEqual({ label: 'PMO', kind: 'director' });
  });
  it('une charge élevée dépasse 1,5 fois la moyenne et 3 tickets', () => {
    expect(loadLevel(0, 2)).toBe('none');
    expect(loadLevel(2, 1)).toBe('normal');
    expect(loadLevel(3, 2)).toBe('high');
    expect(loadLevel(5, 4)).toBe('normal');
  });
});

describe('charge des équipes (manager)', () => {
  it('affiche la charge par personne, sans les commandes d’administration', async () => {
    renderAt('/charge', ['athena-manager', 'athena-team-member'], 'team');
    const row = (await screen.findByText('Ana Martin')).closest('tr')!;
    expect(within(row).getByText('Charge élevée')).toBeInTheDocument();
    expect(within(row).getByText('ARI (5)')).toBeInTheDocument();
    expect(screen.getByText('Bob Durand').closest('tr')).toHaveTextContent('Aucune charge');
    expect(screen.queryByRole('button', { name: 'Créer' })).not.toBeInTheDocument();
    expect(screen.queryByText('Supprimer l’équipe')).not.toBeInTheDocument();
  });
  it('l’administrateur crée une équipe et ajoute un membre', async () => {
    renderAt('/charge', ['athena-admin', 'athena-team-member'], 'team');
    await screen.findByText('Ana Martin');
    await userEvent.type(screen.getByLabelText('Clé'), 'beta');
    await userEvent.type(screen.getByLabelText('Nom'), 'Équipe Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST /v1/teams ') && c.includes('"key":"beta"'))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Personne à ajouter'), 's3');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('PUT /v1/teams/') && c.includes('/members/s3'))).toBe(true));
  });
});

describe('portefeuilles (directeur)', () => {
  it('liste les portefeuilles avec leur santé et les projets à risque, en lecture seule', async () => {
    renderAt('/portefeuilles', ['athena-director'], 'portfolios');
    expect(await screen.findByText('Programmes spatiaux')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le portefeuille Programmes spatiaux' })).toHaveAttribute('href', '/portefeuilles/spatial');
    expect(screen.getByText('Projets à risque')).toBeInTheDocument();
    expect(screen.queryByText('Nouveau portefeuille')).not.toBeInTheDocument();
  });
  it('le PMO crée un portefeuille', async () => {
    renderAt('/portefeuilles', ['athena-pmo', 'athena-team-member'], 'portfolios');
    await screen.findByText('Programmes spatiaux');
    await userEvent.type(screen.getByLabelText('Clé'), 'defense');
    await userEvent.type(screen.getByLabelText('Nom'), 'Défense');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST /v1/portfolios ') && c.includes('"key":"defense"'))).toBe(true));
  });
  it('le détail montre la santé forcée et sa note ; le directeur ne peut rien modifier', async () => {
    renderAt('/portefeuilles/spatial', ['athena-director'], 'portfolios');
    const row = (await screen.findByText('BAD')).closest('tr')!;
    expect(within(row).getByText('À surveiller')).toBeInTheDocument();
    expect(within(row).getByText('(forcée)')).toBeInTheDocument();
    expect(within(row).getByText('Fournisseur')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    expect(screen.queryByText('Rattacher un projet')).not.toBeInTheDocument();
  });
  it('le chef de projet force la santé d’un projet et rattache un projet', async () => {
    renderAt('/portefeuilles/spatial', ['athena-pm', 'athena-team-member'], 'portfolios');
    await screen.findByText('BAD');
    await userEvent.selectOptions(screen.getByLabelText('Santé de ARI'), 'critical');
    await userEvent.click(screen.getAllByRole('button', { name: 'Enregistrer' })[1]!);
    await waitFor(() => expect(calls.some((c) => c.startsWith('PUT /v1/portfolios/spatial/projects/ARI') && c.includes('"health":"critical"'))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Projet à rattacher'), 'NEW');
    await userEvent.click(screen.getByRole('button', { name: 'Rattacher un projet' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('PUT /v1/portfolios/spatial/projects/NEW'))).toBe(true));
  });
});
