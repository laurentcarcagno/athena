import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { visibleReports } from './lib/navigation';
import { ReportsPage } from './pages/ReportsPage';
import { bandOf } from './pages/project/RisksTab';

// Audit des rôles : pont avant le lot 13, le rapport Risques classe les risques du projet par criticité.

const hit = (key: string, title: string, values: Record<string, unknown>, category = 'in_progress', statusName = 'Mitigation en cours') =>
  ({ key, title, tracker: 'RSK', status: 'mitigating', statusName, category, values, version: 1, updatedAt: '2026-11-13T10:00:00Z' });
const hits = [ // déjà classés par criticité décroissante, comme le fait l'API
  hit('LUM-RSK-0004', 'Lanceur décalé', { category: 'lancement', probability: 5, impact: 4, criticality: 20 }),
  hit('LUM-RSK-0003', 'Retard du capteur stellaire', { category: 'programmatique', probability: 4, impact: 4, criticality: 16 }),
  hit('LUM-RSK-0001', 'Panne du bus CAN', { category: 'technique', probability: 2, impact: 5, criticality: 10 }),
  hit('LUM-RSK-0009', 'Station sol indisponible', { category: 'programmatique', probability: 2, impact: 2 }, 'todo', 'Identifié'),
  hit('LUM-RSK-0005', 'Risque levé', { category: 'technique', probability: 1, impact: 1, criticality: 1 }, 'done', 'Clos'),
];

describe('paliers de criticité', () => {
  it('faible 1-4, modéré 5-9, élevé 10-16, critique 20-25', () => {
    expect([1, 4, 5, 9, 10, 16, 20, 25].map(bandOf)).toEqual(['low', 'low', 'moderate', 'moderate', 'high', 'high', 'critical', 'critical']);
  });
  it('le rapport Risques n’existe que pour un projet qui a un tracker de risques', () => {
    expect(visibleReports(null).map((r) => r.id)).not.toContain('risques');
    expect(visibleReports(null, true).map((r) => r.id)).toEqual(['avancement', 'tracabilite', 'conformite', 'livraison', 'activite', 'risques']);
  });
});

const session = { authenticated: true, user: { username: 'u', name: 'U', email: null, roles: ['athena-user'], groups: [] } } as Session;

describe('rapport Risques', () => {
  let trackers: Array<{ key: string; typeKey: string | null }> = [];
  beforeEach(() => {
    trackers = [{ key: 'RSK', typeKey: 'risk' }];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (/\/trackers$/.test(input)) return ok(trackers);
      if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers'] });
      if (/\/search\?/.test(input)) { expect(decodeURIComponent(input)).toContain('type = risk ORDER BY criticality DESC'); return ok({ total: hits.length, hits }); }
      return ok([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const open = () => render(<MemoryRouter initialEntries={['/p/LUM/rapports/risques']}><ToastProvider><Routes><Route path="/p/:project/rapports/:report" element={<ReportsPage session={session} />} /></Routes></ToastProvider></MemoryRouter>);

  it('liste les risques avec leur palier en toutes lettres et résume les risques ouverts', async () => {
    open();
    expect(await screen.findByText('4 risques ouverts : 1 critique, 2 élevés, 0 modéré, 1 faible.')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    const cells = (i: number) => within(rows[i]!).getAllByRole('cell').map((c) => c.textContent);
    expect(cells(1)).toEqual(['LUM-RSK-0003', 'Retard du capteur stellaire', 'programmatique', '4', '4', '16 élevé', 'Mitigation en cours']);
    expect(cells(0)[5]).toBe('20 critique');
    expect(cells(3)[5]).toBe('4 faible'); // criticité absente : probabilité × impact
    expect(screen.getByRole('link', { name: 'Risques' })).toHaveAttribute('aria-current', 'page');
  });
});
