import { render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { ScheduleGantt } from './components/ScheduleGantt';
import { PlanningPage } from './pages/PlanningPage';
import { axisOf, dayNumber, nonWorkingRuns, visibleWindow, wbsOrder, workingPredicate, xOf, DAY_WIDTH, type ScheduleData, type ScheduleTask } from './lib/schedule';

// T-0162 : Planning (Gantt en lecture).

const task = (key: string, over: Partial<ScheduleTask> = {}): ScheduleTask => ({
  key, title: `Tâche ${key}`, tracker: 'TSK', parent: null, summary: false, milestone: false, scheduled: true,
  start: '2026-11-09', end: '2026-11-10', plannedStart: '2026-11-09', plannedEnd: '2026-11-10', duration: 2, moved: false, slack: 0, critical: false, progress: null, remaining: null, version: 1, status: { key: 'todo', name: 'À faire', category: 'todo', color: null }, assignee: null, ...over,
});
// Lundi 9 novembre 2026 ; le 11 est férié.
const data: ScheduleData = {
  tasks: [
    task('N-1', { title: 'Phase', summary: true, plannedStart: '2026-11-09', plannedEnd: '2026-11-13', duration: 0 }),
    task('N-2', { title: 'Conception', parent: 'N-1', progress: 50 }),
    task('N-3', { title: 'Réalisation', parent: 'N-1', plannedStart: '2026-11-12', plannedEnd: '2026-11-13', start: '2026-11-12', end: '2026-11-13' }),
    task('N-4', { title: 'Livraison', milestone: true, start: null, plannedStart: null, plannedEnd: '2026-11-17', end: '2026-11-17', duration: 0 }),
    task('N-5', { title: 'Idée', scheduled: false, start: null, end: null, plannedStart: null, plannedEnd: null, duration: 0 }),
  ],
  links: [{ id: 'l1', from: 'N-2', to: 'N-3', lag: 0 }, { id: 'l2', from: 'N-3', to: 'N-4', lag: 0 }],
  projectEnd: '2026-11-17', criticalPath: [], moved: 0,
};
const calendar = { workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }] };

