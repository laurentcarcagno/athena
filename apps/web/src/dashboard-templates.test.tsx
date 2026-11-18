import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './components/Dashboard';
import { DashboardTemplatesAdmin } from './components/DashboardTemplatesAdmin';

// Lot 27 (ADR-0010) : « Partir d'un gabarit » dans Organiser (T-0262) et administration des gabarits de tableaux de bord (T-0259 à T-0261).

let calls: Array<{ method: string; url: string; body: unknown }>;
let routes: Array<[RegExp, (method: string, body: unknown, url: string) => unknown]>;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const hit = routes.find(([re]) => re.test(`${method} ${url}`));
    if (!hit) return json({}, 404);
    const out = hit[1](method, body, url);
    return out === null ? new Response(null, { status: 204 }) : json(out);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const wrap = (ui: JSX.Element) => <ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider>;

describe('« Partir d’un gabarit » dans Organiser', () => {
  const proposal = [
    { key: 'home-contributeur', name: 'Contributeur', description: 'Ce que je dois faire.', builtin: true, natures: [], projectRoles: [], tabs: [{ name: 'Aujourd’hui', widgets: [] }, { name: 'À prendre', widgets: [] }] },
    { key: 'home-essentiel', name: 'Essentiel', description: '', builtin: true, natures: [], projectRoles: [], tabs: [{ name: 'Mon travail', widgets: [] }] },
  ];
  const base = () => {
    routes.push([/^GET \/v1\/me\/dashboard\/tabs/, () => ({ tabs: [{ id: '', title: null }] })]);
    routes.push([/^GET \/v1\/me\/dashboard\/catalog/, () => ({ kinds: [] })]);
    routes.push([/^GET \/v1\/searches/, () => []]);
    routes.push([/^GET \/v1\/me\/dashboard\/templates/, () => ({ templates: proposal })]);
    routes.push([/^GET \/v1\/me\/dashboard($|\?)/, () => ({ widgets: [], isDefault: true })]);
  };

  it('le bouton n’existe qu’en mode Organiser ; la liste montre les gabarits proposés avec leurs onglets', async () => {
    base();
    render(wrap(<Dashboard />));
    await screen.findByRole('button', { name: 'Organiser' });
    expect(screen.queryByRole('button', { name: 'Partir d’un gabarit' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Organiser' }));
    await user.click(await screen.findByRole('button', { name: 'Partir d’un gabarit' }));
    expect(await screen.findByText('Contributeur')).toBeInTheDocument();
    expect(screen.getByText('2 onglets : Aujourd’hui, À prendre')).toBeInTheDocument();
    expect(screen.getByText('1 onglet : Mon travail')).toBeInTheDocument();
  });

  it('« Ajouter » copie les onglets sans confirmation, quitte le brouillon et recharge les onglets', async () => {
    base();
    routes.push([/^POST \/v1\/me\/dashboard\/templates\/home-contributeur\/apply/, () => ({ mode: 'add', tabs: [{ id: 'aujourd-hui', title: 'Aujourd’hui' }, { id: 'a-prendre', title: 'À prendre' }], truncated: 0 })]);
    render(wrap(<Dashboard />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Organiser' }));
    await user.click(await screen.findByRole('button', { name: 'Partir d’un gabarit' }));
    await user.click(await screen.findByRole('button', { name: 'Ajouter les onglets de Contributeur' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ mode: 'add' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Organiser' })).toBeInTheDocument()); // brouillon quitté
    expect(await screen.findByText('2 onglets ajoutés.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'GET' && c.url.startsWith('/v1/me/dashboard/tabs')).length).toBeGreaterThan(1); // les onglets sont relus
  });

  it('« Remplacer » demande confirmation ; refuser n’appelle rien', async () => {
    base();
    routes.push([/^POST \/v1\/me\/dashboard\/templates\/home-essentiel\/apply/, () => ({ mode: 'replace', tabs: [{ id: '', title: 'Mon travail' }], truncated: 0 })]);
    render(wrap(<Dashboard />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Organiser' }));
    await user.click(await screen.findByRole('button', { name: 'Partir d’un gabarit' }));
    await user.click(await screen.findByRole('button', { name: 'Remplacer mon tableau de bord par Essentiel' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Remplacer votre tableau de bord par « Essentiel »/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Remplacer mon tableau de bord par Essentiel' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remplacer mon tableau de bord' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ mode: 'replace' }));
    expect(await screen.findByText('Tableau de bord remplacé.')).toBeInTheDocument();
  });

  it('aucun gabarit proposé : un message le dit', async () => {
    base();
    routes.unshift([/^GET \/v1\/me\/dashboard\/templates/, () => ({ templates: [] })]);
    render(wrap(<Dashboard />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Organiser' }));
    await user.click(await screen.findByRole('button', { name: 'Partir d’un gabarit' }));
    expect(await screen.findByText('Aucun gabarit n’est proposé pour ce tableau de bord.')).toBeInTheDocument();
  });

  it('le sélecteur de portée est transmis à l’API (projet : ?project=)', async () => {
    base();
    render(wrap(<Dashboard project="LUMEN" />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Organiser' }));
    await user.click(await screen.findByRole('button', { name: 'Partir d’un gabarit' }));
    await screen.findByText('Contributeur');
    expect(calls.some((c) => c.url === '/v1/me/dashboard/templates?project=LUMEN')).toBe(true);
  });
});

describe('administration des gabarits', () => {
  const builtin = { key: 'home-pmo', type: 'home', name: 'PMO', description: 'Les portefeuilles.', roles: ['athena-pmo'], natures: [], projectRoles: [], tabs: [{ name: 'Portefeuilles', widgets: [{ id: 'portfolio-tiles-1', kind: 'portfolio-tiles', repeat: 'portfolio' }] }], builtin: true, hidden: false, derivedFrom: null };
  const revues = { key: 'project-revues-ecss', type: 'project', name: 'Revues ECSS', description: '', roles: ['athena-pm'], natures: ['space-software'], projectRoles: [], tabs: [{ name: 'Revues', widgets: [] }], builtin: true, hidden: false, derivedFrom: null };
  const mine = { key: 'tmon-gabarit', type: 'home', name: 'Mon gabarit', description: '', roles: ['athena-qa'], natures: [], projectRoles: [], tabs: [{ name: 'Visas', widgets: [{ id: 'approvals-1', kind: 'approvals' }] }], builtin: false, hidden: false, derivedFrom: 'home-essentiel' };
  let defaults: Array<{ type: string; role: string; templateKey: string }>;
  const list = () => ({ templates: [builtin, revues, mine], defaults });
  const setup = () => {
    defaults = [];
    routes.push([/^GET \/v1\/dashboard-templates$/, list]);
    routes.push([/^GET \/v1\/dashboard-templates\/catalog/, () => ({ kinds: [{ kind: 'approvals', project: false, size: 'S' }, { kind: 'mentions', project: false, size: 'S' }, { kind: 'health', project: true, size: 'M' }] })]);
    routes.push([/^GET \/v1\/searches/, () => []]);
  };

  it('liste les gabarits livrés et d’organisation, avec leur cible, et se filtre par type et par rôle', async () => {
    setup();
    render(wrap(<DashboardTemplatesAdmin />));
    const table = await screen.findByRole('table', { name: '3 gabarits de tableau de bord' });
    expect(within(table).getAllByText('PMO').length).toBeGreaterThan(0);
    expect(within(table).getByText('Logiciel spatial')).toBeInTheDocument(); // cible du gabarit Revues ECSS
    expect(within(table).getByText(/copie de/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Filtrer par type'), 'project');
    expect(screen.getByRole('table', { name: '1 gabarit de tableau de bord' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrer par type'), '');
    await user.selectOptions(screen.getByLabelText('Filtrer par rôle'), 'athena-qa');
    expect(screen.getByRole('table', { name: '1 gabarit de tableau de bord' })).toHaveTextContent('Mon gabarit');
  });

  it('un gabarit livré ne se modifie pas : il se masque, se duplique ; un gabarit d’organisation se modifie et se supprime', async () => {
    setup();
    routes.push([/^PUT \/v1\/dashboard-templates\/home-pmo\/hidden/, (_m, body) => ({ ...builtin, hidden: (body as { hidden: boolean }).hidden })]);
    routes.push([/^POST \/v1\/dashboard-templates\/home-pmo\/duplicate/, () => ({ ...builtin, key: 'tpmo-copie', builtin: false })]);
    routes.push([/^DELETE \/v1\/dashboard-templates\/tmon-gabarit/, () => null]);
    render(wrap(<DashboardTemplatesAdmin />));
    await screen.findByRole('table', { name: '3 gabarits de tableau de bord' });
    expect(screen.queryByRole('button', { name: 'Modifier PMO' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier Mon gabarit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Masquer Mon gabarit' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Masquer PMO' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/v1/dashboard-templates/home-pmo/hidden')?.body).toEqual({ hidden: true }));
    await user.click(screen.getByRole('button', { name: 'Dupliquer PMO' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/v1/dashboard-templates/home-pmo/duplicate')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Supprimer Mon gabarit' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/v1/dashboard-templates/tmon-gabarit')).toBe(true));
  });

  it('gabarit par défaut : on choisit un rôle du gabarit, on le définit, on le retire', async () => {
    setup();
    routes.push([/^PUT \/v1\/dashboard-templates\/defaults\/home\/athena-pmo/, (_m, body) => { defaults = [{ type: 'home', role: 'athena-pmo', templateKey: (body as { template: string }).template }]; return { defaults }; }]);
    routes.push([/^DELETE \/v1\/dashboard-templates\/defaults\/home\/athena-pmo/, () => { defaults = []; return null; }]);
    render(wrap(<DashboardTemplatesAdmin />));
    await screen.findByRole('table', { name: '3 gabarits de tableau de bord' });
    expect(screen.getByText(/Aucun gabarit par défaut/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Par défaut pour… PMO' }));
    await user.click(await screen.findByRole('button', { name: 'Définir par défaut' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT' && c.url.includes('/defaults/'))?.body).toEqual({ template: 'home-pmo' }));
    expect(await screen.findByText('Mon travail, PMO : PMO')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer le gabarit par défaut Mon travail, PMO' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/defaults/home/athena-pmo'))).toBe(true));
    expect(await screen.findByText(/Aucun gabarit par défaut/)).toBeInTheDocument();
  });

  it('créer : nom, rôles, onglets, cartes du catalogue ; les cartes se règlent « une par projet » ; l’enregistrement envoie le gabarit', async () => {
    setup();
    routes.push([/^POST \/v1\/dashboard-templates$/, (_m, body) => ({ ...(body as object), key: 'tnouveau', builtin: false, hidden: false, derivedFrom: null })]);
    render(wrap(<DashboardTemplatesAdmin />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nouveau gabarit' }));
    expect(await screen.findByText(/Choisissez d’abord les rôles visés/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer le gabarit' })).toBeDisabled();
    await user.type(screen.getByLabelText('Nom'), 'Équipe qualité');
    await user.click(screen.getByRole('checkbox', { name: 'Assurance qualité' }));
    await user.click(await screen.findByRole('button', { name: 'Ajouter À approuver' }));
    expect(screen.getByRole('group', { name: 'À approuver' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nouvel onglet'), 'Visas');
    await user.click(screen.getByRole('button', { name: 'Ajouter l’onglet' }));
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Principal', 'Visas']);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le gabarit' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/v1/dashboard-templates')).toBeTruthy());
    const sent = calls.find((c) => c.method === 'POST' && c.url === '/v1/dashboard-templates')!.body as { name: string; roles: string[]; type: string; tabs: Array<{ name: string; widgets: unknown[] }> };
    expect(sent).toMatchObject({ name: 'Équipe qualité', type: 'home', roles: ['athena-qa'] });
    expect(sent.tabs.map((x) => x.name)).toEqual(['Principal', 'Visas']);
    expect(sent.tabs[0]!.widgets.length).toBe(1);
  });

  it('modifier un gabarit d’organisation : ses onglets et cartes sont rechargés ; le type ne change pas ; un onglet se renomme et se déplace', async () => {
    setup();
    routes.push([/^PUT \/v1\/dashboard-templates\/tmon-gabarit/, (_m, body) => ({ ...mine, ...(body as object) })]);
    render(wrap(<DashboardTemplatesAdmin />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Modifier Mon gabarit' }));
    expect(await screen.findByRole('heading', { name: 'Modification de « Mon gabarit »' })).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Visas' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Nom de l’onglet courant'));
    await user.type(screen.getByLabelText('Nom de l’onglet courant'), 'Accords');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le gabarit' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT' && c.url === '/v1/dashboard-templates/tmon-gabarit')?.body).toMatchObject({ tabs: [{ name: 'Accords' }] }));
  });

  it('les natures et le rôle dans le projet ne s’affichent que pour un tableau de bord de projet ou d’avancement', async () => {
    setup();
    render(wrap(<DashboardTemplatesAdmin />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nouveau gabarit' }));
    expect(screen.queryByText('Natures de projet')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type'), 'project');
    expect(screen.getByText('Natures de projet')).toBeInTheDocument();
    expect(screen.getByText('Rôle dans le projet')).toBeInTheDocument();
  });

  it('l’aperçu résout le gabarit sur un projet choisi, sans rien enregistrer', async () => {
    setup();
    routes.push([/^GET \/v1\/projects$/, () => [{ key: 'LUMEN' }, { key: 'SAT1' }]]);
    routes.push([/^POST \/v1\/dashboard-templates\/project-revues-ecss\/preview/, (_m, body) => ({ scope: (body as { project: string }).project, tabs: [{ name: 'Revues', widgets: [] }] })]);
    render(wrap(<DashboardTemplatesAdmin />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aperçu Revues ECSS' }));
    expect(screen.getByRole('button', { name: 'Afficher l’aperçu' })).toBeDisabled();
    await user.selectOptions(await screen.findByLabelText('Projet'), 'LUMEN');
    await user.click(screen.getByRole('button', { name: 'Afficher l’aperçu' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/preview'))?.body).toEqual({ project: 'LUMEN' }));
    expect(await screen.findByText('Aucune carte dans cet onglet pour ce périmètre.')).toBeInTheDocument();
    expect(calls.some((c) => ['PUT', 'DELETE'].includes(c.method))).toBe(false);
  });

  it('la page n’a pas de défaut d’accessibilité (liste et éditeur)', async () => {
    setup();
    const { container } = render(wrap(<DashboardTemplatesAdmin />));
    const user = userEvent.setup();
    await screen.findByRole('table', { name: '3 gabarits de tableau de bord' });
    await user.click(screen.getByRole('button', { name: 'Modifier Mon gabarit' }));
    await screen.findByRole('heading', { name: 'Modification de « Mon gabarit »' });
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' ; ')}`)).toEqual([]);
  });
});
