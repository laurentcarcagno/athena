import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApp } from './App';
import type { Session } from './api';

const calls: string[] = [];
let modules = ['overview', 'trackers', 'planning', 'documents', 'activity', 'members'];
const summary = { id: 'urd.docs-urd', source: 'urd', path: 'docs/urd.sdoc', title: 'Exigences utilisateur', nodes: 5, requirements: 2, sourceUrl: 'https://gitlab.interne.lan/docs/urd/-/blob/main/docs/urd.sdoc', gitSha: 'abcdef0123456789', indexedAt: '2026-11-06T10:00:00.000Z' };
const nodes = [
  { uid: null, type: 'SECTION', title: 'Contexte', statement: '', status: '', depth: 0, parentUid: null, position: 0, citations: 0 },
  { uid: null, type: 'TEXT', title: '', statement: 'Texte courant <b>gras</b> et <img src=x onerror=alert(1)>', status: '', depth: 1, parentUid: '~urd:0', position: 1, citations: 0 },
  { uid: 'URD-SEC-2', type: 'SECTION', title: 'Connexion', statement: '', status: '', depth: 1, parentUid: '~urd:0', position: 2, citations: 0 },
  { uid: 'URD-1', type: 'REQUIREMENT', title: 'Authentification', statement: 'L’utilisateur se connecte.', status: 'Active', depth: 2, parentUid: 'URD-SEC-2', position: 3, citations: 2 },
  { uid: 'URD-2', type: 'REQUIREMENT', title: 'Journalisation', statement: 'Chaque connexion est journalisée.', status: '', depth: 1, parentUid: '~urd:0', position: 4, citations: 0 },
];

