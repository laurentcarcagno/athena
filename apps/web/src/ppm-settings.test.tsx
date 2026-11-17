import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PpmSettingsTab } from './components/PpmSettings';
import { DurationField } from './components/DurationField';
import { formatDuration, parseDuration, splitMinutes, toMinutes } from './lib/duration';
import { setFeatures } from './lib/features';
import { useState } from 'react';

/** Durées en heures et minutes et réglages PPM (lot 17, T-0187). */
describe('durées en heures et minutes', () => {
  it('7 h 48, 7 h 00, 8 h 00 et toute autre durée se convertissent sans arrondi', () => {
    expect(toMinutes(7, 48)).toBe(468);
    expect(toMinutes(7, 0)).toBe(420);
    expect(toMinutes(8, 0)).toBe(480);
    expect(splitMinutes(468)).toEqual({ hours: 7, minutes: 48 });
    expect(formatDuration(468)).toBe('7 h 48');
    expect(formatDuration(420)).toBe('7 h 00');
    expect(formatDuration(480)).toBe('8 h 00');
    expect(formatDuration(45)).toBe('0 h 45');
    expect(formatDuration(455)).toBe('7 h 35');
  });
  it('lit la saisie au clavier sous plusieurs formes', () => {
    for (const text of ['7 h 48', '7h48', '7:48', '7 H 48']) expect(parseDuration(text), text).toBe(468);
    expect(parseDuration('7 h')).toBe(420);
    expect(parseDuration('8h')).toBe(480);
    expect(parseDuration('45 min')).toBe(45);
    expect(parseDuration('7,5 h')).toBe(450);
    expect(parseDuration('7.8 h')).toBe(468);
    for (const text of ['', 'abc', '7 h 75', '7 h 4 8']) expect(parseDuration(text), text).toBeNull();
  });
});

describe('champ de durée', () => {
  function Harness({ initial }: { initial: number }) {
    const [v, setV] = useState(initial);
    return <><DurationField label="Journée" value={v} onChange={setV} /><output aria-label="minutes">{v}</output></>;
  }
  it('saisit les heures et les minutes séparément et affiche le total', async () => {
    render(<Harness initial={468} />);
    expect(screen.getByText('Total : 7 h 48')).toBeInTheDocument();
    const minutes = screen.getByLabelText('Minutes');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '0');
    expect(screen.getByLabelText('minutes')).toHaveTextContent('420');
    expect(screen.getByText('Total : 7 h 00')).toBeInTheDocument();
    const hours = screen.getByLabelText('Heures');
    await userEvent.clear(hours);
    await userEvent.type(hours, '8');
    expect(screen.getByLabelText('minutes')).toHaveTextContent('480');
  });
  it('signale une durée nulle', async () => {
    render(<Harness initial={0} />);
    expect(screen.getByRole('alert')).toHaveTextContent('La durée doit être comprise entre 0 h 01 et 24 h 00.');
  });
});

describe('Administration › PPM', () => {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: input, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (/\/v1\/ppm-settings$/.test(input)) return ok({ workdayMinutes: 468, snapshotFrequency: 'weekly', snapshotWeeklyRetentionWeeks: 26, snapshotReviewRetentionMonths: null, overloadPercent: 110, statusNoteStaleDays: 30 });
      if (/\/v1\/admin\/ppm-settings$/.test(input)) return ok(JSON.parse(String(init?.body)));
      if (/\/v1\/features$/.test(input)) return ok({ 'ppm.portfolios': true, 'ppm.roadmap': true, 'ppm.capacity': false, 'ppm.finance': false, 'ppm.demand': false });
      if (/\/v1\/admin\/features\//.test(input)) return ok({ 'ppm.portfolios': false, 'ppm.roadmap': true, 'ppm.capacity': false, 'ppm.finance': false, 'ppm.demand': false });
      return ok({});
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); setFeatures(null); });

  it('règle la journée à 7 h 00 et enregistre en minutes', async () => {
    render(<ToastProvider><PpmSettingsTab /></ToastProvider>);
    expect(await screen.findByText('Total : 7 h 48')).toBeInTheDocument();
    const minutes = screen.getByLabelText('Minutes');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT' && /admin\/ppm-settings$/.test(c.url))?.body).toMatchObject({ workdayMinutes: 420, snapshotFrequency: 'weekly', snapshotReviewRetentionMonths: null }));
  });

  it('les instantanés de revue sont conservés sans limite par défaut ; décocher propose une durée en mois', async () => {
    render(<ToastProvider><PpmSettingsTab /></ToastProvider>);
    const unlimited = await screen.findByRole('checkbox', { name: 'Conserver les instantanés de revue sans limite' });
    expect(unlimited).toBeChecked();
    expect(screen.queryByLabelText('Conservation des instantanés de revue (mois)')).not.toBeInTheDocument();
    await userEvent.click(unlimited);
    expect(await screen.findByLabelText('Conservation des instantanés de revue (mois)')).toHaveValue(120);
  });

  it('désactiver une fonctionnalité l’enregistre et met l’interface à jour', async () => {
    render(<ToastProvider><PpmSettingsTab /></ToastProvider>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Portefeuilles et charge des équipes' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT' && /admin\/features\/ppm\.portfolios$/.test(c.url))?.body).toEqual({ enabled: false }));
    expect(await screen.findByRole('checkbox', { name: 'Portefeuilles et charge des équipes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Capacité (à venir)' })).not.toBeChecked();
  });
});
