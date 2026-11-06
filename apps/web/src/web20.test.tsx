import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { MembersTab } from './pages/project/MembersTab';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let lists: unknown[] = [];
const users = [{ subject: 'u-ada', username: 'ada', displayName: 'Ada' }, { subject: 'u-bob', username: 'bob', displayName: 'Bob' }, { subject: 'u-eve', username: 'eve', displayName: 'Eve' }];

beforeEach(() => {
  sent.length = 0;
  lists = [{ scope: 'project', tracker: null, members: [{ subject: 'u-ada', username: 'ada', displayName: 'Ada' }, { subject: 'u-bob', username: 'bob', displayName: 'Bob' }] }];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (method === 'PUT') return ok({});
    if (/access-lists$/.test(input)) return ok(lists);
    if (/\/v1\/users$/.test(input)) return ok(users);
    if (/\/trackers$/.test(input)) return ok([{ key: 'REQ' }, { key: 'CUI' }]);
    if (/\/members$/.test(input)) return ok([{ subject: 'u-ada', username: 'ada', displayName: 'Ada', email: null, role: 'manager' }]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'ada', name: 'Ada', email: null, roles, groups: [] } });
const open = (s = session(['athena-user', 'athena-admin'])) => render(<ToastProvider><MemoryRouter initialEntries={['/p/SEC/membres']}><Routes><Route path="/p/:project/membres" element={<MembersTab session={s} />} /></Routes></MemoryRouter></ToastProvider>);

describe('listes d’ayants droit', () => {
  it('montre la liste du projet, ses membres et la portée de la restriction', async () => {
    open();
    const group = await screen.findByRole('group', { name: 'Ayants droit : Tout le projet' });
    expect(within(group).getByText('Accès restreint')).toBeInTheDocument();
    expect(within(group).getByText('bob')).toBeInTheDocument();
    expect(screen.getByText(/administrateurs d’organisation compris/)).toBeInTheDocument();
  });

  it('ajoute puis retire un ayant droit en renvoyant la liste complète, jamais vide', async () => {
    open();
    const group = await screen.findByRole('group', { name: 'Ayants droit : Tout le projet' });
    await userEvent.selectOptions(within(group).getByLabelText('Ajouter un ayant droit'), 'u-eve');
    await userEvent.click(within(group).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(sent.filter((s) => s.method === 'PUT')).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ tracker: null, members: ['u-ada', 'u-bob', 'u-eve'] });
    await userEvent.click(within(group).getByRole('button', { name: 'Retirer bob' }));
    await waitFor(() => expect(sent.filter((s) => s.method === 'PUT')).toHaveLength(2));
    expect(sent[1]!.body).toEqual({ tracker: null, members: ['u-ada'] });
  });

  it('un seul membre : le retrait est désactivé, il faut supprimer la liste (avec confirmation)', async () => {
    lists = [{ scope: 'tracker', tracker: 'CUI', members: [{ subject: 'u-ada', username: 'ada', displayName: 'Ada' }] }];
    open();
    const group = await screen.findByRole('group', { name: 'Ayants droit : Tracker CUI' });
    expect(within(group).getByRole('button', { name: 'Retirer ada' })).toBeDisabled();
    await userEvent.click(within(group).getByRole('button', { name: 'Supprimer la liste' }));
    expect(await screen.findByText('Supprimer la liste : Tracker CUI')).toBeInTheDocument();
    expect(sent.some((s) => s.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'DELETE')?.url).toBe('/v1/projects/SEC/access-lists?tracker=CUI'));
  });

  it('crée la liste d’un tracker après confirmation, en y incluant le créateur', async () => {
    lists = [];
    open();
    await screen.findByText('Aucune liste : le projet est lisible selon les seuls rôles.');
    await userEvent.selectOptions(screen.getByLabelText('Portée'), 'CUI');
    await userEvent.selectOptions(screen.getByLabelText('Premier ayant droit'), 'u-eve');
    await userEvent.click(screen.getByRole('button', { name: 'Créer la liste' }));
    expect(await screen.findByText('Restreindre l’accès : Tracker CUI')).toBeInTheDocument();
    expect(screen.getByText(/Vous en faites partie/)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Créer la liste' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'PUT'), JSON.stringify(sent)).toBeTruthy());
    expect(sent.find((s) => s.method === 'PUT')!.body).toEqual({ tracker: 'CUI', members: ['u-eve', 'u-ada'] });
  });

  it('réservé aux responsables, et sans violation d’accessibilité', async () => {
    const first = open(session(['athena-user']));
    expect(await screen.findByText(/Réservé|réservé/)).toBeInTheDocument();
    expect(screen.queryByText('Besoin d’en connaître')).toBeNull();
    first.unmount();
    const r = open();
    await screen.findByRole('group', { name: 'Ayants droit : Tout le projet' });
    expect((await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([]);
  });
});
