import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { ReviewDossierPage } from './ReviewDossierPage';

const line = (over: Record<string, unknown>) => ({ key: 'SA', name: 'Projet A', health: 'ok', computedHealth: 'ok', overridden: false, declaredHealth: null, gap: false, phase: 'pdr', plannedEnd: '2026-12-18', nextReview: '2026-12-01', progress: 80, open: 2, late: 0, blocked: 0, maxRisk: null, ...over });
const dossier = {
  review: { id: 'r1', heldOn: '2026-12-10', state: 'draft', summary: 'Ordre du jour', createdBy: 'Pat PMO' }, portfolio: { key: 'snap', name: 'Spatial' },
  snapshot: { takenAt: '2026-11-25T10:00:00.000Z', lines: [line({}), line({ key: 'SB', name: 'Projet B', health: 'critical', computedHealth: 'critical', late: 4, blocked: 3, progress: 20, maxRisk: 20 }), line({ key: 'SC', name: 'Projet C', health: 'critical', computedHealth: 'critical', late: 2 })],
    totals: { projects: 3, byHealth: { ok: 1, attention: 0, critical: 2 }, late: 6, blocked: 3, open: 6, progress: 50 } },
};
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(dossier), { status: 200 }))); });
afterEach(() => vi.unstubAllGlobals());

describe('dossier de revue (B33)', () => {
  it('reprend l’instantané figé : tuiles, tableau, une section par projet critique ; imprimable', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/portefeuilles/snap/revues/r1']}><ToastProvider><Routes><Route path="/portefeuilles/:key/revues/:id" element={<ReviewDossierPage />} /></Routes></ToastProvider></MemoryRouter>);
    const article = await screen.findByRole('article');
    expect(screen.getByText(/Instantané figé le .* : ces valeurs ne changent plus\./)).toBeInTheDocument();
    expect(within(article).getByText('Ordre du jour')).toBeInTheDocument();
    expect(within(article).getByRole('table', { name: 'Santé de 3 projets à la date de la revue' })).toBeInTheDocument();
    const sections = within(article).getAllByRole('region', { name: /^Projet critique / });
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual(['Projet critique SB', 'Projet critique SC']);
    expect(screen.getByRole('button', { name: 'Imprimer le dossier' })).toBeInTheDocument();
    expect(article.className).toContain('ath-sheet');
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});
