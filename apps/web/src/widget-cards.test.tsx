import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgesCard, GeneralInfoCard, GlobalProgressCard, HealthCard, KeyIndicatorsCard, PipelinesCard, QualityCard, SprintProgressCard, type Kpis, type Pipelines, type Quality } from './components/WidgetCards';

// T-0173 à T-0176 : widgets de pilotage, de pipelines, de qualité et de badges, dans leurs états (plein, vide, non relié).

const kpis = (over: Partial<Kpis> = {}): Kpis => ({
  project: { key: 'NOVA', name: 'Nova', createdAt: '2026-01-05T10:00:00Z', members: 6, managers: ['pm.dev'] },
  progress: { total: 20, done: 5, inProgress: 3, todo: 12, percent: 25 },
  late: 2, blocked: 1, dueSoon: 4, open: 15,
  workload: [{ assignee: 'alice', count: 5 }, { assignee: 'bob', count: 2 }],
  velocity: { average: 21, forecast: 22, sprints: 3 },
  sprint: { id: 's1', name: 'Sprint 4', endsOn: '2026-11-20', items: 10, doneItems: 4, totalPoints: 20, donePoints: 8, percent: 40, daysLeft: 7 },
  health: { state: 'attention', reasons: ['blocked', 'late'] },
  ...over,
});
let api: Record<string, unknown>;
beforeEach(() => {
  api = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const hit = Object.entries(api).find(([k]) => url.endsWith(k));
    return new Response(JSON.stringify(hit ? hit[1] : {}), { status: hit ? 200 : 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const view = (node: JSX.Element) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('pilotage', () => {
  it('Informations générales : projet, chefs, membres, date', async () => {
    api['/kpis'] = kpis();
    view(<GeneralInfoCard project="NOVA" />);
    expect(await screen.findByText('pm.dev')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('2026-01-05').tagName).toBe('TIME');
  });

  it('Avancement global : arc avec le pourcentage dit en toutes lettres ; vide sans ticket', async () => {
    api['/kpis'] = kpis();
    const { unmount } = view(<GlobalProgressCard project="NOVA" />);
    expect(await screen.findByRole('img', { name: 'Avancement 25 % : 5 tickets terminés sur 20' })).toBeInTheDocument();
    expect(screen.getByText('3 en cours')).toBeInTheDocument();
    unmount();
    api['/kpis'] = kpis({ progress: { total: 0, done: 0, inProgress: 0, todo: 0, percent: 0 } });
    view(<GlobalProgressCard project="NOVA" />);
    expect(await screen.findByText('Aucun ticket dans ce projet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir les trackers' })).toHaveAttribute('href', '/p/NOVA/trackers');
  });

  it('Indicateurs clés : retards et échéances ouvrent la recherche ; charge par personne', async () => {
    api['/kpis'] = kpis();
    view(<KeyIndicatorsCard project="NOVA" />);
    expect(await screen.findByRole('link', { name: 'En retard' })).toHaveAttribute('href', `/p/NOVA/recherche?q=${encodeURIComponent('late()')}`);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
  });

  it.each([['ok', 'Sain'], ['attention', 'À surveiller'], ['critical', 'Critique']] as const)('Santé du projet, état %s : le libellé porte l’état, pas la couleur seule', async (state, label) => {
    api['/kpis'] = kpis({ health: { state, reasons: [] }, blocked: 3 });
    view(<HealthCard project="NOVA" />);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'bloquants' })).toHaveAttribute('href', `/p/NOVA/recherche?q=${encodeURIComponent('blocked()')}`);
    expect(screen.getByText('3')).toBeInTheDocument(); // le chiffre est celui de la recherche « bloquants »
  });

  it('sans projet choisi : invite à en choisir un ; indisponible si l’API échoue', async () => {
    const { unmount } = view(<HealthCard project="" />);
    expect(screen.getByText('Choisissez un projet dans les réglages de la carte.')).toBeInTheDocument();
    unmount();
    view(<HealthCard project="NOVA" />);
    expect(await screen.findByText('Indisponible pour le moment.')).toBeInTheDocument();
  });

  it('Progression du sprint : anneau et jours restants ; vide sans sprint en cours', async () => {
    api['/kpis'] = kpis();
    const { unmount } = view(<SprintProgressCard project="NOVA" />);
    expect(await screen.findByRole('img', { name: 'Sprint 4 : 40 % terminé' })).toBeInTheDocument();
    expect(screen.getByText('4 / 10')).toBeInTheDocument();
    unmount();
    api['/kpis'] = kpis({ sprint: null });
    view(<SprintProgressCard project="NOVA" />);
    expect(await screen.findByText('Aucun sprint en cours.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le backlog' })).toHaveAttribute('href', '/p/NOVA/backlog');
  });
});

