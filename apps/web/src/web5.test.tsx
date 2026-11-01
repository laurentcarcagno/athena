import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { TrackerBuilder, emptyTracker, trackerProblems, type DraftTracker } from './components/TrackerBuilder';
import { OrgAdminPage } from './pages/OrgAdminPage';
import { TrackerCreatePage } from './pages/TrackerCreatePage';
import { setLocale } from './i18n';

const calls: Array<{ method: string; url: string; body: unknown }> = [];
let routes: Array<[string, RegExp, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  routes = [['GET', /\/v1\/field-types$/, ['text', 'richtext', 'select', 'number']]];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const hit = routes.find(([m, re]) => m === method && re.test(input));
    return new Response(JSON.stringify(hit ? hit[2] : { error: 'not_found', message: 'Introuvable.', details: [] }), { status: hit ? 200 : 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); setLocale('fr'); });

const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-user'], groups: [] } };
const templates = [
  { key: 'bug', name: 'Bugs', description: '', builtin: true, tracker: {
    key: 'BUG', name: 'Bugs',
    fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure'] } }],
    statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'done', name: 'Résolu', category: 'done' }],
    transitions: [{ name: 'Résoudre', from: 'open', to: 'done' }],
  } },
];

function Harness({ initial }: { initial?: DraftTracker }) {
  const [value, setValue] = useState<DraftTracker>(initial ?? emptyTracker());
  return <><TrackerBuilder value={value} onChange={setValue} /><output data-testid="draft">{JSON.stringify(value)}</output></>;
}
const draftOf = () => JSON.parse(screen.getByTestId('draft').textContent!) as DraftTracker;

describe('éditeur de tracker', () => {
  it('ajoute un champ à options, un statut et une transition par le graphe', async () => {
    render(<ToastProvider><Harness /></ToastProvider>);
    const user = userEvent.setup();
    const fieldsCard = screen.getByRole('heading', { name: 'Champs' }).closest('section')!;
    await user.type(within(fieldsCard).getAllByLabelText('Clé')[0]!, 'Sévérité Fine');
    await user.type(within(fieldsCard).getByLabelText('Libellé'), 'Sévérité');
    await user.selectOptions(within(fieldsCard).getByLabelText('Type'), 'select');
    expect(within(fieldsCard).getByRole('button', { name: 'Ajouter le champ' })).toBeDisabled();
    await user.type(within(fieldsCard).getByLabelText('Options (séparées par des virgules)'), 'mineure, majeure');
    await user.click(within(fieldsCard).getByRole('button', { name: 'Ajouter le champ' }));
    expect(draftOf().fields.at(-1)).toEqual({ key: 's_v_rit__fine', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure'] } });

    await user.type(screen.getByLabelText('Clé (Statuts)'), 'review');
    await user.type(screen.getByLabelText('Nom (Statuts)'), 'En revue');
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'in_progress');
    await user.click(screen.getByRole('button', { name: 'Ajouter le statut' }));
    expect(draftOf().statuses.map((s) => s.key)).toEqual(['todo', 'done', 'review']);

    await user.click(screen.getByRole('button', { name: 'À faire' }));
    await user.click(screen.getByRole('button', { name: 'En revue' }));
    const form = screen.getByRole('form', { name: /Nouvelle transition/ });
    await user.clear(within(form).getByLabelText('Nom'));
    await user.type(within(form).getByLabelText('Nom'), 'Relire');
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));
    expect(draftOf().transitions.at(-1)).toEqual({ name: 'Relire', from: 'todo', to: 'review' });
  });

  it('supprimer un statut retire ses transitions', async () => {
    render(<ToastProvider><Harness /></ToastProvider>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Supprimer Terminé' }));
    expect(draftOf().statuses.map((s) => s.key)).toEqual(['todo']);
    expect(draftOf().transitions).toEqual([]);
  });

  it('signale les manques avant envoi', () => {
    expect(trackerProblems(emptyTracker())).toHaveLength(2);
    expect(trackerProblems({ ...emptyTracker(), key: 'RISK', name: 'Risques' })).toEqual([]);
    expect(trackerProblems({ ...emptyTracker(), key: 'RISK', name: 'R', fields: [] })).toHaveLength(1);
  });
});

