import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportControlMembers, MarkingEditor } from './components/MarkingEditor';
import { LinkEditor } from './components/LinkEditor';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let members: unknown = { members: [{ subject: 'u-lead', username: 'lead', displayName: 'Chef' }], marked: 2 };

beforeEach(() => {
  sent.length = 0;
  members = { members: [{ subject: 'u-lead', username: 'lead', displayName: 'Chef' }], marked: 2 };
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (method === 'PUT') return ok({});
    if (/export-control$/.test(input)) return ok(members);
    if (/\/v1\/users$/.test(input)) return ok([{ subject: 'u-lead', username: 'lead', displayName: 'Chef' }, { subject: 'u-eve', username: 'eve', displayName: 'Eve' }]);
    if (/link-types$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const wrap = (ui: JSX.Element) => render(<ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider>);

describe('éditeur de marquage', () => {
  it('un responsable change le marquage après confirmation, et rien n’est envoyé sans elle', async () => {
    const onChanged = vi.fn();
    wrap(<MarkingEditor project="DEF" itemKey="DEF-REQ-0001" value={undefined} canEdit onChanged={onChanged} />);
    expect(screen.getByText('Aucun', { selector: '.ath-tag, span' })).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Appliquer le marquage' });
    expect(apply).toBeDisabled(); // inchangé
    await userEvent.selectOptions(screen.getByLabelText('Marquage'), 'ITAR');
    await userEvent.click(apply);
    expect(await screen.findByText('Marquer DEF-REQ-0001 : ITAR')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Appliquer le marquage' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'PUT', url: '/v1/projects/DEF/artifacts/DEF-REQ-0001/marking', body: { exportControl: 'ITAR' } });
    expect(onChanged).toHaveBeenCalled();
  });

  it('retirer le marquage envoie null ; les autres rôles voient le marquage sans pouvoir le changer', async () => {
    wrap(<MarkingEditor project="DEF" itemKey="DEF-REQ-0001" value="dual_use" canEdit onChanged={() => undefined} />);
    expect(screen.getByText('Double usage', { selector: '.ath-tag, span' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Marquage'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer le marquage' }));
    expect(await screen.findByText('Retirer le marquage de DEF-REQ-0001')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Appliquer le marquage' }));
    await waitFor(() => expect(sent[0]!.body).toEqual({ exportControl: null }));
  });

  it('lecteur : marquage affiché, aucun contrôle', () => {
    wrap(<MarkingEditor project="DEF" itemKey="DEF-REQ-0001" value="EAR" canEdit={false} onChanged={() => undefined} />);
    expect(screen.getByText('EAR')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Seuls les responsables changent le marquage.')).toBeInTheDocument();
  });
});

describe('ayants droit du contrôle export', () => {
  it('liste les ayants droit, ajoute et interdit de vider la liste tant que des items sont marqués', async () => {
    wrap(<ExportControlMembers project="DEF" />);
    expect(await screen.findByText(/2 items marqués/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer lead' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Ajouter un ayant droit du marquage'), 'u-eve');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(sent[0]).toMatchObject({ method: 'PUT', url: '/v1/projects/DEF/export-control', body: { members: ['u-lead', 'u-eve'] } }));
  });
});

describe('liens vers un item sous contrôle export', () => {
  const links = [
    { id: 'l1', type: 'verifies', direction: 'outward', label: 'vérifie', other: 'DEF-REQ-0003', suspect: false },
    { id: 'l2', type: 'verifies', direction: 'outward', label: 'vérifie', other: null, restricted: true, suspect: false },
  ];
  it('affiche « lien vers un item sous contrôle export » sans clé ni titre, et reste accessible', async () => {
    const { container } = wrap(<main><LinkEditor project="DEF" itemKey="DEF-TST-0001" links={links} onChanged={() => undefined} /></main>);
    expect(await screen.findByText('lien vers un item sous contrôle export')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'DEF-REQ-0003' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retirer le lien vers un item sous contrôle export' })).toBeInTheDocument();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});