const runs = (over: Partial<Pipelines> = {}): Pipelines => ({
  configured: true, successRate: 75, running: true,
  repos: [{ repo: 'root/app', successRate: 75, running: true, last: 'running', runs: [{ id: 3, state: 'running', ref: 'main', url: 'http://gl/3' }, { id: 2, state: 'success', ref: 'main', url: 'http://gl/2' }, { id: 1, state: 'failed', ref: 'dev', url: 'http://gl/1' }] }],
  ...over,
});
const quality = (over: Partial<Quality> = {}): Quality => ({ connected: true, provider: 'sonar', measures: { gate: 'passed', coverage: 81.5, bugs: 2, vulnerabilities: 0, smells: 14, debtMinutes: 95, analyzedAt: null }, ...over });

describe('pipelines, qualité et badges', () => {
  it('Pipelines : taux, exécutions avec libellé, l’exécution en cours est animée (coupée sous prefers-reduced-motion par la feuille)', async () => {
    api['/pipelines'] = runs();
    const { container } = view(<PipelinesCard project="NOVA" />);
    expect(await screen.findByText('75 %')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Dernières exécutions de root/app' });
    expect(within(list).getByText('Réussi')).toBeInTheDocument();
    expect(within(list).getByText('Échec')).toBeInTheDocument();
    expect(container.querySelectorAll('.ath-run--running')).toHaveLength(1);
  });

  it('Pipelines sans dépôt : « Relier un dépôt »', async () => {
    api['/pipelines'] = runs({ repos: [], successRate: null, running: false });
    view(<PipelinesCard project="NOVA" />);
    expect(await screen.findByText('Aucun dépôt relié à ce projet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relier un dépôt' })).toHaveAttribute('href', '/p/NOVA/rapports/code');
  });

  it('Qualité du code : non relié → « Relier SonarQube » vers l’administration ; relié → couverture et porte', async () => {
    api['/quality'] = quality({ connected: false, provider: null, measures: null });
    const { unmount } = view(<QualityCard project="NOVA" />);
    expect(await screen.findByRole('link', { name: 'Relier SonarQube' })).toHaveAttribute('href', '/admin');
    unmount();
    api['/quality'] = quality();
    view(<QualityCard project="NOVA" />);
    expect(await screen.findByText('81.5 %')).toBeInTheDocument();
    expect(screen.getByText('Porte franchie')).toBeInTheDocument();
  });

  it('Badges : pipeline et version publiée toujours ; le badge SonarQube est masqué sans connexion', async () => {
    api['/pipelines'] = runs();
    api['/roadmap'] = [{ name: 'v1.0', state: 'published' }, { name: 'v1.1', state: 'draft' }];
    api['/quality'] = quality({ connected: false, provider: null, measures: null });
    const { unmount } = view(<BadgesCard project="NOVA" />);
    expect(await screen.findByText('Pipeline : En cours')).toBeInTheDocument();
    expect(screen.getByText('Version : v1.0')).toBeInTheDocument();
    expect(screen.queryByText(/Qualité :/)).toBeNull();
    unmount();
    api['/quality'] = quality();
    view(<BadgesCard project="NOVA" />);
    expect(await screen.findByText('Qualité : Porte franchie')).toBeInTheDocument();
  });

  it('Badges sans rien : état vide avec « Relier un dépôt »', async () => {
    api['/pipelines'] = runs({ repos: [], configured: false });
    api['/roadmap'] = [];
    api['/quality'] = quality({ connected: false, provider: null, measures: null });
    view(<BadgesCard project="NOVA" />);
    expect(await screen.findByText('Aucun badge à afficher pour l’instant.')).toBeInTheDocument();
  });

  it('aucun défaut d’accessibilité sur les widgets (pastilles à libellé)', async () => {
    api['/kpis'] = kpis(); api['/pipelines'] = runs(); api['/quality'] = quality(); api['/roadmap'] = [{ name: 'v1.0', state: 'published' }];
    const { container } = view(<main><HealthCard project="NOVA" /><SprintProgressCard project="NOVA" /><GlobalProgressCard project="NOVA" /><PipelinesCard project="NOVA" /><BadgesCard project="NOVA" /></main>);
    await screen.findByText('Version : v1.0');
    await screen.findByText('Sprint 4');
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
