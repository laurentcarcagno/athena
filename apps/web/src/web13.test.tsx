import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { OrgAdminPage } from './pages/OrgAdminPage';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
const types = [
  { key: 'requirement', name: 'Exigence', description: '', category: 'engineering', defaultViews: ['tableau'], baseFields: [], builtin: true, modified: false },
  { key: 'test', name: 'Cas de test', description: '', category: 'verification', defaultViews: ['tableau'], baseFields: [], builtin: true, modified: false },
  { key: 'design', name: 'Conception', description: '', category: 'engineering', defaultViews: ['tableau'], baseFields: [], builtin: true, modified: false },
];
const linkTypes = [
  { key: 'blocks', outwardLabel: 'bloque', inwardLabel: 'est bloqué par', hierarchical: false, propagatesSuspect: false, pairs: [], builtin: true, modified: false },
  { key: 'refines', outwardLabel: 'raffine', inwardLabel: 'est raffiné par', hierarchical: true, propagatesSuspect: true, pairs: [{ from: 'requirement', to: 'requirement' }], builtin: true, modified: true },
  { key: 'tests', outwardLabel: 'teste', inwardLabel: 'est testé par', hierarchical: false, propagatesSuspect: true, pairs: [{ from: 'test', to: 'design' }], builtin: false, modified: false },
];

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (method !== 'GET') return new Response(method === 'DELETE' ? null : JSON.stringify({}), { status: method === 'DELETE' ? 204 : 200 });
    if (/\/v1\/link-types$/.test(input)) return ok(linkTypes);
    if (/\/v1\/tracker-types$/.test(input)) return ok(types);
    if (/\/v1\/(users|project-templates|tracker-templates|projects)$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-user'], groups: [] } };
async function openTab() {
  render(<ToastProvider><MemoryRouter initialEntries={['/org']}><Routes><Route path="/org" element={<OrgAdminPage session={admin} />} /></Routes></MemoryRouter></ToastProvider>);
  await userEvent.click(await screen.findByRole('tab', { name: 'Liens' }));
  return screen.findByRole('table');
}

describe('administration des types de liens', () => {
  it('liste les types avec leurs libellés, leurs paires (noms des types de tracker) et leur état', async () => {
    const table = await openTab();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const blocks = rows.find((r) => r.textContent!.startsWith('blocks'))!;
    expect(within(blocks).getByText('Tous les trackers')).toBeInTheDocument();
    expect(within(blocks).getByText('Livré')).toBeInTheDocument();
    expect(within(blocks).getByText('Sans suspicion')).toBeInTheDocument(); // « bloque » ne propage pas la suspicion
    expect(within(blocks).queryByRole('button', { name: /Supprimer|Réinitialiser/ })).not.toBeInTheDocument();
    const refines = rows.find((r) => r.textContent!.startsWith('refines'))!;
    expect(within(refines).getByText('Hiérarchique')).toBeInTheDocument();
    expect(within(refines).getByText('Modifié')).toBeInTheDocument();
    expect(within(refines).getByText('Exigence → Exigence')).toBeInTheDocument();
    expect(within(refines).getByRole('button', { name: 'Réinitialiser refines' })).toBeInTheDocument();
    expect(within(rows.find((r) => r.textContent!.startsWith('tests'))!).getByText('Cas de test → Conception')).toBeInTheDocument();
  });

  it('crée un type avec ses paires de types de tracker', async () => {
    await openTab();
    await userEvent.type(screen.getByLabelText('Clé du type de lien (minuscules)'), 'covers');
    await userEvent.type(screen.getByLabelText('Libellé sortant (ex. vérifie)'), 'couvre');
    await userEvent.type(screen.getByLabelText('Libellé entrant (ex. est vérifié par)'), 'est couvert par');
    await userEvent.selectOptions(screen.getByLabelText('Type source'), 'test');
    expect(screen.getByRole('button', { name: 'Ajouter la paire' })).toBeDisabled(); // la cible manque
    await userEvent.selectOptions(screen.getByLabelText('Type cible'), 'requirement');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la paire' }));
    expect(within(screen.getByRole('list', { name: 'Paires de types de tracker' })).getByText('Cas de test → Exigence')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Créer le type de lien' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'POST' && s.url === '/v1/link-types')?.body).toEqual({
      key: 'covers', outwardLabel: 'couvre', inwardLabel: 'est couvert par', hierarchical: false, propagatesSuspect: true, pairs: [{ from: 'test', to: 'requirement' }],
    }));
    expect(await screen.findByText('Type de lien créé.')).toBeInTheDocument();
  });

  it('modifie un type (clé verrouillée), retire une paire, puis confirme avant de supprimer ou de réinitialiser', async () => {
    const table = await openTab();
    await userEvent.click(within(table).getByRole('button', { name: 'Modifier tests' }));
    expect(screen.getByLabelText('Clé du type de lien (minuscules)')).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Cas de test → Conception' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'PUT')?.body).toMatchObject({ outwardLabel: 'teste', pairs: [] }));
    expect(sent.find((s) => s.method === 'PUT')!.url).toBe('/v1/link-types/tests');

    await userEvent.click(within(table).getByRole('button', { name: 'Supprimer tests' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Supprimer le type de lien/ })).getByRole('button', { name: 'Annuler' }));
    expect(sent.some((s) => s.method === 'DELETE')).toBe(false);
    await userEvent.click(within(table).getByRole('button', { name: 'Réinitialiser refines' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Réinitialiser le type de lien/ })).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'DELETE')?.url).toBe('/v1/link-types/refines'));
  });

  it('règle la propagation de la suspicion par type', async () => {
    const table = await openTab();
    await userEvent.click(within(table).getByRole('button', { name: 'Modifier tests' }));
    const box = screen.getByRole('checkbox', { name: 'Propage la suspicion' });
    expect(box).toBeChecked();
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'PUT')?.body).toMatchObject({ propagatesSuspect: false }));
  });

  it('n’a aucune violation d’accessibilité', async () => {
    await openTab();
    const result = await axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
