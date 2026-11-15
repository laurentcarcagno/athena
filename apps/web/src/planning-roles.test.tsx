import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { ScheduleGantt, type GanttEdit, type ShiftRequest } from './components/ScheduleGantt';
import type { CalendarData, ScheduleData, ScheduleTask } from './lib/schedule';
import { PlanningPage } from './pages/PlanningPage';

// Audit des rôles : actions du Planning sur la tâche sélectionnée (pas un bouton par ligne), demande de décalage de l'utilisateur,
// durée modifiable au clic, messages de lecture seule.

const task = (key: string, over: Partial<ScheduleTask> = {}): ScheduleTask => ({
  key, title: `Tâche ${key}`, tracker: 'TSK', parent: null, summary: false, milestone: false, scheduled: true,
  start: '2026-11-09', end: '2026-11-10', plannedStart: '2026-11-09', plannedEnd: '2026-11-10', duration: 2, moved: false, slack: 0, critical: false, progress: null, remaining: null, version: 1,
  status: { key: 'todo', name: 'À faire', category: 'todo', color: null }, assignee: null, ...over,
});
const data: ScheduleData = {
  tasks: [task('N-1', { title: 'Conception' }), task('N-2', { title: 'Réalisation', plannedStart: '2026-11-12', plannedEnd: '2026-11-13' }), task('N-3', { title: 'Phase', summary: true })],
  links: [], projectEnd: '2026-11-13', criticalPath: [], moved: 0,
};
const calendar: CalendarData = { workDays: [1, 2, 3, 4, 5], holidays: [] };
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const linkButtons = () => screen.queryAllByRole('button', { name: /^Lier .* à…$/ });

describe('actions sur la tâche sélectionnée', () => {
  const edit = (): GanttEdit => ({ onChange: vi.fn(), onLink: vi.fn(), onUnlink: vi.fn(), onLag: vi.fn() });

  it('aucun bouton par ligne : une barre d’actions qui dit quoi faire, puis le nom de la tâche choisie', async () => {
    wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} edit={edit()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions de la tâche sélectionnée' });
    expect(bar).toHaveTextContent('Sélectionnez une tâche (clic sur son titre ou sa barre) pour la lier à une autre.');
    expect(screen.queryAllByRole('button', { name: 'Lier à…' })).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Réalisation' }));
    expect(within(bar).getByText('N-2')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Lier à…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réalisation' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('row').find((r) => within(r).queryByText('N-2'))).toHaveAttribute('aria-selected', 'true');
  });

  it('focaliser une barre sélectionne sa tâche ; une tâche parente n’est pas sélectionnable au tableau', async () => {
    const { container } = wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} edit={edit()} />);
    fireEvent.focus(container.querySelector('g[aria-label^="N-1 "]')!);
    expect(within(screen.getByRole('toolbar', { name: 'Actions de la tâche sélectionnée' })).getByText('N-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phase' })).toBeNull(); // dates calculées : rien à lier ni à décaler
  });

  it('la durée est un bouton qui devient un champ au clic ; Échap referme sans rien envoyer', async () => {
    const e = edit();
    wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} edit={e} />);
    expect(screen.queryByLabelText('Durée de N-1 en jours ouvrés')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Modifier la durée de N-1 (2 j)' }));
    const input = screen.getByLabelText('Durée de N-1 en jours ouvrés');
    expect(input).toHaveFocus();
    await userEvent.type(input, '{Escape}');
    expect(screen.queryByLabelText('Durée de N-1 en jours ouvrés')).toBeNull();
    expect(e.onChange).not.toHaveBeenCalled();
  });
});

