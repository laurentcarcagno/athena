import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { PortfolioHealthTable } from './PortfolioHealthTable';

const row = (over: Record<string, unknown>) => ({
  key: 'HA', name: 'Projet A', lifecycle: { key: 'in_progress', name: 'En cours', category: 'active' }, health: 'ok', computedHealth: 'ok', overridden: false,
  declaredHealth: null, declaredAt: null, gap: false, reasons: [], note: '', plannedStart: null, plannedEnd: null, sponsor: null, phase: null, nextReview: null,
  progress: 80, open: 2, late: 0, blocked: 0, dueSoon: 0, maxRisk: null, ...over,
});
let body: unknown;
let failing = false;
const urls: string[] = [];

beforeEach(() => {
  urls.length = 0; failing = false;
  body = {
    portfolio: { key: 'sante', name: 'Santé', projects: 3 },
    rows: [
      row({ key: 'HB', name: 'Projet B', health: 'critical', computedHealth: 'critical', late: 4, blocked: 3, phase: 'pdr', nextReview: '2026-12-01', plannedEnd: '2026-12-18', sponsor: 'Sam Sponsor', maxRisk: 20, progress: 20 }),
      row({ key: 'HA', declaredHealth: 'critical', gap: true, health: 'attention', overridden: true }),
    ],
    totals: { projects: 2, byHealth: { ok: 0, attention: 1, critical: 1 }, gaps: 1, late: 4, blocked: 3, open: 10, progress: 50 }, hiddenByState: 1,
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    return failing ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(body), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<MemoryRouter><ToastProvider><PortfolioHealthTable portfolio="sante" /></ToastProvider></MemoryRouter>);

describe('tableau de santé du portefeuille (B20)', () => {
  it('montre calculée, déclarée et forcée, l’écart, la phase, les dates et le risque ; chaque cellule mène à son objet', async () => {
    const { container } = show();
    const table = await screen.findByRole('table', { name: 'Santé de 2 projets' });
    const rows = within(table).getAllByRole('row').slice(1);
    const hb = within(rows[0]!);
    expect(hb.getByRole('link', { name: 'HB' })).toHaveAttribute('href', '/p/HB');
    expect(hb.getByRole('link', { name: 'pdr' })).toBeInTheDocument();
    expect(hb.getByRole('link', { name: '20' })).toHaveAttribute('href', '/p/HB/rapports/risques');
    expect(hb.getByRole('link', { name: '4' })).toHaveAttribute('href', '/p/HB/board');
    expect(hb.getByText('Sam Sponsor')).toBeInTheDocument();
    const ha = within(rows[1]!);
    expect(ha.getByText('forcée')).toBeInTheDocument();
    expect(ha.getByText('écart avec la santé calculée')).toBeInTheDocument();
    expect(ha.getByText(/Calculée : Sous contrôle|Calculée : /)).toBeInTheDocument();
    expect(screen.getByText(/Périmètre : les projets que vous pouvez voir · 2 projets affichés · 1 terminé, annulé ou archivé masqué/)).toBeInTheDocument();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('les filtres sont envoyés à l’API', async () => {
    show();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Santé'), 'critical');
    await waitFor(() => expect(urls.at(-1)).toContain('health=critical'));
    await userEvent.click(screen.getByLabelText('Inclure les projets clos'));
    await waitFor(() => expect(urls.at(-1)).toContain('includeClosed=1'));
    await userEvent.selectOptions(screen.getByLabelText('État du projet'), 'active');
    await waitFor(() => expect(urls.at(-1)).toContain('state=active'));
  });

  it('état vide et état dégradé', async () => {
    body = { portfolio: { key: 'sante', name: 'Santé', projects: 3 }, rows: [], totals: { projects: 0, byHealth: { ok: 0, attention: 0, critical: 0 }, gaps: 0, late: 0, blocked: 0, open: 0, progress: 0 }, hiddenByState: 0 };
    const { unmount } = show();
    expect(await screen.findByText('Aucun projet ne correspond aux filtres.')).toBeInTheDocument();
    unmount();
    failing = true;
    show();
    expect(await screen.findByText('Le tableau de santé est indisponible pour le moment.')).toBeInTheDocument();
  });
});
