import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { ProjectSheetPage } from './ProjectSheetPage';

const empty = { plannedStart: null, plannedEnd: null, reviewPlannedOn: null, reviewHeldOn: null, decision: null, decidedBy: null, decidedAt: null, note: '' };
const routes: Record<string, unknown> = {
  kpis: { project: { name: 'Satellite', managers: ['Chef Projet'] }, progress: { percent: 40 }, late: 2, blocked: 1, open: 9, dueSoon: 0, health: { state: 'attention' } },
  meta: { plannedStart: '2026-01-05', plannedEnd: '2026-12-18', sponsorName: 'Sam Sponsor', sponsorSubject: 'sp', description: '', capacityGranularity: null },
  'status-notes': [{ id: 'n', writtenAt: '2026-11-10T10:00:00.000Z', author: 'a', authorName: 'Chef Projet', schedule: 'attention', scope: 'ok', risk: 'critical', resources: null, cost: null, comment: 'Lanceur décalé' }],
  lifecycle: { state: { name: 'En cours' } },
  template: { phase: 'pdr', phases: [
    { key: 'srr', name: 'Exigences', review: 'srr', offTemplate: false, record: { ...empty, reviewPlannedOn: '2026-03-05', reviewHeldOn: '2026-03-06', decision: 'go' } },
    { key: 'pdr', name: 'Conception', review: 'pdr', offTemplate: false, record: { ...empty, reviewPlannedOn: '2026-07-01' } },
    { key: 'old', name: 'old', review: '', offTemplate: true, record: empty },
  ] },
  search: { total: 2, hits: [
    { key: 'SAT-RSK-1', title: 'Lanceur', tracker: 'RSK', status: 'o', statusName: 'Ouvert', category: 'todo', values: {}, version: 1, updatedAt: '', risk: { probability: 4, impact: 5, criticality: 20 } },
    { key: 'SAT-RSK-2', title: 'Levé', tracker: 'RSK', status: 'c', statusName: 'Clos', category: 'done', values: {}, version: 1, updatedAt: '', risk: { probability: 5, impact: 5, criticality: 25 } },
  ] },
};
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const name = Object.keys(routes).find((k) => String(url).includes(`/${k}`));
    return new Response(JSON.stringify(name ? routes[name] : {}), { status: name ? 200 : 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<MemoryRouter initialEntries={['/p/SAT/fiche']}><ToastProvider><Routes><Route path="/p/:project/fiche" element={<ProjectSheetPage />} /></Routes></ToastProvider></MemoryRouter>);

describe('fiche projet d’une page (B23)', () => {
  it('réunit santé, météo, phases et revues, risques principaux (hors risques clos)', async () => {
    const { container } = show();
    const sheet = await screen.findByRole('article', { name: 'Fiche projet SAT' });
    expect(within(sheet).getByText('Sam Sponsor', { exact: false })).toBeInTheDocument();
    expect(within(sheet).getByText('Lanceur décalé')).toBeInTheDocument();
    const phases = within(sheet).getByRole('region', { name: 'Phases et revues' });
    expect(within(phases).getAllByRole('listitem')).toHaveLength(2); // la phase hors gabarit n'est pas imprimée
    expect(within(phases).getByText(/En cours/)).toBeInTheDocument();
    const risks = within(sheet).getByRole('region', { name: 'Risques principaux' });
    expect(within(risks).getAllByRole('listitem')).toHaveLength(1);
    expect(within(risks).getByRole('link', { name: 'SAT-RSK-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer la fiche' })).toBeInTheDocument();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});
