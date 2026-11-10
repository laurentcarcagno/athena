import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

const OVERVIEW = [
  { key: 'REQ', name: 'Exigences', typeKey: 'requirement', category: 'engineering', artifacts: 10, mine: 0, lastActivity: '2026-11-05T10:00:00.000Z', statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo', count: 2 }, { key: 'approved', name: 'Approuvée', category: 'in_progress', count: 3 }, { key: 'verified', name: 'Vérifiée', category: 'done', count: 5 }] },
  { key: 'BUG', name: 'Anomalies', typeKey: 'bug', category: 'development', artifacts: 4, mine: 2, lastActivity: null, statuses: [{ key: 'open', name: 'Ouvert', category: 'todo', count: 4 }] },
  { key: 'NOTE', name: 'Notes', typeKey: null, category: 'other', artifacts: 0, mine: 0, lastActivity: null, statuses: [{ key: 'new', name: 'Nouveau', category: 'todo', count: 0 }] },
];
const calls: string[] = [];
const FEED = {
  items: [
    { id: 'e3', kind: 'transition', at: '2026-11-05T10:30:00.000Z', key: 'ARI-BUG-0002', tracker: 'BUG', actor: 'alice', actorName: 'Alice Martin', fields: [], from: 'open', to: 'in_progress' },
    { id: 'e2', kind: 'updated', at: '2026-11-05T09:00:00.000Z', key: 'ARI-BUG-0002', tracker: 'BUG', actor: 'bob', actorName: 'Bob Durand', fields: ['severity', 'title'], from: null, to: null },
    { id: 'e1', kind: 'comment', at: '2026-11-04T09:00:00.000Z', key: 'ARI-REQ-0001', tracker: 'REQ', actor: 'bob', actorName: 'Bob Durand', fields: [], from: null, to: null },
  ],
  next: 'CURSEUR|00000000-0000-0000-0000-000000000000',
  people: [{ subject: 'alice', name: 'Alice Martin' }, { subject: 'bob', name: 'Bob Durand' }],
};
const OLDER = { items: [{ id: 'e0', kind: 'created', at: '2026-11-01T08:00:00.000Z', key: 'ARI-BUG-0001', tracker: 'BUG', actor: 'alice', actorName: 'Alice Martin', fields: [], from: null, to: null }], next: null, people: FEED.people };
let repos: Array<{ path: string; defaultBranch: string }> = [];
let modules: string[] | 'error' = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'];

beforeEach(() => {
  calls.length = 0;
  repos = [];
  modules = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(input);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/modules$/.test(input)) return modules === 'error' ? new Response('{}', { status: 500 }) : ok({ modules });
    if (/\/activity\?/.test(input)) return ok(/before=CURSEUR/.test(input) ? OLDER : FEED);
    if (/\/code-repos$/.test(input)) return ok(repos);
    if (/\/dora\?/.test(input)) return ok({ windowDays: 30, deployments: 6, deploymentFrequency: 0.2, leadTimeHours: 12.5, changeFailureRate: 0.25, mttrHours: null });
    if (/\/overview$/.test(input)) return ok({ trackers: OVERVIEW });
    if (/\/dashboard$/.test(input)) return ok({ byCategory: { todo: 3, in_progress: 2, done: 7 }, byTracker: [{ tracker: 'BUG', total: 12, open: 5 }], distribution: null, recent: [] });
    if (/\/velocity$/.test(input)) return ok({ sprints: [], average: 0, forecast: 0 });
    if (/\/flow/.test(input) || /\/roadmap$/.test(input)) return ok([]);
    if (/\/search\?/.test(input)) return ok({ total: 0, hits: [] });
    if (/\/v1\/projects\/ARI\/(filters|boards)$/.test(input) || /\/v1\/projects$/.test(input)) return ok([]);
    if (/\/v1\/projects\/ARI\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies' }, { key: 'REQ', name: 'Exigences' }]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const app = (path: string, roles = ['athena-user']) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const projectNav = () => within(screen.getByRole('group', { name: 'Projet ARI' }));
/** Sections du projet au rail (les trackers, imbriqués sous « Trackers », sont au niveau 1). */
const sectionNames = () => projectNav().getAllByRole('button').filter((b) => b.getAttribute('data-depth') === '0').map((b) => b.textContent);
const ADMIN = ['athena-user', 'athena-admin'];

describe('navigation du projet au rail (ADR-0003)', () => {
  it('liste les sections dans l’ordre fixe, l’entrée courante signalée, sans barre d’onglets', async () => {
    app('/p/ARI', ADMIN);
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    await waitFor(() => expect(sectionNames()).toEqual(['Vue d’ensemble', 'Backlog', 'Board', 'Trackers', 'Planification', 'Traçabilité', 'Documents', 'Code et intégration', 'Activité', 'Membres', 'Recherche', 'Administration']));
    expect(projectNav().getByRole('button', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
    expect(projectNav().getByRole('button', { name: 'Planification' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('navigation', { name: 'Projet ARI' })).not.toBeInTheDocument();
  });

  it('imbrique les trackers sous « Trackers »', async () => {
    app('/p/ARI');
    const tracker = await screen.findByRole('button', { name: 'BUG · Anomalies' });
    expect(tracker).toHaveAttribute('data-depth', '1');
    const buttons = projectNav().getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('BUG · Anomalies')).toBe(buttons.indexOf('Trackers') + 1);
  });

  it('masque la section dont le module est inactif, sans décaler les autres', async () => {
    modules = ['overview', 'trackers', 'activity'];
    app('/p/ARI', ADMIN);
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    await waitFor(() => expect(sectionNames()).toEqual(['Vue d’ensemble', 'Backlog', 'Board', 'Trackers', 'Activité', 'Recherche', 'Administration']));
  });

  it('garde toutes les sections autorisées quand la liste des modules est indisponible', async () => {
    modules = 'error';
    app('/p/ARI', ADMIN);
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    await waitFor(() => expect(sectionNames()).toEqual(['Vue d’ensemble', 'Backlog', 'Board', 'Trackers', 'Planification', 'Traçabilité', 'Conformité', 'Documents', 'Code et intégration', 'Activité', 'Membres', 'Recherche', 'Administration']));
  });

  it('n’affiche aucune entrée menant à « Réservé » : ni Planification, ni Membres, ni Administration pour un simple membre', async () => {
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    await waitFor(() => expect(sectionNames()).toEqual(['Vue d’ensemble', 'Backlog', 'Board', 'Trackers', 'Traçabilité', 'Documents', 'Code et intégration', 'Activité', 'Recherche']));
  });

  it('reste affichée sur toutes les adresses du projet, l’entrée courante comprise', async () => {
    const cases: Array<[string, string]> = [
      ['/p/ARI/recherche', 'Recherche'], ['/p/ARI/admin', 'Administration'], ['/p/ARI/board/EQ', 'Board'],
      ['/p/ARI/t/BUG/tableau', 'BUG · Anomalies'], ['/p/ARI/a/ARI-BUG-0002', 'BUG · Anomalies'], ['/p/ARI/trackers/REQ/config', 'REQ · Exigences'],
      ['/p/ARI/trackers/new', 'Trackers'], ['/p/ARI/membres', 'Membres'],
    ];
    for (const [path, entry] of cases) {
      const view = app(path, ADMIN);
      await waitFor(() => expect(projectNav().getByRole('button', { name: entry })).toHaveAttribute('aria-current', 'page'));
      view.unmount();
    }
  });

  it('se parcourt au clavier et mène à la section', async () => {
    app('/p/ARI', ADMIN);
    const entry = await screen.findByRole('button', { name: 'Planification' });
    entry.focus();
    expect(entry).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Planification · ARI' })).toBeInTheDocument();
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('anciennes adresses', () => {
  it('redirige la liste ATQL de /p/:projet vers la vue Recherche, requête conservée', async () => {
    app('/p/ARI?q=status%3Dopen');
    await screen.findByRole('heading', { level: 1, name: 'ARI' }); // titre de la page Recherche
    await waitFor(() => expect(calls.some((c) => c.includes('/search?q=status%3Dopen'))).toBe(true));
    await waitFor(() => expect(projectNav().getByRole('button', { name: 'Recherche' })).toHaveAttribute('aria-current', 'page'));
  });
  it('accède à la Recherche à sa nouvelle adresse', async () => {
    app('/p/ARI/recherche');
    await screen.findByRole('heading', { level: 1, name: 'ARI' });
    await waitFor(() => expect(calls.some((c) => c.includes('/v1/projects/ARI/search?'))).toBe(true));
  });
  it('redirige /manage vers Planification et /dashboard vers la Vue d’ensemble', async () => {
    const first = app('/p/ARI/manage', ADMIN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Planification · ARI' })).toBeInTheDocument();
    await waitFor(() => expect(projectNav().getByRole('button', { name: 'Planification' })).toHaveAttribute('aria-current', 'page'));
    first.unmount();
    app('/p/ARI/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' })).toBeInTheDocument();
    await waitFor(() => expect(projectNav().getByRole('button', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page'));
  });
});

describe('onglet Trackers', () => {
  it('groupe les trackers par catégorie dans l’ordre fixe, avec compteurs par état et éléments à moi', async () => {
    app('/p/ARI/trackers');
    await screen.findByRole('heading', { level: 1, name: 'Trackers · ARI' });
    const groups = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent).filter((t) => ['Ingénierie', 'Développement', 'Autres', 'Pilotage'].includes(String(t)));
    expect(groups).toEqual(['Ingénierie', 'Développement', 'Autres']); // catégories vides absentes
    const req = screen.getByRole('region', { name: 'Ingénierie' });
    expect(within(req).getByText('Exigences')).toBeInTheDocument();
    expect(within(req).getByText('10 items')).toHaveClass('ath-mono');
    expect(within(req).getByRole('img', { name: /Brouillon 2, Approuvée 3, Vérifiée 5/ })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Développement' })).getByText('2 à moi')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Autres' })).getByText(/Aucune activité/)).toBeInTheDocument();
    expect(within(req).getByRole('link', { name: 'Ouvrir Exigences' })).toHaveAttribute('href', '/p/ARI/t/REQ/tableau');
  });
  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI/trackers');
    await screen.findByRole('heading', { level: 1, name: 'Trackers · ARI' });
    await screen.findByRole('region', { name: 'Ingénierie' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('Vue d’ensemble', () => {
  it('liste les trackers et mes items, même sans aucune donnée', async () => {
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble · ARI' });
    expect(await screen.findByText('Rien n’est assigné à votre nom.')).toBeInTheDocument();
    const card = screen.getByRole('link', { name: 'REQ' }).closest('section')!;
    expect(within(card).getByRole('link', { name: 'REQ' })).toHaveAttribute('href', '/p/ARI/t/REQ/tableau');
    expect(within(card).getByText('5 ouverts / 10')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tout voir dans la Recherche' })).toHaveAttribute('href', '/p/ARI/recherche?q=assignee%20%3D%20currentUser()');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('onglets Planification, Membres et Code', () => {
  it('Membres : les acteurs sont réservés aux chefs de projet et administrateurs', async () => {
    app('/p/ARI/membres');
    await screen.findByRole('heading', { level: 1, name: 'Membres · ARI' });
    expect(screen.getByText('Réservé aux chefs de projet et aux administrateurs.')).toBeInTheDocument();
  });
  it('Membres : un chef de projet voit la liste des acteurs', async () => {
    app('/p/ARI/membres', ['athena-user', 'athena-pm']);
    await screen.findByRole('heading', { level: 1, name: 'Membres · ARI' });
    expect(screen.queryByText('Réservé aux chefs de projet et aux administrateurs.')).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.endsWith('/v1/projects/ARI/members'))).toBe(true));
  });
  it('Planification n’affiche plus les acteurs : sprints, versions, boards, approbations', async () => {
    app('/p/ARI/planification', ['athena-user', 'athena-pm']);
    await screen.findByRole('heading', { level: 1, name: 'Planification · ARI' });
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Sprints', 'Versions', 'Boards', 'Approbations', 'Baselines']);
  });
  it('Code : dépôts liés et indicateurs de livraison, vide sinon', async () => {
    app('/p/ARI/code');
    await screen.findByRole('heading', { level: 1, name: 'Code et intégration · ARI' });
    expect(await screen.findByText('Aucun dépôt lié à ce projet.')).toBeInTheDocument();
  });
  it('Code : liste les dépôts en mono et les indicateurs DORA', async () => {
    repos = [{ path: 'ariane/obc', defaultBranch: 'main' }];
    app('/p/ARI/code');
    expect(await screen.findByText('ariane/obc')).toHaveClass('ath-mono');
    const row = (await screen.findByText('Taux d’échec')).closest('tr')!;
    expect(within(row).getByText('25 %')).toBeInTheDocument();
    expect(within(screen.getByText('Rétablissement (h)').closest('tr')!).getByText('—')).toBeInTheDocument();
  });
});

describe('onglet Activité', () => {
  const lastActivityCall = () => decodeURIComponent([...calls].reverse().find((c) => c.includes('/activity?'))!);

  it('liste les événements du plus récent au plus ancien, clés et champs en mono, lien vers la fiche', async () => {
    app('/p/ARI/activite');
    await screen.findByRole('heading', { level: 1, name: 'Activité · ARI' });
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Alice Martin')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/a fait passer de/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText('in_progress')).toHaveClass('ath-mono');
    expect(within(rows[1]!).getByText('severity')).toHaveClass('ath-mono');
    expect(within(rows[2]!).getByText('a commenté')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('link', { name: 'ARI-BUG-0002' })).toHaveAttribute('href', '/p/ARI/a/ARI-BUG-0002');
    expect(within(rows[0]!).getByText('2026-11-05 10:30')).toHaveClass('ath-mono');
  });

  it('filtre par tracker, personne et type d’événement, filtres conservés dans l’adresse', async () => {
    app('/p/ARI/activite');
    await screen.findAllByRole('row');
    await screen.findByRole('option', { name: 'BUG' });
    await userEvent.selectOptions(screen.getByLabelText('Tracker'), 'BUG');
    await waitFor(() => expect(lastActivityCall()).toContain('tracker=BUG'));
    await userEvent.selectOptions(screen.getByLabelText('Personne'), 'bob');
    await waitFor(() => expect(lastActivityCall()).toContain('actor=bob'));
    await userEvent.selectOptions(screen.getByLabelText('Type d’événement'), 'updated');
    await waitFor(() => expect(lastActivityCall()).toContain('kind=updated'));
    expect(lastActivityCall()).toContain('tracker=BUG&actor=bob&kind=updated');
  });

  it('charge la page suivante avec le curseur et désactive « Plus ancien » à la fin', async () => {
    app('/p/ARI/activite');
    await screen.findAllByRole('row');
    await userEvent.click(screen.getByRole('button', { name: 'Plus ancien' }));
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(5));
    expect(lastActivityCall()).toContain('before=CURSEUR|');
    expect(screen.getByRole('button', { name: 'Plus ancien' })).toBeDisabled();
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI/activite');
    await screen.findAllByRole('row');
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});
