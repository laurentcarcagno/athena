import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSession } from './api';
import { CreateArtifact } from './components/CreateArtifact';
import { isFieldVisible, visibleWhenOf } from './lib/visibility';

const definition = {
  key: 'INC', name: 'Incidents', workflow: { initial: 'open', statuses: [], transitions: [] },
  fields: [
    { id: '1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: '2', key: 'kind', label: 'Nature', type: 'select', config: { options: ['demande', 'panne'] }, required: true, semanticRole: null },
    { id: '3', key: 'cause', label: 'Cause', type: 'text', config: { visibleWhen: { field: 'kind', in: ['panne'] } }, required: true, semanticRole: null },
  ],
};
let posted: unknown = null;
beforeEach(async () => {
  posted = null;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input === '/auth/session') return new Response(JSON.stringify({ authenticated: true, user: { id: 'u', username: 'u', name: 'U', email: null, roles: ['athena-team-member'], groups: [] } }), { status: 200 });
    if (init?.method === 'POST') { posted = JSON.parse(String(init.body)); return new Response(JSON.stringify({ key: 'SAT1-INC-0001' }), { status: 201 }); }
    if (/\/trackers\/INC$/.test(input)) return new Response(JSON.stringify(definition), { status: 200 });
    return new Response(JSON.stringify([{ key: 'INC', name: 'Incidents' }]), { status: 200 });
  }));
  await loadSession();
});
afterEach(() => vi.unstubAllGlobals());

describe('champs à visibilité conditionnelle', () => {
  it('règle : visible seulement si le champ pilote vaut une des valeurs', () => {
    const f = { config: { visibleWhen: { field: 'kind', in: ['panne'] } } };
    expect(isFieldVisible(f, { kind: 'panne' })).toBe(true);
    expect(isFieldVisible(f, { kind: 'demande' })).toBe(false);
    expect(isFieldVisible({ config: {} }, {})).toBe(true);
    expect(visibleWhenOf({ visibleWhen: { field: 'kind', in: [1] } })).toEqual({ field: 'kind', in: ['1'] });
  });

  it('création : le champ conditionnel apparaît quand la condition est remplie, disparaît sinon, et n’est pas envoyé masqué', async () => {
    render(<ToastProvider><MemoryRouter><CreateArtifact target={{ scope: 'tracker', project: 'SAT1', tracker: 'INC' }} open onClose={() => undefined} onCreated={() => undefined} /></MemoryRouter></ToastProvider>);
    await userEvent.type(await screen.findByLabelText('Titre (obligatoire)'), 'Question');
    expect(screen.queryByLabelText(/^Cause/)).toBeNull(); // masqué : pilote non renseigné
    await userEvent.selectOptions(screen.getByLabelText('Nature (obligatoire)'), 'panne');
    await userEvent.type(await screen.findByLabelText('Cause (obligatoire)'), 'joint');
    await userEvent.selectOptions(screen.getByLabelText('Nature (obligatoire)'), 'demande'); // la condition cesse : « cause » disparaît
    expect(screen.queryByLabelText(/^Cause/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Créer le ticket' }));
    await waitFor(() => expect(posted).toEqual({ values: { title: 'Question', kind: 'demande' } })); // la valeur saisie puis masquée n'est pas envoyée
  });
});
