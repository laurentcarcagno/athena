import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { WorkflowEditor, layoutWorkflow, NODE } from './components/WorkflowEditor';
import { OrgAdminPage } from './pages/OrgAdminPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { setLocale } from './i18n';

const statuses = [
  { id: 's1', key: 'open', name: 'Ouvert', category: 'todo' },
  { id: 's2', key: 'doing', name: 'En cours', category: 'in_progress' },
  { id: 's3', key: 'done', name: 'Fini', category: 'done' },
];
const transitions = [
  { id: 't1', name: 'Démarrer', fromStatusId: 's1', toStatusId: 's2' },
  { id: 't2', name: 'Terminer', fromStatusId: 's2', toStatusId: 's3' },
  { id: 't3', name: 'Rouvrir', fromStatusId: null, toStatusId: 's1' },
  { id: 't4', name: 'Retour', fromStatusId: 's2', toStatusId: 's1' },
];

describe('disposition du workflow', () => {
  it('place une colonne par catégorie, de gauche à droite, et ajoute « Tout état » quand une transition n’a pas de départ', () => {
    const layout = layoutWorkflow(statuses, transitions, false);
    const x = (id: string) => layout.nodes.find((n) => n.id === id)!.x;
    expect(layout.nodes.map((n) => n.id)).toEqual(['__any__', 's1', 's2', 's3']);
    expect(x('__any__')).toBeLessThan(x('s1'));
    expect(x('s1')).toBeLessThan(x('s2'));
    expect(x('s2')).toBeLessThan(x('s3'));
    expect(layout.width).toBe(NODE.pad * 2 + 4 * NODE.w + 3 * NODE.gapX);
  });

  it('n’ajoute pas « Tout état » sans transition libre ni édition, et empile les statuts d’une même catégorie', () => {
    const layout = layoutWorkflow([...statuses, { id: 's4', key: 'review', name: 'Revue', category: 'in_progress' }], transitions.slice(0, 2), false);
    expect(layout.nodes.some((n) => n.id === '__any__')).toBe(false);
    const doing = layout.nodes.find((n) => n.id === 's2')!;
    const review = layout.nodes.find((n) => n.id === 's4')!;
    expect(review.x).toBe(doing.x);
    expect(review.y).toBeGreaterThan(doing.y);
  });

  it('dessine une flèche par transition et écarte deux transitions opposées', () => {
    const layout = layoutWorkflow(statuses, transitions, false);
    expect(layout.edges).toHaveLength(4);
    const forward = layout.edges.find((e) => e.id === 't1')!;
    const back = layout.edges.find((e) => e.id === 't4')!;
    expect(forward.path).not.toBe(back.path);
    expect(layout.edges.find((e) => e.id === 't3')!.dashed).toBe(true);
  });
});

