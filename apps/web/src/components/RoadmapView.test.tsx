import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { RoadmapView, milestonesOf, type RoadmapData } from './RoadmapView';

const phase = (over: Record<string, unknown>) => ({ key: 'phase-a', name: 'Phase A', review: 'prr', offTemplate: false, current: false, plannedStart: null, plannedEnd: null, reviewPlannedOn: null, reviewHeldOn: null, decision: null, undated: true, heldLate: false, ...over });
const data = {
  portfolio: { key: 'rm', name: 'Roadmap' }, hiddenByState: 1,
  projects: [
    { key: 'SAT', name: 'Satellite', lifecycle: { key: 'in_progress', name: 'En cours', category: 'active' }, plannedStart: '2026-01-05', plannedEnd: '2026-12-18', calculatedEnd: '2027-01-15',
      baseline: { name: 'PLAN-1', end: '2026-12-18', gapDays: 20 },
      phases: [phase({ key: 'phase-a', name: 'Phase A', plannedStart: '2026-01-05', plannedEnd: '2026-03-01', reviewPlannedOn: '2026-03-01', reviewHeldOn: '2026-03-10', heldLate: true, undated: false, current: true }), phase({ key: 'phase-b', name: 'Phase B', review: 'pdr' }), phase({ key: 'old', name: 'old', offTemplate: true })],
      releases: [{ name: 'v1', startsOn: '2026-02-01', endsOn: '2026-06-30', state: 'planned' }], unscheduled: false },
    { key: 'VID', name: 'Vide', lifecycle: { key: 'in_progress', name: 'En cours', category: 'active' }, plannedStart: null, plannedEnd: null, calculatedEnd: null, baseline: null, phases: [], releases: [], unscheduled: true },
  ],
} as RoadmapData;
const urls: string[] = [];
let failing = false;
beforeEach(() => {
  urls.length = 0; failing = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(String(url)); return failing ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(data), { status: 200 }); }));
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<MemoryRouter><ToastProvider><RoadmapView portfolio="rm" today={new Date('2026-11-17T00:00:00Z')} /></ToastProvider></MemoryRouter>);

describe('roadmap du portefeuille (B27, B28)', () => {
  it('la frise : un couloir par projet, chevrons, losanges, versions, baseline fantôme avec son écart, aucun défaut axe', async () => {
    const { container } = show();
    const svg = await screen.findByRole('img', { name: 'Roadmap de 2 projets' });
    expect(svg.querySelectorAll('.ath-roadmap-phase')).toHaveLength(1); // phase datée seulement, hors gabarit exclue
    expect(svg.querySelectorAll('.ath-roadmap-review')).toHaveLength(1);
    expect(svg.querySelector('.ath-roadmap-review--late')).not.toBeNull();
    expect(svg.querySelectorAll('.ath-roadmap-release')).toHaveLength(1);
    expect(svg.querySelector('.ath-roadmap-ghost title')?.textContent).toContain('+20 jours ouvrés');
    expect(svg.querySelector('.ath-roadmap-calc')).not.toBeNull(); // fin calculée après la fin prévue
    expect(svg.textContent).toContain('Non planifié');
    expect(screen.getByText(/1 terminé, annulé ou archivé masqué/)).toBeInTheDocument();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('le tableau donne l’écart à la baseline ; la vue jalons liste revues et versions, avec « tenue en retard »', async () => {
    show();
    await screen.findByRole('img');
    await userEvent.click(screen.getByRole('button', { name: 'Tableau' }));
    const row = within(await screen.findByRole('table', { name: 'Roadmap de 2 projets' })).getAllByRole('row')[1]!;
    expect(within(row).getByText('+20 jours ouvrés')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'SAT' })).toHaveAttribute('href', '/p/SAT');
    await userEvent.click(screen.getByRole('button', { name: 'Jalons' }));
    const table = await screen.findByRole('table', { name: '2 jalons' });
    expect(within(table).getByText('tenue en retard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer les jalons' })).toBeInTheDocument();
  });

  it('le zoom change l’échelle ; inclure les projets clos recharge ; dégradé en cas d’erreur', async () => {
    const { unmount } = show();
    const svg = await screen.findByRole('img');
    const before = Number(svg.getAttribute('width'));
    await userEvent.click(screen.getByRole('button', { name: 'Mois' }));
    expect(Number(screen.getByRole('img').getAttribute('width'))).toBeGreaterThan(before);
    await userEvent.click(screen.getByLabelText('Inclure les projets clos'));
    await waitFor(() => expect(urls.at(-1)).toContain('includeClosed=1'));
    unmount();
    failing = true;
    show();
    expect(await screen.findByText('La roadmap est indisponible pour le moment.')).toBeInTheDocument();
  });

  it('milestonesOf : revues datées et versions, triées par date', () => {
    expect(milestonesOf(data.projects[0]!).map((m) => [m.kind, m.label])).toEqual([['review', 'PRR'], ['release', 'v1']]);
  });
});
