import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { DependenciesPanel } from './DependenciesPanel';

const graph = {
  projects: ['AAA', 'BBB'], links: [{ id: 'd1', from: { key: 'AAA-TSK-1', project: 'AAA' }, to: { key: 'BBB-TSK-1', project: 'BBB' }, lagDays: 0, slackDays: -2, critical: true }],
  matrix: [{ from: 'AAA', to: 'BBB', count: 1, critical: 1 }],
};
const calls: Array<{ method: string; url: string; body?: string }> = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    if (String(url).endsWith('/propagate')) return new Response(JSON.stringify({ origin: 'AAA-TSK-1', shiftDays: 3, impacts: [{ key: 'BBB-TSK-1', project: 'BBB', shiftDays: 3, newStart: '2026-11-19', newEnd: '2026-11-25' }] }), { status: 200 });
    if (init?.method === 'POST') return new Response('{}', { status: 201 });
    return new Response(JSON.stringify(graph), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = (canEdit: boolean) => render(<MemoryRouter><ToastProvider><DependenciesPanel portfolio="dep" canEdit={canEdit} /></ToastProvider></MemoryRouter>);

describe('dépendances entre projets (B36)', () => {
  it('matrice, liens avec leur marge dite en toutes lettres, aucun défaut axe', async () => {
    const { container } = show(true);
    const links = await screen.findByRole('table', { name: '1 lien' });
    expect(within(links).getByText('-2 jours ouvrés · contrainte violée')).toBeInTheDocument();
    expect(within(links).getByRole('link', { name: 'AAA-TSK-1' })).toHaveAttribute('href', '/p/AAA/a/AAA-TSK-1');
    expect(screen.getByText('1 · 1 critique')).toBeInTheDocument();
    expect((await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('le PMO ajoute un lien ; la propagation est en lecture et liste les tickets touchés', async () => {
    show(true);
    await screen.findByRole('table', { name: '1 lien' });
    const add = screen.getByRole('form', { name: 'Ajouter une dépendance' });
    await userEvent.type(within(add).getByLabelText('Ticket prédécesseur'), 'AAA-TSK-1');
    await userEvent.type(within(add).getByLabelText('Ticket successeur'), 'CCC-TSK-1');
    await userEvent.click(within(add).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/v1/dependencies'))?.body).toBe(JSON.stringify({ from: 'AAA-TSK-1', to: 'CCC-TSK-1', lagDays: 0 })));
    const form = screen.getByRole('form', { name: 'Propager un retard' });
    await userEvent.type(within(form).getByLabelText('Ticket qui glisse'), 'AAA-TSK-1');
    await userEvent.click(within(form).getByRole('button', { name: 'Voir les jalons touchés' }));
    const table = await screen.findByRole('table', { name: '1 ticket touché si AAA-TSK-1 glisse de 3 jours ouvrés' });
    expect(within(table).getByText('+3 jours ouvrés')).toBeInTheDocument();
    expect(screen.getByText('La propagation est un calcul : aucun planning n’est modifié.')).toBeInTheDocument();
  });

  it('un lecteur ne peut ni ajouter ni retirer', async () => {
    show(false);
    await screen.findByRole('table', { name: '1 lien' });
    expect(screen.queryByRole('form', { name: 'Ajouter une dépendance' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retirer le lien/ })).toBeNull();
  });
});
