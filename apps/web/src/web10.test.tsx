import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

const calls: string[] = [];
const bodies: Array<{ method: string; url: string; body: unknown }> = [];
let views: Array<Record<string, unknown>> = [];
let badQuery = false;
let typeKey: string | null = 'bug';
const TYPES = [
  { key: 'bug', name: 'Anomalie', description: '', category: 'development', defaultViews: ['tableau', 'board'], baseFields: [], builtin: true, modified: false },
  { key: 'requirement', name: 'Exigence', description: '', category: 'engineering', defaultViews: ['tableau', 'arbre'], baseFields: [], builtin: true, modified: false },
];
const BOARD = {
  key: '~BUG', name: 'Anomalies', unmapped: 0,
  columns: [
    { name: 'Ouvert', wipLimit: null, count: 1, overLimit: false, cards: [{ key: 'ARI-BUG-0001', tracker: 'BUG', title: 'Anomalie 1', status: 'open', statusName: 'Ouvert', assignee: null, version: 4 }] },
    { name: 'En cours', wipLimit: null, count: 0, overLimit: false, cards: [] },
    { name: 'Fini', wipLimit: null, count: 0, overLimit: false, cards: [] },
  ],
};
const view = (id: string, name: string, query: string, extra: Record<string, unknown> = {}) => ({ id, name, query, owner: 'u', shared: false, trackerKey: 'BUG', view: 'tableau', columns: null, isDefault: false, ...extra });
const hit = (n: number, status = 'open') => ({ key: `ARI-BUG-${String(n).padStart(4, '0')}`, tracker: 'BUG', status, statusName: status === 'open' ? 'Ouvert' : 'En cours', category: status === 'open' ? 'todo' : 'in_progress', version: 1, updatedAt: '2026-11-05T10:00:00.000Z', values: { title: `Anomalie ${n}`, severity: 'majeure' } });
const def = {
  key: 'BUG', name: 'Anomalies', typeKey: 'bug',
  fields: [
    { id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: 'g', key: 'assignee', label: 'Responsable', type: 'user', config: {}, required: false, semanticRole: 'assignee' },
    { id: 'h', key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure', 'très haute'] }, required: false, semanticRole: null },
  ],
  statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }, { id: 's2', key: 'in_progress', name: 'En cours', category: 'in_progress' }, { id: 's3', key: 'done', name: 'Fini', category: 'done' }],
  transitions: [],
};
const overview = { trackers: [{ key: 'BUG', name: 'Anomalies', typeKey: 'bug', category: 'development', artifacts: 40, mine: 0, lastActivity: null, statuses: [{ key: 'open', name: 'Ouvert', category: 'todo', count: 25 }, { key: 'in_progress', name: 'En cours', category: 'in_progress', count: 10 }, { key: 'done', name: 'Fini', category: 'done', count: 5 }] }] };

