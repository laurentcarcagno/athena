import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { matrixCsv } from './components/MatrixView';

const calls: Array<{ method: string; url: string; body?: string }> = [];
const item = (key: string, title: string) => ({ key, title, status: 'draft', statusName: 'Brouillon', category: 'todo' });
let linksFilled = [{ row: 'ARI-REQ-0001', col: 'ARI-TST-0001', suspect: false }, { row: 'ARI-REQ-0001', col: 'ARI-TST-0002', suspect: true }];

beforeEach(() => {
  calls.length = 0;
  linksFilled = [{ row: 'ARI-REQ-0001', col: 'ARI-TST-0001', suspect: false }, { row: 'ARI-REQ-0001', col: 'ARI-TST-0002', suspect: true }];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: input, body: init?.body as string | undefined });
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (/\/matrix\?/.test(input)) {
      return ok({
        type: { key: 'verifies', outwardLabel: 'vérifie', inwardLabel: 'est vérifié par' },
        rows: [{ ...item('ARI-REQ-0001', 'Exigence 1'), linked: true }, { ...item('ARI-REQ-0002', 'Exigence 2'), linked: false }],
        cols: [item('ARI-TST-0001', 'Test 1'), item('ARI-TST-0002', 'Test 2')], totalRows: 2, totalCols: 2, links: linksFilled,
      });
    }
    if (/\/artifacts\/ARI-TST-0001\/links$/.test(input) && init?.method === 'POST') { linksFilled = [...linksFilled, { row: 'ARI-REQ-0002', col: 'ARI-TST-0001', suspect: false }]; return ok({ id: 'l' }, 201); }
    if (/\/link-types$/.test(input)) return ok([{ key: 'verifies', outwardLabel: 'vérifie', inwardLabel: 'est vérifié par' }, { key: 'blocks', outwardLabel: 'bloque', inwardLabel: 'est bloqué par' }]);
    if (/\/tracker-types$/.test(input)) return ok([{ key: 'requirement', name: 'Exigence', description: '', category: 'engineering', defaultViews: ['tableau', 'matrice'], baseFields: [], builtin: true, modified: false }]);
    if (/\/trackers\/REQ$/.test(input)) return ok({ key: 'REQ', name: 'Exigences', typeKey: 'requirement', fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }], statuses: [{ id: 's', key: 'draft', name: 'Brouillon', category: 'todo' }], transitions: [] });
    if (/\/overview$/.test(input)) return ok({ trackers: ['REQ', 'TST'].map((key) => ({ key, name: key, typeKey: null, category: 'other', artifacts: 2, mine: 0, lastActivity: null, statuses: [] })) });
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/(modules)$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning'] });
    if (/\/(filters|boards)/.test(input) || /\/v1\/projects$/.test(input) || /\/trackers$/.test(input)) return ok([]);
    return ok({ error: 'not_found', message: 'Introuvable.', details: [] }, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const Where = () => <span data-testid="where">{useLocation().pathname}{useLocation().search}</span>;
const app = (path: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session} /></MemoryRouter></ToastProvider>);

describe('vue Matrice', () => {
  it('affiche la matrice, marque la ligne non couverte par un texte et le lien suspect par un nom accessible', async () => {
    app('/p/ARI/t/REQ/matrice');
    const table = await screen.findByRole('table', { name: /Matrice de traçabilité : REQ en lignes, TST en colonnes/ });
    expect(screen.getByRole('link', { name: 'Matrice' })).toHaveAttribute('aria-current', 'page');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByLabelText('lien existant')).toBeInTheDocument();
    expect(within(rows[1]!).getByLabelText('lien suspect')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('non couvert')).toBeInTheDocument();
    expect(screen.getByText(/1 lignes couvertes sur 2 affichées/)).toBeInTheDocument();
    expect(calls.some((c) => /matrix\?rows=REQ&cols=TST&type=verifies&offset=0/.test(c.url))).toBe(true);
  });

  it('change le tracker en colonnes et le type de lien dans l’adresse', async () => {
    app('/p/ARI/t/REQ/matrice');
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Type de lien'), 'blocks');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('mt=blocks'));
  });

  it('crée un lien depuis une case vide puis recharge la matrice', async () => {
    app('/p/ARI/t/REQ/matrice');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Lier ARI-REQ-0002 et ARI-TST-0001' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && /ARI-TST-0001\/links$/.test(c.url) && c.body === JSON.stringify({ to: 'ARI-REQ-0002', type: 'verifies' }))).toBe(true));
    await waitFor(() => expect(calls.filter((c) => /matrix\?/.test(c.url))).toHaveLength(2));
  });

  it('produit un CSV échappé avec « 1 » pour un lien et « 1! » pour un lien suspect', () => {
    const csv = matrixCsv({
      rows: [{ ...item('A-1', 'a'), linked: true }, { ...item('A-2', 'b'), linked: false }],
      cols: [item('T-1', 'x'), item('T,2', 'y')], links: [{ row: 'A-1', col: 'T-1', suspect: false }, { row: 'A-1', col: 'T,2', suspect: true }],
    });
    expect(csv).toBe(',T-1,"T,2"\nA-1,1,1!\nA-2,,\n');
  });

  it('est accessible (axe)', async () => {
    const { container } = app('/p/ARI/t/REQ/matrice');
    await screen.findByRole('table');
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
