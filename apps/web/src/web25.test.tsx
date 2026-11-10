import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaselineCompare } from './components/BaselineCompare';

const calls: string[] = [];
let baselines: unknown[] = [];
const two = [
  { name: 'B2', gitTag: 'baseline/B2', gitSha: 'f00dfeed00112233', docShas: { urd: 'bbbb2222bbbb2222' }, createdBy: 'u', createdAt: '2026-11-07T09:00:00.000Z' },
  { name: 'B1', gitTag: 'baseline/B1', gitSha: 'abcdef0123456789', docShas: { urd: 'aaaa1111aaaa1111' }, createdBy: 'u', createdAt: '2026-11-01T09:00:00.000Z' },
];
const diff = {
  created: ['ARI-BUG-0002'], modified: ['ARI-BUG-0001'], deleted: [], trackers: ['BUG'],
  docs: [{ source: 'urd', from: 'aaaa1111aaaa1111', to: 'bbbb2222bbbb2222', added: [{ uid: 'URD-3', title: 'Verrouillage' }], modified: [{ uid: 'URD-1', title: 'Authentification' }], removed: [{ uid: 'URD-10', title: 'Supervision' }] }],
};

beforeEach(() => {
  calls.length = 0;
  baselines = two;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(input);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (/baselines-diff\/export/.test(input)) return ok({ filename: 'baselines-ARI-B1-B2.csv', csv: '"Diffusion Restreinte"\nkind,change,key,title\n"Diffusion Restreinte"\n' });
    if (/baselines-diff/.test(input)) return ok(diff);
    if (/\/baselines$/.test(input)) return ok(baselines);
    return ok([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const open = () => render(<ToastProvider><MemoryRouter><main><BaselineCompare project="ARI" /></main></MemoryRouter></ToastProvider>);

describe('baselines couplées aux documents', () => {
  it('liste les baselines avec le SHA de chaque source documentaire', async () => {
    open();
    const row = (await screen.findByRole('cell', { name: 'B2' })).closest('tr')!;
    expect(within(row).getByText('bbbb2222')).toHaveClass('ath-mono');
    expect(within(row).getByText('urd')).toBeInTheDocument();
    expect(within(screen.getByRole('cell', { name: 'B1' }).closest('tr')!).getByText('aaaa1111')).toBeInTheDocument();
  });

  it('compare deux baselines : tickets, trackers, exigences ajoutées, modifiées, supprimées et changement de SHA', async () => {
    open();
    await screen.findByRole('cell', { name: 'B2' });
    expect(screen.getByLabelText('De la baseline')).toHaveValue('B1');
    expect(screen.getByLabelText('À la baseline')).toHaveValue('B2');
    await userEvent.click(screen.getByRole('button', { name: 'Comparer' }));
    expect(await screen.findByText('B1 → B2 : 7 différences.')).toBeInTheDocument();
    expect(calls.some((c) => /baselines-diff\?from=B1&to=B2$/.test(c))).toBe(true);
    const doc = screen.getByRole('region', { name: 'Exigences de la source urd' });
    expect(within(doc).getByText('SHA aaaa1111 → bbbb2222')).toBeInTheDocument();
    expect(within(doc).getByText('URD-3')).toHaveClass('ath-mono');
    expect(within(doc).getByText('Exigences ajoutées (1)')).toBeInTheDocument();
    expect(within(doc).getByText('Exigences modifiées (1)')).toBeInTheDocument();
    expect(within(doc).getByText('Exigences supprimées (1)')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Tickets et trackers' })).getByText('ARI-BUG-0002')).toBeInTheDocument();
  });

  it('exporte en CSV (la mention de protection vient de l’API) et refuse de comparer une baseline à elle-même', async () => {
    open();
    await screen.findByRole('cell', { name: 'B2' });
    expect(screen.getByRole('button', { name: 'Exporter en CSV' })).toBeDisabled(); // rien comparé encore
    await userEvent.click(screen.getByRole('button', { name: 'Comparer' }));
    await screen.findByText(/différences/);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter en CSV' }));
    await waitFor(() => expect(calls.some((c) => /baselines-diff\/export\?from=B1&to=B2$/.test(c))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('À la baseline'), 'B1');
    expect(screen.getByRole('button', { name: 'Comparer' })).toBeDisabled();
  });

  it('dit quand rien ne change, quand il manque des baselines, et reste accessible (axe)', async () => {
    baselines = [two[0]];
    const { container, unmount } = open();
    expect(await screen.findByText('Deux baselines au moins sont nécessaires pour comparer.')).toBeInTheDocument();
    unmount();
    baselines = [];
    const empty = open();
    expect(await screen.findByText('Aucune baseline.')).toBeInTheDocument();
    empty.unmount();
    baselines = two;
    const full = open();
    await screen.findByRole('cell', { name: 'B2' });
    await userEvent.click(screen.getByRole('button', { name: 'Comparer' }));
    await screen.findByRole('region', { name: 'Exigences de la source urd' });
    expect((await axe.run(full.container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([]);
    void container;
  });
});
