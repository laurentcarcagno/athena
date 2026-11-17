import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { GovernancePanel, trendChart } from './GovernancePanel';

const cells = [1, 2, 3, 4, 5].flatMap((probability) => [1, 2, 3, 4, 5].map((impact) => ({ probability, impact, count: probability === 4 && impact === 5 ? 2 : probability === 1 && impact === 2 ? 1 : 0 })));
const routes: Record<string, unknown> = {
  gates: { rows: [{ project: 'MIS', name: 'Mission', phase: 'phase-0', phaseName: 'Phase 0 — Analyse de mission', review: 'mdr', reviewPlannedOn: '2026-09-01', reviewHeldOn: null, decision: null, canAdvance: false, criteria: { total: 5, met: 1, manualPending: 3, automaticRemaining: 2 } }] },
  risks: { cells, top: [{ key: 'MIS-RSK-1', project: 'MIS', probability: 4, impact: 5, criticality: 20 }], total: 3 },
  actions: { projects: [{ project: 'MIS', open: 2, late: 1, closed: 1 }], overdue: [{ key: 'MIS-ACT-1', project: 'MIS', due: '2026-11-10', assignee: 'Chef Projet' }] },
  'milestone-trend': { series: [{ phase: 'phase-0', field: 'review_planned_on', points: [{ at: '2026-03-01', planned: '2026-06-01' }, { at: '2026-05-01', planned: '2026-07-15' }] }] },
};
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const name = Object.keys(routes).find((k) => String(url).includes(`/${k}`));
    return new Response(JSON.stringify(name ? routes[name] : {}), { status: name ? 200 : 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<MemoryRouter><ToastProvider><GovernancePanel portfolio="gov" projects={['MIS', 'SEC']} /></ToastProvider></MemoryRouter>);

describe('gouvernance du portefeuille (B34)', () => {
  it('passage des gates, matrice des risques en toutes lettres, suivi des actions ; aucun défaut axe', async () => {
    const { container } = show();
    const gates = await screen.findByRole('table', { name: 'Gates de 1 projet' });
    expect(within(gates).getByText(/MDR · .*/)).toBeInTheDocument();
    expect(within(gates).getByText(/1\/5 · 3 à confirmer · 2 tickets restants/)).toBeInTheDocument();
    const matrix = await screen.findByRole('table', { name: 'Matrice probabilité par impact de 3 risques ouverts' });
    expect(within(matrix).getByText('Probabilité 4, impact 5, criticité critique : 2 risques')).toBeInTheDocument();
    expect(within(matrix).getAllByRole('row')).toHaveLength(6);
    expect(await screen.findByRole('table', { name: 'Actions de 1 projet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MIS-ACT-1' })).toHaveAttribute('href', '/p/MIS/a/MIS-ACT-1');
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('la tendance des jalons se choisit par projet et se trace en courbe, avec sa vue tableau', async () => {
    show();
    await screen.findByRole('table', { name: 'Gates de 1 projet' });
    await userEvent.selectOptions(screen.getByLabelText('Projet'), 'MIS');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tableau' })).toBeInTheDocument());
  });

  it('trendChart : une ligne par jalon, la date prévue reportée d’un relevé au suivant', () => {
    const c = trendChart([{ phase: 'phase-0', field: 'review_planned_on', points: [{ at: '2026-03-01', planned: '2026-06-01' }, { at: '2026-05-01', planned: '2026-07-15' }] }, { phase: 'phase-0', field: 'planned_end', points: [{ at: '2026-04-01', planned: '2026-06-10' }] }]);
    expect(c.categories).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']);
    expect(c.series[0]!.data).toEqual([0, 0, 44]);
    expect(c.series[1]!.name).toBe('phase-0 · fin de phase');
  });
});
