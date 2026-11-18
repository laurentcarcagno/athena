import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { AccessTokens } from './AccessTokens';

const calls: Array<{ method: string; url: string; body?: string }> = [];
let tokens: Array<Record<string, unknown>> = [];
beforeEach(() => {
  calls.length = 0;
  tokens = [{ id: 't1', name: 'Intégration CI', scope: 'read', prefix: 'athp_Ab12Cd3', expiresAt: '2027-02-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null }];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    if ((init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify(tokens), { status: 200 });
    if (init?.method === 'POST') return new Response(JSON.stringify({ token: 'athp_SECRET-VALUE-SHOWN-ONCE', view: {} }), { status: 201 });
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<ToastProvider><AccessTokens /></ToastProvider>);

describe('jetons d’accès personnels (profil)', () => {
  it('liste les jetons sans jamais afficher leur valeur, crée un jeton et le montre une seule fois', async () => {
    show();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Intégration CI')).toBeInTheDocument();
    expect(screen.queryByText(/SECRET-VALUE/)).toBeNull();
    await userEvent.type(screen.getByLabelText('Nom'), 'Script de sauvegarde');
    await userEvent.selectOptions(screen.getByLabelText('Portée'), 'write');
    await userEvent.clear(screen.getByLabelText('Validité (jours, 1 à 365)'));
    await userEvent.type(screen.getByLabelText('Validité (jours, 1 à 365)'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Créer un jeton' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ name: 'Script de sauvegarde', scope: 'write', expiresInDays: 30 })));
    expect(await screen.findByText('athp_SECRET-VALUE-SHOWN-ONCE')).toBeInTheDocument();
    expect(screen.getByText(/ne sera plus affiché/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(screen.queryByText(/SECRET-VALUE/)).toBeNull();
  });

  it('la validité hors de 1 à 365 jours bloque la création', async () => {
    show();
    await userEvent.type(await screen.findByLabelText('Nom'), 'x');
    await userEvent.clear(screen.getByLabelText('Validité (jours, 1 à 365)'));
    await userEvent.type(screen.getByLabelText('Validité (jours, 1 à 365)'), '400');
    expect(screen.getByRole('button', { name: 'Créer un jeton' })).toBeDisabled();
  });

  it('révoque après confirmation', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Révoquer Intégration CI' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/v1/me/tokens/t1'))).toBe(true));
  });
});
