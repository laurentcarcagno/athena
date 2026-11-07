import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocRefPicker, type DocLinkRow } from './components/DocRefPicker';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
const hits = [
  { uid: 'URD-1', document: 'Exigences utilisateur', docId: 'urd.docs-urd', type: 'REQUIREMENT', title: 'Authentification', snippet: '', match: 'uid' },
  { uid: 'URD-12', document: 'Exigences utilisateur', docId: 'urd.docs-urd', type: 'REQUIREMENT', title: 'Authentification forte', snippet: '', match: 'prefix' },
];

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') { sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined }); return new Response(null, { status: 204 }); }
    if (/docs\/search\?q=auth/.test(input)) return new Response(JSON.stringify(hits), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const rows: DocLinkRow[] = [
  { source: 'urd', docId: 'urd.docs-urd', uid: 'URD-1', title: 'Authentification', status: 'Active', suspect: true, orphan: false },
  { source: 'urd', docId: null, uid: 'URD-9', title: '', status: '', suspect: true, orphan: true },
  { source: 'urd', docId: 'urd.docs-urd', uid: 'URD-3', title: 'Journal', status: '', suspect: false, orphan: false },
];
const open = (links = rows, onChanged = vi.fn()) => render(<ToastProvider><MemoryRouter><main><DocRefPicker project="ARI" itemKey="ARI-ACT-0001" links={links} onChanged={onChanged} /></main></MemoryRouter></ToastProvider>);

describe('citer une exigence documentaire', () => {
  it('propose des exigences par UID ou titre, écarte celles déjà citées, et cite au clic', async () => {
    const onChanged = vi.fn();
    open(rows, onChanged);
    await userEvent.type(screen.getByLabelText('Citer une exigence (UID ou titre)'), 'auth');
    const list = await screen.findByRole('list', { name: '1 exigence proposée' }); // URD-1 est déjà citée
    expect(within(list).getByText('URD-12')).toHaveClass('ath-mono');
    expect(within(list).queryByText('URD-1')).toBeNull();
    await userEvent.click(within(list).getByRole('button', { name: 'Citer URD-12' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'POST', url: '/v1/projects/ARI/artifacts/ARI-ACT-0001/doc-links', body: { source: 'urd', uid: 'URD-12' } });
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByLabelText('Citer une exigence (UID ou titre)')).toHaveValue('');
  });

  it('montre les liens suspects et orphelins en texte, lien vers le document à l’ancre de l’exigence', () => {
    open();
    const list = screen.getByRole('list', { name: 'Exigences documentaires citées' });
    const first = within(list).getByText('URD-1').closest('li')!;
    expect(within(first).getByText('Suspect')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Ouvrir dans le document URD-1' })).toHaveAttribute('href', '/p/ARI/documents/urd.docs-urd#URD-1');
    const orphan = within(list).getByText('URD-9').closest('li')!;
    expect(within(orphan).getByText(/absente?/i)).toBeInTheDocument();
    expect(within(orphan).queryByRole('button', { name: /Acquitter/ })).toBeNull(); // rien à acquitter : l'exigence a disparu
    expect(within(within(list).getByText('URD-3').closest('li')!).queryByRole('button')).toBeNull(); // lien sain
  });

  it('acquitte un lien suspect par une action humaine (route d’acquittement)', async () => {
    const onChanged = vi.fn();
    open(rows, onChanged);
    await userEvent.click(screen.getByRole('button', { name: 'Acquitter URD-1' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'POST', url: '/v1/projects/ARI/artifacts/ARI-ACT-0001/doc-links/urd/URD-1/acknowledge' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('sans citation : le dit ; accessible (axe) avec suggestions affichées', async () => {
    const { container } = open([]);
    expect(screen.getByText('Aucune exigence documentaire citée.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Citer une exigence (UID ou titre)'), 'auth');
    await screen.findByRole('list', { name: '2 exigences proposées' });
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([]);
  });
});
