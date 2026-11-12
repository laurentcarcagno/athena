import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artifact, Session, TrackerDefinition } from './api';
import { PlanningSection, hasPlanning } from './components/PlanningSection';
import { PlanningBoard, PlanningList } from './components/PlanningViews';
import { filterSchedule, type ScheduleData, type ScheduleTask } from './lib/schedule';
import { PlanningPage } from './pages/PlanningPage';

// T-0165 : onglets Gantt / Board / Liste / Versions sur un même périmètre, section Planification de la fiche, rôles.

const done = { key: 'done', name: 'Terminé', category: 'done', color: null };
const doing = { key: 'doing', name: 'En cours', category: 'in_progress', color: null };
const todo = { key: 'todo', name: 'À faire', category: 'todo', color: null };
const task = (key: string, over: Partial<ScheduleTask> = {}): ScheduleTask => ({
  key, title: `Tâche ${key}`, tracker: 'TSK', parent: null, summary: false, milestone: false, scheduled: true,
  start: '2026-11-09', end: '2026-11-10', plannedStart: '2026-11-09', plannedEnd: '2026-11-10', duration: 2, moved: false, slack: 3, critical: false, progress: null, remaining: null, version: 1, status: todo, assignee: null, ...over,
});
const data: ScheduleData = {
  tasks: [
    task('N-1', { title: 'Phase', summary: true, plannedStart: '2026-11-09', plannedEnd: '2026-11-20', end: '2026-11-20', status: doing }),
    task('N-2', { title: 'Conception', parent: 'N-1', status: done, progress: 100, critical: true, slack: 0, assignee: 'u-uma', end: '2020-01-10', plannedEnd: '2020-01-10' }),
    task('N-3', { title: 'Réalisation', parent: 'N-1', status: doing, progress: 40, remaining: 3, assignee: 'u-pat', end: '2020-02-14', plannedEnd: '2020-02-14' }),
    task('N-4', { title: 'Livraison', milestone: true, start: null, plannedStart: null, status: todo, end: '2999-01-01', plannedEnd: '2999-01-01', duration: 0 }),
  ],
  links: [{ id: 'l1', from: 'N-2', to: 'N-3', lag: 0 }],
  projectEnd: '2999-01-01', criticalPath: ['N-2'], moved: 0, baseline: null,
};

describe('filtres du périmètre', () => {
  const f = (q: string, filter: Parameters<typeof filterSchedule>[1]['f'], me = 'u-pat') => filterSchedule(data, { q, f: filter, me, today: '2026-11-12' }).tasks.map((t) => t.key);
  it('sans filtre, tout le planning', () => { expect(f('', 'all')).toEqual(['N-1', 'N-2', 'N-3', 'N-4']); });
  it('le texte cherche dans la clé et le titre, sans casse, et garde les parents', () => {
    expect(f('réalis', 'all')).toEqual(['N-1', 'N-3']);
    expect(f('n-4', 'all')).toEqual(['N-4']);
  });
  it('en retard : échéance passée et ticket non terminé', () => { expect(f('', 'late')).toEqual(['N-1', 'N-3']); });
  it('chemin critique, jalons et mes tâches', () => {
    expect(f('', 'critical')).toEqual(['N-1', 'N-2']);
    expect(f('', 'milestones')).toEqual(['N-4']);
    expect(f('', 'mine', 'u-pat')).toEqual(['N-1', 'N-3']);
    expect(f('', 'mine', '')).toEqual([]);
  });
  it('retire les liens dont une extrémité est filtrée', () => {
    expect(filterSchedule(data, { q: '', f: 'late', me: '', today: '2026-11-12' }).links).toEqual([]);
    expect(filterSchedule(data, { q: 'concep', f: 'all', me: '', today: '2026-11-12' }).links).toEqual([]);
    expect(filterSchedule(data, { q: 'n-', f: 'all', me: '', today: '2026-11-12' }).links).toHaveLength(1);
  });
});

