import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { PrioritizationPanel } from './PrioritizationPanel';

const ranking = {
  model: { version: 2, criteria: [{ key: 'valeur', label: 'Valeur', weight: 3, scaleMin: 0, scaleMax: 10, direction: 'higher' }, { key: 'cout', label: 'Coût', weight: 2, scaleMin: 0, scaleMax: 100, direction: 'lower' }] },
  requests: [
    { key: 'PIL-REQ-2', project: 'PIL', title: 'Station sol bis', score: 100, completeness: 60, incomplete: true, contributions: [{ criterion: 'valeur', points: 100 }], converted: null },
    { key: 'PIL-REQ-1', project: 'PIL', title: 'Capteur v2', score: 80, completeness: 100, incomplete: false, contributions: [{ criterion: 'valeur', points: 48 }, { criterion: 'cout', points: 32 }], converted: 'converted' },
    { key: 'PIL-REQ-3', project: 'PIL', title: 'Refonte du bus', score: null, completeness: 0, incomplete: true, contributions: [], converted: null },
  ],
};
const calls: Array<{ method: string; url: string; body?: string }> = [];
let disabled = false;
beforeEach(() => {
  calls.length = 0; disabled = false;
  vi.stubGlobal('prompt', vi.fn(() => 'Hors périmètre'));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    const u = String(url);
    if (disabled) return new Response('{}', { status: 404 });
    if (u.endsWith('/ranking')) return new Response(JSON.stringify(ranking), { status: 200 });
    if (u.endsWith('/scenarios') && (init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify([{ id: 's1', name: 'Et si A glisse', author: 'Pat PMO', changeCount: 1 }]), { status: 200 });
    if (u.endsWith('/evaluate')) return new Response(JSON.stringify({ scenario: { name: 'Et si A glisse' }, result: { shifts: [{ ticket: 'AAA-TSK-1', shiftDays: 3, impacts: [{ key: 'BBB-TSK-1', project: 'BBB', shiftDays: 3 }] }], capacity: [], budget: [] } }), { status: 200 });
    if (u.endsWith('/earned-value')) return new Response(JSON.stringify({ rows: [{ project: 'EXE', name: 'Exécution', bac: 100000, pv: 50000, ev: 50000, ac: 40000, cpi: 1.25, spi: 1, quadrant: 'on_track' }] }), { status: 200 });
    return new Response('{}', { status: 201 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });
const show = (canEdit = true) => render(<MemoryRouter><ToastProvider><PrioritizationPanel portfolio="prio" canEdit={canEdit} canSeeFinance /></ToastProvider></MemoryRouter>);

describe('priorisation, scénarios, valeur acquise (B41)', () => {
  it('classement avec complétude dite en toutes lettres, non notées à la fin, valeur acquise lue ; aucun défaut axe', async () => {
    const { container } = show();
    const table = await screen.findByRole('table', { name: '3 demandes classées' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('60 % · incomplète')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Convertie en projet')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('non notée')).toBeInTheDocument();
    const ev = await screen.findByRole('table', { name: 'Valeur acquise de 1 projet' });
    expect(within(ev).getByText('Dans le budget et dans les temps')).toBeInTheDocument();
    expect(within(ev).getByText('1.25')).toBeInTheDocument();
    expect((await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('note une demande, refuse avec un motif, crée puis calcule un scénario (lecture seule)', async () => {
    show();
    const form = await screen.findByRole('form', { name: 'Noter une demande' });
    await userEvent.type(within(form).getByLabelText('Demande (clé)'), 'PIL-REQ-3');
    await userEvent.selectOptions(within(form).getByLabelText('Critère'), 'valeur');
    await userEvent.type(within(form).getByLabelText('Valeur'), '7,5');
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer la note' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/scores'))?.body).toBe(JSON.stringify({ ticket: 'PIL-REQ-3', criterion: 'valeur', value: 7.5 })));
    await userEvent.click(screen.getAllByRole('button', { name: 'Refuser' })[0]!);
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/requests/PIL-REQ-2/refuse'))?.body).toBe(JSON.stringify({ reason: 'Hors périmètre' })));
    await userEvent.click(screen.getByRole('button', { name: 'Calculer' }));
    expect(await screen.findByText('Si AAA-TSK-1 glisse de 3 jours ouvrés : BBB-TSK-1 (+3 j).')).toBeInTheDocument();
    expect(screen.getByText('Un scénario est un calcul : rien n’est modifié dans les projets, les allocations ni le budget.')).toBeInTheDocument();
  });

  it('absent quand la fonctionnalité Demandes est désactivée', async () => {
    disabled = true;
    const { container } = show();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(container.textContent).toBe('');
  });
});

import { sensitivity } from './PrioritizationPanel';

describe('sensibilité des pondérations (B41)', () => {
  it('doubler le poids du critère où une demande excelle la fait monter ; le diviser par deux la fait descendre', () => {
    const criteria = [{ key: 'valeur', label: 'Valeur', weight: 1, scaleMin: 0, scaleMax: 10, direction: 'higher' as const }, { key: 'cout', label: 'Coût', weight: 1, scaleMin: 0, scaleMax: 100, direction: 'lower' as const }];
    // A : valeur 100 %, coût 20 % ; B : valeur 40 %, coût 100 % ; à poids égaux B (70) devance A (60)
    const requests = [
      { key: 'A', project: 'P', title: 'A', score: 60, completeness: 100, incomplete: false, contributions: [{ criterion: 'valeur', points: 50 }, { criterion: 'cout', points: 10 }], converted: null },
      { key: 'B', project: 'P', title: 'B', score: 70, completeness: 100, incomplete: false, contributions: [{ criterion: 'valeur', points: 20 }, { criterion: 'cout', points: 50 }], converted: null },
    ];
    const s = sensitivity(criteria, requests);
    const valeur = s.find((x) => x.criterion === 'valeur')!.rankings;
    expect(valeur['A']).toEqual({ half: 2, double: 1 }); // doubler la valeur fait passer A devant B
    expect(valeur['B']).toEqual({ half: 1, double: 2 });
  });
});