describe('éditeur graphique de workflow', () => {
  it('crée une transition en cliquant départ puis arrivée', async () => {
    const onCreate = vi.fn(async () => undefined);
    render(<WorkflowEditor statuses={statuses} transitions={transitions} editable onCreate={onCreate} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ouvert' }));
    expect(screen.getByRole('status')).toHaveTextContent('Départ : Ouvert');
    await user.click(screen.getByRole('button', { name: 'Fini' }));
    const form = screen.getByRole('form', { name: /Nouvelle transition Ouvert → Fini/ });
    await user.clear(within(form).getByLabelText('Nom'));
    await user.type(within(form).getByLabelText('Nom'), 'Clore');
    await user.type(within(form).getByLabelText('Rôles autorisés (virgules, vide : tous)'), 'athena-admin');
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: 'Clore', from: 'open', to: 'done', roles: ['athena-admin'] }));
  });

  it('crée une transition depuis « Tout état » et permet d’annuler la sélection', async () => {
    const onCreate = vi.fn(async () => undefined);
    render(<WorkflowEditor statuses={statuses} transitions={[]} editable onCreate={onCreate} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tout état' }));
    await user.click(screen.getByRole('button', { name: 'En cours' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ from: null, to: 'doing' })));
    await user.click(screen.getByRole('button', { name: 'Ouvert' }));
    await user.click(screen.getByRole('button', { name: 'Ouvert (départ)' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cliquez sur un statut de départ');
  });

  it('en lecture seule, les nœuds ne sont pas interactifs', () => {
    render(<WorkflowEditor statuses={statuses} transitions={transitions} editable={false} onCreate={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Ouvert' })).toBeInTheDocument();
  });
});

const calls: Array<{ method: string; url: string; body: unknown }> = [];
let routes: Array<[string, RegExp, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const hit = routes.find(([m, re]) => m === method && re.test(input));
    return new Response(JSON.stringify(hit ? hit[2] : { error: 'not_found', message: 'Introuvable.', details: [] }), { status: hit ? 200 : 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); setLocale('fr'); });
const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-team-member'], groups: [] } };

describe('vue projet', () => {
  it('chaque tracker : nom, nombre de tickets, attributs en info-bulle (T-0152)', async () => {
    routes.push(['GET', /\/v1\/projects$/, [{ key: 'ARI', name: 'Ariane' }]]);
    routes.push(['GET', /\/v1\/projects\/ARI\/trackers$/, [{ key: 'BUG', name: 'Bugs', artifacts: 12 }, { key: 'REQ', name: 'Exigences', artifacts: 3 }]]);
    routes.push(['GET', /\/trackers\/BUG$/, { fields: [{ label: 'Titre' }, { label: 'Sévérité' }] }]);
    routes.push(['GET', /\/trackers\/REQ$/, { fields: [{ label: 'Énoncé' }] }]);
    routes.push(['GET', /\/boards$/, []]);
    render(<ToastProvider><MemoryRouter><ProjectsPage /></MemoryRouter></ToastProvider>);
    expect(await screen.findByRole('link', { name: 'Bugs' })).toHaveAttribute('title', 'Attributs : Titre, Sévérité');
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exigences' })).toHaveAttribute('title', 'Attributs : Énoncé');
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

});

describe('gabarits de projet', () => {
  const templates = [
    { key: 'vide', name: 'Projet vide', description: '', builtin: true, trackers: [] },
    { key: 'qualite', name: 'Qualité', description: '', builtin: true, trackers: [{ key: 'REQ', name: 'Exigences', fields: [{ label: 'Énoncé' }], statuses: [], transitions: [] }, { key: 'BUG', name: 'Bugs', fields: [{ label: 'Titre' }], statuses: [], transitions: [] }] },
  ];
  const app = () => render(<ToastProvider><MemoryRouter><OrgAdminPage session={admin} /></MemoryRouter></ToastProvider>);

  it('crée un projet à partir du gabarit choisi', async () => {
    routes.push(['GET', /\/v1\/users$/, []], ['GET', /\/v1\/project-templates$/, templates], ['GET', /\/v1\/projects$/, []], ['POST', /\/v1\/projects$/, {}]);
    app();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Nouveau projet' }));
    await user.selectOptions(await screen.findByLabelText('Gabarit du projet'), 'qualite');
    await user.type(screen.getByLabelText('Clé du projet (2 à 10 majuscules)'), 'qua');
    await user.type(screen.getByLabelText('Nom du projet'), 'Qualité');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/projects'))?.body).toEqual({ key: 'QUA', name: 'Qualité', template: 'qualite' }));
  });

  it('enregistre un gabarit depuis les trackers d’un projet', async () => {
    routes.push(['GET', /\/v1\/users$/, []], ['GET', /\/v1\/project-templates$/, templates], ['GET', /\/v1\/projects$/, [{ key: 'ARI', name: 'Ariane' }]], ['GET', /\/members$/, []],
      ['GET', /\/v1\/projects\/ARI\/trackers$/, [{ key: 'BUG', name: 'Bugs' }, { key: 'REQ', name: 'Exigences' }]], ['POST', /\/v1\/project-templates$/, {}]);
    app();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Gabarits' }));
    expect(await screen.findByText('Qualité')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Clé du gabarit (minuscules)'), 'mon-modele');
    await user.type(screen.getByLabelText('Nom du gabarit'), 'Mon modèle');
    await user.selectOptions(screen.getByLabelText('Reprendre les trackers du projet'), 'ARI');
    await user.click(await screen.findByRole('checkbox', { name: /REQ/ }));
    await user.click(screen.getByRole('button', { name: 'Créer le gabarit' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/project-templates'))?.body)
      .toEqual({ key: 'mon-modele', name: 'Mon modèle', fromProject: { project: 'ARI', trackers: ['BUG'] } }));
  });
});
