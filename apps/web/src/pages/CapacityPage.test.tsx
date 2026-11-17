import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import type { Session } from '../api';
import { CapacityPage, hours, parseDuration } from './CapacityPage';

const session = { authenticated: true, user: { id: 'sub-ana', username: 'ana', name: 'Ana', email: null, roles: ['athena-team-member'], groups: [] } } as unknown as Session;
const view = {
  granularity: 'month', overloadPercent: 110, workdayMinutes: 468, periods: [{ key: '2026-11', from: '2026-11-01', to: '2026-11-30' }, { key: '2026-12', from: '2026-12-01', to: '2026-12-31' }],
  people: [
    { subject: 'sub-ana', name: 'Ana Martin', teams: ['thermique'], cells: [{ period: '2026-11', capacityMinutes: 6739, loadMinutes: 4680, level: 'normal', projects: [{ project: 'CAP', minutes: 4680 }] }, { period: '2026-12', capacityMinutes: 9360, loadMinutes: 12000, level: 'overload', projects: [{ project: 'CAP', minutes: 12000 }] }] },
    { subject: 'sub-bob', name: 'Bob Durand', teams: ['thermique'], cells: [{ period: '2026-11', capacityMinutes: 9360, loadMinutes: 0, level: 'free', projects: [] }, { period: '2026-12', capacityMinutes: 9360, loadMinutes: 6000, level: 'normal', projects: [] }] },
  ],
  teams: [{ team: 'thermique', name: 'Thermique', cells: [{ period: '2026-11', capacityMinutes: 16099, nominativeMinutes: 4680, genericMinutes: 0, freeMinutes: 11419, level: 'free' }, { period: '2026-12', capacityMinutes: 18720, nominativeMinutes: 18000, genericMinutes: 4680, level: 'overload', freeMinutes: -3960 }], needs: [] }],
  bottlenecks: [{ team: 'thermique', name: 'Thermique', period: '2026-12', saturationPercent: 122, projects: [{ project: 'CAP', minutes: 22680 }] }],
};
const calls: Array<{ method: string; url: string; body?: string }> = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    if (String(url).includes('/capacity/absences')) return new Response(JSON.stringify(init?.method === 'POST' ? { id: 'a1' } : [{ id: 'a1', from: '2026-11-19', to: '2026-11-20', halfDay: false, kind: 'leave' }]), { status: init?.method === 'POST' ? 201 : 200 });
    return new Response(JSON.stringify(view), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<MemoryRouter><ToastProvider><CapacityPage session={session} /></ToastProvider></MemoryRouter>);

describe('page Capacité (B35)', () => {
  it('carte de chaleur : taux écrit et palier en toutes lettres ; goulots avec leurs projets ; aucun défaut axe', async () => {
    const { container } = show();
    const table = await screen.findByRole('table', { name: 'Charge de 2 personnes par période' });
    const ana = within(within(table).getByText('Ana Martin').closest('tr')!);
    expect(ana.getByText('69 %')).toBeInTheDocument(); // 4680 / 6739
    expect(ana.getByText('normal')).toBeInTheDocument();
    expect(ana.getByText('128 %')).toBeInTheDocument();
    expect(ana.getByText('surcharge')).toBeInTheDocument();
    expect(within(table).getByText('sous-charge')).toBeInTheDocument();
    const bottlenecks = await screen.findByRole('table', { name: '1 goulot' });
    expect(within(bottlenecks).getByText('122 %')).toBeInTheDocument();
    expect(within(bottlenecks).getByRole('link', { name: 'CAP' })).toHaveAttribute('href', '/p/CAP');
    expect(screen.getByText(/Sous-charge sous 60 %, normal jusqu’à 100 %, tendu jusqu’à 110 %, surcharge au-delà\./)).toBeInTheDocument();
    // mêmes étiquettes que l'audit e2e (WCAG 2.x A et AA) ; l'ordre des titres est une bonne pratique, pas un critère WCAG
    const res = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false } } });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });

  it('les filtres sont envoyés à l’API ; la personne saisit une absence', async () => {
    show();
    await screen.findByRole('table', { name: /^Charge de/ });
    await userEvent.selectOptions(screen.getByLabelText('Période'), 'week');
    await waitFor(() => expect(calls.some((c) => c.url.includes('granularity=week'))).toBe(true));
    await userEvent.type(screen.getByLabelText('Du (absence)'), '2026-12-07');
    await userEvent.type(screen.getByLabelText('Au (absence)'), '2026-12-08');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter l’absence' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ subject: 'sub-ana', from: '2026-12-07', to: '2026-12-08', kind: 'leave', halfDay: false })));
  });

  it('saisie : disponibilité à 80 % avec journée de 7 h 12, allocation nominative et besoin générique', async () => {
    show();
    await screen.findByRole('table', { name: /^Charge de/ });
    const av = screen.getByRole('form', { name: 'Disponibilité d’une personne' });
    await userEvent.selectOptions(within(av).getByLabelText('Personne'), 'sub-bob');
    await userEvent.type(within(av).getByLabelText('Disponibilité à partir du'), '2026-11-01');
    await userEvent.clear(within(av).getByLabelText('Temps de travail (%)'));
    await userEvent.type(within(av).getByLabelText('Temps de travail (%)'), '80');
    await userEvent.type(within(av).getByLabelText('Durée de la journée (h min, facultatif)'), '7 h 12');
    await userEvent.click(within(av).getByRole('button', { name: 'Enregistrer la disponibilité' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/availability'))?.body).toBe(JSON.stringify({ subject: 'sub-bob', from: '2026-11-01', ratio: 0.8, workdayMinutes: 432 })));
    const al = screen.getByRole('form', { name: 'Allocation à un projet' });
    await userEvent.type(within(al).getByLabelText('Projet (clé)'), 'cap');
    await userEvent.selectOptions(within(al).getByLabelText('Équipe'), 'thermique');
    await userEvent.type(within(al).getByLabelText('Rôle'), 'thermicien');
    await userEvent.type(within(al).getByLabelText('Allocation du'), '2026-11-01');
    await userEvent.click(within(al).getByRole('button', { name: 'Enregistrer l’allocation' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/projects/CAP/allocations'))?.body).toBe(JSON.stringify({ from: '2026-11-01', to: null, fte: 0.5, team: 'thermique', roleLabel: 'thermicien' })));
  });

  it('parseDuration : heures et minutes, bornes de 1 minute à 24 heures', () => {
    expect([parseDuration('7 h 48'), parseDuration('7h48'), parseDuration('7:48'), parseDuration('8 h'), parseDuration('0 h 00'), parseDuration('25 h'), parseDuration('7 h 75'), parseDuration('x')]).toEqual([468, 468, 468, 480, null, null, null, null]);
  });

  it('durées en heures et minutes', () => {
    expect(hours(468)).toBe('7 h 48');
    expect(hours(6739)).toBe('112 h 19');
  });
});