describe('demande de décalage (utilisateur)', () => {
  it('sans droit d’édition ni demande : ni sélection ni bouton', () => {
    wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} />);
    expect(screen.queryByRole('toolbar', { name: 'Actions de la tâche sélectionnée' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Réalisation' })).toBeNull();
  });

  it('sélectionner sa tâche, motiver, envoyer : la fin souhaitée et le motif partent', async () => {
    const request: ShiftRequest = { onSubmit: vi.fn() };
    wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} request={request} />);
    expect(screen.getByRole('toolbar', { name: 'Actions de la tâche sélectionnée' })).toHaveTextContent('Sélectionnez une de vos tâches (clic sur son titre) pour demander un décalage à votre chef de projet.');
    await userEvent.click(screen.getByRole('button', { name: 'Réalisation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demander un décalage' }));
    const dialog = screen.getByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'Envoyer la demande' });
    expect(send).toBeDisabled(); // le motif est obligatoire
    await userEvent.type(within(dialog).getByLabelText('Fin souhaitée (facultatif)'), '2026-11-20');
    await userEvent.type(within(dialog).getByLabelText('Motif'), '  Anomalie bloquante sur le banc  ');
    await userEvent.click(send);
    expect(request.onSubmit).toHaveBeenCalledWith('N-2', { end: '2026-11-20', reason: 'Anomalie bloquante sur le banc' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('la fin souhaitée est facultative', async () => {
    const request: ShiftRequest = { onSubmit: vi.fn() };
    wrap(<ScheduleGantt project="NOVA" data={data} calendar={calendar} request={request} />);
    await userEvent.click(screen.getByRole('button', { name: 'Conception' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demander un décalage' }));
    await userEvent.type(screen.getByLabelText('Motif'), 'Congés');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(request.onSubmit).toHaveBeenCalledWith('N-1', { end: null, reason: 'Congés' });
  });
});

const user = { authenticated: true, user: { id: 'u-pat', username: 'pat', name: 'Pat', roles: ['athena-team-member'] } } as unknown as Session;
const qa = { authenticated: true, user: { id: 'u-emma', username: 'emma', name: 'Emma', roles: ['athena-qa', 'athena-team-member'] } } as unknown as Session; // le serveur donne à l'assurance produit le rôle effectif d'utilisateur

describe('PlanningPage selon le rôle', () => {
  let calls: Array<{ method: string; url: string; body: unknown }> = [];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (method !== 'GET') calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'POST') return ok({ id: 'c1' }, 201);
      if (/\/members$/.test(input)) return ok([{ username: 'claire.lefevre', displayName: 'Claire Lefèvre', role: 'manager' }, { username: 'pat', displayName: 'Pat', role: 'member' }, { username: 'marc.dubois', displayName: 'Marc Dubois', role: 'manager' }]);
      if (/schedule\/baselines$/.test(input)) return ok([]);
      if (/\/schedule(\?.*)?$/.test(input)) return ok(data);
      if (/\/v1\/calendar$/.test(input)) return ok(calendar);
      return ok([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = (session: Session) => render(
    <MemoryRouter initialEntries={['/p/NOVA/planning']}><ToastProvider><Routes><Route path="/p/:project/planning" element={<PlanningPage session={session} />} /></Routes></ToastProvider></MemoryRouter>,
  );

  it('l’utilisateur demande un décalage : commentaire du ticket qui mentionne les chefs du projet, confirmation', async () => {
    open(user);
    await userEvent.click(await screen.findByRole('button', { name: 'Réalisation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demander un décalage' }));
    await userEvent.type(screen.getByLabelText('Fin souhaitée (facultatif)'), '2026-11-20');
    await userEvent.type(screen.getByLabelText('Motif'), 'Banc indisponible');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toBe('/v1/projects/NOVA/artifacts/N-2/comments');
    const body = (calls[0]!.body as { body: string }).body;
    expect(body).toMatch(/^@claire\.lefevre @marc\.dubois Demande de décalage de N-2 \(Réalisation\) : fin souhaitée le .*20.*\. Motif : Banc indisponible$/);
    expect(body).not.toContain('@pat'); // un membre simple n'est pas notifié
    expect((await screen.findAllByText('Demande envoyée à Claire Lefèvre, Marc Dubois.')).length).toBeGreaterThan(0);
  });

  it('le message de lecture seule dit comment obtenir un changement', async () => {
    open(user);
    expect(await screen.findByText(/demandez un décalage à votre chef de projet depuis la tâche/)).toBeInTheDocument();
  });

  it('assurance produit : les droits d’un utilisateur, donc la demande de décalage, mais pas l’édition', async () => {
    open(qa);
    await userEvent.click(await screen.findByRole('button', { name: 'Réalisation' }));
    expect(screen.getByRole('button', { name: 'Demander un décalage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lier à…' })).toBeNull();
    expect(screen.queryByLabelText(/Modifier la durée/)).toBeNull();
  });
});