beforeEach(() => {
  calls.length = 0;
  bodies.length = 0;
  views = [];
  badQuery = false;
  typeKey = 'bug';
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${input}`);
    if (init.body) bodies.push({ method: init.method ?? 'GET', url: input, body: JSON.parse(String(init.body)) });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/filters\?tracker=BUG$/.test(input)) return ok(views);
    if (/\/filters/.test(input) && init.method && init.method !== 'GET') return new Response(init.method === 'POST' ? JSON.stringify({ id: 'new' }) : null, { status: init.method === 'POST' ? 201 : 204 });
    if (/\/search\?/.test(input) && badQuery && /status = open/.test(decodeURIComponent(input)) === false && /nope/.test(decodeURIComponent(input))) return new Response(JSON.stringify({ error: 'validation', message: 'Requête invalide.', details: ['Champ inconnu ou invalide : nope'] }), { status: 422 });
    if (/\/search\?/.test(input)) {
      const q = decodeURIComponent(/q=([^&]*)/.exec(input)![1]!);
      const offset = Number(/offset=(\d+)/.exec(input)?.[1] ?? '0');
      const inProgress = q.includes('status = in_progress');
      const hits = inProgress ? [hit(3, 'in_progress')] : Array.from({ length: 25 }, (_, i) => hit(offset + i + 1));
      return ok({ total: inProgress ? 1 : 40, hits });
    }
    const itemMatch = /\/artifacts\/(ARI-BUG-\d{4})$/.exec(input);
    if (itemMatch) return ok({ id: itemMatch[1], key: itemMatch[1], trackerKey: 'BUG', status: 'open', version: 1, values: { title: `Titre de ${itemMatch[1]}` } });
    if (/\/artifacts\/[^/]+\/(links|doc-links|comments|history|code-refs)$/.test(input)) return ok([]);
    if (/\/overview$/.test(input)) return ok(overview);
    if (/\/tracker-types$/.test(input)) return ok(TYPES);
    if (/\/boards\/~BUG$/.test(input)) return ok(BOARD);
    if (/\/boards\/~BUG\/cards\/[^/]+\/move$/.test(input)) return ok({ id: 'a', key: 'ARI-BUG-0001', trackerKey: 'BUG', status: 'in_progress', version: 5, values: {} });
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning', 'activity', 'members'] });
    if (/\/trackers\/BUG$/.test(input)) return ok({ ...def, typeKey });
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = (roles: string[]): Session => ({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles, groups: [] } });
const Where = () => <span data-testid="where">{useLocation().pathname}{useLocation().search}</span>;
const app = (path: string, roles = ['athena-team-member']) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Where /><AuthenticatedApp session={session(roles)} /></MemoryRouter></ToastProvider>,
);
const lastSearch = () => decodeURIComponent([...calls].reverse().find((c) => c.includes('/search?'))!);

describe('écran Tracker', () => {
  it('affiche l’en-tête (nom, préfixe, total), le mini-workflow et les tickets du tracker seulement', async () => {
    app('/p/ARI/t/BUG/tableau');
    expect(await screen.findByRole('heading', { level: 1, name: 'Anomalies' })).toBeInTheDocument();
    expect(screen.getByText('ARI-BUG')).toHaveClass('ath-mono');
    expect(screen.getByText('40 tickets')).toBeInTheDocument();
    const workflow = screen.getByRole('list', { name: 'Workflow' });
    expect(within(workflow).getAllByRole('button').map((b) => b.textContent)).toEqual(['Ouvert 25', 'En cours 10', 'Fini 5']);
    expect(await screen.findByRole('link', { name: 'ARI-BUG-0001' })).toHaveAttribute('href', '/p/ARI/t/BUG/tableau?i=ARI-BUG-0001'); // ouvre le panneau de détail
    expect(lastSearch()).toContain('q=tracker = BUG&limit=25&offset=0');
    expect(screen.getByRole('link', { name: 'Tableau' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '+ Nouveau ticket' })).toBeInTheDocument();
  });

  it('filtre sur un état du mini-workflow, puis retire le filtre', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'En cours 10' }));
    await screen.findByRole('link', { name: 'ARI-BUG-0003' });
    expect(lastSearch()).toContain('tracker = BUG AND (status = in_progress)');
    expect(screen.getByRole('button', { name: 'En cours 10' })).toHaveAttribute('aria-pressed', 'true');
    expect(decodeURIComponent(screen.getByTestId('where').textContent!.replace(/\+/g, ' '))).toContain('?f=status = in_progress');
    await userEvent.click(screen.getByRole('button', { name: 'En cours 10' }));
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(lastSearch()).toContain('q=tracker = BUG&');
  });

  it('trie par colonne et pagine, l’état restant dans l’adresse', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('columnheader', { name: /Clé/ }));
    await waitFor(() => expect(lastSearch()).toContain('ORDER BY key asc'));
    expect(screen.getByTestId('where')).toHaveTextContent('sort=key%3Aasc');
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await waitFor(() => expect(lastSearch()).toContain('offset=25'));
    expect(lastSearch()).toContain('ORDER BY key asc');
  });

  it('« + Nouveau ticket » ouvre la création sur ce tracker', async () => {
    app('/p/ARI/t/BUG/tableau');
    await userEvent.click(await screen.findByRole('button', { name: '+ Nouveau ticket' }));
    expect(await screen.findByLabelText('Titre (obligatoire)')).toBeInTheDocument();
    expect(calls).toContain('GET /v1/projects/ARI/trackers/BUG');
  });

  it('propose Configurer aux seuls administrateurs', async () => {
    const view = app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('heading', { level: 1, name: 'Anomalies' });
    expect(screen.queryByRole('button', { name: 'Configurer' })).not.toBeInTheDocument();
    view.unmount();
    app('/p/ARI/t/BUG/tableau', ['athena-team-member', 'athena-admin']);
    await userEvent.click(await screen.findByRole('button', { name: 'Configurer' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/parametres/trackers/BUG');
  });

  it('redirige un tracker sans vue ou une vue inconnue vers le Tableau', async () => {
    const first = app('/p/ARI/t/BUG');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau'));
    first.unmount();
    app('/p/ARI/t/BUG/inconnue');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau'));
  });

  it('la Recherche existante garde son tableau', async () => {
    app('/p/ARI/recherche?q=status%3Dopen');
    expect(await screen.findByRole('link', { name: 'ARI-BUG-0001' })).toBeInTheDocument();
    expect(lastSearch()).toContain('q=status=open');
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('barre de filtres', () => {
  it('« Assigné à moi », un champ à liste et le texte écrivent un fragment ATQL dans l’adresse', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'Assigné à moi' }));
    await waitFor(() => expect(lastSearch()).toContain('tracker = BUG AND (assignee = "u")'));
    await userEvent.selectOptions(screen.getByLabelText('Sévérité'), 'très haute');
    await waitFor(() => expect(lastSearch()).toContain('(assignee = "u" AND severity = "très haute")'));
    await userEvent.type(screen.getByLabelText('Recherche dans le tracker'), 'crash{enter}');
    await waitFor(() => expect(lastSearch()).toContain('AND text ~ "crash")'));
    expect(screen.getByRole('option', { name: 'Sévérité : très haute' })).toBeInTheDocument(); // l’option porte son libellé (T-0147)
    expect(screen.getByText('très haute')).toBeInTheDocument(); // la puce active
    await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    await waitFor(() => expect(lastSearch()).toContain('q=tracker = BUG&'));
    expect(screen.getByTestId('where')).not.toHaveTextContent('f=');
  });

  it('une seule barre (T-0147) : les vues avant la recherche, aucun bouton sans texte, vue enregistrée et colonnes dans la barre', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    const views = screen.getByRole('navigation', { name: 'Vues du tracker' });
    const bar = screen.getByRole('search', { name: 'Filtres du tracker' });
    expect(views.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const b of within(bar).getAllByRole('button')) expect(b.textContent?.trim()).not.toBe('');
    expect(within(bar).getByLabelText('Vues enregistrées')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Colonnes' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Filtres' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('« Liens suspects » écrit suspect() et se relit comme une puce', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'Liens suspects' }));
    await waitFor(() => expect(lastSearch()).toContain('tracker = BUG AND (suspect())'));
    expect(screen.getByRole('button', { name: 'Liens suspects' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Requête avancée' }));
    expect(screen.getByLabelText('Requête ATQL du tracker')).toHaveValue('suspect()');
  });

  it('bascule en mode requête : le fragment est affiché, modifiable et reste synchronisé avec les puces', async () => {
    app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'Requête avancée' }));
    const input = screen.getByLabelText('Requête ATQL du tracker');
    expect(input).toHaveValue('status = open');
    await userEvent.clear(input);
    await userEvent.type(input, 'status = open AND severity = majeure{enter}');
    await waitFor(() => expect(lastSearch()).toContain('(status = open AND severity = majeure)'));
    expect(screen.getByLabelText('Sévérité')).toHaveValue('majeure'); // retour automatique aux puces
  });

  it('une requête non représentable reste en mode requête, avec un message', async () => {
    app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open%20OR%20status%20%3D%20done');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(screen.getByLabelText('Requête ATQL du tracker')).toHaveValue('status = open OR status = done');
    expect(screen.getByText(/ne s’affiche pas en filtres/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtres simples' })).toBeDisabled();
    expect(lastSearch()).toContain('(status = open OR status = done)');
  });

  it('affiche l’erreur de syntaxe du serveur sans perdre la saisie', async () => {
    badQuery = true;
    app('/p/ARI/t/BUG/tableau?f=nope%20%3D%20x');
    expect(await screen.findByRole('alert')).toHaveTextContent('Champ inconnu ou invalide : nope');
    await userEvent.click(screen.getByRole('button', { name: 'Requête avancée' }));
    expect(screen.getByLabelText('Requête ATQL du tracker')).toHaveValue('nope = x');
  });
});

describe('vues enregistrées du tracker', () => {
  it('liste les vues du tracker, applique une vue (filtre et tri) et signale la vue par défaut', async () => {
    views = [view('v1', 'Bloquants', 'severity = majeure ORDER BY key desc', { shared: true, isDefault: true }), view('v2', 'Mes ouverts', 'status = open')];
    app('/p/ARI/t/BUG/tableau');
    // Première visite sans filtre : la vue par défaut s'applique.
    await waitFor(() => expect(lastSearch()).toContain('(severity = majeure) ORDER BY key desc'));
    expect(screen.getByLabelText('Vues enregistrées')).toHaveValue('v1');
    expect(calls).toContain('GET /v1/projects/ARI/filters?tracker=BUG');
    await userEvent.selectOptions(screen.getByLabelText('Vues enregistrées'), 'v2');
    await waitFor(() => expect(lastSearch()).toContain('(status = open)'));
    expect(lastSearch()).not.toContain('ORDER BY');
    expect(screen.getByTestId('where')).not.toHaveTextContent('sort=');
  });

  it('n’applique pas la vue par défaut quand l’adresse porte déjà un filtre', async () => {
    views = [view('v1', 'Défaut', 'severity = majeure', { shared: true, isDefault: true })];
    app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(lastSearch()).toContain('(status = open)');
    expect(lastSearch()).not.toContain('severity');
  });

  it('enregistre la combinaison filtre et tri en vue partagée', async () => {
    app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open&sort=key%3Adesc');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la vue' }));
    await userEvent.type(screen.getByLabelText('Nom de la vue'), 'Ouverts récents');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Partager avec le projet' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Enregistrer la vue' }).at(-1)!);
    await waitFor(() => expect(bodies.find((b) => b.method === 'POST' && b.url.endsWith('/filters'))?.body).toEqual({
      name: 'Ouverts récents', query: 'status = open ORDER BY key desc', trackerKey: 'BUG', shared: true,
    }));
    expect(await screen.findByText('Vue enregistrée.')).toBeInTheDocument();
  });

  it('un responsable définit la vue par défaut ; un utilisateur ne voit pas ce choix', async () => {
    views = [view('v1', 'Équipe', 'status = open', { shared: true })];
    const user = app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open');
    await screen.findByLabelText('Vues enregistrées');
    await waitFor(() => expect(screen.getByLabelText('Vues enregistrées')).toHaveValue('v1'));
    expect(screen.queryByRole('button', { name: 'Définir par défaut' })).not.toBeInTheDocument();
    user.unmount();
    app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open', ['athena-team-member', 'athena-pm']);
    await userEvent.click(await screen.findByRole('button', { name: 'Définir par défaut' }));
    await waitFor(() => expect(bodies.find((b) => b.method === 'PATCH')?.body).toEqual({ isDefault: true }));
  });

  it('demande confirmation avant de supprimer une vue', async () => {
    views = [view('v2', 'Mes ouverts', 'status = open')];
    app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open');
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer la vue' }));
    const dialog = await screen.findByRole('dialog', { name: /Supprimer la vue/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la vue' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Supprimer la vue/ })).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(calls).toContain('DELETE /v1/projects/ARI/filters/v2'));
  });

  it('n’a aucune violation d’accessibilité avec la barre de filtres et les vues', async () => {
    views = [view('v1', 'Équipe', 'status = open', { shared: true })];
    const { container } = app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('vue Board du tracker', () => {
  const viewTabs = () => within(screen.getByRole('navigation', { name: 'Vues du tracker' })).getAllByRole('link').map((l) => l.textContent);

  it('propose Tableau et Board pour un type qui a un board, et affiche les colonnes de statut du tracker', async () => {
    app('/p/ARI/t/BUG/board');
    await screen.findByRole('region', { name: 'Ouvert' });
    expect(viewTabs()).toEqual(['Tableau', 'Board']);
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Ouvert', 'En cours', 'Fini']);
    expect(within(screen.getByRole('region', { name: 'Ouvert' })).getByRole('link', { name: 'ARI-BUG-0001' })).toBeInTheDocument();
    expect(calls).toContain('GET /v1/projects/ARI/boards/~BUG');
    expect(screen.queryByRole('search')).not.toBeInTheDocument(); // les filtres sont ceux du Tableau
    expect(screen.queryByRole('list', { name: 'Workflow' })).not.toBeInTheDocument();
  });

  it('déplace une carte vers une autre colonne par le workflow (sélecteur « Déplacer vers »)', async () => {
    app('/p/ARI/t/BUG/board');
    await screen.findByRole('region', { name: 'Ouvert' });
    await userEvent.selectOptions(screen.getByLabelText('Déplacer vers'), 'En cours');
    await waitFor(() => expect(bodies.find((b) => b.method === 'POST' && b.url.endsWith('/move'))?.body).toEqual({ column: 'En cours', version: 4 }));
    expect(bodies.find((b) => b.url.endsWith('/move'))!.url).toBe('/v1/projects/ARI/boards/~BUG/cards/ARI-BUG-0001/move');
  });

  it('ne propose pas le Board pour un type sans board et redirige vers le Tableau', async () => {
    typeKey = 'requirement';
    app('/p/ARI/t/BUG/board');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau'));
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(viewTabs()).toEqual(['Tableau', 'Arbre']);
  });

  it('un tracker sans type garde toutes les vues : Tableau, Board et Arbre', async () => {
    typeKey = null;
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(viewTabs()).toEqual(['Tableau', 'Board', 'Arbre', 'Matrice']);
  });

  it('la page d’un board de projet est inchangée', async () => {
    app('/p/ARI/board/~BUG');
    expect(await screen.findByRole('heading', { level: 1, name: 'Anomalies' })).toBeInTheDocument();
  });

  it('n’a aucune violation d’accessibilité', async () => {
    const { container } = app('/p/ARI/t/BUG/board');
    await screen.findByRole('region', { name: 'Ouvert' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('panneau de détail scindé', () => {
  const panel = () => screen.getByRole('complementary', { name: 'Détail du ticket' });

  it('un clic sur un ticket ouvre sa fiche à droite sans quitter la liste, l’adresse reste partageable', async () => {
    app('/p/ARI/t/BUG/tableau');
    await userEvent.click(await screen.findByRole('link', { name: 'ARI-BUG-0002' }));
    expect(await screen.findByRole('complementary', { name: 'Détail du ticket' })).toBeInTheDocument();
    expect(await within(panel()).findByRole('heading', { level: 2, name: /ARI-BUG-0002 · Titre de ARI-BUG-0002/ })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau?i=ARI-BUG-0002');
    expect(screen.getByRole('link', { name: 'ARI-BUG-0003' })).toBeInTheDocument(); // la liste reste affichée
    expect(screen.getByRole('link', { name: 'ARI-BUG-0002' })).toHaveAttribute('aria-current', 'true');
    expect(await within(panel()).findByLabelText('Titre (obligatoire)')).toBeInTheDocument(); // édition en place, comme la fiche complète
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('s’ouvre directement depuis l’adresse (?i=)', async () => {
    app('/p/ARI/t/BUG/tableau?i=ARI-BUG-0004');
    expect(await within(await screen.findByRole('complementary', { name: 'Détail du ticket' })).findByRole('heading', { level: 2, name: /ARI-BUG-0004/ })).toBeInTheDocument();
  });

  it('J / K passent au ticket suivant / précédent, sans sortir de la liste', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.keyboard('j');
    await within(await screen.findByRole('complementary', { name: 'Détail du ticket' })).findByRole('heading', { level: 2, name: /ARI-BUG-0001/ });
    await userEvent.keyboard('j');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('i=ARI-BUG-0002'));
    await userEvent.keyboard('jj');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('i=ARI-BUG-0004'));
    await userEvent.keyboard('k');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('i=ARI-BUG-0003'));
    // aux extrémités, la sélection reste sur le premier / dernier item
    await userEvent.keyboard('kkkkk');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('i=ARI-BUG-0001'));
  });

  it('T-0112 : l’onglet de la fiche cohabite avec ?i=, reste d’un ticket à l’autre (J) et disparaît à la fermeture', async () => {
    app('/p/ARI/t/BUG/tableau?i=ARI-BUG-0001&onglet=history');
    const side = await screen.findByRole('complementary', { name: 'Détail du ticket' });
    expect(await within(side).findByRole('tab', { name: 'Historique', selected: true })).toBeInTheDocument();
    await userEvent.keyboard('j');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('i=ARI-BUG-0002'));
    expect(screen.getByTestId('where')).toHaveTextContent('onglet=history');
    expect(await within(panel()).findByRole('tab', { name: 'Historique', selected: true })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('i='));
    expect(screen.getByTestId('where')).not.toHaveTextContent('onglet=');
  });

  it('J / K sont ignorés pendant la saisie dans un champ', async () => {
    app('/p/ARI/t/BUG/tableau?i=ARI-BUG-0001');
    const title = await within(await screen.findByRole('complementary', { name: 'Détail du ticket' })).findByLabelText('Titre (obligatoire)');
    await userEvent.click(title);
    await userEvent.keyboard('jk');
    expect(screen.getByTestId('where')).toHaveTextContent('i=ARI-BUG-0001');
    expect(title).toHaveValue('Titre de ARI-BUG-0001jk');
  });

  it('Échap ferme le panneau et rend le focus à la ligne', async () => {
    app('/p/ARI/t/BUG/tableau?i=ARI-BUG-0002');
    await screen.findByRole('complementary', { name: 'Détail du ticket' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Détail du ticket' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('link', { name: 'ARI-BUG-0002' })).toHaveFocus());
    expect(screen.getByTestId('where')).not.toHaveTextContent('i=');
  });

  it('le bouton Fermer ferme le panneau ; Agrandir ouvre la fiche complète', async () => {
    app('/p/ARI/t/BUG/tableau?i=ARI-BUG-0003');
    await within(await screen.findByRole('complementary', { name: 'Détail du ticket' })).findByRole('heading', { level: 2 });
    await userEvent.click(within(panel()).getByRole('button', { name: 'Agrandir' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/a/ARI-BUG-0003'));
    expect(await screen.findByRole('heading', { level: 1, name: /ARI-BUG-0003/ })).toBeInTheDocument();
  });

  it('T-0113 : la fiche agrandie revient à la liste d’origine (filtres et panneau) et parcourt ses tickets', async () => {
    app('/p/ARI/t/BUG/tableau?f=x&i=ARI-BUG-0003');
    await within(await screen.findByRole('complementary', { name: 'Détail du ticket' })).findByRole('heading', { level: 2 });
    await userEvent.click(within(panel()).getByRole('button', { name: 'Agrandir' }));
    const nav = await screen.findByRole('navigation', { name: 'Navigation depuis l’origine' });
    expect(within(nav).getByText(/^3 \/ \d+$/)).toBeInTheDocument();
    await userEvent.click(within(nav).getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByRole('heading', { level: 1, name: /ARI-BUG-0004/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /^Retour : / }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/t/BUG/tableau?f=x&i=ARI-BUG-0003'));
  });

  it('Fermer retire ?i= de l’adresse', async () => {
    app('/p/ARI/t/BUG/tableau?i=ARI-BUG-0003');
    await within(await screen.findByRole('complementary', { name: 'Détail du ticket' })).findByRole('heading', { level: 2 });
    await userEvent.click(within(panel()).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Détail du ticket' })).not.toBeInTheDocument());
    expect(screen.getByTestId('where')).not.toHaveTextContent('i=');
  });

  it('n’a aucune violation d’accessibilité avec le panneau ouvert', async () => {
    const { container } = app('/p/ARI/t/BUG/tableau?i=ARI-BUG-0001');
    await within(await screen.findByRole('complementary', { name: 'Détail du ticket' })).findByLabelText('Titre (obligatoire)');
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });
});

describe('colonnes et épinglage des vues', () => {
  const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent!.replace(/[▲▼↕]/g, '').trim());

  it('affiche les colonnes par défaut, permet d’ajouter un champ du tracker et de le trier', async () => {
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(headers()).toEqual(['Clé', 'Titre', 'Statut', 'Mis à jour']);
    await userEvent.click(screen.getByRole('button', { name: 'Colonnes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sévérité' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Statut' })); // retire une colonne
    await waitFor(() => expect(headers()).toEqual(['Clé', 'Titre', 'Mis à jour', 'Sévérité']));
    expect(decodeURIComponent(screen.getByTestId('where').textContent!)).toContain('cols=title,updated,f:severity');
    expect(screen.getAllByText('majeure').length).toBeGreaterThanOrEqual(25);
    await userEvent.click(screen.getByRole('columnheader', { name: /Sévérité/ }));
    await waitFor(() => expect(lastSearch()).toContain('ORDER BY severity asc'));
  });

  it('rouvre les colonnes depuis l’adresse et revient au choix par défaut sans paramètre', async () => {
    app('/p/ARI/t/BUG/tableau?cols=title%2Cf%3Aseverity');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(headers()).toEqual(['Clé', 'Titre', 'Sévérité']);
    await userEvent.click(screen.getByRole('button', { name: 'Colonnes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sévérité' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Statut' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mis à jour' }));
    await waitFor(() => expect(headers()).toEqual(['Clé', 'Titre', 'Statut', 'Mis à jour']));
    expect(screen.getByTestId('where')).not.toHaveTextContent('cols=');
  });

  it('enregistre les colonnes avec la vue et les restitue à l’application de la vue', async () => {
    views = [view('v9', 'Avec sévérité', 'status = open', { columns: ['title', 'f:severity'] })];
    app('/p/ARI/t/BUG/tableau');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.selectOptions(await screen.findByLabelText('Vues enregistrées'), 'v9');
    await waitFor(() => expect(headers()).toEqual(['Clé', 'Titre', 'Sévérité']));
    expect(decodeURIComponent(screen.getByTestId('where').textContent!)).toContain('cols=title,f:severity');
  });

  it('une vue modifiée seulement par ses colonnes peut être enregistrée avec elles', async () => {
    app('/p/ARI/t/BUG/tableau?cols=title%2Cf%3Aseverity');
    await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la vue' }));
    await userEvent.type(screen.getByLabelText('Nom de la vue'), 'Titres et sévérités');
    await userEvent.click(screen.getAllByRole('button', { name: 'Enregistrer la vue' }).at(-1)!);
    await waitFor(() => expect(bodies.find((b) => b.method === 'POST' && b.url.endsWith('/filters'))?.body).toEqual({
      name: 'Titres et sévérités', query: '', trackerKey: 'BUG', shared: false, columns: ['title', 'f:severity'],
    }));
  });

  it('épingle la vue enregistrée active dans les favoris du rail', async () => {
    views = [view('v1', 'Bloquants', 'status = open', { shared: true })];
    app('/p/ARI/t/BUG/tableau?f=status%20%3D%20open');
    await waitFor(() => expect(screen.getByLabelText('Vues enregistrées')).toHaveValue('v1'));
    const bar = screen.getByLabelText('Vues enregistrées').closest('.ath-toolbar') as HTMLElement;
    await userEvent.click(within(bar).getByRole('button', { name: 'Épingler' }));
    await waitFor(() => expect(bodies.find((b) => b.url.endsWith('/favorite'))?.body).toEqual({ kind: 'view', project: 'ARI', ref: 'BUG:v1', label: 'Bloquants', favorite: true }));
  });
});
