import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { BacklogPage } from './pages/BacklogPage';

// T-0116 : page Backlog, un sprint se planifie sans quitter la page, au clavier compris.

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let backlog = [
  { key: 'NOVA-TSK-0005', tracker: 'TSK', title: 'Recherche par étiquette', status: 'todo', statusName: 'À faire', category: 'todo', points: 5, assignee: null },
  { key: 'NOVA-TSK-0004', tracker: 'TSK', title: 'Thème sombre', status: 'todo', statusName: 'À faire', category: 'todo', points: 2, assignee: null },
  { key: 'NOVA-TSK-0006', tracker: 'TSK', title: 'Historique', status: 'todo', statusName: 'À faire', category: 'todo', points: 3, assignee: null },
];
const sprint = (id: string, name: string, state: string, items: unknown[]) => ({ id, name, goal: '', state, startsOn: '2026-11-05', endsOn: '2026-11-19', items, totalPoints: 8, donePoints: 5 });
const s1 = sprint('s1', 'Sprint 1', 'active', [{ key: 'NOVA-TSK-0001', status: 'done', statusName: 'Terminé', title: 'Connexion', done: true, points: 5 }, { key: 'NOVA-TSK-0002', status: 'todo', statusName: 'À faire', title: 'Export', done: false, points: 3 }]);
const s2 = sprint('s2', 'Sprint 2', 'planned', [{ key: 'NOVA-TSK-0007', status: 'todo', statusName: 'À faire', title: 'Import', done: false, points: 13 }]);

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (method !== 'GET') {
      sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (/\/close$/.test(input)) return ok({ completed: 1, returned: ['NOVA-TSK-0002'] });
      if (/\/backlog\/rank$/.test(input)) return ok({ items: backlog });
      if (/\/sprints$/.test(input)) return ok({ id: 's3' });
      return new Response(null, { status: 204 });
    }
    if (/\/backlog$/.test(input)) return ok({ items: backlog });
    if (/\/sprints$/.test(input)) return ok([s1, s2, { ...s2, id: 's0', name: 'Ancien', state: 'closed' }].map(({ items: _i, totalPoints: _t, donePoints: _d, ...rest }) => rest));
    if (/\/sprints\/s1\/burndown$/.test(input)) return ok([{ date: '2026-11-05', remaining: 8, ideal: 8 }, { date: '2026-11-06', remaining: 8, ideal: 6 }, { date: '2026-11-07', remaining: 3, ideal: 4 }]);
    if (/\/sprints\/s1$/.test(input)) return ok(s1);
    if (/\/sprints\/s2$/.test(input)) return ok(s2);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const pm: Session = { authenticated: true, user: { username: 'pm', name: 'Paula', email: null, roles: ['athena-user', 'athena-admin'], groups: [] } }; // responsable du projet (l'administrateur l'est toujours)
const member: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const page = (session = pm) => render(<ToastProvider><MemoryRouter initialEntries={['/p/NOVA/backlog']}><Routes><Route path="/p/:project/backlog" element={<BacklogPage session={session} />} /></Routes></MemoryRouter></ToastProvider>);
const list = () => screen.findByRole('list', { name: 'Backlog' });

describe('page Backlog', () => {
  it('montre le sprint en cours (burndown et données), les sprints à venir et le backlog ordonné ; un sprint clos n’apparaît pas', async () => {
    page();
    const rows = within(await list()).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getAllByRole('link')[0]!.textContent)).toEqual(['NOVA-TSK-0005', 'NOVA-TSK-0004', 'NOVA-TSK-0006']);
    expect(screen.getByRole('img', { name: /Burndown : Reste à faire 3, Idéal 4/ })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('07/11/2026');
    expect(screen.getByRole('list', { name: 'Sprint 2' })).toHaveTextContent('NOVA-TSK-0007');
    expect(screen.queryByText('Ancien')).not.toBeInTheDocument();
  });

  it('réordonne au clavier : descendre, puis monter, le focus reste sur le ticket déplacé', async () => {
    page();
    await list();
    const down = screen.getByRole('button', { name: 'Descendre NOVA-TSK-0005' });
    down.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: 'POST', url: '/v1/projects/NOVA/backlog/rank', body: { key: 'NOVA-TSK-0005', after: 'NOVA-TSK-0004' } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descendre NOVA-TSK-0005' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Monter NOVA-TSK-0006' }));
    await waitFor(() => expect(sent.at(-1)?.body).toEqual({ key: 'NOVA-TSK-0006', after: 'NOVA-TSK-0005' }));
    expect(screen.getByRole('button', { name: 'Monter NOVA-TSK-0005' })).toBeDisabled();
    // En tête, « Monter » est désactivé : le focus passe à « Descendre » sur la même ligne.
    screen.getByRole('button', { name: 'Descendre NOVA-TSK-0004' }).focus();
    await userEvent.click(screen.getByRole('button', { name: 'Monter NOVA-TSK-0004' }));
    await waitFor(() => expect(sent.at(-1)?.body).toEqual({ key: 'NOVA-TSK-0004', after: null }));
  });

  it('planifie sans quitter la page : créer un sprint, ajouter, retirer, démarrer, clore vers le sprint suivant', async () => {
    page();
    await list();
    const form = screen.getByRole('form', { name: 'Nouveau sprint' });
    await userEvent.type(within(form).getByLabelText('Nom'), 'Sprint 3');
    await userEvent.type(within(form).getByLabelText('Début'), '2026-12-01');
    await userEvent.type(within(form).getByLabelText('Fin'), '2026-12-14');
    await userEvent.click(within(form).getByRole('button', { name: 'Créer le sprint' }));
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ url: '/v1/projects/NOVA/sprints', body: { name: 'Sprint 3', startsOn: '2026-12-01', endsOn: '2026-12-14' } }));

    await userEvent.selectOptions(screen.getByLabelText('Ajouter NOVA-TSK-0004 au sprint'), 'Sprint 2');
    const row = screen.getByLabelText('Ajouter NOVA-TSK-0004 au sprint').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: 'POST', url: '/v1/projects/NOVA/sprints/s2/items', body: { artifact: 'NOVA-TSK-0004' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Retirer NOVA-TSK-0007 du sprint' }));
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ method: 'DELETE', url: '/v1/projects/NOVA/sprints/s2/items/NOVA-TSK-0007' }));

    await userEvent.click(screen.getByRole('button', { name: 'Démarrer' }));
    await waitFor(() => expect(sent.at(-1)?.url).toBe('/v1/projects/NOVA/sprints/s2/start'));

    await userEvent.selectOptions(screen.getByLabelText('Tickets non terminés'), 'Vers « Sprint 2 »');
    await userEvent.click(screen.getByRole('button', { name: 'Clore' }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: 'POST', url: '/v1/projects/NOVA/sprints/s1/close', body: { moveTo: 's2' } }));
    expect(await screen.findByText('Sprint clos : 1 ticket(s) non terminé(s) reporté(s).')).toBeInTheDocument();
  });

  it('un simple membre consulte sans actions de planification', async () => {
    page(member);
    await list();
    expect(screen.queryByRole('button', { name: /Monter|Descendre|Démarrer|Clore|Retirer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Nouveau sprint' })).not.toBeInTheDocument();
  });

  it('reste sans violation axe (WCAG A et AA)', async () => {
    const { container } = page();
    await list();
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
