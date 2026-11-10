import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalFlowEditor } from './ApprovalFlowEditor';
import { ApprovalPanel, type ItemApproval } from './ApprovalPanel';

const steps = (over: Partial<ItemApproval['steps'][number]>[] = []): ItemApproval['steps'] => [
  { id: 's1', position: 1, name: 'Relecture technique', kind: 'review', approvers: [{ subject: 'rita', displayName: 'Rita' }, { subject: 'remy', displayName: 'Remy' }], role: null, minApprovals: 1, state: 'done',
    decisions: [{ approver: 'rita', approverName: 'Rita', decision: 'approved', comment: 'Relu', decidedAt: '2026-11-07T09:30:00.000Z' }], ...over[0] },
  { id: 's2', position: 2, name: 'Approbation qualité', kind: 'approval', approvers: [], role: 'athena-qa', minApprovals: 1, state: 'current', decisions: [], ...over[1] },
];
const pending = (over: Partial<ItemApproval> = {}): ItemApproval => ({ configured: true, enabled: true, state: 'pending', currentStep: 2, steps: steps(), invalidated: null, canDecide: false, ...over });

let current: ItemApproval;
let calls: Array<{ method: string; url: string; body: unknown }>;
beforeEach(() => {
  calls = [];
  current = pending();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/approval/decision')) { current = pending({ state: (body as { decision: string }).decision === 'approved' ? 'approved' : 'rejected', canDecide: false, currentStep: null }); return new Response(JSON.stringify(current), { status: 200 }); }
    if (url.endsWith('/approval')) return new Response(JSON.stringify(current), { status: 200 });
    if (url.endsWith('/approval-flow') && method === 'GET') return new Response(JSON.stringify({ enabled: true, configured: true, steps: [{ name: 'Relecture', kind: 'review', approvers: [{ subject: 'rita', displayName: 'Rita' }], role: null, minApprovals: 1 }] }), { status: 200 });
    if (url.endsWith('/approval-flow')) return new Response('{}', { status: 200 });
    if (url.endsWith('/v1/users')) return new Response(JSON.stringify([{ subject: 'rita', username: 'rita', displayName: 'Rita' }, { subject: 'remy', username: 'remy', displayName: 'Remy' }]), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const axeViolations = async (container: HTMLElement) => (await axe.run(container, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
})).violations.map((v) => `${v.id} : ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' ; ')})`);
const mount = (ui: JSX.Element) => render(<ToastProvider>{ui}</ToastProvider>);

describe('panneau d’approbation d’un ticket', () => {
  it('dit l’état en texte, les étapes dans l’ordre, qui est désigné et les décisions nominatives horodatées', async () => {
    const { container } = mount(<ApprovalPanel project="APR" itemKey="APR-REQ-0001" version={1} />);
    await screen.findByText('Circuit d’approbation');
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText(/étape 2 : Approbation qualité/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Étapes du circuit' });
    const [first, second] = within(list).getAllByRole('listitem', {}).filter((li) => li.className.includes('ath-approval-step'));
    expect(first).toHaveTextContent('1. Relecture technique');
    expect(first).toHaveTextContent('Désignés : Rita, Remy');
    expect(first).toHaveTextContent('Approuvé par Rita');
    expect(first).toHaveTextContent('07/11/2026 09:30');
    expect(first).toHaveTextContent('— Relu');
    expect(second).toHaveTextContent('Désignés : Assurance qualité étatique');
    expect(screen.getByText('Vous n’êtes pas désigné pour l’étape en cours.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('affiche le message d’invalidation après une modification', async () => {
    current = pending({ currentStep: 1, steps: steps([{ state: 'current', decisions: [] }, { state: 'waiting' }]), invalidated: { at: '2026-11-07T10:00:00.000Z', version: 4, count: 2 } });
    mount(<ApprovalPanel project="APR" itemKey="APR-REQ-0001" version={4} />);
    const notice = await screen.findByText(/Le ticket a été modifié \(version 4\) : les 2 décisions précédentes sont invalidées et le circuit reprend à la première étape\./);
    expect(notice).toHaveAttribute('role', 'status');
  });

  it('une personne désignée décide après confirmation ; la décision est envoyée avec son commentaire', async () => {
    current = pending({ canDecide: true });
    const user = userEvent.setup();
    const changed = vi.fn();
    mount(<ApprovalPanel project="APR" itemKey="APR-REQ-0001" version={1} onChanged={changed} />);
    await user.type(await screen.findByLabelText('Commentaire de la décision'), 'Conforme');
    await user.click(screen.getByRole('button', { name: 'Approuver' }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(dialog).toHaveTextContent('Approuver APR-REQ-0001 ?');
    expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(false); // rien n'est envoyé avant la confirmation
    await user.click(within(dialog).getByRole('button', { name: 'Approuver' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/decision'))?.body).toEqual({ decision: 'approved', comment: 'Conforme' }));
    expect(await screen.findByText('Approuvé', { selector: 'span, strong, mark, em, b' })).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
  });

  it('sans circuit actif : message', async () => {
    current = pending({ configured: false, enabled: false, steps: [] });
    mount(<ApprovalPanel project="APR" itemKey="APR-REQ-0001" version={1} />);
    expect(await screen.findByText('Aucun circuit d’approbation sur le tracker de ce ticket.')).toBeInTheDocument();
  });
});

describe('éditeur du circuit d’un tracker', () => {
  it('charge le circuit, ajoute une étape, désigne des personnes et enregistre', async () => {
    const user = userEvent.setup();
    const { container } = mount(<ApprovalFlowEditor project="APR" tracker="REQ" />);
    expect(await screen.findByLabelText('Étape 1 : nom')).toHaveValue('Relecture');
    await user.click(screen.getByRole('button', { name: 'Ajouter une étape' }));
    await user.type(screen.getByLabelText('Étape 2 : nom'), 'Validation');
    await user.selectOptions(screen.getByLabelText('Étape 2 : nature'), 'approval');
    await user.click(screen.getByLabelText('Étape 2 : ouverte au rôle assurance qualité étatique'));
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le circuit' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
      enabled: true,
      steps: [
        { name: 'Relecture', kind: 'review', approvers: ['rita'], role: null, minApprovals: 1 },
        { name: 'Validation', kind: 'approval', approvers: [], role: 'athena-qa', minApprovals: 1 },
      ],
    }));
  });

  it('l’enregistrement est refusé tant qu’une étape n’a personne de désigné ou que le minimum dépasse le nombre de personnes', async () => {
    const user = userEvent.setup();
    mount(<ApprovalFlowEditor project="APR" tracker="REQ" />);
    await screen.findByLabelText('Étape 1 : nom');
    const save = screen.getByRole('button', { name: 'Enregistrer le circuit' });
    expect(save).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Ajouter une étape' }));
    expect(save).toBeDisabled(); // étape sans nom ni personne
    await user.type(screen.getByLabelText('Étape 2 : nom'), 'X');
    await user.selectOptions(screen.getByLabelText('Étape 2 : personnes désignées'), 'remy');
    expect(save).toBeEnabled();
    await user.clear(screen.getByLabelText('Étape 2 : décisions favorables requises'));
    await user.type(screen.getByLabelText('Étape 2 : décisions favorables requises'), '2');
    expect(save).toBeDisabled(); // 2 requises pour une seule personne
  });
});
