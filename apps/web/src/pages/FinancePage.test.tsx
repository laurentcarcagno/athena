import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import type { Session } from '../api';
import { FinancePage, euros } from './FinancePage';

const session = (roles: string[]) => ({ authenticated: true, user: { id: 'u', username: 'u', name: 'U', email: null, roles, groups: [] } }) as unknown as Session;
const finance = {
  project: 'FIN', lines: [{ category: 'logiciel', budget: 105000, committed: 0, actual: 60000, forecast: 50000, eac: 110000, variance: -5000 }, { category: 'prestations', budget: 20000, committed: 15000, actual: 22000, forecast: 0, eac: 22000, variance: -2000 }],
  totals: { budget: 125000, committed: 15000, actual: 82000, forecast: 50000, eac: 132000, variance: -7000 },
  alerts: [{ kind: 'overrun', category: 'logiciel', excess: 5000 }, { kind: 'exceeded', category: 'prestations', excess: 2000 }],
  curve: [{ period: '2026-05', actualCumulative: 82000, forecastCumulative: 82000 }, { period: '2026-07', actualCumulative: 82000, forecastCumulative: 112000 }],
};
const calls: Array<{ method: string; url: string; body?: string }> = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    const u = String(url);
    if (u.endsWith('/v1/projects')) return new Response(JSON.stringify([{ key: 'FIN', name: 'Finance' }]), { status: 200 });
    if (u.endsWith('/finance/categories')) return new Response(JSON.stringify([{ key: 'logiciel', name: 'Logiciel', kind: 'internal' }]), { status: 200 });
    if (u.endsWith('/actuals/import')) return new Response(JSON.stringify({ fileName: 'saisie.csv', rows: 1000, imported: 997, alreadyImported: false, rejected: [{ line: 11, reason: 'catégorie inconnue : inconnue' }] }), { status: 200 });
    if (u.includes('/finance/projects/')) return new Response(JSON.stringify(finance), { status: 200 });
    return new Response('{}', { status: 201 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = (roles: string[]) => render(<MemoryRouter><ToastProvider><FinancePage session={session(roles)} /></ToastProvider></MemoryRouter>);

describe('page Finances (B37)', () => {
  it('tableau par catégorie, écart et dépassement dits en toutes lettres, alertes ; aucun défaut axe', async () => {
    const { container } = show(['athena-director']);
    await userEvent.selectOptions(await screen.findByLabelText('Projet'), 'FIN');
    const table = await screen.findByRole('table', { name: 'Finances du projet FIN' });
    expect(within(table).getByText(/-5\s?000 € · dépassement/)).toBeInTheDocument();
    expect(screen.getByText('Estimation à terminaison au-delà du budget')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Budget' })).toBeNull(); // la direction lit, ne saisit pas
    expect((await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('le PMO a les droits de la finance : il saisit un budget', async () => {
    show(['athena-pmo']);
    await userEvent.selectOptions(await screen.findByLabelText('Projet'), 'FIN');
    await screen.findByRole('table', { name: 'Finances du projet FIN' });
    expect(screen.getByRole('form', { name: 'Budget' })).toBeInTheDocument();
  });

  it('la finance saisit un budget, puis importe des réels avec le rapport de rejet', async () => {
    show(['athena-finance']);
    await userEvent.selectOptions(await screen.findByLabelText('Projet'), 'FIN');
    await screen.findByRole('table', { name: 'Finances du projet FIN' });
    const form = screen.getByRole('form', { name: 'Budget' });
    await userEvent.selectOptions(within(form).getByLabelText('Catégorie'), 'logiciel');
    await userEvent.type(within(form).getByLabelText('Montant (€)'), '1500,50');
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/finance/budget'))?.body).toBe(JSON.stringify({ project: 'FIN', category: 'logiciel', kind: 'initial', amount: 1500.5, reason: '' })));
    await userEvent.type(screen.getByLabelText(/^Réels à importer/), 'FIN;logiciel;2026-01;10');
    await userEvent.click(screen.getByRole('button', { name: 'Importer' }));
    expect(await screen.findByText('997 lignes enregistrées sur 1000.')).toBeInTheDocument();
    expect(screen.getByText('Ligne 11 : catégorie inconnue : inconnue')).toBeInTheDocument();
  });

  it('montants en euros', () => {
    expect(euros(1234.5).replace(/\s/g, ' ')).toMatch(/^1 ?235 €$/);
  });
});
