import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { DecisionsPanel } from './DecisionsPanel';

const alerts = { alerts: [{ kind: 'review_late', project: 'DEC', team: null, since: '2026-03-01', value: 106 }, { kind: 'overload', project: null, team: 'thermique', since: null, value: 122 }] };
const decisions = [
  { id: 'd1', project: 'DEC', kind: 'suspend', rationale: 'Financement gelé', conditions: 'Reprise après arbitrage', owner: null, dueOn: '2026-12-01', costDelta: null, scheduleDeltaDays: null, budgetCategory: null, appliedAt: null, decidedBy: 'Pat PMO', decidedAt: '2026-11-18T10:00:00.000Z', proposedState: 'on_hold' },
  { id: 'd2', project: 'DEC', kind: 'change', rationale: 'Ajout de périmètre', conditions: '', owner: null, dueOn: null, costDelta: 12000, scheduleDeltaDays: 10, budgetCategory: 'logiciel', appliedAt: null, decidedBy: 'Pat PMO', decidedAt: '2026-11-17T10:00:00.000Z', proposedState: null },
];
const calls: Array<{ method: string; url: string; body?: string }> = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    if (String(url).endsWith('/alerts')) return new Response(JSON.stringify(alerts), { status: 200 });
    if (init?.method === 'POST') return new Response('{}', { status: 201 });
    return new Response(JSON.stringify(decisions), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = (canDecide: boolean, canApply: boolean) => render(<MemoryRouter><ToastProvider><DecisionsPanel portfolio="gov2" projects={['DEC', 'SEC']} canDecide={canDecide} canApply={canApply} /></ToastProvider></MemoryRouter>);

describe('alertes et décisions (B38)', () => {
  it('alertes avec leur cause en toutes lettres ; décision de suspension : transition proposée, non appliquée ; aucun défaut axe', async () => {
    const { container } = show(true, false);
    const al = await screen.findByRole('table', { name: '2 alertes ouvertes' });
    expect(within(al).getByText('Revue en retard')).toBeInTheDocument();
    expect(within(al).getByText('106 jours de retard')).toBeInTheDocument();
    expect(within(al).getByText('122 % de la capacité')).toBeInTheDocument();
    const journal = await screen.findByRole('table', { name: '2 décisions' });
    expect(within(journal).getByText('proposée : on_hold (non appliquée)')).toBeInTheDocument();
    expect(screen.getByText('Une alerte s’ouvre dès que sa cause existe et se résout seule quand elle disparaît.')).toBeInTheDocument();
    expect((await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('le PMO enregistre une décision ; la finance applique l’avenant ; un lecteur n’a aucun bouton', async () => {
    const { unmount } = show(true, true);
    const form = await screen.findByRole('form', { name: 'Enregistrer une décision' });
    await userEvent.selectOptions(within(form).getByLabelText('Projet'), 'DEC');
    await userEvent.selectOptions(within(form).getByLabelText('Nature'), 'stop');
    await userEvent.type(within(form).getByLabelText('Motif'), 'Plus de besoin');
    expect(screen.getByText('La décision propose une transition du cycle de vie au chef du projet ; elle ne l’applique pas.')).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer la décision' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/decisions'))?.body).toBe(JSON.stringify({ project: 'DEC', kind: 'stop', rationale: 'Plus de besoin', conditions: '' })));
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer l’avenant' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/decisions/d2/apply'))).toBe(true));
    unmount();
    show(false, false);
    await screen.findByRole('table', { name: '2 décisions' });
    expect(screen.queryByRole('form', { name: 'Enregistrer une décision' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Appliquer l’avenant' })).toBeNull();
  });
});
