import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type Session } from './api';
import { AdminPage } from './pages/AdminPage';
import { suggest } from './pages/ListPage';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('F-08 : un double envoi ne produit qu’une requête', () => {
  it('deux écritures identiques simultanées partagent la même requête et la même réponse', async () => {
    let release!: () => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { release = () => resolve(reply({ key: 'ARI-BUG-0002' })); }));
    const first = api('POST', '/v1/projects/ARI/trackers/BUG/artifacts', { values: { title: 'A' } });
    const second = api('POST', '/v1/projects/ARI/trackers/BUG/artifacts', { values: { title: 'A' } });
    release();
    expect(await first).toEqual({ key: 'ARI-BUG-0002' });
    expect(await second).toEqual({ key: 'ARI-BUG-0002' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un corps différent, une autre adresse ou une lecture ne sont pas fusionnés ; la requête suivante repart une fois la première terminée', async () => {
    fetchMock.mockImplementation(async () => reply({ ok: true }));
    await Promise.all([api('POST', '/v1/x', { a: 1 }), api('POST', '/v1/x', { a: 2 }), api('POST', '/v1/y', { a: 1 }), api('GET', '/v1/x'), api('GET', '/v1/x')]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await api('POST', '/v1/x', { a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('une écriture en échec libère la place : on peut la renvoyer', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'conflict', message: 'Déjà là.', details: [] }, 409)).mockResolvedValueOnce(reply({ ok: true }));
    await expect(api('POST', '/v1/z', { a: 1 })).rejects.toThrow('Déjà là.');
    await expect(api('POST', '/v1/z', { a: 1 })).resolves.toEqual({ ok: true });
  });
});

describe('F-13 : la page Administration est réservée aux administrateurs', () => {
  const as = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'U', email: null, roles, groups: [] } });
  const mount = (session: Session) => render(<ToastProvider><MemoryRouter initialEntries={['/p/ARI/admin']}><Routes><Route path="/p/:project/admin" element={<AdminPage session={session} />} /></Routes></MemoryRouter></ToastProvider>);

  it('un utilisateur ou un chef de projet voit le message, sans onglet et sans aucun appel réseau', () => {
    for (const roles of [['athena-user'], ['athena-user', 'athena-pm']]) {
      const { unmount } = mount(as(roles));
      expect(screen.getByText('Réservé aux administrateurs.')).toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un administrateur voit les onglets', async () => {
    fetchMock.mockImplementation(async () => reply([]));
    mount(as(['athena-admin']));
    expect(await screen.findByRole('tab', { name: 'Webhooks' })).toBeInTheDocument();
    expect(screen.queryByText('Réservé aux administrateurs.')).not.toBeInTheDocument();
  });
});

describe('F-10 : l’ATQL suggère les valeurs, pas seulement les champs', () => {
  it('après un opérateur, propose les valeurs connues du champ', () => {
    const { items } = suggest('status = ', ['status', 'severity'], { status: ['open', 'in_progress', 'done'] });
    expect(items).toEqual(['open', 'in_progress', 'done']);
    expect(suggest('status = in', ['status'], { status: ['open', 'in_progress'] }).items).toEqual(['in_progress']);
  });

});

describe('F-08 : état « loading » de tout bouton qui déclenche une écriture', () => {
  it('le bouton cliqué reste désactivé, aria-busy et suivi de « … » jusqu’à la fin de l’écriture, puis se libère', async () => {
    const { Btn } = await import('@athena/ui');
    let release!: () => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { release = () => resolve(reply({ ok: true })); }));
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<Btn onClick={() => { void api('POST', '/v1/secondaire', { a: 1 }); }}>Créer</Btn>);
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    const busy = await screen.findByRole('button', { name: 'Créer…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    release();
    expect(await screen.findByRole('button', { name: 'Créer' })).toBeEnabled();
  });

  it('un clic sans écriture ne change rien', async () => {
    const { Btn } = await import('@athena/ui');
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<Btn onClick={() => undefined}>Ouvrir</Btn>);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeEnabled();
  });
});
