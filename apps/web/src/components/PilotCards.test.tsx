import { render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapacityCard, PhaseGateCard, PlatformOpsCard, PortfolioFinanceCard, PortfolioGatesCard, PortfolioRequestsCard, ProjectFinanceCard, RiskMatrixCard, RoadmapCard, resetPortfoliosCache, usePortfolioProjects } from './PilotCards';

// Lot 27 (N1 à N9) : les neuf cartes des gabarits lisent les routes des pages PPM et savent charger, être vides ou échouer.

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0]!;
const totals = (budget: number, actual: number, eac: number) => ({ budget, committed: 0, actual, forecast: 0, eac, variance: budget - eac });
let routes: Record<string, unknown>;

beforeEach(() => {
  resetPortfoliosCache();
  routes = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([k]) => url === k || url.startsWith(`${k}?`));
    if (!hit) return new Response('{}', { status: 404 });
    return hit[1] === 'error' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(hit[1]), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const show = (ui: JSX.Element) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('finances (N1, N2)', () => {
  it('le projet : budget, engagé, réel, estimation, écart (dépassement signalé en toutes lettres) et lien vers la page Finances', async () => {
    routes['/v1/finance/projects/LUMEN'] = { project: 'LUMEN', lines: [{ category: 'labor', ...totals(1000, 400, 1200) }], totals: { budget: 1000, committed: 100, actual: 400, forecast: 800, eac: 1200, variance: -200 }, alerts: [], curve: [] };
    show(<ProjectFinanceCard project="LUMEN" />);
    expect(await screen.findByText('Budget')).toBeInTheDocument();
    expect(screen.getByText(/dépassement/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir les finances' })).toHaveAttribute('href', '/finances');
  });
  it('le projet sans donnée : état vide ; en erreur : « indisponible »', async () => {
    routes['/v1/finance/projects/LUMEN'] = { project: 'LUMEN', lines: [], totals: totals(0, 0, 0), alerts: [], curve: [] };
    const { unmount } = show(<ProjectFinanceCard project="LUMEN" />);
    expect(await screen.findByText('Aucune donnée financière.')).toBeInTheDocument();
    unmount();
    routes['/v1/finance/projects/LUMEN'] = 'error';
    show(<ProjectFinanceCard project="LUMEN" />);
    expect(await screen.findByText('Indisponible pour le moment.')).toBeInTheDocument();
  });
  it('le portefeuille : une ligne par projet et un total', async () => {
    routes['/v1/me/dashboard/portfolios'] = { portfolios: [{ key: 'defense', name: 'Défense', projects: ['DRNT', 'RADC'] }] };
    routes['/v1/finance/projects/DRNT'] = { project: 'DRNT', lines: [{ category: 'a', ...totals(100, 10, 90) }], totals: totals(100, 10, 90), alerts: [], curve: [] };
    routes['/v1/finance/projects/RADC'] = { project: 'RADC', lines: [{ category: 'a', ...totals(200, 20, 250) }], totals: totals(200, 20, 250), alerts: [], curve: [] };
    show(<PortfolioFinanceCard portfolio="defense" />);
    const table = await screen.findByRole('table', { name: 'Finances du portefeuille defense' });
    expect(within(table).getByText('DRNT')).toBeInTheDocument();
    expect(within(table).getByText('RADC')).toBeInTheDocument();
    expect(within(table).getByText('Total')).toBeInTheDocument();
    expect(within(table).getAllByText(/300/).length).toBeGreaterThan(0); // 100 + 200 de budget
  });
  it('un portefeuille sans projet lisible : état vide', async () => {
    routes['/v1/me/dashboard/portfolios'] = { portfolios: [{ key: 'defense', name: 'Défense', projects: [] }] };
    show(<PortfolioFinanceCard portfolio="defense" />);
    expect(await screen.findByText('Aucune donnée financière.')).toBeInTheDocument();
  });
});

describe('charge et capacité (N3)', () => {
  const view = {
    periods: [{ key: '2026-W47', from: day(0), to: day(6) }],
    teams: [{ team: 'dev', name: 'Développement', cells: [{ period: '2026-W47', capacityMinutes: 1000, nominativeMinutes: 900, genericMinutes: 200, freeMinutes: 0, level: 'overload' }] }, { team: 'qa', name: 'Qualité', cells: [{ period: '2026-W47', capacityMinutes: 1000, nominativeMinutes: 100, genericMinutes: 0, freeMinutes: 900, level: 'free' }] }],
    bottlenecks: [{ team: 'dev', name: 'Développement', period: '2026-W47', saturationPercent: 120, projects: [{ project: 'LUMEN', minutes: 600 }] }],
  };
  it('sans périmètre : toutes les équipes visibles, avec leur pic et leurs semaines de surcharge', async () => {
    routes['/v1/capacity'] = view;
    show(<CapacityCard />);
    const table = await screen.findByRole('table', { name: 'Charge et capacité sur 12 semaines' });
    expect(within(table).getByText('Développement')).toBeInTheDocument();
    expect(within(table).getByText('Qualité')).toBeInTheDocument();
    expect(within(table).getByText('1 semaine en surcharge')).toBeInTheDocument();
    expect(screen.getByText('120 % de saturation')).toBeInTheDocument();
  });
  it('pour un projet : seulement les équipes où il pèse ; un projet sans surcharge : état vide', async () => {
    routes['/v1/capacity'] = view;
    const { unmount } = show(<CapacityCard project="LUMEN" />);
    expect((await screen.findAllByText('Développement')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Qualité')).not.toBeInTheDocument();
    unmount();
    show(<CapacityCard project="AUTRE" />);
    expect(await screen.findByText('Aucune surcharge sur les 12 prochaines semaines pour ce périmètre.')).toBeInTheDocument();
  });
});

describe('feuille de route (N4)', () => {
  it('un projet : versions et revues des 90 prochains jours, les retards signalés', async () => {
    routes['/v1/projects/LUMEN/roadmap'] = [{ name: 'v1.0', endsOn: day(20), state: 'planned' }, { name: 'v0.9', endsOn: day(-3), state: 'planned' }, { name: 'v9', endsOn: day(200), state: 'planned' }];
    routes['/v1/projects/LUMEN/template'] = { phases: [{ key: 'phase-a', name: 'Phase A', review: 'pdr', offTemplate: false, record: { reviewPlannedOn: day(30), reviewHeldOn: null } }] };
    show(<RoadmapCard project="LUMEN" />);
    const table = await screen.findByRole('table', { name: 'Jalons des 90 prochains jours' });
    expect(within(table).getByText('v1.0')).toBeInTheDocument();
    expect(within(table).getByText('PDR')).toBeInTheDocument();
    expect(within(table).getByText(/en retard/)).toBeInTheDocument();
    expect(within(table).queryByText('v9')).not.toBeInTheDocument();
  });
  it('un portefeuille : jalons de ses projets ; rien à venir : état vide', async () => {
    routes['/v1/portfolios/defense/roadmap'] = { portfolio: { key: 'defense', name: 'Défense' }, hiddenByState: 0, projects: [{ key: 'DRNT', name: 'Drone', lifecycle: { key: 'a', name: 'a', category: 'x' }, plannedStart: null, plannedEnd: null, calculatedEnd: null, baseline: null, phases: [], releases: [{ name: 'R1', startsOn: day(1), endsOn: day(15), state: 'planned' }], unscheduled: false }] };
    const { unmount } = show(<RoadmapCard portfolio="defense" />);
    expect(await screen.findByText('R1')).toBeInTheDocument();
    unmount();
    routes['/v1/portfolios/defense/roadmap'] = { portfolio: { key: 'defense', name: 'Défense' }, hiddenByState: 0, projects: [] };
    show(<RoadmapCard portfolio="defense" />);
    expect(await screen.findByText('Aucun jalon dans les 90 prochains jours.')).toBeInTheDocument();
  });
});

describe('phase et prochaine revue (N5)', () => {
  it('phase en cours, revue et date, critères de sortie remplis et à valider à la main', async () => {
    routes['/v1/projects/LUMEN/template'] = {
      templateKey: 'spatial-project', phase: 'phase-a',
      phaseCheck: { key: 'phase-a', name: 'Phase A', review: 'pdr', next: 'phase-b', canAdvance: false, criteria: [{ label: 'a', stage: 'exit', manual: true, met: false }, { label: 'b', stage: 'exit', manual: false, met: true }, { label: 'c', stage: 'entry', manual: true, met: false }] },
      phases: [{ key: 'phase-a', name: 'Phase A', review: 'pdr', offTemplate: false, record: { reviewPlannedOn: '2026-12-01', reviewHeldOn: null } }],
    };
    show(<PhaseGateCard project="LUMEN" />);
    expect(await screen.findByText('Phase A')).toBeInTheDocument();
    expect(screen.getByText(/PDR/)).toBeInTheDocument();
    expect(screen.getByText(/1 sur 2 remplis/)).toHaveTextContent('1 à valider à la main');
  });
  it('un projet sans gabarit normatif : état vide explicite', async () => {
    routes['/v1/projects/NOVA/template'] = { templateKey: null, phase: null, phaseCheck: null };
    show(<PhaseGateCard project="NOVA" />);
    expect(await screen.findByText(/n’a pas de gabarit normatif/)).toBeInTheDocument();
  });
});

describe('portes, décisions et demandes (N6, N7)', () => {
  it('les revues des 60 prochains jours, les décisions à appliquer et les dernières décisions', async () => {
    routes['/v1/portfolios/defense/gates'] = { rows: [
      { project: 'DRNT', name: 'Drone', phaseName: 'Conception', review: 'pdr', reviewPlannedOn: day(10), reviewHeldOn: null, canAdvance: true, criteria: { total: 4, met: 4 } },
      { project: 'RADC', name: 'Radar', phaseName: 'Exigences', review: 'srr', reviewPlannedOn: day(200), reviewHeldOn: null, canAdvance: false, criteria: { total: 3, met: 0 } },
    ] };
    routes['/v1/portfolios/defense/decisions'] = [{ id: 'd1', project: 'DRNT', kind: 'change', appliedAt: null, decidedAt: day(-1), costDelta: 5000, scheduleDeltaDays: null, proposedState: null }, { id: 'd2', project: 'RADC', kind: 'continue', appliedAt: day(-5), decidedAt: day(-6), costDelta: null, scheduleDeltaDays: null, proposedState: null }];
    show(<PortfolioGatesCard portfolio="defense" />);
    const table = await screen.findByRole('table', { name: 'Revues des 60 prochains jours' });
    expect(within(table).getByText('DRNT')).toBeInTheDocument();
    expect(within(table).queryByText('RADC')).not.toBeInTheDocument(); // dans 200 jours
    expect(screen.getByText('1 décision à appliquer')).toBeInTheDocument();
    expect(screen.getByText('Changement chiffré')).toBeInTheDocument();
  });
  it('rien à venir : état vide', async () => {
    routes['/v1/portfolios/defense/gates'] = { rows: [] };
    routes['/v1/portfolios/defense/decisions'] = [];
    show(<PortfolioGatesCard portfolio="defense" />);
    expect(await screen.findByText('Aucune revue à venir, aucune décision à appliquer.')).toBeInTheDocument();
  });
  it('les demandes à instruire, triées, sans celles déjà converties ou refusées', async () => {
    routes['/v1/portfolios/defense/ranking'] = { model: null, requests: [
      { key: 'DEFP-REQ-0001', project: 'DEFP', title: 'Radar léger', score: 80, completeness: 100, incomplete: false, converted: null },
      { key: 'DEFP-REQ-0002', project: 'DEFP', title: 'Déjà fait', score: 90, completeness: 100, incomplete: false, converted: 'converted' },
      { key: 'DEFP-REQ-0003', project: 'DEFP', title: 'Sans score', score: null, completeness: 40, incomplete: true, converted: null },
    ] };
    show(<PortfolioRequestsCard portfolio="defense" />);
    expect(await screen.findByText('Radar léger')).toBeInTheDocument();
    expect(screen.queryByText('Déjà fait')).not.toBeInTheDocument();
    expect(screen.getByText('à compléter')).toBeInTheDocument();
  });
});

describe('risques consolidés (N8)', () => {
  const cells = [{ probability: 4, impact: 5, count: 2 }];
  it('projet : la matrice du projet et les plus critiques ; sans risque : état vide', async () => {
    routes['/v1/projects/LUMEN/risk-matrix'] = { cells, top: [{ key: 'LUMEN-RSK-0001', project: 'LUMEN', probability: 4, impact: 5, criticality: 20 }], total: 2 };
    const { unmount } = show(<RiskMatrixCard project="LUMEN" />);
    expect(await screen.findByRole('table', { name: /2 risques/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LUMEN-RSK-0001' })).toHaveAttribute('href', '/p/LUMEN/a/LUMEN-RSK-0001');
    unmount();
    routes['/v1/projects/LUMEN/risk-matrix'] = { cells: [], top: [], total: 0 };
    show(<RiskMatrixCard project="LUMEN" />);
    expect(await screen.findByText(/Aucun risque/)).toBeInTheDocument();
  });
  it('portefeuille : la matrice consolidée', async () => {
    routes['/v1/portfolios/defense/risks'] = { cells, top: [], total: 2 };
    show(<RiskMatrixCard portfolio="defense" />);
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('état de la plateforme (N9)', () => {
  it('chaque ligne dit son état et mène à l’écran qui permet d’agir', async () => {
    routes['/v1/admin/platform-status'] = { history: { pending: 3, oldestMinutes: 42, reconcileErrors: 1 }, webhooks: { failed: 2, late: 0 }, plugins: { installed: 4, disabled: 1 }, tokens: { expiring: 0 } };
    show(<PlatformOpsCard />);
    expect(await screen.findByText(/3 événements pas encore écrits, le plus ancien depuis 42 min/)).toBeInTheDocument();
    expect(screen.getByText(/1 projet en échec/)).toBeInTheDocument();
    expect(screen.getByText(/2 en échec sur 7 jours/)).toBeInTheDocument();
    expect(screen.getByText(/1 désactivé sur 4/)).toBeInTheDocument();
    expect(screen.getByText('aucune échéance proche')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jetons d’accès' })).toHaveAttribute('href', '/profil');
  });
  it('en erreur : indisponible', async () => {
    routes['/v1/admin/platform-status'] = 'error';
    show(<PlatformOpsCard />);
    expect(await screen.findByText('Indisponible pour le moment.')).toBeInTheDocument();
  });
});

describe('portefeuille d’une carte', () => {
  it('usePortfolioProjects : indéfini sans portefeuille, nul pendant le chargement, puis la liste de ses projets', async () => {
    routes['/v1/me/dashboard/portfolios'] = { portfolios: [{ key: 'defense', name: 'Défense', projects: ['DRNT'] }] };
    const seen: Array<string[] | null | undefined> = [];
    function Probe({ p }: { p?: string }) { seen.push(usePortfolioProjects(p)); return null; }
    render(<Probe />);
    expect(seen.at(-1)).toBeUndefined();
    render(<Probe p="defense" />);
    await waitFor(() => expect(seen.at(-1)).toEqual(['DRNT']));
    expect(seen).toContain(null);
  });
});

describe('accessibilité', () => {
  it('les cartes à tableau et la matrice n’ont pas de défaut axe', async () => {
    routes['/v1/projects/LUMEN/risk-matrix'] = { cells: [{ probability: 4, impact: 5, count: 2 }], top: [{ key: 'LUMEN-RSK-0001', project: 'LUMEN', probability: 4, impact: 5, criticality: 20 }], total: 2 };
    routes['/v1/capacity'] = { periods: [], teams: [{ team: 'dev', name: 'Développement', cells: [{ period: 'w', capacityMinutes: 1000, nominativeMinutes: 900, genericMinutes: 0, freeMinutes: 100, level: 'tight' }] }], bottlenecks: [] };
    const { container } = show(<><RiskMatrixCard project="LUMEN" /><CapacityCard /></>);
    await screen.findByRole('table', { name: /2 risques/ });
    await screen.findByText('Développement');
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
