import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';
import { listHref } from './pages/project/TraceabilityTab';

const calls: Array<{ method: string; url: string; body?: string }> = [];
const rule = (extra: Record<string, unknown> = {}) => ({
  key: 'req-verifiee', scope: 'organization', name: 'Exigences vérifiées', fromTracker: 'REQ', linkType: 'verifies', direction: 'any', minCount: 1, statuses: ['validated'], threshold: { target: 100, warning: 50 },
  total: 4, covered: 2, rate: 50, level: 'warning', suspect: 1, gaps: [{ key: 'ARI-REQ-0003', title: 'Exigence 3' }, { key: 'ARI-REQ-0004', title: 'Exigence 4' }],
  atql: { total: 'tracker = REQ AND status = "validated"', gaps: 'tracker = REQ AND status = "validated" AND notLinked("verifies")', suspect: 'tracker = REQ AND status = "validated" AND suspect()' }, error: null, ...extra,
});
let rules: unknown[] = [];

beforeEach(() => {
  calls.length = 0;
  rules = [rule(), rule({ key: 'deux', scope: 'project', name: 'Deux tests', minCount: 2, direction: 'in', atql: { total: 'tracker = REQ', gaps: 'tracker = REQ AND NOT linkCount("verifies", 2, "in")', suspect: 'tracker = REQ AND suspect()' }, gaps: [], covered: 4, rate: 100, level: 'ok', suspect: 0 })];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: input, body: init?.body as string | undefined });
    const ok = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
    if (/\/coverage$/.test(input)) return ok(rules);
    if (/\/coverage-rules/.test(input) && init?.method === 'POST') return ok({ key: 'nouvelle' }, 201);
    if (/\/coverage-rules\//.test(input) && init?.method === 'DELETE') return ok(null, 204);
    if (/\/coverage-rules\//.test(input) && init?.method === 'PUT') return ok({ key: 'deux' });
    if (/\/link-types$/.test(input)) return ok([{ key: 'verifies', outwardLabel: 'vérifie' }]);
    if (/\/projects\/ARI\/trackers$/.test(input)) return ok([{ key: 'REQ' }, { key: 'TST' }]);
    if (/\/modules$/.test(input)) return ok({ modules: ['overview', 'trackers', 'planning', 'traceability', 'activity', 'members'] });
    if (/\/v1\/projects$/.test(input)) return ok([]);
    return ok({ error: 'not_found', message: 'Introuvable.', details: [] }, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const user: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const admin: Session = { authenticated: true, user: { username: 'a', name: 'Ada', email: null, roles: ['athena-user', 'athena-admin'], groups: [] } };
const Where = () => <span data-testid="where">{useLocation().pathname}{useLocation().search}</span>;
const app = (session: Session) => render(<ToastProvider><MemoryRouter initialEntries={['/p/ARI/tracabilite']}><Where /><AuthenticatedApp session={session} /></MemoryRouter></ToastProvider>);

describe('onglet Traçabilité', () => {
  it('s’ouvre depuis la rubrique du projet au rail et montre taux, niveau en texte, nombres cliquables et items en défaut', async () => {
    app(user);
    const section = (await screen.findByRole('heading', { name: /Exigences vérifiées/ })).closest('section')!;
    await waitFor(() => expect(within(screen.getByRole('group', { name: /^Projet / })).getByRole('button', { name: 'Traçabilité' })).toHaveAttribute('aria-current', 'page'));
    expect(within(section).getByText('50 %')).toBeInTheDocument();
    expect(within(section).getByText('Alerte')).toBeInTheDocument();
    expect(within(section).getByText('objectif 100 %, alerte 50 %')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: '4 items visés' })).toHaveAttribute('href', `/p/ARI/t/REQ/tableau?f=${encodeURIComponent('status = "validated"')}`);
    expect(within(section).getByRole('link', { name: '2 en défaut' })).toHaveAttribute('href', `/p/ARI/t/REQ/tableau?f=${encodeURIComponent('status = "validated" AND notLinked("verifies")')}`);
    expect(within(section).getByRole('link', { name: '1 avec lien suspect' })).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'ARI-REQ-0003' })).toHaveAttribute('href', '/p/ARI/a/ARI-REQ-0003');
    expect(screen.queryByRole('button', { name: 'Ajouter une règle' })).toBeNull(); // réservé aux administrateurs
  });

  it('chaque nombre est un lien, y compris pour une règle à deux liens minimum', async () => {
    app(user);
    const section = (await screen.findByRole('heading', { name: /Deux tests/ })).closest('section')!;
    expect(within(section).getByRole('link', { name: '0 en défaut' })).toHaveAttribute('href', `/p/ARI/t/REQ/tableau?f=${encodeURIComponent('NOT linkCount("verifies", 2, "in")')}`);
  });

  it('l’administrateur modifie une règle : formulaire prérempli, clé et portée figées, PUT sur la règle', async () => {
    app(admin);
    const section = (await screen.findByRole('heading', { name: /Deux tests/ })).closest('section')!;
    await userEvent.click(within(section).getByRole('button', { name: 'Modifier' }));
    const form = screen.getByRole('form', { name: 'Modifier la règle « Deux tests »' });
    expect(within(form).getByLabelText('Clé de la règle (minuscules)')).toHaveValue('deux');
    expect(within(form).getByLabelText('Clé de la règle (minuscules)')).toHaveAttribute('readonly');
    expect(within(form).getByLabelText('Portée')).toBeDisabled();
    expect(within(form).getByLabelText('Nombre minimal de liens')).toHaveValue(2);
    await userEvent.clear(within(form).getByLabelText('Nombre minimal de liens'));
    await userEvent.type(within(form).getByLabelText('Nombre minimal de liens'), '3');
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer la règle' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && /projects\/ARI\/coverage-rules\/deux$/.test(c.url))).toBe(true));
    const sent = JSON.parse(calls.find((c) => c.method === 'PUT')!.body!);
    expect(sent).toMatchObject({ name: 'Deux tests', minCount: 3, fromTracker: 'REQ' });
    expect(sent.key).toBeUndefined();
  });

  it('l’administrateur crée une règle avec ses seuils', async () => {
    app(admin);
    await screen.findByRole('heading', { name: /Exigences vérifiées/ });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une règle' }));
    const form = screen.getByRole('form', { name: 'Ajouter une règle' });
    await userEvent.type(within(form).getByLabelText('Clé de la règle (minuscules)'), 'nouvelle');
    await userEvent.type(within(form).getByLabelText('Nom de la règle'), 'Nouvelle règle');
    await userEvent.clear(within(form).getByLabelText('Objectif (%)'));
    await userEvent.type(within(form).getByLabelText('Objectif (%)'), '95');
    await userEvent.type(within(form).getByLabelText('Seuil d’alerte (%)'), '80');
    await userEvent.click(within(form).getByRole('button', { name: 'Créer la règle' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && /projects\/ARI\/coverage-rules$/.test(c.url))).toBe(true));
    const sent = JSON.parse(calls.find((c) => c.method === 'POST' && /coverage-rules/.test(c.url))!.body!);
    expect(sent).toMatchObject({ key: 'nouvelle', fromTracker: 'REQ', linkType: 'verifies', direction: 'any', minCount: 1, statuses: [], threshold: { target: 95, warning: 80 } });
  });

  it('supprime une règle d’organisation après confirmation', async () => {
    app(admin);
    const section = (await screen.findByRole('heading', { name: /Exigences vérifiées/ })).closest('section')!;
    await userEvent.click(within(section).getByRole('button', { name: 'Supprimer' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && /\/v1\/coverage-rules\/req-verifiee$/.test(c.url))).toBe(true));
  });

  it('construit l’adresse de la liste filtrée', () => {
    expect(listHref('ARI', 'REQ', 'tracker = REQ')).toBe('/p/ARI/t/REQ/tableau');
    expect(listHref('ARI', 'REQ', 'tracker = REQ AND suspect()')).toBe(`/p/ARI/t/REQ/tableau?f=${encodeURIComponent('suspect()')}`);
  });

  it('est accessible (axe), formulaire ouvert compris', async () => {
    const { container } = app(admin);
    await screen.findByRole('heading', { name: /Exigences vérifiées/ });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une règle' }));
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
