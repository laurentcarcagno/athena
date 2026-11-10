import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { CreateArtifact } from './components/CreateArtifact';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TrackerConfigPage } from './pages/TrackerConfigPage';

let routes: Array<[RegExp, unknown]> = [];
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const hit = routes.find(([re]) => re.test(input));
    return hit ? new Response(JSON.stringify(hit[1]), { status: 200 }) : new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-user'], groups: [] } };

/** Audit axe-core (WCAG 2.1 A/AA). Le contraste est vérifié ailleurs : jsdom ne calcule pas les styles. */
async function violations(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' ; ')})`);
}

const page = (path: string, element: JSX.Element, pattern: string) =>
  render(<ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /></Routes></MemoryRouter></ToastProvider>);

describe('accessibilité (axe-core, WCAG 2.1 AA)', () => {
  it('tableau de bord', async () => {
    routes = [
      [/\/dashboard$/, { byCategory: { todo: 3, in_progress: 2, done: 7 }, byTracker: [{ tracker: 'BUG', total: 12, open: 5 }], distribution: null, recent: [{ key: 'BUG-1', at: '2026-10-31T10:00:00.000Z' }] }],
      [/\/velocity$/, { sprints: [{ sprint: 'S1', committed: 8, completed: 5 }], average: 5, forecast: 5 }],
      [/\/flow/, [{ date: '2026-10-31', todo: 3, in_progress: 2, done: 7 }]],
      [/\/roadmap$/, [{ id: 'r1', name: '1.0', startsOn: '2026-10-01', endsOn: '2026-11-01', state: 'planned', items: 4, doneItems: 2, progress: 0.5 }]],
    ];
    const { container } = page('/p/ARI/dashboard', <DashboardPage />, '/p/:project/dashboard');
    await screen.findByText('12 total');
    expect(await violations(container)).toEqual([]);
  });

  it('éditeur de tracker', async () => {
    routes = [
      [/\/trackers\/BUG$/, { key: 'BUG', name: 'Bugs', fields: [{ id: 'f', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' }],
        statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }, { id: 's2', key: 'done', name: 'Fini', category: 'done' }],
        transitions: [{ id: 't', name: 'Terminer', fromStatusId: 's1', toStatusId: 's2' }] }],
      [/\/field-types$/, ['text', 'number', 'select']],
    ];
    const { container } = page('/p/ARI/trackers/BUG/config', <TrackerConfigPage session={admin} />, '/p/:project/trackers/:tracker/config');
    await screen.findByRole('heading', { level: 1 });
    expect(await violations(container)).toEqual([]);
  });

  it('liste des projets', async () => {
    routes = [
      [/\/v1\/projects$/, [{ key: 'ARI', name: 'Ariane' }]],
      [/\/trackers$/, [{ key: 'BUG', name: 'Bugs' }]],
      [/\/boards$/, []],
    ];
    const { container } = page('/', <ProjectsPage />, '/');
    await screen.findByText('Ariane');
    expect(await violations(container)).toEqual([]);
  });

  it('fenêtre de création d’artefact', async () => {
    routes = [[/\/trackers\/BUG$/, { key: 'BUG', name: 'Bugs', statuses: [], transitions: [], fields: [
      { id: '1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
      { id: '3', key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure'] }, required: true, semanticRole: null },
    ] }]];
    render(<ToastProvider><MemoryRouter><CreateArtifact target={{ scope: 'tracker', project: 'ARI', tracker: 'BUG' }} open onClose={() => undefined} onCreated={() => undefined} /></MemoryRouter></ToastProvider>);
    await screen.findByLabelText('Titre (obligatoire)');
    expect(await violations(document.body)).toEqual([]);
  });

  it('détecte réellement une violation (témoin négatif)', async () => {
    const { container } = render(<main><img src="x.png" /><button /></main>);
    const found = await violations(container);
    expect(found.join(' ')).toMatch(/image-alt/);
    expect(found.join(' ')).toMatch(/button-name/);
  });
});
