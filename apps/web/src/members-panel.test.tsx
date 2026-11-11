import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MembersPanel } from './pages/project/MembersTab';

/** T-0151 (ADR-0005) : ajout nommé, retrait confirmé, réglages d'accès avancés repliés. */
let deletes: string[];
beforeEach(() => {
  deletes = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') { deletes.push(input); return new Response(null, { status: 204 }); }
    if (/\/members$/.test(input)) return new Response(JSON.stringify([{ subject: 's1', username: 'user.dev', displayName: 'User Dev', role: 'member' }]), { status: 200 });
    if (/\/v1\/users$/.test(input)) return new Response(JSON.stringify([{ subject: 's1', username: 'user.dev', displayName: 'User Dev' }, { subject: 's2', username: 'qa.dev', displayName: 'QA' }]), { status: 200 });
    if (/\/export-control$/.test(input)) return new Response(JSON.stringify({ members: [], marked: 0 }), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

it('ajout nommé, aucun bouton sans texte ; retirer demande confirmation ; l’accès restreint est replié', async () => {
  render(<ToastProvider><MemoryRouter><MembersPanel project="SAT1" me="pm.dev" /></MemoryRouter></ToastProvider>);
  expect(await screen.findByRole('button', { name: 'Ajouter au projet' })).toBeTruthy();
  expect(screen.getByLabelText('Ajouter un membre')).toBeTruthy();
  const details = screen.getByText('Accès restreint et contrôle export').closest('details')!;
  expect(details.open).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Retirer user.dev' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Retirer User Dev du projet ?')).toBeTruthy();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Retirer' }));
  await waitFor(() => expect(deletes).toEqual(['/v1/projects/SAT1/members/s1']));
});