describe('création d’un tracker dans un projet', () => {
  const page = (roles = admin) => render(
    <ToastProvider><MemoryRouter initialEntries={['/p/ARI/trackers/new']}><Routes>
      <Route path="/p/:project/trackers/new" element={<TrackerCreatePage session={roles} />} />
      <Route path="/p/:project/trackers/:tracker/config" element={<p>configuration ouverte</p>} />
    </Routes></MemoryRouter></ToastProvider>,
  );

  it('part d’un template de tracker, le modifie, puis crée le tracker', async () => {
    routes.push(['GET', /\/v1\/tracker-templates$/, templates], ['POST', /\/v1\/projects\/ARI\/trackers$/, { id: 'x', key: 'DEF' }]);
    page();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Partir d’un template de tracker'), 'bug');
    expect(screen.getByDisplayValue('BUG')).toBeInTheDocument();
    expect(screen.getByText('Sévérité')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Clé du tracker (2 à 10 majuscules)'));
    await user.type(screen.getByLabelText('Clé du tracker (2 à 10 majuscules)'), 'def');
    await user.click(screen.getByRole('button', { name: 'Supprimer severity' }));
    await user.click(screen.getByRole('button', { name: 'Créer le tracker' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      key: 'DEF', name: 'Bugs',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }],
      statuses: templates[0]!.tracker.statuses, transitions: templates[0]!.tracker.transitions,
    }));
    expect(await screen.findByText('configuration ouverte')).toBeInTheDocument();
  });

  it('refuse l’accès à un non administrateur', () => {
    page({ authenticated: true, user: { username: 'u', name: 'U', email: null, roles: ['athena-user'], groups: [] } });
    expect(screen.getByText('Réservé aux administrateurs.')).toBeInTheDocument();
  });
});

describe('templates de tracker et de projet', () => {
  const app = () => render(<ToastProvider><MemoryRouter><OrgAdminPage session={admin} /></MemoryRouter></ToastProvider>);
  const base = () => routes.push(['GET', /\/v1\/users$/, []], ['GET', /\/v1\/projects$/, []], ['GET', /\/v1\/tracker-templates$/, templates],
    ['GET', /\/v1\/project-templates$/, [{ key: 'vide', name: 'Projet vide', description: '', builtin: true, trackers: [] }]]);

  it('crée un template de tracker en partant d’un template existant', async () => {
    base();
    routes.push(['POST', /\/v1\/tracker-templates$/, { key: 'bug-plus' }]);
    app();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Templates' }));
    await user.click(await screen.findByRole('tab', { name: 'Templates de tracker' }));
    await user.type(await screen.findByLabelText('Clé du template de tracker (minuscules)'), 'bug-plus');
    await user.type(screen.getByLabelText('Nom du template de tracker'), 'Bugs plus');
    await user.selectOptions(screen.getByLabelText('Partir d’un template de tracker'), 'bug');
    await user.click(screen.getByRole('button', { name: 'Créer le template de tracker' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ key: 'bug-plus', name: 'Bugs plus', tracker: { key: 'BUG', fields: expect.any(Array) } }));
  });

  it('crée un template de projet avec un template de tracker coché et un nouveau tracker', async () => {
    base();
    routes.push(['POST', /\/v1\/tracker-templates$/, { key: 'risques' }], ['POST', /\/v1\/project-templates$/, { key: 'assemble' }]);
    app();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Templates' }));
    await user.type(await screen.findByLabelText('Clé du template (minuscules)'), 'assemble');
    await user.type(screen.getByLabelText('Nom du template'), 'Assemblé');
    await user.click(screen.getByRole('checkbox', { name: /Bugs/ }));
    await user.click(screen.getByRole('button', { name: 'Nouveau tracker pour ce template' }));
    const card = screen.getByRole('heading', { name: 'Nouveau tracker pour ce template' }).closest('section')!;
    await user.type(within(card).getByLabelText('Clé du template de tracker (minuscules)'), 'risques');
    await user.type(within(card).getByLabelText('Nom du template de tracker'), 'Risques');
    await user.type(within(card).getByLabelText('Clé du tracker (2 à 10 majuscules)'), 'risk');
    await user.type(within(card).getByLabelText('Nom du tracker'), 'Risques');
    await user.click(within(card).getByRole('button', { name: 'Créer le template de tracker' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/tracker-templates'))?.body).toMatchObject({ key: 'risques', tracker: { key: 'RISK' } }));
    await user.click(await screen.findByRole('button', { name: 'Créer le template' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/project-templates'))?.body).toEqual({ key: 'assemble', name: 'Assemblé', trackerTemplates: ['bug', 'risques'] }));
  });
});