beforeEach(() => {
  calls.length = 0;
  modules = ['overview', 'trackers', 'planning', 'documents', 'activity', 'members'];
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(input);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/modules$/.test(input)) return ok({ modules });
    if (/\/docs\/search\?q=URD-1$/.test(input)) return ok([{ uid: 'URD-1', document: 'Exigences utilisateur', docId: 'urd.docs-urd', type: 'REQUIREMENT', title: 'Authentification', snippet: 'L’utilisateur se connecte.', match: 'uid' }, { uid: 'URD-10', document: 'Exigences utilisateur', docId: 'urd.docs-urd', type: 'REQUIREMENT', title: 'Supervision', snippet: '', match: 'prefix' }]);
    if (/\/docs\/search\?q=zzz$/.test(input)) return ok([]);
    if (/\/docs\/urd\.docs-urd\/tree$/.test(input)) return ok({ document: summary, nodes, truncated: false });
    if (/\/docs\/nodes\/URD-1\/citations/.test(input)) return ok([
      { key: 'ARI-ACT-0001', tracker: 'ACT', title: 'Revoir l’authentification', status: 'En cours', category: 'in_progress', suspect: true, origin: 'athena' },
      { key: 'ARI-REQ-0004', tracker: 'REQ', title: 'SSO', status: 'Vérifiée', category: 'done', suspect: false, origin: 'document' },
    ]);
    if (/\/projects\/ARI\/docs$/.test(input)) return ok([summary]);
    if (/\/v1\/projects$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const user: Session = { authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-user'], groups: [] } };
const app = (path: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><AuthenticatedApp session={user} /></MemoryRouter></ToastProvider>);

describe('onglet Documents', () => {
  it('n’apparaît que si une source documentaire est indexée', async () => {
    modules = ['overview', 'trackers', 'planning', 'activity', 'members'];
    app('/p/ARI');
    await screen.findByRole('heading', { level: 1, name: /Vue d’ensemble/ });
    await waitFor(() => expect(calls.some((c) => /modules$/.test(c))).toBe(true));
    expect(screen.queryByRole('link', { name: 'Documents' })).toBeNull();
  });

  it('liste les documents, ouvre un document avec bannière « lecture seule » et lien vers la source', async () => {
    app('/p/ARI/documents');
    expect(await screen.findByRole('link', { name: 'Exigences utilisateur' })).toHaveAttribute('href', '/p/ARI/documents/urd.docs-urd');
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Choisissez un document.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Exigences utilisateur' }));
    const banner = await screen.findByRole('note');
    expect(banner).toHaveTextContent('Lecture seule : modifier dans StrictDoc.');
    expect(within(banner).getByRole('link', { name: 'Ouvrir la source' })).toHaveAttribute('href', 'https://gitlab.interne.lan/docs/urd/-/blob/main/docs/urd.sdoc');
    expect(within(banner).getByRole('link', { name: 'Ouvrir la source' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(banner).toHaveTextContent('abcdef01');
  });

  it('adresse stable par exigence : l’ancre #UID sélectionne et fait défiler jusqu’au nœud ; UID en police à chasse fixe', async () => {
    app('/p/ARI/documents/urd.docs-urd#URD-1');
    const req = (await screen.findByRole('heading', { name: /Authentification/ })).closest('article')!;
    expect(req).toHaveAttribute('id', 'URD-1');
    expect(req).toHaveAttribute('aria-current', 'location');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const uid = within(req).getByText('URD-1');
    expect(uid).toHaveClass('ath-mono');
    // plan : un lien par section et exigence vers son ancre
    const outline = screen.getByRole('navigation', { name: 'Plan du document' });
    expect(within(outline).getByRole('link', { name: /URD-2/ })).toHaveAttribute('href', '/p/ARI/documents/urd.docs-urd#URD-2');
    expect(within(outline).getByRole('link', { name: /Contexte/ })).toHaveAttribute('href', '/p/ARI/documents/urd.docs-urd#n-0');
  });

  it('chaque nœud est rendu comme du texte : aucun HTML brut n’est interprété', async () => {
    const { container } = app('/p/ARI/documents/urd.docs-urd');
    await screen.findByRole('heading', { name: /Authentification/ });
    expect(screen.getByText(/Texte courant <b>gras<\/b> et <img src=x onerror=alert\(1\)>/)).toBeInTheDocument(); // littéral, pas interprété
    expect(container.querySelector('.ath-doc__content img, .ath-doc__content b, .ath-doc__content script')).toBeNull();
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('cherche par UID : exact puis préfixe, chacun avec son adresse stable ; aucun résultat est dit', async () => {
    app('/p/ARI/documents/urd.docs-urd');
    await screen.findByRole('heading', { name: /Authentification/ });
    await userEvent.type(screen.getByLabelText('UID ou texte'), 'URD-1');
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    const list = await screen.findByRole('list', { name: '2 résultats' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['URD-1', '/p/ARI/documents/urd.docs-urd#URD-1'], ['URD-10', '/p/ARI/documents/urd.docs-urd#URD-10']]);
    expect(within(list).getByText(/UID exact/)).toBeInTheDocument();
    expect(within(list).getByText(/Début d’UID/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('UID ou texte'));
    await userEvent.type(screen.getByLabelText('UID ou texte'), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
  });

  it('citations : le nombre dans la liste, le détail (artefact, état, lien suspect) dans le panneau de l’exigence', async () => {
    app('/p/ARI/documents/urd.docs-urd');
    const req = (await screen.findByRole('heading', { name: /Authentification/ })).closest('article')!;
    const button = within(req).getByRole('button', { name: '2 citations' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(within(screen.getByRole('heading', { name: /Journalisation/ }).closest('article')!).getByRole('button', { name: '0 citation' })).toBeInTheDocument();
    await userEvent.click(button);
    const panel = await within(req).findByRole('region', { name: 'Artefacts citant URD-1' });
    expect(within(panel).getByRole('link', { name: 'ARI-ACT-0001' })).toHaveAttribute('href', '/p/ARI/a/ARI-ACT-0001');
    expect(within(panel).getByText('En cours')).toBeInTheDocument();
    expect(within(panel).getByText('Lien suspect')).toBeInTheDocument();
    expect(calls.some((c) => /nodes\/URD-1\/citations\?source=urd$/.test(c))).toBe(true);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('ne présente aucune violation d’accessibilité (axe), citations ouvertes', async () => {
    const { container } = app('/p/ARI/documents/urd.docs-urd#URD-1');
    const req = (await screen.findByRole('heading', { name: /Authentification/ })).closest('article')!;
    await userEvent.click(within(req).getByRole('button', { name: '2 citations' }));
    await within(req).findByRole('region');
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 90)).join(' | ')}`)).toEqual([]);
  });
});
