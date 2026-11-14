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

const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-team-member'], groups: [] } };
function GoNewProject() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/admin?onglet=projets')}>Nouveau projet (menu)</button>;
}
const open = (path: string) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><GoNewProject /><Routes><Route path="/admin" element={<OrgAdminPage session={admin} />} /></Routes></MemoryRouter></ToastProvider>,
);

const FORM = 'Clé du projet (2 à 10 majuscules)';

describe('onglet Projets de l’Administration', () => {
  it('s’ouvre sur Projets par défaut, formulaire de création fermé (le bouton le propose)', async () => {
    open('/admin');
    expect(await screen.findByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: '+ Nouveau projet' })).toBeInTheDocument();
    expect(screen.queryByLabelText(FORM)).toBeNull();
  });

  it('?onglet=projets ouvre Projets à l’arrivée, avec le formulaire de création déjà ouvert', async () => {
    open('/admin?onglet=projets');
    expect(await screen.findByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText(FORM)).toBeInTheDocument();
    expect(screen.getByLabelText('Nom du projet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Nouveau projet' })).toBeNull(); // le bouton laisse place au formulaire
  });

  it('en revenant sur l’onglet Projets plus tard, le formulaire n’est pas rouvert de lui-même', async () => {
    open('/admin?onglet=projets');
    await screen.findByLabelText(FORM);
    await userEvent.click(screen.getByRole('tab', { name: 'Gabarits' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Projets' }));
    expect(await screen.findByRole('button', { name: '+ Nouveau projet' })).toBeInTheDocument();
    expect(screen.queryByLabelText(FORM)).toBeNull();
  });

  it('depuis un autre onglet déjà ouvert, « Nouveau projet » revient sur Projets, chaque fois', async () => {
    open('/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'Gabarits' }));
    expect(screen.getByRole('tab', { name: 'Gabarits' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau projet (menu)' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByLabelText(FORM)).toBeInTheDocument(); // formulaire ouvert aussi
    // une seconde fois, adresse inchangée : l'onglet quitté est de nouveau remplacé
    await userEvent.click(screen.getByRole('tab', { name: 'Utilisateurs' }));
    expect(screen.getByRole('tab', { name: 'Utilisateurs' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau projet (menu)' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByLabelText(FORM)).toBeInTheDocument();
  });

  it('déjà sur Projets avec le formulaire fermé, « Nouveau projet » du menu l’ouvre', async () => {
    open('/admin');
    await screen.findByRole('button', { name: '+ Nouveau projet' });
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau projet (menu)' }));
    expect(await screen.findByLabelText(FORM)).toBeInTheDocument();
  });
});
