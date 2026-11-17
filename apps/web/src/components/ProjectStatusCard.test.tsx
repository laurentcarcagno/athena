import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { ProjectStatusCard } from './ProjectStatusCard';

const note = { id: 'n1', writtenAt: '2026-11-10T10:00:00.000Z', author: 'sub-pm', authorName: 'Chef Projet', schedule: 'attention', scope: 'ok', risk: 'critical', resources: null, cost: null, comment: 'Lanceur décalé' };
let notes: unknown[] = [note];
const calls: Array<{ method: string; url: string; body?: string }> = [];

beforeEach(() => {
  calls.length = 0; notes = [note];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    return new Response(JSON.stringify(init?.method === 'POST' ? note : notes), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = (canManage: boolean) => render(<MemoryRouter><ToastProvider><ProjectStatusCard project="MET" canManage={canManage} /></ToastProvider></MemoryRouter>);

describe('carte Météo du projet (B17)', () => {
  it('affiche la dernière note avec des niveaux en toutes lettres, sans bouton pour un lecteur', async () => {
    const { container } = show(false);
    expect(await screen.findByText('Lanceur décalé')).toBeInTheDocument();
    expect(screen.getByText('Attention')).toBeInTheDocument();
    expect(screen.getByText('Critique')).toBeInTheDocument();
    expect(screen.getByText(/Écrite par Chef Projet le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Écrire la météo' })).toBeNull();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('un lecteur ne voit rien quand aucune météo n’est écrite', async () => {
    notes = [];
    const { container } = show(false);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(container.textContent).toBe('');
  });

  it('le chef de projet écrit une météo en trois choix et un commentaire', async () => {
    show(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Écrire la météo' }));
    await userEvent.selectOptions(screen.getByLabelText('Délai'), 'critical');
    await userEvent.type(screen.getByLabelText('Commentaire'), 'Retard fournisseur');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toBeDefined());
    expect(JSON.parse(calls.find((c) => c.method === 'POST')!.body!)).toEqual({ schedule: 'critical', scope: 'ok', risk: 'critical', comment: 'Retard fournisseur' });
  });
});
