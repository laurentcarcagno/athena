import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { CommandPalette } from './components/CommandPalette';
import { CreateArtifact, coerce } from './components/CreateArtifact';
import { fr, getLocale, setLocale } from './i18n';
import { AdminPage } from './pages/AdminPage';
import { ArtifactPage } from './pages/ArtifactPage';
import { DashboardPage } from './pages/DashboardPage';
import { TrackerConfigPage } from './pages/TrackerConfigPage';

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
afterEach(() => { vi.unstubAllGlobals(); setLocale('fr'); });

const on = (method: string, path: RegExp | string, reply: Reply): Handler => (url, m) => (m === method && (typeof path === 'string' ? url === path : path.test(url)) ? reply : undefined);
const wrap = (path: string, element: JSX.Element, pattern: string) => render(
  <ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /></Routes></MemoryRouter></ToastProvider>,
);
const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-user'], groups: [] } };
const simple: Session = { authenticated: true, user: { username: 'b', name: 'Bob', email: null, roles: ['athena-user'], groups: [] } };

describe('langue', () => {
  it('bascule entre français et anglais et mémorise le choix', () => {
    expect(fr.list.create).toBe('Nouvel artefact');
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(fr.list.create).toBe('New artifact');
    expect(fr.artifact.transitioned('Start')).toBe('Transition "Start" applied.');
    expect(window.localStorage.getItem('athena.locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
  it('fournit les mêmes clés dans les deux langues', () => {
    const keys = (o: unknown, prefix = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    const snapshot = (locale: 'fr' | 'en') => { setLocale(locale); return keys(JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(fr).map((k) => [k, (fr as unknown as Record<string, unknown>)[k]]))))).sort(); };
    expect(snapshot('en')).toEqual(snapshot('fr'));
  });
});

describe('tableau de bord', () => {
  it('compose indicateurs, flux, vélocité et roadmap sans style en ligne', async () => {
    handlers = [
      on('GET', '/v1/projects/ARI/dashboard', { body: { byCategory: { todo: 3, in_progress: 2, done: 7 }, byTracker: [{ tracker: 'BUG', total: 12, open: 5 }], distribution: null, recent: [{ key: 'BUG-1', at: '2026-10-31T10:00:00.000Z' }] } }),
      on('GET', '/v1/projects/ARI/velocity', { body: { sprints: [{ sprint: 'S1', committed: 8, completed: 5 }], average: 5, forecast: 5 } }),
      on('GET', /\/flow\?days=7/, { body: [{ date: '2026-10-30', todo: 4, in_progress: 2, done: 6 }, { date: '2026-10-31', todo: 3, in_progress: 2, done: 7 }] }),
      on('GET', '/v1/projects/ARI/roadmap', { body: [{ id: 'r1', name: '1.0', startsOn: '2026-10-01', endsOn: '2026-11-01', state: 'planned', items: 4, doneItems: 2, progress: 0.5 }] }),
    ];
    const { container } = wrap('/p/ARI/dashboard', <DashboardPage />, '/p/:project/dashboard');
    expect(await screen.findByText('5')).toHaveClass('ath-stat__value'); // ouverts = à faire + en cours
    expect(screen.getByText('12 total')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1.0 : 50' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'S1 Terminé : 5' })).toBeInTheDocument();
    expect(screen.getByText(/Prévision du prochain sprint : 5 points/)).toBeInTheDocument();
    expect(container.querySelectorAll('.ath-corner')).toHaveLength(1); // un seul réticule par page
    expect(container.querySelectorAll('[style]')).toHaveLength(0); // compatible CSP sans styles en ligne
  });
});

describe('création d’artefact', () => {
  const definition = { key: 'BUG', name: 'Bugs', statuses: [], transitions: [], fields: [
    { id: '1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: '2', key: 'points', label: 'Points', type: 'number', config: {}, required: false, semanticRole: null },
    { id: '3', key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure'] }, required: true, semanticRole: null },
  ] };
  it('génère le formulaire depuis le tracker et envoie des valeurs typées', async () => {
    handlers = [
      on('GET', '/v1/projects/ARI/trackers/BUG', { body: definition }),
      on('POST', '/v1/projects/ARI/trackers/BUG/artifacts', { status: 201, body: { id: 'x', key: 'BUG-7', trackerKey: 'BUG', status: 'open', version: 1, values: {} } }),
    ];
    const onCreated = vi.fn();
    render(<ToastProvider><MemoryRouter><CreateArtifact project="ARI" trackers={['BUG']} open onClose={() => undefined} onCreated={onCreated} /></MemoryRouter></ToastProvider>);
    await userEvent.type(await screen.findByLabelText('Titre (obligatoire)'), 'Crash');
    await userEvent.type(screen.getByLabelText('Points'), '8');
    await userEvent.selectOptions(screen.getByLabelText('Sévérité (obligatoire)'), 'majeure');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('BUG-7'));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ values: { title: 'Crash', points: 8, severity: 'majeure' } });
  });
  it('affiche les erreurs de validation du serveur et convertit les saisies', async () => {
    handlers = [
      on('GET', '/v1/projects/ARI/trackers/BUG', { body: definition }),
      on('POST', /artifacts$/, { status: 422, body: { error: 'validation', message: 'Données invalides.', details: ['title : obligatoire'] } }),
    ];
    render(<ToastProvider><MemoryRouter><CreateArtifact project="ARI" trackers={['BUG']} open onClose={() => undefined} onCreated={() => undefined} /></MemoryRouter></ToastProvider>);
    await screen.findByLabelText('Titre (obligatoire)');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByText(/title : obligatoire/)).toBeInTheDocument();
    const f = (type: string) => ({ id: '', key: 'k', label: '', type, config: {}, required: false, semanticRole: null });
    expect(coerce(f('number'), '3')).toBe(3);
    expect(coerce(f('text'), '  ')).toBeUndefined();
    expect(coerce(f('multiselect'), 'a, b')).toEqual(['a', 'b']);
  });
});

describe('éditeur de tracker', () => {
  const def = { key: 'BUG', name: 'Bugs', fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
    statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }, { id: 's2', key: 'done', name: 'Fini', category: 'done' }],
    transitions: [{ id: 't', name: 'Terminer', fromStatusId: 's1', toStatusId: 's2' }] };
  const base = () => [on('GET', '/v1/projects/ARI/trackers/BUG', { body: def }), on('GET', '/v1/field-types', { body: ['text', 'number', 'select'] })];

  it('ajoute un champ, un statut et une transition (administrateur)', async () => {
    handlers = [...base(), on('POST', /\/fields$/, { status: 201, body: {} }), on('POST', /\/statuses$/, { status: 201, body: {} }), on('POST', /\/transitions$/, { status: 201, body: {} })];
    wrap('/p/ARI/trackers/BUG/config', <TrackerConfigPage session={admin} />, '/p/:project/trackers/:tracker/config');
    expect(await screen.findByRole('heading', { level: 1, name: /Configuration du tracker · BUG/ })).toBeInTheDocument();
    const fields = screen.getByRole('heading', { name: 'Champs' }).closest('section')!;
    await userEvent.type(within(fields).getByLabelText('Clé'), 'environment');
    await userEvent.type(within(fields).getByLabelText('Libellé'), 'Environnement');
    await userEvent.selectOptions(within(fields).getByLabelText('Type'), 'select');
    await userEvent.click(within(fields).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/fields'))?.body).toEqual({ key: 'environment', label: 'Environnement', type: 'select', required: false }));

    const transitions = screen.getByRole('heading', { name: 'Transitions' }).closest('section')!;
    await userEvent.type(within(transitions).getByLabelText('Nom'), 'Rouvrir');
    await userEvent.selectOptions(within(transitions).getByLabelText('Vers'), 'open');
    await userEvent.click(within(transitions).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/transitions'))?.body).toEqual({ name: 'Rouvrir', from: null, to: 'open' }));
  });
  it('masque les formulaires aux non-administrateurs', async () => {
    handlers = base();
    wrap('/p/ARI/trackers/BUG/config', <TrackerConfigPage session={simple} />, '/p/:project/trackers/:tracker/config');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(screen.getByText('Réservé aux administrateurs.')).toBeInTheDocument();
  });
});

describe('administration', () => {
  it('crée un webhook et n’affiche le secret qu’une fois', async () => {
    handlers = [
      on('GET', '/v1/webhooks', { body: [] }),
      on('POST', '/v1/webhooks', { status: 201, body: { secret: 'whsec_abc123', endpoint: { id: '1' } } }),
    ];
    wrap('/p/ARI/admin', <AdminPage />, '/p/:project/admin');
    await userEvent.type(await screen.findByLabelText('URL HTTPS'), 'https://exemple.org/hook');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByText('whsec_abc123')).toHaveClass('ath-mono');
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ url: 'https://exemple.org/hook', eventTypes: ['artifact.*'] });
  });
  it('active et désactive une automatisation, liste plugins et baselines', async () => {
    handlers = [
      on('GET', '/v1/projects/ARI/automations', { body: [{ id: 'r1', name: 'Escalade', enabled: true, trigger: 'artifact.created', condition: 'severity = bloquante' }] }),
      on('POST', '/v1/automations/r1/disable', { status: 204 }),
      on('GET', '/v1/plugins', { body: [{ id: 'com.acme.x', name: 'Couleurs', version: '1.0.0', enabled: true, permissions: ['storage'] }] }),
      on('GET', '/v1/projects/ARI/baselines', { body: [{ name: 'v1.0', gitSha: 'abcdef1234567890', createdAt: '2026-10-31T10:00:00.000Z' }] }),
    ];
    wrap('/p/ARI/admin', <AdminPage />, '/p/:project/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'Automatisations' }));
    expect(await screen.findByText('severity = bloquante')).toHaveClass('ath-mono');
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/v1/automations/r1/disable')).toBe(true));
    await userEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    expect(await screen.findByText('com.acme.x')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Baselines' }));
    expect(await screen.findByText('abcdef12')).toHaveClass('ath-mono');
  });
});

