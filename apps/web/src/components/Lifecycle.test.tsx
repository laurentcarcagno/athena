import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { LifecycleAdminTab } from './LifecycleAdmin';
import { ProjectLifecycleCard } from './ProjectLifecycleCard';

const view = {
  state: { key: 'in_progress', name: 'En cours', category: 'active' },
  next: [
    { to: 'on_hold', name: 'Suspendu', category: 'suspended', permitted: true, reasonRequired: false },
    { to: 'cancelled', name: 'Annulé', category: 'cancelled', permitted: true, reasonRequired: true },
    { to: 'completed', name: 'Terminé', category: 'closed', permitted: false, reasonRequired: false },
  ],
  history: [{ from: 'starting', to: 'in_progress', reason: '', by: 'x', at: '2026-05-04T08:00:00.000Z' }],
};
const config = {
  states: [{ key: 'in_progress', name: 'En cours', category: 'active', hidden: false }, { key: 'cancelled', name: 'Annulé', category: 'cancelled', hidden: false }],
  transitions: [{ from: 'in_progress', to: 'cancelled', roles: ['pmo'] }], customized: false,
};
const calls: Array<{ method: string; url: string; body?: string }> = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    return new Response(JSON.stringify(String(url).includes('/lifecycle') && String(url).includes('/projects/') ? view : config), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const wrap = (node: React.ReactNode) => render(<MemoryRouter><ToastProvider>{node}</ToastProvider></MemoryRouter>);

describe('cycle de vie (B11)', () => {
  it('le projet n’offre que les transitions permises ; l’annulation demande un motif avant d’être envoyée', async () => {
    wrap(<ProjectLifecycleCard project="LIF" />);
    expect(await screen.findByRole('button', { name: 'Suspendu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminé' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Annulé' }));
    const confirm = screen.getByRole('button', { name: 'Passer à « Annulé »' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motif du passage à « Annulé »'), 'Programme arrêté');
    await userEvent.click(confirm);
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toContain('/v1/projects/LIF/lifecycle/transition');
    expect(JSON.parse(post!.body!)).toEqual({ to: 'cancelled', reason: 'Programme arrêté' });
  });

  it('l’administration renomme un état et enregistre la configuration complète', async () => {
    wrap(<LifecycleAdminTab />);
    const name = await screen.findByLabelText('Nom cancelled');
    await userEvent.clear(name);
    await userEvent.type(name, 'Abandonné');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toContain('/v1/admin/lifecycle');
    const body = JSON.parse(put!.body!);
    expect(body.states.find((s: { key: string }) => s.key === 'cancelled')).toMatchObject({ name: 'Abandonné', category: 'cancelled' });
    expect(body.transitions).toEqual([{ from: 'in_progress', to: 'cancelled', roles: ['pmo'] }]);
  });
});
