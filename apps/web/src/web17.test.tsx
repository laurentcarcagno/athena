import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

const calls: Array<{ method: string; url: string; body?: string }> = [];
const matrix = (extra: Record<string, unknown> = {}) => ({
  category: 'B', categories: ['A', 'B'], totals: { clauses: 3, applicable: 2, notApplicable: 1, modified: 0, covered: 1, rate: 50 },
  rows: [
    { key: 'SAT-NORM-0001', reference: '5.1', title: 'Plan de développement', standard: 'ECSS', applicability: 'applicable', justification: '', evidence: [{ key: 'SAT-PRO-0001', title: 'Procédure', tracker: 'PRO' }], covered: true },
    { key: 'SAT-NORM-0002', reference: '5.2', title: 'Revue de conception', standard: 'ECSS', applicability: 'applicable', justification: '', evidence: [], covered: false },
    { key: 'SAT-NORM-0003', reference: '5.3', title: 'Sécurité', standard: 'ECSS', applicability: 'not_applicable', justification: 'Hors périmètre catégorie B', evidence: [], covered: false },
  ], ...extra,
});

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: input, body: init?.body as string | undefined });
    const ok = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
    if (/\/conformity\/export/.test(input)) return ok({ filename: 'conformite-SAT-B.csv', csv: 'a,b\n' });
    if (/\/conformity/.test(input)) return ok(matrix());
    if (/\/tailoring$/.test(input) && init?.method === 'PUT') return ok({});
    if (/\/clauses\/import$/.test(input)) return ok({ created: 1, updated: 0, unchanged: 0, errors: 1, lines: [{ line: 2, reference: '6.1', status: 'created', key: 'SAT-NORM-0004' }, { line: 3, reference: '6.1', status: 'error', message: 'doublon de la ligne 2' }] });
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning', 'traceability', 'conformity', 'activity', 'members'] });
    if (/\/v1\/projects$/.test(input)) return ok([]);
    return ok({ error: 'not_found', message: 'Introuvable.', details: [] }, 404);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const user: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const pm: Session = { authenticated: true, user: { username: 'p', name: 'Paul', email: null, roles: ['athena-user', 'athena-pm'], groups: [] } };
const app = (session: Session) => render(<ToastProvider><MemoryRouter initialEntries={['/p/SAT/conformite']}><AuthenticatedApp session={session} /></MemoryRouter></ToastProvider>);

describe('onglet Conformité', () => {
  it('s’ouvre depuis la barre d’onglets et montre le taux, les preuves et les clauses non applicables justifiées', async () => {
    app(user);
    expect(await screen.findByText('50 % de clauses applicables couvertes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conformité' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('2 applicables, 1 couvertes, 1 non applicables, 0 modifiées')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: '5.1' }).closest('tr')!;
    expect(within(row).getByRole('link', { name: 'SAT-PRO-0001' })).toHaveAttribute('href', '/p/SAT/a/SAT-PRO-0001');
    expect(within(row).getByText('Oui')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: '5.2' }).closest('tr')!).getByText('Aucune preuve liée')).toBeInTheDocument();
    const na = screen.getByRole('link', { name: '5.3' }).closest('tr')!;
    expect(within(na).getByText('Non applicable')).toBeInTheDocument();
    expect(within(na).getByText('Hors périmètre catégorie B')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importer des clauses' })).toBeNull(); // réservé aux responsables
    expect(screen.queryByRole('button', { name: /Tailoring de la clause/ })).toBeNull();
  });

  it('change de catégorie, exporte en CSV', async () => {
    app(user);
    await screen.findByText('50 % de clauses applicables couvertes');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie de criticité'), 'A');
    await waitFor(() => expect(calls.some((c) => /conformity\?category=A$/.test(c.url))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Exporter en CSV' }));
    await waitFor(() => expect(calls.some((c) => /conformity\/export\?category=A$/.test(c.url))).toBe(true));
  });

  it('exige une justification pour « non applicable » avant tout appel, puis enregistre le tailoring', async () => {
    app(pm);
    await userEvent.click(await screen.findByRole('button', { name: 'Tailoring de la clause 5.2' }));
    const form = screen.getByRole('form', { name: 'Tailoring de la clause 5.2' });
    await userEvent.selectOptions(within(form).getByLabelText('Applicabilité'), 'not_applicable');
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('La justification est obligatoire');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await userEvent.type(within(form).getByLabelText('Justification'), 'Hors périmètre');
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body!)).toEqual({ clause: '5.2', category: 'B', applicability: 'not_applicable', justification: 'Hors périmètre' });
  });

  it('importe un fichier CSV et affiche le rapport ligne par ligne', async () => {
    app(pm);
    await userEvent.click(await screen.findByRole('button', { name: 'Importer des clauses' }));
    const form = screen.getByRole('form', { name: 'Importer les clauses d’une norme' });
    await userEvent.click(within(form).getByRole('button', { name: 'Importer' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Choisissez un fichier CSV.');
    const file = new File(['reference,title,text\n6.1,A,B\n'], 'norme.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => 'reference,title,text\n6.1,A,B\n' });
    await userEvent.upload(within(form).getByLabelText('Fichier CSV'), file);
    await userEvent.click(within(form).getByRole('button', { name: 'Importer' }));
    expect(await within(form).findByText('doublon de la ligne 2')).toBeInTheDocument();
    expect(within(form).getByText('SAT-NORM-0004')).toBeInTheDocument();
    expect(JSON.parse(calls.find((c) => /clauses\/import/.test(c.url))!.body!).csv).toContain('6.1,A,B');
  });

  it('ne présente aucune violation d’accessibilité (axe), formulaire de tailoring ouvert', async () => {
    const { container } = app(pm);
    await userEvent.click(await screen.findByRole('button', { name: 'Tailoring de la clause 5.1' }));
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([]);
  });
});