describe('Board et Liste du planning', () => {
  it('le Board range les tâches par catégorie de statut, sans les tâches parentes', () => {
    render(<MemoryRouter><PlanningBoard project="NOVA" data={data} /></MemoryRouter>);
    const column = (name: string) => screen.getByRole('region', { name });
    expect(within(column('À faire')).getByText('N-4')).toBeInTheDocument();
    expect(within(column('En cours')).getByText('N-3')).toBeInTheDocument();
    expect(within(column('Terminé')).getByText('N-2')).toBeInTheDocument();
    expect(screen.queryByText('N-1')).toBeNull();
    expect(within(column('Terminé')).getByText('Critique')).toBeInTheDocument();
  });

  it('la Liste montre début, fin, durée, marge, avancement et reste à faire dans l’ordre de la hiérarchie', () => {
    render(<MemoryRouter><PlanningList project="NOVA" data={data} /></MemoryRouter>);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['N-1', 'N-2', 'N-3', 'N-4']);
    const cells = (i: number) => within(rows[i]!).getAllByRole('cell').map((c) => c.textContent);
    expect(cells(2)).toEqual(['N-3', 'Réalisation', 'En cours', expect.any(String), expect.any(String), '2 j', '3 j', '40 %', '3 j']);
    expect(cells(1)[6]).toContain('0 j');
    expect(cells(1)[6]).toContain('Critique');
    expect(cells(3)[5]).toBe('Jalon');
    expect(screen.getByRole('columnheader', { name: 'Marge' })).toBeInTheDocument();
  });

  it('restent accessibles (axe)', async () => {
    const { container } = render(<MemoryRouter><PlanningBoard project="NOVA" data={data} /><PlanningList project="NOVA" data={data} /></MemoryRouter>);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
});

const user = { authenticated: true, user: { id: 'u-pat', username: 'pat', name: 'Pat', roles: ['athena-user'] } } as unknown as Session;

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}

describe('PlanningPage : onglets et filtres dans l’adresse', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (/schedule\/baselines$/.test(input)) return ok([]);
      if (/\/schedule(\?.*)?$/.test(input)) return ok(data);
      return ok([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const open = (url: string, session: Session = user) => render(
    <MemoryRouter initialEntries={[url]}><ToastProvider><Where /><Routes><Route path="/p/:project/planning" element={<PlanningPage session={session} />} /></Routes></ToastProvider></MemoryRouter>,
  );

  it('quatre onglets ; le filtre est gardé d’un onglet à l’autre', async () => {
    open('/p/NOVA/planning?q=r%C3%A9alis&f=late');
    const tabs = await screen.findByRole('navigation', { name: 'Vues du planning' });
    expect(within(tabs).getAllByRole('link').map((l) => l.textContent)).toEqual(['Gantt', 'Board', 'Liste', 'Versions']);
    expect(within(tabs).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/p/NOVA/planning?q=r%C3%A9alis&f=late&vue=board');
    expect(within(tabs).getByRole('link', { name: 'Liste' })).toHaveAttribute('href', '/p/NOVA/planning?q=r%C3%A9alis&f=late&vue=list');
    expect(within(tabs).getByRole('link', { name: 'Versions' }).getAttribute('href')).toBe('/p/NOVA/planning?vue=versions'); // les versions n'ont pas ces filtres
    await userEvent.click(within(tabs).getByRole('link', { name: 'Liste' }));
    expect(screen.getByTestId('where').textContent).toBe('/p/NOVA/planning?q=r%C3%A9alis&f=late&vue=list');
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['N-1', 'N-3']);
  });

  it('saisir une recherche la met dans l’adresse ; « Effacer les filtres » la retire', async () => {
    open('/p/NOVA/planning?vue=list');
    await userEvent.type(await screen.findByLabelText('Rechercher une tâche'), 'livr');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/NOVA/planning?vue=list&q=livr'));
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(screen.getByTestId('where').textContent).toBe('/p/NOVA/planning?vue=list');
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(4);
  });

  it('« Mes tâches » ne garde que celles de la personne connectée ; aucun résultat se dit', async () => {
    open('/p/NOVA/planning?vue=board&f=mine');
    expect(await screen.findByText('N-3')).toBeInTheDocument();
    expect(screen.queryByText('N-2')).toBeNull();
    await userEvent.type(screen.getByLabelText('Rechercher une tâche'), 'zzz');
    expect(await screen.findByText('Aucune tâche ne correspond aux filtres.')).toBeInTheDocument();
  });

  it('le Gantt, par défaut, reçoit aussi le filtre', async () => {
    open('/p/NOVA/planning?f=milestones');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['N-4']);
  });
});

