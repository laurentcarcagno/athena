import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { ApprovalsPanel } from './components/ApprovalsPanel';
import { ProjectManagePage } from './pages/ProjectManagePage';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
const items = [
  { type: 'release', ref: 'CDR', id: 'r1', requiresApproval: true, state: 'pending', decisions: [] },
  { type: 'baseline', ref: 'B1', id: 'b1', requiresApproval: true, state: 'approved', decisions: [{ approver: 'u-qa', approverName: 'Aline QA', decision: 'approved', comment: 'Conforme', decidedAt: '2026-11-06T10:15:00.000Z' }] },
  { type: 'baseline', ref: 'B0', id: 'b0', requiresApproval: false, state: 'not_required', decisions: [] },
];

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (method !== 'GET') return ok({});
    if (/approvals$/.test(input)) return ok(items);
    return ok([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const wrap = (ui: JSX.Element) => render(<ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider>);

describe('approbation des jalons et baselines', () => {
  it('liste les objets avec leur état en texte et les décisions nominatives horodatées', async () => {
    wrap(<ApprovalsPanel project="DEF" canRequire={false} canDecide={false} />);
    const row = (await screen.findByText('CDR')).closest('tr')!;
    expect(within(row).getByText('Jalon')).toBeInTheDocument();
    expect(within(row).getByText('En attente')).toBeInTheDocument();
    const b1 = screen.getByText('B1').closest('tr')!;
    expect(within(b1).getByText('Approuvée')).toBeInTheDocument();
    expect(within(b1).getByText(/Approuvée par Aline QA/)).toBeInTheDocument();
    expect(within(b1).getByText('2026-11-06 10:15')).toBeInTheDocument();
    expect(within(b1).getByText(/Conforme/)).toBeInTheDocument();
    expect(within(screen.getByText('B0').closest('tr')!).getByText('Non requise')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull(); // lecture seule
  });

  it('un responsable exige l’approbation, sans pouvoir décider', async () => {
    wrap(<ApprovalsPanel project="DEF" canRequire canDecide={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Exiger l’approbation B0' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'PUT', url: '/v1/projects/DEF/approvals/baseline/B0/required', body: { required: true } });
    expect(screen.queryByRole('button', { name: /^Approuver/ })).toBeNull();
  });

  it('l’assurance qualité décide après confirmation, avec son commentaire ; rien n’est envoyé sans elle', async () => {
    wrap(<ApprovalsPanel project="DEF" canRequire={false} canDecide />);
    await userEvent.type(await screen.findByLabelText('Commentaire CDR'), 'Plan qualité respecté');
    await userEvent.click(screen.getByRole('button', { name: 'Approuver CDR' }));
    expect(await screen.findByText('Approuver CDR', { selector: 'h2, h3, [role="dialog"] *' })).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approuver' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'POST', url: '/v1/projects/DEF/approvals/release/CDR/decision', body: { decision: 'approved', comment: 'Plan qualité respecté' } });
    await userEvent.click(screen.getByRole('button', { name: 'Refuser B1' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.body).toEqual({ decision: 'rejected', comment: '' });
  });

  it('page Planification : le rôle assurance qualité ne voit que les approbations, un simple utilisateur est refusé', async () => {
    const as = (roles: string[]): Session => ({ authenticated: true, user: { username: 'q', name: 'Q', email: null, roles, groups: [] } });
    const page = (s: Session) => wrap(<Routes><Route path="/" element={<ProjectManagePage session={s} />} /></Routes>);
    const qa = page(as(['athena-qa']));
    expect(await screen.findByText('Rôle assurance qualité étatique : lecture seule, avec approbation des jalons et des baselines.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Approuver CDR' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Sprints' })).toBeNull();
    expect((await axe.run(qa.container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([]);
    qa.unmount();
    page(as(['athena-user']));
    expect(await screen.findByText(/Réservé|réservé/)).toBeInTheDocument();
  });

  it('un responsable trouve l’onglet Approbations dans la planification', async () => {
    const s: Session = { authenticated: true, user: { username: 'p', name: 'P', email: null, roles: ['athena-pm', 'athena-user'], groups: [] } };
    wrap(<Routes><Route path="/" element={<ProjectManagePage session={s} />} /></Routes>);
    await userEvent.click(await screen.findByRole('tab', { name: 'Approbations' }));
    expect(await screen.findByRole('button', { name: 'Ne plus exiger CDR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver CDR' })).toBeNull();
  });
});
