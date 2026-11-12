import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarTab } from './components/Calendar';

/** T-0160 : Administration > Calendrier (semaine ouvrée, jours fériés). */
let sent: unknown[] = [];
beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'PUT') {
      const body = JSON.parse(String(init?.body));
      sent.push(body);
      return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response(JSON.stringify({ workDays: [1, 2, 3, 4, 5], holidays: [{ day: '2026-11-11', label: 'Armistice' }] }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const open = async () => {
  render(<ToastProvider><CalendarTab /></ToastProvider>);
  await screen.findByRole('checkbox', { name: 'Lundi' });
};

describe('calendrier de l’organisation', () => {
  it('montre la semaine ouvrée et les jours fériés enregistrés', async () => {
    await open();
    for (const d of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']) expect(screen.getByRole('checkbox', { name: d })).toBeChecked();
    for (const d of ['Samedi', 'Dimanche']) expect(screen.getByRole('checkbox', { name: d })).not.toBeChecked();
    expect(screen.getByText('Armistice')).toBeInTheDocument();
  });

  it('ajoute le samedi, un jour férié, en retire un autre, et enregistre', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Samedi' }));
    await userEvent.type(screen.getByLabelText('Date'), '2026-12-25');
    await userEvent.type(screen.getByLabelText('Libellé'), 'Noël');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le jour férié' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Armistice' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le calendrier' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ workDays: [1, 2, 3, 4, 5, 6], holidays: [{ day: '2026-12-25', label: 'Noël' }] });
  });

  it('refuse un jour férié incomplet ou en double, et une semaine sans jour travaillé', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le jour férié' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Renseignez la date et le libellé.');
    await userEvent.type(screen.getByLabelText('Date'), '2026-11-11');
    await userEvent.type(screen.getByLabelText('Libellé'), 'Autre');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le jour férié' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ce jour est déjà férié.');
    for (const d of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']) await userEvent.click(screen.getByRole('checkbox', { name: d }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le calendrier' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Au moins un jour travaillé est requis.');
    expect(sent).toHaveLength(0);
  });
});