const def = (withPlanning: boolean): TrackerDefinition => ({
  key: 'TSK', fields: [
    { id: 'f1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: 'f2', key: 'who', label: 'Responsable', type: 'user', config: {}, required: false, semanticRole: 'assignee' },
    ...(withPlanning ? [
      { id: 'f3', key: 'begin', label: 'Début', type: 'date', config: {}, required: false, semanticRole: 'start_date' },
      { id: 'f4', key: 'end', label: 'Fin', type: 'date', config: {}, required: false, semanticRole: 'due_date' },
      { id: 'f5', key: 'pct', label: 'Avancement', type: 'number', config: {}, required: false, semanticRole: 'progress' },
      { id: 'f6', key: 'rest', label: 'Reste', type: 'number', config: {}, required: false, semanticRole: 'remaining' },
    ] : []),
  ], statuses: [], transitions: [],
} as unknown as TrackerDefinition);
const art = (assignee: string): Artifact => ({ id: 'a1', key: 'N-3', trackerKey: 'TSK', status: 'doing', values: { title: 'Réalisation', who: assignee, begin: '2026-11-09', end: '2026-11-10', pct: 40, rest: 3 }, version: 2 });
const links = [
  { id: 'l1', type: 'precedes', direction: 'inward', label: 'succède à', other: 'N-2', suspect: false, ordered: true, lagDays: 0 },
  { id: 'l2', type: 'precedes', direction: 'outward', label: 'précède', other: 'N-4', suspect: false, ordered: true, lagDays: 2 },
  { id: 'l3', type: 'refines', direction: 'outward', label: 'raffine', other: 'REQ-1', suspect: false },
];

describe('section Planification de la fiche', () => {
  let calls: Array<{ method: string; url: string; body: unknown }> = [];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (method !== 'GET') calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(method === 'PATCH' ? { moved: 2, keys: [], batch: 'b' } : { ...data, tasks: [task('N-3', { slack: 5, critical: false, progress: 40, remaining: 3 })] }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const show = (roles: string[], assignee = 'u-pat', onSave = vi.fn(), onChanged = vi.fn()) => {
    render(<MemoryRouter><ToastProvider><PlanningSection project="NOVA" def={def(true)} artifact={art(assignee)} links={links} roles={roles} me="u-pat" onSave={onSave} onChanged={onChanged} /></ToastProvider></MemoryRouter>);
    return { onSave, onChanged };
  };

  it('n’existe que pour un tracker qui porte un début et une échéance', () => {
    expect(hasPlanning(def(true))).toBe(true);
    expect(hasPlanning(def(false))).toBe(false);
  });

  it('affiche les dates, la durée, la marge et les liens « précède » (pas les autres types)', async () => {
    show(['athena-user']);
    expect(await screen.findByText('2 j', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('N-2')).toHaveAttribute('href', '/p/NOVA/a/N-2');
    expect(screen.getByText('N-4').closest('li')!.textContent).toContain('(+2 j)');
    expect(screen.queryByText('REQ-1')).toBeNull();
  });

  it('un utilisateur modifie l’avancement et le reste à faire de son ticket, pas les dates', async () => {
    const { onSave } = show(['athena-user'], 'u-pat');
    const progress = await screen.findByLabelText('Avancement');
    await userEvent.clear(progress);
    await userEvent.type(progress, '60');
    await userEvent.tab();
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ key: 'pct' }), '60'));
    expect(screen.queryByLabelText('Début')).toBeNull(); // dates en lecture
    expect(screen.queryByLabelText('Durée')).toBeNull();
    expect(screen.getByText(/tickets qui vous sont assignés/)).toBeInTheDocument();
  });

  it('sur le ticket d’un autre, un utilisateur ne voit que des valeurs', async () => {
    show(['athena-user'], 'u-uma');
    await screen.findByText('2 j', { selector: 'dd' });
    expect(screen.queryByLabelText('Avancement')).toBeNull();
    expect(screen.queryByLabelText('Reste à faire (jours)')).toBeNull();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('le chef de projet change la durée : replanification des successeurs, fiche rechargée', async () => {
    const { onChanged } = show(['athena-pm'], 'u-uma');
    const duration = await screen.findByLabelText('Durée');
    await userEvent.clear(duration);
    await userEvent.type(duration, '5');
    await userEvent.tab();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', url: '/v1/projects/NOVA/schedule/tasks/N-3', body: { duration: 5 } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByText(/tickets qui vous sont assignés/)).toBeNull();
  });

  it('une tâche parente a des dates calculées, en lecture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...data, tasks: [task('N-3', { summary: true, progress: 70 })] }), { status: 200 })));
    show(['athena-pm'], 'u-uma');
    expect(await screen.findByText(/calculées depuis ses enfants/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Durée')).toBeNull();
  });
});
