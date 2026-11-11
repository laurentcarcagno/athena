import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, RateLimitedError } from './api';

/** T-0142 (ADR-0005) : une réponse 429 n'est jamais une déconnexion ; message, compte à rebours et nouvel essai. */
let sessionCalls = 0;
let assign: ReturnType<typeof vi.fn>;
const original = window.location;
beforeEach(() => {
  sessionCalls = 0;
  assign = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, pathname: '/', search: '', assign } });
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (input === '/auth/session') {
      sessionCalls++;
      return sessionCalls === 1
        ? new Response(JSON.stringify({ error: 'rate_limited', message: 'Trop de requêtes.' }), { status: 429, headers: { 'Retry-After': '30' } })
        : new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'rate_limited', message: 'Trop de requêtes. Réessayez plus tard.' }), { status: 429, headers: { 'Retry-After': '7' } });
  }));
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: original });
  vi.unstubAllGlobals();
});

it('serveur saturé au chargement : message et compte à rebours, aucune redirection vers la connexion ; « Réessayer maintenant » relance', async () => {
  render(<App />);
  expect(await screen.findByText('Athena est très sollicité.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toMatch(/nouvel essai automatique dans 30 s/);
  expect(assign).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer maintenant' }));
  await waitFor(() => expect(sessionCalls).toBe(2));
  // Seconde réponse : vraiment non authentifié, la connexion est alors proposée normalement.
  await waitFor(() => expect(assign).toHaveBeenCalledWith('/auth/login?returnTo=%2F'));
});

it('un appel d’API limité lève RateLimitedError avec le délai du serveur', async () => {
  const error = await api('GET', '/v1/projects').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RateLimitedError);
  expect((error as RateLimitedError).retryAfter).toBe(7);
  expect((error as RateLimitedError).status).toBe(429);
});
