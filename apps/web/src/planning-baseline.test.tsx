import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { ScheduleGantt } from './components/ScheduleGantt';
import { axisOf, type ScheduleData, type ScheduleTask } from './lib/schedule';
import { PlanningPage } from './pages/PlanningPage';

// T-0164 : chemin critique (trait épais et mention « Critique ») et calque de baseline (pointillés, écart en jours).

const task = (key: string, over: Partial<ScheduleTask> = {}): ScheduleTask => ({
  key, title: `Tâche ${key}`, tracker: 'TSK', parent: null, summary: false, milestone: false, scheduled: true,
  start: '2026-11-09', end: '2026-11-10', plannedStart: '2026-11-09', plannedEnd: '2026-11-10', duration: 2, moved: false, slack: 3, critical: false, progress: null, remaining: null, version: 1, ...over,
});
const data: ScheduleData = {
  tasks: [
    task('N-1', { critical: true, slack: 0, baselineStart: '2026-11-09', baselineEnd: '2026-11-10', variance: 0 }),
    task('N-2', { critical: true, slack: 0, plannedStart: '2026-11-12', plannedEnd: '2026-11-17', baselineStart: '2026-11-11', baselineEnd: '2026-11-13', variance: 2 }),
    task('N-3', { slack: 4, plannedStart: '2026-11-09', plannedEnd: '2026-11-10', baselineStart: '2026-11-10', baselineEnd: '2026-11-12', variance: -1 }),
    task('N-4', { slack: 4, baselineStart: null, baselineEnd: null, variance: null }),
  ],
  links: [{ id: 'l1', from: 'N-1', to: 'N-2', lag: 0 }, { id: 'l2', from: 'N-1', to: 'N-3', lag: 0 }],
  projectEnd: '2026-11-17', criticalPath: ['N-1', 'N-2'], moved: 0, baseline: { name: 'B1', createdAt: '2026-11-01T10:00:00Z' },
};
const noBaseline: ScheduleData = { ...data, baseline: null, tasks: data.tasks.map(({ baselineStart: _s, baselineEnd: _e, variance: _v, ...t }) => t as ScheduleTask) };
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('chemin critique', () => {
  it('trait épais, lien épais et mention « Critique » dans le tableau, seulement pour les tâches sans marge', () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={noBaseline} calendar={null} critical />);
    expect(container.querySelectorAll('g.ath-gantt-critical')).toHaveLength(2);
    expect(container.querySelectorAll('path.ath-gantt-link--critical')).toHaveLength(1); // N-1 → N-2 seulement
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).queryByText('Critique') !== null)).toEqual([true, true, false, false]);
  });

  it('désactivé : aucune mise en évidence ni mention', () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={noBaseline} calendar={null} />);
    expect(container.querySelectorAll('.ath-gantt-critical, .ath-gantt-link--critical')).toHaveLength(0);
    expect(screen.queryByText('Critique')).toBeNull();
  });
});

describe('calque de baseline', () => {
  it('dessine un pointillé par tâche présente dans la baseline et ajoute la colonne d’écart en jours', () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={data} calendar={null} />);
    expect(container.querySelectorAll('rect.ath-gantt-baseline')).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: 'Écart' })).toBeInTheDocument();
    const gaps = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').at(-1)!.textContent);
    expect(gaps).toEqual(['0 j', '+2 j', '−1 j', '—']);
    expect(screen.getByText('+2 j')).toHaveAttribute('title', '2 jours ouvrés de retard');
    expect(screen.getByText('−1 j')).toHaveAttribute('title', '1 jour ouvré d’avance');
    expect(container.querySelector('rect.ath-gantt-baseline title')!.textContent).toMatch(/^Baseline : /);
  });

  it('sans baseline : ni colonne ni pointillé', () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={noBaseline} calendar={null} />);
    expect(container.querySelectorAll('rect.ath-gantt-baseline')).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Écart' })).toBeNull();
  });

  it('l’axe du temps inclut les dates de la baseline', () => {
    const early = { ...data, tasks: [task('N-1', { baselineStart: '2026-10-01', baselineEnd: '2026-10-05' })] };
    const axis = axisOf(early.tasks)!;
    expect(Date.UTC(2026, 9, 1) / 86_400_000).toBeGreaterThanOrEqual(axis.first);
  });

  it('reste accessible (axe) avec chemin critique et baseline', async () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={data} calendar={null} critical />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
});

const member = { authenticated: true, user: { name: 'Uma', roles: ['athena-user'] } } as unknown as Session;

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}

describe('PlanningPage : critique et baseline', () => {
  let urls: string[] = [];
  beforeEach(() => {
    urls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      urls.push(input);
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (/schedule\/baselines$/.test(input)) return ok([{ name: 'B1', createdAt: '2026-11-01T10:00:00Z', tasks: 4 }]);
      if (/schedule\?baseline=B1$/.test(input)) return ok(data);
      if (/\/schedule$/.test(input)) return ok(noBaseline);
      return ok([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = (url = '/p/NOVA/planning') => render(
    <MemoryRouter initialEntries={[url]}><ToastProvider><Where /><Routes><Route path="/p/:project/planning" element={<PlanningPage session={member} />} /></Routes></ToastProvider></MemoryRouter>,
  );

  it('l’interrupteur garde le chemin critique dans l’adresse et affiche son explication', async () => {
    open();
    const toggle = await screen.findByRole('switch', { name: 'Chemin critique' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(screen.getByTestId('where').textContent).toBe('/p/NOVA/planning?critique=1');
    expect(screen.getByText(/Trait épais et mention « Critique »/)).toBeInTheDocument();
    expect(screen.getAllByText('Critique').length).toBeGreaterThan(0);
  });

  it('choisir une baseline recharge le planning comparé et le garde dans l’adresse', async () => {
    open();
    const select = await screen.findByLabelText('Comparer à une baseline');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'B1' })).toBeInTheDocument());
    await userEvent.selectOptions(select, 'B1');
    await waitFor(() => expect(urls.some((u) => /schedule\?baseline=B1$/.test(u))).toBe(true));
    expect(screen.getByTestId('where').textContent).toBe('/p/NOVA/planning?baseline=B1');
    expect(await screen.findByRole('columnheader', { name: 'Écart' })).toBeInTheDocument();
    expect(screen.getByText('Pointillés : dates figées par la baseline B1.')).toBeInTheDocument();
  });

  it('une adresse avec baseline et critique rouvre la même vue', async () => {
    open('/p/NOVA/planning?critique=1&baseline=B1');
    expect(await screen.findByRole('columnheader', { name: 'Écart' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Chemin critique' })).toBeChecked();
  });
});
