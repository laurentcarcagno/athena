import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadSession } from './api';
import { CreateArtifact } from './components/CreateArtifact';

/** T-0146 (ADR-0005) : boutons nommés, champs essentiels d'abord, « Moi » pour le responsable. */
const definition = {
  key: 'BUG', name: 'Bugs', workflow: { initial: 'open', statuses: [], transitions: [] },
  fields: [
    { id: '1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: '2', key: 'description', label: 'Description', type: 'richtext', config: {}, required: false, semanticRole: null },
    { id: '3', key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure'] }, required: true, semanticRole: null },
    { id: '4', key: 'assignee', label: 'Responsable', type: 'user', config: {}, required: false, semanticRole: 'assignee' },
    { id: '5', key: 'affected_version', label: 'Version affectée', type: 'text', config: {}, required: false, semanticRole: null },
    { id: '6', key: 'root_cause', label: 'Cause racine', type: 'richtext', config: {}, required: false, semanticRole: null },
  ],
};
let posted: unknown = null;
beforeEach(async () => {
  posted = null;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input === '/auth/session') return new Response(JSON.stringify({ authenticated: true, user: { id: 'sub-ud', username: 'user.dev', name: 'User Dev', email: null, roles: ['athena-user'], groups: [] } }), { status: 200 });
    if (init?.method === 'POST') { posted = JSON.parse(String(init.body)); return new Response(JSON.stringify({ key: 'SAT1-BUG-0007' }), { status: 201 }); }
    if (/\/trackers\/BUG$/.test(input)) return new Response(JSON.stringify(definition), { status: 200 });
    return new Response(JSON.stringify([{ key: 'BUG', name: 'Bugs' }]), { status: 200 });
  }));
  await loadSession();
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<ToastProvider><MemoryRouter><CreateArtifact target={{ scope: 'tracker', project: 'SAT1', tracker: 'BUG' }} open onClose={() => undefined} onCreated={() => undefined} /></MemoryRouter></ToastProvider>);

it('boutons nommés et rappel des touches ; champs essentiels d’abord, les autres repliés', async () => {
  open();
  await screen.findByLabelText('Titre (obligatoire)');
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Créer le ticket' })).toBeTruthy();
  expect(within(dialog).getByText('Entrée pour créer · Échap pour annuler')).toBeTruthy();
  expect((screen.getByLabelText('Titre (obligatoire)') as HTMLInputElement).placeholder).toMatch(/^Ex\. :/);
  expect(screen.getByLabelText('Description')).toBeTruthy();
  expect(screen.queryByLabelText('Cause racine')).toBeNull();
  const more = screen.getByRole('button', { name: 'Plus de champs (3) : responsable, version affectée, cause racine' });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await userEvent.click(more);
  expect(screen.getByLabelText('Cause racine')).toBeTruthy();
});

it('« Moi » affecte le compte connecté, affiché par son nom, et l’envoie par son identifiant', async () => {
  open();
  await userEvent.type(await screen.findByLabelText('Titre (obligatoire)'), 'Crash');
  await userEvent.selectOptions(screen.getByLabelText('Sévérité (obligatoire)'), 'majeure');
  await userEvent.click(screen.getByRole('button', { name: /^Plus de champs/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Moi' }));
  expect(screen.getByText('Vous (User Dev)')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Créer le ticket' }));
  await waitFor(() => expect(posted).toEqual({ values: { title: 'Crash', severity: 'majeure', assignee: 'sub-ud' } }));
});