describe('planning : calculs d’affichage', () => {
  it('ordonne le tableau selon la hiérarchie, enfants sous leur parent', () => {
    const shuffled = [data.tasks[1]!, data.tasks[3]!, data.tasks[0]!, data.tasks[2]!, data.tasks[4]!];
    expect(wbsOrder(shuffled).map((r) => [r.task.key, r.depth])).toEqual([['N-4', 0], ['N-1', 0], ['N-2', 1], ['N-3', 1], ['N-5', 0]]);
  });

  it('cale l’axe sur les dates planifiées, avec une marge, et positionne les dates au jour près', () => {
    const axis = axisOf(data.tasks)!;
    expect(axis.first).toBe(dayNumber('2026-11-09') - 2);
    expect(axis.days).toBeGreaterThanOrEqual(21);
    expect(xOf(axis, '2026-11-09')).toBe(2 * DAY_WIDTH);
    expect(xOf(axis, '2026-11-10')).toBe(3 * DAY_WIDTH);
    expect(axisOf([task('X', { plannedStart: null, plannedEnd: null, scheduled: false })])).toBeNull();
  });

  it('regroupe les jours non ouvrés (week-ends et fériés) en plages', () => {
    const axis = axisOf(data.tasks)!;
    const runs = nonWorkingRuns(axis, workingPredicate(calendar));
    // 7-8 nov (samedi, dimanche) avant le 9 ; mercredi 11 férié ; 14-15 nov.
    expect(runs.slice(0, 4)).toEqual([[0, 2], [4, 1], [7, 2], [14, 2]]);
  });

  it('ne dessine que la fenêtre visible au-delà de 80 lignes', () => {
    expect(visibleWindow(50, 0, 600)).toEqual({ from: 0, to: 50 });
    expect(visibleWindow(500, 0, 640)).toEqual({ from: 0, to: 28 });
    expect(visibleWindow(500, 3200, 640)).toEqual({ from: 92, to: 128 });
    expect(visibleWindow(500, 99_999, 640).to).toBe(500);
  });
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ScheduleGantt', () => {
  it('affiche le tableau WBS puis le diagramme : barres, avancement, jalon, repère du jour, jours grisés, liens', () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} today={new Date('2026-11-10T09:00:00Z')} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['N-1', 'N-2', 'N-3', 'N-4', 'N-5']);
    expect(within(rows[1]!).getAllByRole('cell')[1]!.className).toContain('ath-gantt-indent-1');
    expect(within(rows[3]!).getAllByRole('cell')[4]!.textContent).toBe('Jalon');
    expect(within(rows[4]!).getAllByRole('cell')[2]!.textContent).toBe('—'); // tâche sans date
    expect(within(rows[1]!).getAllByRole('cell')[5]!.textContent).toBe('50 %');

    const bars = [...container.querySelectorAll('rect.ath-gantt-bar')];
    expect(bars).toHaveLength(3); // parente + deux tâches ; le jalon est un losange
    const conception = bars[1]!;
    expect(Number(conception.getAttribute('x'))).toBe(2 * DAY_WIDTH); // 9 novembre
    expect(Number(conception.getAttribute('width'))).toBe(2 * DAY_WIDTH); // 9 et 10 novembre
    const done = container.querySelectorAll('rect.ath-gantt-done');
    expect(done).toHaveLength(1);
    expect(Number(done[0]!.getAttribute('width'))).toBe(DAY_WIDTH); // 50 % de 2 jours
    expect(container.querySelectorAll('.ath-gantt-milestone polygon')).toHaveLength(1);
    expect(container.querySelectorAll('.ath-gantt-today')).toHaveLength(1);
    expect(container.querySelectorAll('rect.ath-gantt-off').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('path.ath-gantt-link')).toHaveLength(2);
    expect(container.querySelector('svg[role="img"]')!.getAttribute('aria-label')).toMatch(/Diagramme de Gantt : 5 lignes/);
    expect(container.querySelector('.ath-gantt-bar')!.closest('g')!.querySelector('title')!.textContent).toContain('N-1 Phase');
  });

  it('n’emploie aucun style en ligne (CSP)', () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} />);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('500 lignes : seule une fenêtre est dessinée, le tableau garde sa hauteur par des lignes d’espacement', () => {
    const many: ScheduleData = { ...data, tasks: Array.from({ length: 500 }, (_, i) => task(`N-${i + 1}`, { plannedStart: '2026-11-09', plannedEnd: '2026-11-10' })), links: [] };
    const { container } = wrap(<ScheduleGantt project="NOVA" data={many} calendar={calendar} />);
    const drawn = container.querySelectorAll('rect.ath-gantt-bar').length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(60);
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(60);
    expect(container.querySelector('.ath-gantt-svg:not(.ath-gantt-svg--head)')!.getAttribute('height')).toBe(String(500 * 32));
    const spacer = container.querySelector('tbody tr[aria-hidden="true"] svg');
    expect(spacer).not.toBeNull();
  });

  it('est accessible (axe)', async () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

const session = { authenticated: true, user: { name: 'Pat', roles: ['athena-team-member'] } } as unknown as Session;

describe('PlanningPage', () => {
  let paths: string[] = [];
  beforeEach(() => {
    paths = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      paths.push(input);
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (/\/schedule$/.test(input)) return ok(globalThis.__schedule ?? data);
      if (/\/v1\/calendar$/.test(input)) return ok(calendar);
      if (/\/roadmap$/.test(input)) return ok([]);
      return ok([]);
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); globalThis.__schedule = undefined; });

  const open = (url: string) => render(
    <MemoryRouter initialEntries={[url]}><ToastProvider><Routes><Route path="/p/:project/planning" element={<PlanningPage session={session} />} /></Routes></ToastProvider></MemoryRouter>,
  );

  it('ouvre le Gantt par défaut, avec les onglets Gantt et Versions', async () => {
    open('/p/NOVA/planning');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Vues du planning' });
    expect(within(tabs).getByRole('link', { name: 'Gantt' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Versions' })).toHaveAttribute('href', '/p/NOVA/planning?vue=versions');
    expect(paths.some((p) => /\/v1\/projects\/NOVA\/schedule$/.test(p))).toBe(true);
  });

  it('?vue=versions affiche l’ancienne Roadmap sans second titre', async () => {
    open('/p/NOVA/planning?vue=versions');
    expect(await screen.findByText('Aucune version dans ce projet.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(paths.some((p) => /\/schedule$/.test(p))).toBe(false);
  });

  it('sans tâche planifiée, explique comment en avoir', async () => {
    globalThis.__schedule = { ...data, tasks: [] };
    open('/p/NOVA/planning');
    await waitFor(() => expect(screen.getByText('Aucune tâche planifiée dans ce projet.')).toBeInTheDocument());
  });
});

declare global { var __schedule: ScheduleData | undefined }

describe('Gantt : phases repliables et défilement du diagramme', () => {
  it('replier une phase masque ses tâches du tableau et du diagramme ; déplier les rend ; Tout replier / Tout déplier', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const { container } = render(<MemoryRouter><ScheduleGantt project="NOVA" data={data} calendar={calendar} today={new Date('2026-11-10T12:00:00Z')} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'N-2' })).toBeInTheDocument();
    const bars = () => container.querySelectorAll('.ath-gantt-task, .ath-gantt-summary, .ath-gantt-milestone').length;
    const before = bars();
    await userEvent.click(screen.getByRole('button', { name: 'Replier Phase' }));
    expect(screen.queryByRole('link', { name: 'N-2' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'N-3' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Déplier Phase' })).toHaveAttribute('aria-expanded', 'false');
    expect(bars()).toBe(before - 2);
    await userEvent.click(screen.getByRole('button', { name: 'Déplier Phase' }));
    expect(screen.getByRole('link', { name: 'N-2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tout replier' }));
    expect(screen.queryByRole('link', { name: 'N-3' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tout déplier' }));
    expect(screen.getByRole('link', { name: 'N-3' })).toBeInTheDocument();
  });

  it('le défilement horizontal est porté par le diagramme seul, pas par le tableau', () => {
    const { container } = render(<MemoryRouter><ScheduleGantt project="NOVA" data={data} calendar={calendar} /></MemoryRouter>);
    const scroller = container.querySelector('.ath-gantt-scroll')!;
    expect(scroller.querySelector('svg')).not.toBeNull();
    expect(scroller.querySelector('table')).toBeNull();
    expect(container.querySelector('.ath-gantt-left')!.querySelector('table')).not.toBeNull();
  });
});
