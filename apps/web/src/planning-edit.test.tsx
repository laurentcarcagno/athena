import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { ScheduleGantt, type GanttEdit } from './components/ScheduleGantt';
import { DAY_WIDTH, ROW_HEIGHT, type CalendarData, type ScheduleData, type ScheduleTask } from './lib/schedule';
import { PlanningPage } from './pages/PlanningPage';

// jsdom n'a pas PointerEvent : une sous-classe de MouseEvent porte les coordonnées du glisser.
if (typeof window.PointerEvent === 'undefined') (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class PointerEvent extends MouseEvent {};

// T-0163 : édition du planning par le chef de projet (durée, glisser, étirer, lier), équivalents clavier, lecture seule.

const task = (key: string, over: Partial<ScheduleTask> = {}): ScheduleTask => ({
  key, title: `Tâche ${key}`, tracker: 'TSK', parent: null, summary: false, milestone: false, scheduled: true,
  start: '2026-11-09', end: '2026-11-10', plannedStart: '2026-11-09', plannedEnd: '2026-11-10', duration: 2, moved: false, slack: 0, critical: false, progress: null, remaining: null, version: 1, status: { key: 'todo', name: 'À faire', category: 'todo', color: null }, assignee: null, ...over,
});
// Lundi 9 ; vendredi 13 ; lundi 16 novembre 2026. Le 11 est férié.
const data: ScheduleData = {
  tasks: [
    task('N-1', { title: 'Conception' }),
    task('N-2', { title: 'Réalisation', plannedStart: '2026-11-12', plannedEnd: '2026-11-13', start: '2026-11-12', end: '2026-11-13' }),
    task('N-3', { title: 'Livraison', milestone: true, start: null, plannedStart: null, plannedEnd: '2026-11-17', end: '2026-11-17', duration: 0 }),
  ],
  links: [{ id: 'l1', from: 'N-1', to: 'N-2', lag: 1 }],
  projectEnd: '2026-11-17', criticalPath: [], moved: 0,
};
const calendar: CalendarData = { workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }] };

function setup() {
  const edit: GanttEdit = { onChange: vi.fn(), onLink: vi.fn(), onUnlink: vi.fn(), onLag: vi.fn() };
  const view = render(<MemoryRouter><ScheduleGantt project="NOVA" data={data} calendar={calendar} edit={edit} /></MemoryRouter>);
  const bar = (key: string) => view.container.querySelector(`g[aria-label^="${key} "]`) as SVGGElement;
  return { edit, bar, ...view };
}

