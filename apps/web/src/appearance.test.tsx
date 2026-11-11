import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceTab } from './components/Appearance';
import { allowedThemes, setAllowedThemes } from './lib/theme';

/** T-0136 : Administration > Apparence (thème par défaut, thèmes proposés) et effet sur le choix des personnes. */
let sent: Array<{ method: string; body: unknown }> = [];
beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body));
      sent.push({ method, body });
      return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response(JSON.stringify({ defaultTheme: 'hemeria', allowedThemes: [] }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); setAllowedThemes(null); });

describe('apparence de l’organisation', () => {
  it('propose tous les thèmes par défaut ; en retirer un l’enregistre et le retire du choix des personnes', async () => {
    render(<ToastProvider><AppearanceTab /></ToastProvider>);
    const nord = await screen.findByRole('checkbox', { name: 'Nord' });
    expect(nord).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hemeria' })).toBeDisabled(); // le thème par défaut reste proposé
    await userEvent.click(nord);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’apparence' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    const body = sent[0]!.body as { defaultTheme: string; allowedThemes: string[] };
    expect(body.defaultTheme).toBe('hemeria');
    expect(body.allowedThemes).not.toContain('nord');
    expect(body.allowedThemes).toContain('hemeria');
    expect(allowedThemes().map((t) => t.name)).not.toContain('nord');
  });
});
