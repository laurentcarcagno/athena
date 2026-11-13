import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { OrgAdminPage } from './pages/OrgAdminPage';

// « Nouveau projet » du menu Projets ouvre l'onglet Projets de l'Administration, même si un autre onglet y était déjà ouvert.

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-user'], groups: [] } };
function GoNewProject() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/admin?onglet=projets')}>Nouveau projet (menu)</button>;
}
const open = (path: string) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><GoNewProject /><Routes><Route path="/admin" element={<OrgAdminPage session={admin} />} /></Routes></MemoryRouter></ToastProvider>,
);

describe('onglet Projets de l’Administration', () => {
  it('s’ouvre sur Projets par défaut', async () => {
    open('/admin');
    expect(await screen.findByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true');
  });

  it('?onglet=projets ouvre Projets à l’arrivée', async () => {
    open('/admin?onglet=projets');
    expect(await screen.findByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true');
  });

  it('depuis un autre onglet déjà ouvert, « Nouveau projet » revient sur Projets, chaque fois', async () => {
    open('/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'Gabarits' }));
    expect(screen.getByRole('tab', { name: 'Gabarits' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau projet (menu)' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true'));
    // une seconde fois, adresse inchangée : l'onglet quitté est de nouveau remplacé
    await userEvent.click(screen.getByRole('tab', { name: 'Utilisateurs' }));
    expect(screen.getByRole('tab', { name: 'Utilisateurs' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau projet (menu)' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true'));
  });
});
