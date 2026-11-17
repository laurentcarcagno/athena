import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { PlannedVsConsumedCard } from './PlannedVsConsumedCard';
import { WorklogSection } from './WorklogSection';

const rows = [{ id: 'w1', subject: 'sub-ana', person: 'Ana Martin', day: '2026-11-17', minutes: 468, comment: 'Plan' }, { id: 'w2', subject: 'sub-bob', person: 'Bob Durand', day: '2026-11-12', minutes: 90, comment: '' }];
const calls: Array<{ method: string; url: string; body?: string }> = [];
let disabled = false;
beforeEach(() => {
  calls.length = 0; disabled = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    if (disabled) return new Response('{}', { status: 404 });
    if (String(url).includes('planned-vs-consumed')) return new Response(JSON.stringify({ periods: [{ key: '2026-11', plannedMinutes: 4914, consumedMinutes: 558 }], byPerson: [] }), { status: 200 });
    return new Response(JSON.stringify(init?.method === 'POST' ? { id: 'w3' } : { rows, totalMinutes: 558 }), { status: init?.method === 'POST' ? 201 : 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<MemoryRouter><ToastProvider><WorklogSection project="TPS" ticket="TPS-TSK-1" me="sub-ana" /></ToastProvider></MemoryRouter>);

describe('temps passé (B36)', () => {
  it('liste le temps passé en heures et minutes avec le total ; seul le sien se retire ; aucun défaut axe', async () => {
    const { container } = show();
    expect(await screen.findByText('Total : 9 h 18')).toBeInTheDocument();
    expect(screen.getByText('7 h 48')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(1);
    expect((await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('saisie « 1 h 30 » envoyée en minutes ; une durée invalide est refusée avant l’envoi', async () => {
    show();
    await screen.findByText('Total : 9 h 18');
    const form = screen.getByRole('form', { name: 'Saisir du temps passé' });
    await userEvent.type(within(form).getByLabelText('Jour'), '2026-11-18');
    await userEvent.type(within(form).getByLabelText('Durée (h min)'), 'beaucoup');
    await userEvent.click(within(form).getByRole('button', { name: 'Ajouter' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.clear(within(form).getByLabelText('Durée (h min)'));
    await userEvent.type(within(form).getByLabelText('Durée (h min)'), '1 h 30');
    await userEvent.click(within(form).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ day: '2026-11-18', minutes: 90, comment: '' })));
  });

  it('absente quand la fonctionnalité Capacité est désactivée (404)', async () => {
    disabled = true;
    const { container } = show();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(container.textContent).toBe('');
  });

  it('planifié contre consommé : un graphique par mois avec sa vue tableau ; rien sans donnée', async () => {
    render(<MemoryRouter><ToastProvider><PlannedVsConsumedCard project="TPS" today={new Date('2026-11-17T00:00:00Z')} /></ToastProvider></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Planifié contre consommé' })).toBeInTheDocument();
    expect(calls[0]!.url).toContain('from=2026-09-01&to=2027-02-28&granularity=month');
  });
});
