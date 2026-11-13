import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { RoadmapPage } from './pages/RoadmapPage';

// T-0117 : Roadmap, avancement des versions, ajout de tickets, publication.

const sent: Array<{ method: string; url: string; body: unknown }> = [];
const v1 = { id: 'r1', name: '1.0', startsOn: '2026-10-01', endsOn: '2026-10-31', state: 'released', items: 2, doneItems: 2, totalPoints: 8, donePoints: 8, progress: 1 };
const v2 = { id: 'r2', name: '1.1', startsOn: '2026-11-01', endsOn: '2026-11-30', state: 'planned', items: 2, doneItems: 1, totalPoints: 8, donePoints: 3, progress: 0.38 };
const items: Record<string, unknown[]> = {
  r1: [{ key: 'NOVA-TSK-0001', title: 'Connexion', statusName: 'Terminé', done: true, points: 5 }, { key: 'NOVA-TSK-0002', title: 'Export', statusName: 'Terminé', done: true, points: 3 }],
  r2: [{ key: 'NOVA-TSK-0003', title: 'Import', statusName: 'Terminé', done: true, points: 3 }, { key: 'NOVA-TSK-0004', title: 'NOVA-TSK-0004', statusName: 'À faire', done: false, points: 5 }],
};

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (method !== 'GET') {
      sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (/\/releases$/.test(input)) return ok({ id: 'r3' });
      return new Response(null, { status: 204 });
    }
    if (/\/roadmap$/.test(input)) return ok([v1, v2]);
    const match = /\/releases\/(r\d)\/items$/.exec(input);
    if (match) return ok(items[match[1]!]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const pm: Session = { authenticated: true, user: { username: 'pm', name: 'Paula', email: null, roles: ['athena-user', 'athena-admin'], groups: [] } }; // responsable du projet (l'administrateur l'est toujours)
const member: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const page = (session = pm) => render(<ToastProvider><MemoryRouter initialEntries={['/p/NOVA/roadmap']}><Routes><Route path="/p/:project/roadmap" element={<RoadmapPage session={session} />} /></Routes></MemoryRouter></ToastProvider>);
const ready = () => screen.findByRole('list', { name: '1.1' });

describe('page Roadmap', () => {
  it('montre l’avancement de chaque version dès l’arrivée : pourcentage, tickets, points, calendrier', async () => {
    page();
    await ready();
    expect(screen.getByRole('img', { name: 'Calendrier des versions' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1.1, Avancement 38 % : 38' })).toBeInTheDocument();
    expect(screen.getByText('Avancement 38 %')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 tickets terminés')).toBeInTheDocument();
    expect(screen.getByText('3 / 8 pt')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: '1.1' })).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual(['NOVA-TSK-0003', 'NOVA-TSK-0004']);
    expect(rows[1]).not.toHaveTextContent('NOVA-TSK-0004NOVA-TSK-0004'); // titre restreint : la clé n'est pas répétée
    expect(screen.getByText('Publiée')).toBeInTheDocument();
  });

  it('ajoute et retire des tickets, publie après confirmation, crée une version', async () => {
    page();
    await ready();
    const add = screen.getByRole('form', { name: 'Ajouter · 1.1' });
    await userEvent.type(within(add).getByLabelText('Clé du ticket'), 'NOVA-TSK-0006');
    await userEvent.click(within(add).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: 'POST', url: '/v1/projects/NOVA/releases/r2/items', body: { artifact: 'NOVA-TSK-0006' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Retirer NOVA-TSK-0004 de la version' }));
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ method: 'DELETE', url: '/v1/projects/NOVA/releases/r2/items/NOVA-TSK-0004' }));

    await userEvent.click(screen.getByRole('button', { name: 'Publier' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publier la version « 1.1 » ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publier' }));
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ method: 'POST', url: '/v1/projects/NOVA/releases/r2/publish' }));

    const form = screen.getByRole('form', { name: 'Nouvelle version' });
    await userEvent.type(within(form).getByLabelText('Nom'), '1.2');
    await userEvent.type(within(form).getByLabelText('Début'), '2026-12-01');
    await userEvent.type(within(form).getByLabelText('Fin'), '2026-12-31');
    await userEvent.click(within(form).getByRole('button', { name: 'Créer la version' }));
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ url: '/v1/projects/NOVA/releases', body: { name: '1.2', startsOn: '2026-12-01', endsOn: '2026-12-31' } }));
  });

  it('une version publiée n’offre ni ajout ni retrait ; un simple membre consulte sans action', async () => {
    page();
    await ready();
    expect(screen.queryByRole('form', { name: 'Ajouter · 1.0' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer NOVA-TSK-0001 de la version' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Publier' })).toHaveLength(1);
  });

  it('un simple membre consulte sans action de planification', async () => {
    page(member);
    await ready();
    expect(screen.queryByRole('button', { name: /Publier|Retirer|Ajouter|Créer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Nouvelle version' })).not.toBeInTheDocument();
  });

  it('reste sans violation axe (WCAG A et AA)', async () => {
    const { container } = page();
    await ready();
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
