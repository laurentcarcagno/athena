import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { ArtifactPage } from './pages/ArtifactPage';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let links: Array<Record<string, unknown>> = [];

const def = {
  key: 'BUG', name: 'Anomalies', typeKey: null,
  fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
  statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
};
const link = (id: string, label: string, other: string, extra: Record<string, unknown> = {}) => ({ id, type: 'verifies', direction: 'outward', label, other, suspect: false, ...extra });

beforeEach(() => {
  sent.length = 0;
  links = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/link-types$/.test(input)) return ok([
      { key: 'verifies', outwardLabel: 'vérifie', inwardLabel: 'est vérifié par', hierarchical: false },
      { key: 'duplicates', outwardLabel: 'duplique', inwardLabel: 'duplique', hierarchical: false },
    ]);
    if (/\/search\?/.test(input)) {
      return ok({ total: 2, hits: [
        { key: 'ARI-BUG-0001', tracker: 'BUG', status: 'open', category: 'todo', version: 1, updatedAt: '', values: { title: 'Soi-même' } },
        { key: 'ARI-REQ-0007', tracker: 'REQ', status: 'open', category: 'todo', version: 1, updatedAt: '', values: { title: 'Journalisation du système' } },
      ] });
    }
    if (method !== 'GET') return new Response(method === 'POST' && /\/links$/.test(input) ? JSON.stringify({ id: 'new' }) : null, { status: method === 'POST' && /\/links$/.test(input) ? 200 : 204 });
    if (/\/artifacts\/ARI-BUG-0001\/links$/.test(input)) return ok(links);
    if (/\/artifacts\/ARI-BUG-0001$/.test(input)) return ok({ id: 'a', key: 'ARI-BUG-0001', trackerKey: 'BUG', status: 'open', version: 1, values: { title: 'Crash' } });
    if (/\/trackers\/BUG$/.test(input)) return ok(def);
    if (/\/artifacts\/[^/]+\/(doc-links|comments|history|code-refs)$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const page = () => render(<ToastProvider><MemoryRouter initialEntries={['/p/ARI/a/ARI-BUG-0001']}><Routes><Route path="/p/:project/a/:key" element={<ArtifactPage session={session} />} /></Routes></MemoryRouter></ToastProvider>);
const openLinks = async () => { await userEvent.click(await screen.findByRole('tab', { name: 'Liens' })); };

describe('liens depuis la fiche', () => {
  it('liste les liens typés avec leur sens, la clé en mono, et signale un lien suspect', async () => {
    links = [link('l1', 'vérifie', 'ARI-REQ-0007'), link('l2', 'est vérifié par', 'ARI-TST-0002', { direction: 'inward', suspect: true })];
    page();
    await openLinks();
    const list = screen.getByRole('group', { name: 'Relations' }); // T-0113 : relations groupées
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('link', { name: 'ARI-REQ-0007' })).toHaveClass('ath-mono');
    expect(within(rows[1]!).getByText('Suspect')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('Suspect')).not.toBeInTheDocument();
  });

  it('crée un lien sortant : type puis ticket cible trouvé par son titre', async () => {
    page();
    await openLinks();
    await userEvent.selectOptions(screen.getByLabelText('Type de lien'), 'verifies:out');
    await userEvent.type(screen.getByLabelText('Ticket cible (clé ou titre)'), 'journal');
    const proposed = within(await screen.findByRole('list', { name: 'Tickets proposés' }));
    expect(proposed.queryByText('ARI-BUG-0001')).not.toBeInTheDocument(); // l'item lui-même n'est pas proposé
    expect(proposed.getByText('Journalisation du système')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lier' })).toBeDisabled(); // une cible doit être choisie dans la liste
    await userEvent.click(proposed.getByRole('button', { name: /ARI-REQ-0007/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Lier' }));
    await waitFor(() => expect(sent.find((s) => s.url.endsWith('/artifacts/ARI-BUG-0001/links'))?.body).toEqual({ to: 'ARI-REQ-0007', type: 'verifies' }));
    expect(await screen.findByText('Lien créé.')).toBeInTheDocument();
  });

  it('crée un lien entrant (« est vérifié par ») depuis la cible, sens inversé', async () => {
    page();
    await openLinks();
    await userEvent.selectOptions(screen.getByLabelText('Type de lien'), 'verifies:in');
    await userEvent.type(screen.getByLabelText('Ticket cible (clé ou titre)'), 'ARI-REQ');
    await userEvent.click(await screen.findByRole('button', { name: /ARI-REQ-0007/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Lier' }));
    await waitFor(() => expect(sent.find((s) => s.url.endsWith('/artifacts/ARI-REQ-0007/links'))?.body).toEqual({ to: 'ARI-BUG-0001', type: 'verifies' }));
  });

  it('un type symétrique n’apparaît qu’une fois', async () => {
    page();
    await openLinks();
    const options = within(screen.getByLabelText('Type de lien')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).toEqual(['', 'verifies:out', 'verifies:in', 'duplicates:out']);
  });

  it('demande confirmation avant de supprimer un lien', async () => {
    links = [link('l1', 'vérifie', 'ARI-REQ-0007')];
    page();
    await openLinks();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le lien ARI-REQ-0007' }));
    const dialog = await screen.findByRole('dialog', { name: /Supprimer le lien/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(sent.some((s) => s.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le lien ARI-REQ-0007' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Supprimer le lien/ })).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'DELETE')?.url).toBe('/v1/projects/ARI/links/l1'));
  });

  it('acquitte un lien suspect en un clic, sans confirmation', async () => {
    links = [link('l2', 'vérifie', 'ARI-REQ-0007', { suspect: true })];
    page();
    await openLinks();
    await userEvent.click(screen.getByRole('button', { name: 'Acquitter ARI-REQ-0007' }));
    await waitFor(() => expect(sent.find((s) => s.url.endsWith('/links/l2/clear-suspect'))?.method).toBe('POST'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('le raccourci L ouvre l’onglet Liens et place le focus sur le type de lien', async () => {
    page();
    await screen.findByLabelText('Titre (obligatoire)');
    await userEvent.keyboard('l');
    await waitFor(() => expect(screen.getByLabelText('Type de lien')).toHaveFocus());
    expect(screen.getByRole('tab', { name: 'Liens' })).toHaveAttribute('aria-selected', 'true');
  });

  it('le raccourci L est ignoré pendant une saisie', async () => {
    page();
    const title = await screen.findByLabelText('Titre (obligatoire)');
    await userEvent.click(title);
    await userEvent.keyboard('l');
    expect(title).toHaveValue('Crashl');
    expect(screen.getByRole('tab', { name: 'Détails' })).toHaveAttribute('aria-selected', 'true');
  });

  it('n’a aucune violation d’accessibilité', async () => {
    links = [link('l1', 'vérifie', 'ARI-REQ-0007', { suspect: true })];
    const { container } = page();
    await openLinks();
    await screen.findByLabelText('Type de lien');
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