describe('Gantt éditable', () => {
  it('la durée du tableau se modifie à la validation et signale la nouvelle valeur', async () => {
    const { edit } = setup();
    expect(screen.getByRole('button', { name: 'Modifier la durée de N-1 (2 j)' })).toHaveTextContent('2 j');
    await userEvent.click(screen.getByRole('button', { name: 'Modifier la durée de N-1 (2 j)' }));
    const input = screen.getByLabelText('Durée de N-1 en jours ouvrés');
    expect(input).toHaveValue(2);
    await userEvent.clear(input);
    await userEvent.type(input, '5{Enter}');
    expect(edit.onChange).toHaveBeenCalledWith('N-1', { duration: 5 });
    expect(screen.queryByLabelText('Durée de N-3 en jours ouvrés')).toBeNull(); // jalon : pas de durée
  });

  it('refuse une durée invalide ou inchangée en rétablissant la valeur', async () => {
    const { edit } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Modifier la durée de N-1 (2 j)' }));
    const input = screen.getByLabelText('Durée de N-1 en jours ouvrés');
    await userEvent.clear(input);
    await userEvent.type(input, '0{Enter}');
    expect(edit.onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Modifier la durée de N-1 (2 j)' })).toHaveTextContent('2 j'); // champ refermé, valeur inchangée
  });

  it('flèches : décale le début d’un jour ouvré (week-end et férié sautés) ; Maj + flèches change la fin', () => {
    const { edit, bar } = setup();
    fireEvent.keyDown(bar('N-2'), { key: 'ArrowRight' }); // jeudi 12 → vendredi 13
    expect(edit.onChange).toHaveBeenLastCalledWith('N-2', { start: '2026-11-13' });
    fireEvent.keyDown(bar('N-2'), { key: 'ArrowLeft' }); // jeudi 12 → mardi 10 (le 11 est férié)
    expect(edit.onChange).toHaveBeenLastCalledWith('N-2', { start: '2026-11-10' });
    fireEvent.keyDown(bar('N-2'), { key: 'ArrowRight', shiftKey: true }); // fin : vendredi 13 → lundi 16
    expect(edit.onChange).toHaveBeenLastCalledWith('N-2', { due: '2026-11-16' });
    fireEvent.keyDown(bar('N-2'), { key: 'ArrowLeft', shiftKey: true }); // fin : vendredi 13 → jeudi 12
    expect(edit.onChange).toHaveBeenLastCalledWith('N-2', { due: '2026-11-12' });
    fireEvent.keyDown(bar('N-1'), { key: 'ArrowLeft', shiftKey: true }); // fin 10 → 9 (>= début)
    expect(edit.onChange).toHaveBeenLastCalledWith('N-1', { due: '2026-11-09' });
  });

  it('un jalon se décale par sa date, et une fin ne passe pas avant le début', () => {
    const { edit, bar } = setup();
    fireEvent.keyDown(bar('N-3'), { key: 'ArrowRight' });
    expect(edit.onChange).toHaveBeenLastCalledWith('N-3', { due: '2026-11-18' });
    vi.mocked(edit.onChange).mockClear();
    fireEvent.keyDown(bar('N-1'), { key: 'ArrowLeft', shiftKey: true }); // fin 10 → 9, égale au début : permis
    fireEvent.keyDown(bar('N-1'), { key: 'ArrowLeft', shiftKey: true }); // l’affichage n’a pas changé : toujours 9
    expect(vi.mocked(edit.onChange).mock.calls.map((c) => c[1])).toEqual([{ due: '2026-11-09' }, { due: '2026-11-09' }]);
  });

  it('glisser une barre déplace le début du nombre de jours glissé ; étirer sa poignée change la fin', () => {
    const { edit, bar, container } = setup();
    fireEvent.pointerDown(bar('N-1'), { button: 0, clientX: 100, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 100 + 2 * DAY_WIDTH + 5, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 100 + 2 * DAY_WIDTH + 5, clientY: 10 });
    expect(edit.onChange).toHaveBeenLastCalledWith('N-1', { start: '2026-11-12' }); // 9 + 2 jours = 11 (férié) → jeudi 12

    const handle = container.querySelector('g[aria-label^="N-2 "] rect.ath-gantt-resize') as SVGRectElement;
    fireEvent.pointerDown(handle, { button: 0, clientX: 300, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 300 + 3 * DAY_WIDTH, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 300 + 3 * DAY_WIDTH, clientY: 40 });
    expect(edit.onChange).toHaveBeenLastCalledWith('N-2', { due: '2026-11-16' }); // 13 + 3 jours = 16 (lundi)
  });

  it('un glisser sans déplacement d’un jour n’envoie rien', () => {
    const { edit, bar } = setup();
    fireEvent.pointerDown(bar('N-1'), { button: 0, clientX: 100, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 105, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 105, clientY: 10 });
    expect(edit.onChange).not.toHaveBeenCalled();
  });

  it('glisser la poignée de lien vers une autre ligne crée le lien « précède »', () => {
    const { edit, container } = setup();
    const handle = container.querySelector('g[aria-label^="N-1 "] circle.ath-gantt-handle') as SVGCircleElement;
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 16 });
    fireEvent.pointerMove(window, { clientX: 220, clientY: 2 * ROW_HEIGHT + 10 });
    expect(container.querySelector('.ath-gantt-link--preview')).not.toBeNull();
    fireEvent.pointerUp(window, { clientX: 220, clientY: 2 * ROW_HEIGHT + 10 }); // ligne 3 : N-3
    expect(edit.onLink).toHaveBeenCalledWith('N-1', 'N-3', 0);
  });

  it('« Lier à… » : choix de la tâche et du décalage, équivalent clavier du glisser de lien', async () => {
    const { edit } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Réalisation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lier à…' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'N-3');
    const lag = within(dialog).getByLabelText('Décalage (jours ouvrés)');
    await userEvent.clear(lag);
    await userEvent.type(lag, '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lier' }));
    expect(edit.onLink).toHaveBeenCalledWith('N-2', 'N-3', 2);
  });

  it('Entrée sur une barre ouvre le dialogue, qui liste les liens et permet d’en retirer un', async () => {
    const { edit, bar } = setup();
    fireEvent.keyDown(bar('N-1'), { key: 'Enter' });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Précède N-2')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Décalage du lien en jours ouvrés : Précède N-2')).toHaveValue(1);
    await userEvent.click(within(dialog).getByRole('button', { name: /Retirer le lien : Précède N-2/ }));
    expect(edit.onUnlink).toHaveBeenCalledWith('l1');
  });

  it('le décalage d’un lien se change sur place (négatif permis), sans rien envoyer s’il est inchangé ou invalide', async () => {
    const { edit, bar } = setup();
    fireEvent.keyDown(bar('N-1'), { key: 'Enter' });
    const input = await screen.findByLabelText('Décalage du lien en jours ouvrés : Précède N-2');
    await userEvent.clear(input);
    await userEvent.type(input, '1{Enter}');
    expect(edit.onLag).not.toHaveBeenCalled(); // inchangé
    await userEvent.clear(input);
    await userEvent.type(input, '-2{Enter}');
    expect(edit.onLag).toHaveBeenCalledWith('l1', -2);
  });

  it('sans droit d’édition : ni champ, ni bouton, ni poignée, ni barre focalisable', () => {
    const { container } = render(<MemoryRouter><ScheduleGantt project="NOVA" data={data} calendar={calendar} /></MemoryRouter>);
    expect(container.querySelectorAll('input, button, .ath-gantt-handle, .ath-gantt-resize, [tabindex]')).toHaveLength(0);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('reste accessible (axe) en mode édition', async () => {
    const { container } = setup();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
});

const manager = { authenticated: true, user: { name: 'Pat', roles: ['athena-admin'] } } as unknown as Session;
const member = { authenticated: true, user: { name: 'Uma', roles: ['athena-team-member'] } } as unknown as Session;

describe('PlanningPage : édition', () => {
  let calls: Array<{ method: string; url: string; body: unknown }> = [];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (method !== 'GET') calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'PATCH') return ok({ moved: 3, keys: ['N-1', 'N-2', 'N-3'], batch: 'b' });
      if (method === 'POST' && /schedule\/apply$/.test(input)) return ok({ moved: 1, keys: ['N-2'], batch: 'b' });
      if (method === 'POST') return ok({ id: 'l9' }, 201);
      if (method === 'DELETE') return new Response(null, { status: 204 });
      if (/\/schedule$/.test(input)) return ok(data);
      if (/\/v1\/calendar$/.test(input)) return ok(calendar);
      return ok([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = (session: Session) => render(
    <MemoryRouter initialEntries={['/p/NOVA/planning']}><ToastProvider><Routes><Route path="/p/:project/planning" element={<PlanningPage session={session} />} /></Routes></ToastProvider></MemoryRouter>,
  );

  it('le chef de projet change une durée : PATCH, replanification annoncée, planning rechargé', async () => {
    open(manager);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier la durée de N-1 (2 j)' }));
    const input = await screen.findByLabelText('Durée de N-1 en jours ouvrés');
    await userEvent.clear(input);
    await userEvent.type(input, '4{Enter}');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: '/v1/projects/NOVA/schedule/tasks/N-1', body: { duration: 4 } });
    expect((await screen.findAllByText('3 tickets déplacés.')).length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls.filter(([u]) => /\/schedule$/.test(String(u))).length).toBeGreaterThanOrEqual(2);
  });

  it('lier crée le lien « précède » puis replanifie, et annonce les tickets déplacés', async () => {
    open(manager);
    await userEvent.click(await screen.findByRole('button', { name: 'Réalisation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lier à…' }));
    await userEvent.selectOptions(within(screen.getByRole('dialog')).getByRole('combobox'), 'N-3');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lier' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/v1/projects/NOVA/artifacts/N-2/links', body: { to: 'N-3', type: 'precedes' } });
    expect(calls[1]).toMatchObject({ method: 'POST', url: '/v1/projects/NOVA/schedule/apply' });
    expect((await screen.findAllByText('Lien créé. 1 ticket déplacé.')).length).toBeGreaterThan(0);
  });

  it('changer le décalage d’un lien appelle la route de décalage puis annonce la replanification', async () => {
    open(manager);
    await userEvent.click(await screen.findByRole('button', { name: 'Conception' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lier à…' }));
    const input = within(screen.getByRole('dialog')).getByLabelText(/Décalage du lien en jours ouvrés/);
    await userEvent.clear(input);
    await userEvent.type(input, '4{Enter}');
    await waitFor(() => expect(calls).toEqual([{ method: 'PATCH', url: '/v1/projects/NOVA/schedule/links/l1', body: { lagDays: 4 } }]));
    expect((await screen.findAllByText('3 tickets déplacés.')).length).toBeGreaterThan(0);
  });

  it('retirer un lien appelle la suppression du lien', async () => {
    open(manager);
    await userEvent.click(await screen.findByRole('button', { name: 'Conception' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lier à…' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Retirer le lien/ }));
    await waitFor(() => expect(calls).toEqual([{ method: 'DELETE', url: '/v1/projects/NOVA/links/l1', body: undefined }]));
  });

  it('un utilisateur voit le planning en lecture, sans contrôle d’édition', async () => {
    open(member);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Durée de/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Lier/ })).toBeNull();
    expect(screen.getByText(/Planning en lecture/)).toBeInTheDocument();
  });
});
