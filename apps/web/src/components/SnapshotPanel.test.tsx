import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { SnapshotPanel } from './SnapshotPanel';
import { PortfolioHealthTable, trendOf } from './PortfolioHealthTable';

const snaps = [
  { id: 's2', kind: 'manual', period: null, label: 'Avant la revue', takenAt: '2026-11-24T10:00:00.000Z', takenBy: 'Pat PMO', projects: 2 },
  { id: 's1', kind: 'weekly', period: '2026-W47', label: '', takenAt: '2026-11-16T10:00:00.000Z', takenBy: 'système', projects: 2 },
];
const calls: Array<{ method: string; url: string; body?: string }> = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    if (String(url).includes('/snapshots/compare')) return new Response(JSON.stringify({ from: snaps[1], to: snaps[0], changes: [
      { key: 'SA', name: 'A', change: 'changed', health: { from: 'ok', to: 'critical' }, phase: { from: null, to: null }, plannedEnd: { from: null, to: null }, late: { from: 0, to: 4 }, progress: { from: 50, to: 50 } },
      { key: 'SB', name: 'B', change: 'same', health: { from: 'ok', to: 'ok' }, phase: { from: null, to: null }, plannedEnd: { from: null, to: null }, late: { from: 0, to: 0 }, progress: { from: 50, to: 50 } },
    ] }), { status: 200 });
    if (String(url).endsWith('/reviews')) return new Response(JSON.stringify(init?.method === 'POST' ? { id: 'r1' } : []), { status: init?.method === 'POST' ? 201 : 200 });
    if (init?.method === 'POST') return new Response(JSON.stringify(snaps[0]), { status: 201 });
    return new Response(JSON.stringify(snaps), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = (canTake: boolean) => render(<MemoryRouter><ToastProvider><SnapshotPanel portfolio="snap" canTake={canTake} /></ToastProvider></MemoryRouter>);

describe('instantanés du portefeuille (B32)', () => {
  it('liste les instantanés ; le PMO en prend un à la main ; un lecteur n’a pas le bouton', async () => {
    const { container, unmount } = show(true);
    expect(await screen.findByRole('table', { name: '2 instantanés' })).toBeInTheDocument();
    expect(screen.getByText('Avant la revue', { selector: 'td' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Libellé de l’instantané'), 'Point de mars');
    await userEvent.click(screen.getByRole('button', { name: 'Prendre un instantané' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ kind: 'manual', label: 'Point de mars' })));
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
    unmount();
    show(false);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Prendre un instantané' })).toBeNull();
  });

  it('compare deux instantanés : n’affiche que les écarts, avec l’avant et l’après', async () => {
    show(false);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Comparer'), 's1');
    await userEvent.selectOptions(screen.getByLabelText('à'), 's2');
    await userEvent.click(screen.getByRole('button', { name: 'Comparer' }));
    const table = await screen.findByRole('table', { name: /^Écarts du .* au / });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('Modifié')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Sain → Critique')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('0 → 4')).toBeInTheDocument();
  });
});

describe('revues de portefeuille (B33)', () => {
  it('le PMO crée une revue datée : l’instantané est figé à la création', async () => {
    show(true);
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Date de la revue'), '2026-12-10');
    await userEvent.type(screen.getByLabelText('Ordre du jour ou compte rendu'), 'Point trimestriel');
    await userEvent.click(screen.getByRole('button', { name: 'Créer la revue et figer l’instantané' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/reviews'))?.body).toBe(JSON.stringify({ heldOn: '2026-12-10', summary: 'Point trimestriel' })));
  });
});

describe('tendance (B21, B32)', () => {
  it('flèche : hausse, baisse, stable, sans instantané précédent rien', () => {
    expect(trendOf(3, 1)).toEqual({ arrow: '↑', word: 'up' });
    expect(trendOf(1, 3)).toEqual({ arrow: '↓', word: 'down' });
    expect(trendOf(2, 2)).toEqual({ arrow: '→', word: 'same' });
    expect(trendOf(2, undefined)).toBeNull();
  });

  it('les tuiles et le tableau montrent la tendance en mots, avec la date de l’instantané, et une mini-courbe', async () => {
    const row = { key: 'SA', name: 'A', lifecycle: { key: 'in_progress', name: 'En cours', category: 'active' }, health: 'critical', computedHealth: 'critical', overridden: false, declaredHealth: null, declaredAt: null, gap: false, reasons: [], note: '', plannedStart: null, plannedEnd: null, sponsor: null, phase: null, nextReview: null, progress: 20, open: 5, late: 4, blocked: 0, dueSoon: 0, maxRisk: null };
    const health = { portfolio: { key: 'snap', name: 'Snap', projects: 1 }, rows: [row], totals: { projects: 1, byHealth: { ok: 0, attention: 0, critical: 1 }, gaps: 0, late: 4, blocked: 0, open: 5, progress: 20 }, hiddenByState: 0 };
    const trend = { previous: { id: 's1', takenAt: '2026-11-16T10:00:00.000Z', kind: 'weekly', totals: { projects: 1, byHealth: { ok: 1, attention: 0, critical: 0 }, late: 0, blocked: 0 }, lines: [{ key: 'SA', health: 'ok', late: 0 }] },
      series: { SA: [{ at: '2026-11-09', late: 0, progress: 10, health: 'ok' }, { at: '2026-11-16', late: 0, progress: 15, health: 'ok' }] } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/trend') ? trend : health), { status: 200 })));
    render(<MemoryRouter><ToastProvider><PortfolioHealthTable portfolio="snap" /></ToastProvider></MemoryRouter>);
    const tiles = await screen.findByRole('list', { name: 'Vue direction' });
    expect(within(tiles).getAllByText(/depuis le/).length).toBeGreaterThan(0);
    expect(within(tiles).getAllByText(/en hausse/).length).toBeGreaterThan(0); // critiques : 0 → 1
    const table = await screen.findByRole('table');
    expect(within(table).getByText('était : Sain')).toBeInTheDocument();
    expect(within(table).getByRole('img', { name: 'Retards de SA sur les derniers instantanés' })).toBeInTheDocument();
  });
});
