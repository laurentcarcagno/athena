import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, TrackerTypeEntry } from './api';
import { TrackerBuilder, emptyTracker, type DraftTracker } from './components/TrackerBuilder';
import { OrgAdminPage } from './pages/OrgAdminPage';
import { TrackerConfigPage } from './pages/TrackerConfigPage';
import { TrackerCreatePage } from './pages/TrackerCreatePage';

type Reply = { status?: number; body?: unknown };
type Handler = (url: string, method: string) => Reply | undefined;
const calls: Array<{ method: string; url: string; body: unknown }> = [];
let handlers: Handler[] = [];

beforeEach(() => {
  handlers = [];
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    for (const h of handlers) {
      const hit = h(input, method);
      if (hit) return new Response(hit.status === 204 ? null : JSON.stringify(hit.body ?? {}), { status: hit.status ?? 200 });
    }
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const on = (method: string, path: RegExp | string, reply: Reply): Handler => (url, m) => (m === method && (typeof path === 'string' ? url === path : path.test(url)) ? reply : undefined);
const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-user'], groups: [] } };
const wrap = (path: string, element: JSX.Element, pattern: string) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /></Routes></MemoryRouter></ToastProvider>,
);

const field = (key: string, label: string, extra: Record<string, unknown> = {}) => ({ key, label, type: 'text', ...extra });
const title = field('title', 'Titre', { required: true, semanticRole: 'title' });
const types: TrackerTypeEntry[] = [
  { key: 'requirement', name: 'Exigence', description: '', category: 'engineering', defaultViews: ['tableau', 'arbre'], baseFields: [title], builtin: true, modified: false },
  { key: 'task', name: 'Tâche', description: '', category: 'development', defaultViews: ['tableau', 'board'], baseFields: [title, field('assignee', 'Responsable', { type: 'user', semanticRole: 'assignee' }), field('due', 'Échéance', { type: 'date', semanticRole: 'due_date' })], builtin: true, modified: true },
  { key: 'hw-interface', name: 'Interface matérielle', description: 'Connecteurs', category: 'engineering', defaultViews: ['tableau'], baseFields: [title], builtin: false, modified: false },
];

async function openTypesTab() {
  handlers = [
    on('GET', '/v1/users', { body: [] }), on('GET', '/v1/project-templates', { body: [] }), on('GET', '/v1/tracker-templates', { body: [] }),
    on('GET', '/v1/projects', { body: [] }), on('GET', '/v1/tracker-types', { body: types }),
    on('GET', '/v1/field-types', { body: ['text', 'user', 'date'] }),
  ];
  wrap('/org', <OrgAdminPage session={admin} />, '/org');
  await userEvent.click(await screen.findByRole('tab', { name: 'Types' }));
  return screen.findByRole('table');
}

describe('administration des types de tracker', () => {
  it('liste les types avec catégorie, vues et état (livré, modifié)', async () => {
    const table = await openTypesTab();
    const row = (name: RegExp) => within(table).getByText(name).closest('tr')!;
    expect(within(row(/^Exigence/)).getByText('requirement')).toHaveClass('ath-mono');
    expect(within(row(/^Exigence/)).getByText('Ingénierie')).toBeInTheDocument();
    expect(within(row(/^Exigence/)).getByText('Tableau, Arbre')).toBeInTheDocument();
    expect(within(row(/^Tâche/)).getByText('Modifié')).toBeInTheDocument();
    expect(within(row(/^Exigence/)).getByText('Livré')).toBeInTheDocument();
    // Un type livré intact ne se supprime pas ; un type livré modifié se réinitialise ; un type propre se supprime.
    expect(within(row(/^Exigence/)).queryByRole('button', { name: /Supprimer|Réinitialiser/ })).not.toBeInTheDocument();
    expect(within(row(/^Tâche/)).getByRole('button', { name: 'Réinitialiser Tâche' })).toBeInTheDocument();
    expect(within(row(/^Interface matérielle/)).getByRole('button', { name: 'Supprimer Interface matérielle' })).toBeInTheDocument();
  });

  it('crée un type avec ses vues et son socle de champs', async () => {
    await openTypesTab();
    handlers.unshift(on('POST', '/v1/tracker-types', { status: 201, body: { key: 'icd' } }));
    await userEvent.type(screen.getByLabelText('Clé du type (minuscules)'), 'icd');
    await userEvent.type(screen.getByLabelText('Nom du type'), 'ICD');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), 'verification');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Matrice' }));
    await userEvent.type(screen.getByLabelText('Clé du champ'), 'bus');
    await userEvent.type(screen.getByLabelText('Libellé du champ'), 'Bus');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter au socle' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer le type' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/v1/tracker-types')?.body).toEqual({
      key: 'icd', name: 'ICD', description: '', category: 'verification', defaultViews: ['tableau', 'matrice'],
      baseFields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'bus', label: 'Bus', type: 'text' }],
    }));
    expect(await screen.findByText('Type créé.')).toBeInTheDocument();
  });

  it('modifie un type (clé verrouillée) puis demande confirmation avant de supprimer ou de réinitialiser', async () => {
    const table = await openTypesTab();
    handlers.unshift(on('PUT', '/v1/tracker-types/hw-interface', { body: { key: 'hw-interface' } }), on('DELETE', /\/v1\/tracker-types\//, { status: 204 }));
    await userEvent.click(within(table).getByRole('button', { name: 'Modifier Interface matérielle' }));
    expect(screen.getByLabelText('Clé du type (minuscules)')).toHaveAttribute('readonly');
    await userEvent.clear(screen.getByLabelText('Nom du type'));
    await userEvent.type(screen.getByLabelText('Nom du type'), 'Interface HW');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ name: 'Interface HW', category: 'engineering' }));

    await userEvent.click(within(table).getByRole('button', { name: 'Supprimer Interface matérielle' }));
    const dialog = await screen.findByRole('dialog', { name: /Supprimer le type/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(table).getByRole('button', { name: 'Réinitialiser Tâche' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Réinitialiser le type/ })).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/v1/tracker-types/task'));
  });

  it('n’a aucune violation d’accessibilité', async () => {
    await openTypesTab();
    const result = await axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('choix du type dans l’éditeur de tracker', () => {
  function Harness({ onChange }: { onChange: (t: DraftTracker) => void }) {
    const [value, setValue] = useState<DraftTracker>(emptyTracker());
    return <TrackerBuilder value={value} onChange={(t) => { setValue(t); onChange(t); }} />;
  }
  it('propose le socle du type sans doubler le champ déjà présent, et détacher n’enlève aucun champ', async () => {
    handlers = [on('GET', '/v1/field-types', { body: ['text'] }), on('GET', '/v1/tracker-types', { body: types })];
    const seen = vi.fn();
    render(<Harness onChange={seen} />);
    await screen.findByRole('option', { name: 'Tâche' });
    await userEvent.selectOptions(screen.getByLabelText('Type de tracker'), 'task');
    const last = () => seen.mock.calls.at(-1)![0] as DraftTracker;
    expect(last().typeKey).toBe('task');
    expect(last().fields.map((f) => f.key)).toEqual(['title', 'assignee', 'due']);
    await userEvent.selectOptions(screen.getByLabelText('Type de tracker'), '');
    expect(last().typeKey).toBeNull();
    expect(last().fields.map((f) => f.key)).toEqual(['title', 'assignee', 'due']);
  });
});

describe('type d’un tracker existant', () => {
  const def = {
    key: 'BUG', name: 'Bugs', typeKey: null, fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
    statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }, { id: 's2', key: 'done', name: 'Fini', category: 'done' }],
    transitions: [{ id: 't', name: 'Terminer', fromStatusId: 's1', toStatusId: 's2' }],
  };
  it('rattache le tracker à un type (administrateur)', async () => {
    handlers = [on('GET', '/v1/projects/ARI/trackers/BUG', { body: def }), on('GET', '/v1/field-types', { body: ['text'] }), on('GET', '/v1/tracker-types', { body: types }), on('PATCH', '/v1/projects/ARI/trackers/BUG/type', { status: 204 })];
    wrap('/p/ARI/trackers/BUG/config', <TrackerConfigPage session={admin} />, '/p/:project/trackers/:tracker/config');
    await userEvent.selectOptions(await screen.findByLabelText('Type de tracker'), 'requirement');
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/type'))?.body).toEqual({ typeKey: 'requirement' }));
    expect(await screen.findByText('Type du tracker enregistré.')).toBeInTheDocument();
  });
});

describe('création d’un tracker avec un type', () => {
  it('envoie le type choisi avec le tracker', async () => {
    handlers = [
      on('GET', '/v1/tracker-templates', { body: [] }), on('GET', '/v1/field-types', { body: ['text', 'user', 'date'] }), on('GET', '/v1/tracker-types', { body: types }),
      on('POST', '/v1/projects/ARI/trackers', { status: 201, body: { id: 'x', key: 'TSK' } }),
    ];
    wrap('/p/ARI/trackers/new', <TrackerCreatePage session={admin} />, '/p/:project/trackers/new');
    await screen.findByRole('option', { name: 'Tâche' });
    await userEvent.selectOptions(screen.getByLabelText('Type de tracker'), 'task');
    await userEvent.type(screen.getByLabelText('Clé du tracker (2 à 10 majuscules)'), 'TSK');
    await userEvent.type(screen.getByLabelText('Nom du tracker'), 'Tâches');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le tracker' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/v1/projects/ARI/trackers')?.body).toMatchObject({ key: 'TSK', typeKey: 'task' }));
  });
});