describe('palette de commandes', () => {
  function Where() { return <span data-testid="where">{useLocation().pathname}</span>; }
  const mount = () => render(
    <ToastProvider><MemoryRouter initialEntries={['/p/ARI']}><CommandPalette project="ARI" /><Where /></MemoryRouter></ToastProvider>,
  );
  const open = async () => { await userEvent.keyboard('{Control>}k{/Control}'); return screen.findByRole('combobox'); };

  it('s’ouvre avec Ctrl+K et navigue au clavier', async () => {
    handlers = [on('GET', '/v1/projects', { body: [{ key: 'ARI', name: 'Ariane' }, { key: 'HAK', name: 'Hakuna' }] })];
    mount();
    const input = await open();
    await userEvent.type(input, 'tableau');
    expect(screen.getByRole('option', { name: /Tableau de bord · ARI/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/dashboard');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it('cherche des artefacts du projet et ouvre celui qui est sélectionné', async () => {
    handlers = [
      on('GET', '/v1/projects', { body: [{ key: 'ARI', name: 'Ariane' }] }),
      on('GET', /\/search\?/, { body: { total: 1, hits: [{ key: 'BUG-12', tracker: 'BUG', status: 'open', category: 'todo', version: 1, updatedAt: '', values: { title: 'Crash au démarrage' } }] } }),
    ];
    mount();
    await userEvent.type(await open(), 'crash');
    const option = await screen.findByRole('option', { name: /BUG-12/ });
    expect(within(option).getByText('BUG-12')).toHaveClass('ath-mono');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.click(option);
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ARI/a/BUG-12');
    expect(decodeURIComponent(calls.find((c) => c.url.includes('/search'))!.url)).toContain('key ~ "crash" OR title ~ "crash"');
  });
  it('échappe les guillemets de la saisie et se ferme avec Échap', async () => {
    handlers = [on('GET', '/v1/projects', { body: [] }), on('GET', /\/search\?/, { body: { total: 0, hits: [] } })];
    mount();
    await userEvent.type(await open(), 'a"b');
    await waitFor(() => expect(calls.some((c) => c.url.includes('/search'))).toBe(true));
    expect(decodeURIComponent(calls.find((c) => c.url.includes('/search'))!.url)).not.toContain('"a"b"');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('restauration depuis l’historique', () => {
  it('restaure une révision antérieure', async () => {
    const def = { key: 'BUG', name: 'Bugs', fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }], statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [] };
    handlers = [
      on('GET', '/v1/projects/ARI/artifacts/BUG-1', { body: { id: 'a', key: 'BUG-1', trackerKey: 'BUG', status: 'open', version: 3, values: { title: 'Version C' } } }),
      on('GET', '/v1/projects/ARI/trackers/BUG', { body: def }),
      on('GET', /\/links$/, { body: [] }), on('GET', /\/doc-links$/, { body: [] }), on('GET', /\/comments$/, { body: [] }), on('GET', /\/code-refs$/, { body: [] }),
      on('GET', /\/history$/, { body: [{ version: 3, actor: 'A', at: '2026-10-31T10:00:00.000Z', gitSha: null, diff: {} }, { version: 1, actor: 'A', at: '2026-10-30T10:00:00.000Z', gitSha: null, diff: {} }] }),
      on('POST', /\/restore$/, { body: { id: 'a', key: 'BUG-1', trackerKey: 'BUG', status: 'open', version: 4, values: { title: 'Version A' } } }),
    ];
    wrap('/p/ARI/a/BUG-1', <ArtifactPage session={simple} />, '/p/:project/a/:key');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('tab', { name: 'Historique' }));
    const buttons = screen.getAllByRole('button', { name: 'Restaurer' });
    expect(buttons).toHaveLength(1); // pas de restauration de la révision courante
    await userEvent.click(buttons[0]!);
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/restore'))?.body).toEqual({ version: 1, expectedVersion: 3 }));
    expect(await screen.findByText('Révision 1 restaurée.')).toBeInTheDocument();
  });
});

describe('pièces jointes', () => {
  it('formate les tailles', async () => {
    const { formatSize } = await import('./pages/ArtifactPage');
    expect(formatSize(512)).toBe('512 o');
    expect(formatSize(2048)).toBe('2.0 Ko');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 Mo');
  });
});

describe('champs : rôles et suppression', () => {
  const def = { key: 'BUG', name: 'Bugs', fields: [
    { id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: 'g', key: 'salary', label: 'Salaire', type: 'number', config: {}, required: false, semanticRole: null, readRoles: ['hr'], writeRoles: null },
  ], statuses: [], transitions: [] };
  it('envoie les rôles saisis, affiche les rôles et propose la purge après un conflit', async () => {
    handlers = [
      on('GET', '/v1/projects/ARI/trackers/BUG', { body: def }), on('GET', '/v1/field-types', { body: ['text', 'number'] }),
      on('POST', /\/fields$/, { status: 201, body: {} }),
      (url, method) => (method === 'DELETE' && url.endsWith('/fields/salary') ? { status: 409, body: { error: 'conflict', message: 'Utilisé.', details: [] } } : undefined),
      on('DELETE', /fields\/salary\?purge=true$/, { status: 204 }),
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    wrap('/p/ARI/trackers/BUG/config', <TrackerConfigPage session={admin} />, '/p/:project/trackers/:tracker/config');
    expect(await screen.findByText('R: hr · W: Tous')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer title' })).toBeNull(); // le titre n'est pas supprimable
    const fields = screen.getByRole('heading', { name: 'Champs' }).closest('section')!;
    await userEvent.type(within(fields).getByLabelText('Clé'), 'cost');
    await userEvent.type(within(fields).getByLabelText('Libellé'), 'Coût');
    await userEvent.type(within(fields).getByLabelText('Rôles en lecture (virgules)'), 'hr, finance');
    await userEvent.click(within(fields).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/fields'))?.body).toEqual({ key: 'cost', label: 'Coût', type: 'text', required: false, readRoles: ['hr', 'finance'] }));
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer salary' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('?purge=true'))).toBe(true));
    vi.restoreAllMocks();
  });
});

describe('transitions réservées à des rôles', () => {
  const def = { key: 'BUG', name: 'Bugs', fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
    statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }, { id: 's2', key: 'done', name: 'Fini', category: 'done' }],
    transitions: [{ id: 't1', name: 'Terminer', fromStatusId: 's1', toStatusId: 's2' }, { id: 't2', name: 'Valider', fromStatusId: 's1', toStatusId: 's2', conditions: [{ type: 'role', roles: ['release'] }] }] };
  const artifact = { id: 'a', key: 'BUG-1', trackerKey: 'BUG', status: 'open', version: 1, values: { title: 'x' } };
  const routes = () => [
    on('GET', '/v1/projects/ARI/artifacts/BUG-1', { body: artifact }), on('GET', '/v1/projects/ARI/trackers/BUG', { body: def }),
    on('GET', /\/(links|doc-links|comments|history|code-refs)$/, { body: [] }),
  ];
  it('masque les transitions dont l’utilisateur n’a pas le rôle', async () => {
    handlers = routes();
    wrap('/p/ARI/a/BUG-1', <ArtifactPage session={simple} />, '/p/:project/a/:key');
    expect(await screen.findByRole('button', { name: 'Terminer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull();
  });
  it('les affiche pour le rôle requis', async () => {
    handlers = routes();
    const releaser: Session = { authenticated: true, user: { username: 'r', name: 'R', email: null, roles: ['athena-user', 'release'], groups: [] } };
    wrap('/p/ARI/a/BUG-1', <ArtifactPage session={releaser} />, '/p/:project/a/:key');
    expect(await screen.findByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });
});

describe('filtres enregistrés', () => {
  it('liste, applique, enregistre et supprime un filtre', async () => {
    const { ListPage } = await import('./pages/ListPage');
    let saved = [{ id: 'f1', name: 'Ouverts', query: 'status = open', owner: 'b', shared: false }];
    handlers = [
      on('GET', '/v1/projects/ARI/trackers', { body: [{ key: 'BUG' }] }),
      on('GET', /\/search\?/, { body: { total: 0, hits: [] } }),
      (url, m) => (m === 'GET' && url === '/v1/projects/ARI/filters' ? { body: saved } : undefined),
      (url, m) => (m === 'POST' && url === '/v1/projects/ARI/filters' ? { status: 201, body: {} } : undefined),
      (url, m) => (m === 'DELETE' && url.endsWith('/filters/f1') ? { status: 204 } : undefined),
    ];
    wrap('/p/ARI?q=severity%20%3D%20majeure', <ListPage session={simple} />, '/p/:project');
    await screen.findByRole('option', { name: 'Ouverts' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await userEvent.type(screen.getByLabelText('Nom du filtre'), 'Majeurs');
    await userEvent.click(screen.getByLabelText('Partagé'));
    await userEvent.click(within(screen.getByLabelText('Nom du filtre').closest('form')!).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/filters'))?.body).toEqual({ name: 'Majeurs', query: 'severity = majeure', shared: true }));
    await userEvent.selectOptions(screen.getByLabelText('Filtres enregistrés'), 'Ouverts');
    await waitFor(() => expect(calls.some((c) => c.url.includes('/search?q=status%20%3D%20open'))).toBe(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le filtre' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    saved = [];
  });
});

describe('couloirs du board', () => {
  const board = { key: 'kanban', name: 'Kanban', unmapped: 0, columns: [
    { name: 'À faire', wipLimit: null, count: 2, overLimit: false, cards: [
      { key: 'BUG-1', tracker: 'BUG', title: 'Crash', status: 'open', assignee: 'alice', version: 1 },
      { key: 'BUG-2', tracker: 'BUG', title: 'Lenteur', status: 'open', assignee: null, version: 1 },
    ] },
    { name: 'Fini', wipLimit: null, count: 1, overLimit: false, cards: [{ key: 'BUG-3', tracker: 'BUG', title: 'Typo', status: 'done', assignee: 'alice', version: 2 }] },
  ] };
  it('regroupe les cartes par responsable', async () => {
    const { BoardPage } = await import('./pages/BoardPage');
    handlers = [on('GET', '/v1/projects/ARI/boards/kanban', { body: board })];
    wrap('/p/ARI/board/kanban', <BoardPage />, '/p/:project/board/:board');
    await screen.findByText('Crash');
    await userEvent.selectOptions(screen.getByLabelText('Couloirs'), 'assignee');
    const alice = screen.getByRole('region', { name: 'alice' });
    expect(within(alice).getByText('Crash')).toBeInTheDocument();
    expect(within(alice).getByText('Typo')).toBeInTheDocument();
    expect(within(alice).queryByText('Lenteur')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Non assigné' })).getByText('Lenteur')).toBeInTheDocument();
  });
});

describe('Gantt des versions', () => {
  it('positionne les versions sur un axe commun et expose chaque barre au lecteur d’écran', async () => {
    const { ganttLayout } = await import('./pages/DashboardPage');
    const r = (id: string, startsOn: string, endsOn: string, progress: number) => ({ id, name: id, startsOn, endsOn, state: 'planned', items: 1, doneItems: 0, progress });
    const layout = ganttLayout([r('a', '2026-01-01', '2026-01-10', 0.5), r('b', '2026-01-11', '2026-01-20', 0), r('x', 'invalide', '2026-01-01', 0)]);
    expect(layout.map((l) => l.id)).toEqual(['a', 'b']);
    expect(layout[0]!.left).toBe(0);
    expect(layout[1]!.left).toBeCloseTo(50, 5);
    expect(layout[0]!.width + layout[1]!.width).toBeCloseTo(100, 5);
    expect(ganttLayout([])).toEqual([]);
  });
});

describe('autocomplétion ATQL', () => {
  it('suggère champs et mots-clés pour le dernier mot', async () => {
    const { suggest } = await import('./pages/ListPage');
    expect(suggest('sta', []).items).toEqual(['status']);
    expect(suggest('status = open AND sev', ['severity', 'points']).items).toEqual(['severity']);
    expect(suggest('status = open O', []).items).toEqual(['OR', 'ORDER BY']);
    expect(suggest('status = ', []).items).toEqual([]);
    expect(suggest('status', []).items).toEqual([]); // mot déjà complet
    expect(suggest('x', ['xyz']).prefix).toBe('x');
  });
  it('complète le mot en cours au clic', async () => {
    const { ListPage } = await import('./pages/ListPage');
    handlers = [
      on('GET', '/v1/projects/ARI/trackers', { body: [{ key: 'BUG' }] }),
      on('GET', '/v1/projects/ARI/trackers/BUG', { body: { key: 'BUG', name: 'Bugs', statuses: [], transitions: [], fields: [
        { id: '1', key: 'severity', label: 'Sév', type: 'select', config: {}, required: false, semanticRole: null },
        { id: '2', key: 'salary', label: 'Salaire', type: 'number', config: {}, required: false, semanticRole: null, readRoles: ['hr'] },
      ] } }),
      on('GET', /\/search\?/, { body: { total: 0, hits: [] } }),
    ];
    wrap('/p/ARI', <ListPage session={simple} />, '/p/:project');
    const input = await screen.findByLabelText('Requête ATQL');
    await userEvent.type(input, 'status = open AND s');
    expect(await screen.findByRole('option', { name: 'severity' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'salary' })).toBeNull(); // champ à lecture restreinte non suggéré
    await userEvent.click(screen.getByRole('button', { name: 'severity' }));
    expect(input).toHaveValue('status = open AND severity ');
  });
});
