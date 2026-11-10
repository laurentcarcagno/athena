import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { ArtifactPage } from './pages/ArtifactPage';

// T-0112 : fiche du ticket, informations clés dans l'en-tête et onglet actif dans l'adresse.

let values: Record<string, unknown> = {};
let links: Array<Record<string, unknown>> = [];
let sprint: unknown = null;

const def = {
  key: 'BUG', name: 'Anomalies', typeKey: null,
  fields: [
    { id: 'f1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: 'f2', key: 'assignee', label: 'Responsable', type: 'user', config: {}, required: false, semanticRole: 'assignee' },
    { id: 'f3', key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure'] }, required: false, semanticRole: 'priority' },
    { id: 'f4', key: 'due', label: 'Échéance', type: 'date', config: {}, required: false, semanticRole: 'due_date' },
    { id: 'f5', key: 'fixed_version', label: 'Version corrigée', type: 'text', config: {}, required: false, semanticRole: 'version' },
  ],
  statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
};

beforeEach(() => {
  values = { title: 'Crash' };
  links = [];
  sprint = null;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/artifacts\/ARI-BUG-0001\/links$/.test(input)) return ok(links);
    if (/\/artifacts\/ARI-BUG-0001\/sprint$/.test(input)) return ok({ sprint });
    if (/\/artifacts\/(BUG-1|ARI-BUG-0001)$/.test(input)) return ok({ id: 'a', key: 'ARI-BUG-0001', trackerKey: 'BUG', status: 'open', version: 1, values });
    if (/\/trackers\/BUG$/.test(input)) return ok(def);
    if (/\/link-types$/.test(input)) return ok([]);
    if (/\/artifacts\/[^/]+\/(doc-links|comments|history|code-refs|attachments)$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
const sheet = (entry = '/p/ARI/a/ARI-BUG-0001') => {
  const router = createMemoryRouter([{ path: '/p/:project/a/:key', element: <><ArtifactPage session={session} /><Where /></> }], { initialEntries: [entry] });
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  return router;
};
const facts = async () => within(await screen.findByLabelText('Informations clés'));
const fact = (list: ReturnType<typeof within>, term: string) => list.getByText(term, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('fiche : informations clés dans l’en-tête', () => {
  it('montre responsable, priorité, échéance, version, sprint, parent et blocage sans clic', async () => {
    values = { title: 'Crash', assignee: 'alice', severity: 'majeure', due: '2026-12-01', fixed_version: '2.4.0' };
    sprint = { id: 's', name: 'Sprint 12', state: 'active' };
    links = [
      { id: 'l1', type: 'refines', direction: 'outward', label: 'raffine', other: 'ARI-BUG-0009', suspect: false, hierarchical: true },
      { id: 'l2', type: 'blocks', direction: 'inward', label: 'est bloqué par', other: 'ARI-TSK-0003', suspect: false, hierarchical: false },
      { id: 'l3', type: 'blocks', direction: 'outward', label: 'bloque', other: 'ARI-TSK-0004', suspect: false, hierarchical: false },
      { id: 'l4', type: 'refines', direction: 'inward', label: 'est raffiné par', other: 'ARI-BUG-0010', suspect: false, hierarchical: true },
    ];
    sheet();
    const list = await facts();
    expect(fact(list, 'Responsable')).toHaveTextContent('alice');
    expect(fact(list, 'Sévérité')).toHaveTextContent('majeure'); // libellé du champ qui porte le rôle « priority »
    expect(fact(list, 'Échéance')).toHaveTextContent('2026-12-01');
    expect(fact(list, 'Version corrigée')).toHaveTextContent('2.4.0');
    expect(fact(list, 'Sprint')).toHaveTextContent('Sprint 12');
    expect(within(fact(list, 'Parent')).getByRole('link', { name: 'ARI-BUG-0009' })).toHaveAttribute('href', '/p/ARI/a/ARI-BUG-0009');
    expect(fact(list, 'Parent')).not.toHaveTextContent('ARI-BUG-0010'); // un enfant n'est pas un parent
    expect(within(fact(list, 'Bloqué par')).getByRole('link', { name: 'ARI-TSK-0003' })).toHaveClass('ath-mono');
    expect(fact(list, 'Bloqué par')).not.toHaveTextContent('ARI-TSK-0004'); // « bloque » n'est pas un blocage du ticket
  });

  it('une information absente vaut « — », annoncée « non renseigné » aux lecteurs d’écran', async () => {
    sheet();
    const list = await facts();
    for (const term of ['Responsable', 'Sévérité', 'Échéance', 'Version corrigée', 'Sprint', 'Parent', 'Bloqué par']) {
      expect(fact(list, term)).toHaveTextContent('—');
      expect(within(fact(list, term)).getByText('non renseigné')).toHaveClass('ath-visually-hidden');
    }
  });

  it('l’en-tête enrichi reste sans violation axe', async () => {
    sheet();
    await facts();
    const result = await axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('fiche : onglet actif dans l’adresse (?onglet=)', () => {
  it('ouvre l’onglet de l’adresse ; changer d’onglet met à jour l’adresse ; Précédent restaure l’onglet', async () => {
    const router = sheet('/p/ARI/a/ARI-BUG-0001?onglet=history');
    expect(await screen.findByRole('tab', { name: 'Historique', selected: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Liens' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/a/ARI-BUG-0001?onglet=links');
    await userEvent.click(screen.getByRole('tab', { name: 'Détails' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/p\/ARI\/a\/ARI-BUG-0001$/); // Détails : onglet par défaut, absent de l'adresse
    await act(async () => { await router.navigate(-1); });
    expect(await screen.findByRole('tab', { name: 'Liens', selected: true })).toBeInTheDocument();
    await act(async () => { await router.navigate(-1); });
    expect(await screen.findByRole('tab', { name: 'Historique', selected: true })).toBeInTheDocument();
  });

  it('sans paramètre, ou avec une valeur inconnue, la fiche s’ouvre sur Détails', async () => {
    sheet('/p/ARI/a/ARI-BUG-0001?onglet=inconnu');
    expect(await screen.findByRole('tab', { name: 'Détails', selected: true })).toBeInTheDocument();
  });

  it('« approval » sans circuit actif retombe sur Détails', async () => {
    sheet('/p/ARI/a/ARI-BUG-0001?onglet=approval');
    expect(await screen.findByRole('tab', { name: 'Détails', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Approbation' })).not.toBeInTheDocument();
  });

  it('une ancienne clé redirige vers l’adresse canonique sans perdre l’onglet', async () => {
    sheet('/p/ARI/a/BUG-1?onglet=history');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/a/ARI-BUG-0001?onglet=history'));
    expect(await screen.findByRole('tab', { name: 'Historique', selected: true })).toBeInTheDocument();
  });

  it('le raccourci L passe l’adresse sur l’onglet des liens', async () => {
    sheet();
    await screen.findByRole('tab', { name: 'Détails', selected: true });
    await userEvent.keyboard('l');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?onglet=links'));
    expect(screen.getByRole('tab', { name: 'Liens', selected: true })).toBeInTheDocument();
  });
});
