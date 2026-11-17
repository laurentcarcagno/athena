import { render, screen } from '@testing-library/react';
import { ToastProvider } from '@athena/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettings } from './components/NotificationSettings';

afterEach(() => vi.unstubAllGlobals());

/** Réglages de notification : l'état affiché est celui du serveur, jamais une valeur par défaut inventée pendant le chargement. */
describe('réglages de notification', () => {
  it('n’affiche aucune case avant la réponse du serveur, puis l’état réel (commentaire désactivé)', async () => {
    let release: (value: Response) => void = () => undefined;
    const prefs = new Promise<Response>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (/notification-prefs$/.test(input)) return prefs;
      if (/notification-digest$/.test(input)) return new Response(JSON.stringify({ available: false, enabled: false, hour: 8, timezone: 'UTC', locale: 'fr' }), { status: 200 });
      return new Response('{}', { status: 200 });
    }));
    render(<ToastProvider><NotificationSettings /></ToastProvider>);
    expect(screen.queryByRole('checkbox', { name: 'Commentaire' })).not.toBeInTheDocument();
    release(new Response(JSON.stringify({ transition: true, mention: true, suspect: true, comment: false, approval: true }), { status: 200 }));
    expect(await screen.findByRole('checkbox', { name: 'Commentaire' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mention' })).toBeChecked();
  });
});
