import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumb, crumbsFor } from './Breadcrumb';

const labels = (path: string, search = '') => crumbsFor(path, search).map((c) => c.label);

describe('fil d’Ariane', () => {
  it('est vide hors d’un projet', () => {
    expect(labels('/')).toEqual([]);
    expect(labels('/me')).toEqual([]);
    expect(labels('/org')).toEqual([]);
  });

  it('suit Projet › Tracker › Vue › Item', () => {
    expect(labels('/p/ARI')).toEqual(['ARI']);
    expect(labels('/p/ARI/trackers')).toEqual(['ARI', 'Trackers']);
    expect(labels('/p/ARI/t/BUG/tableau')).toEqual(['ARI', 'BUG', 'Tableau']);
    expect(labels('/p/ARI/t/BUG/board')).toEqual(['ARI', 'BUG', 'Board']);
    expect(labels('/p/ARI/t/BUG/tableau', '?i=ARI-BUG-0007&f=x')).toEqual(['ARI', 'BUG', 'Tableau', 'ARI-BUG-0007']);
    expect(labels('/p/ARI/a/ARI-BUG-0007')).toEqual(['ARI', 'BUG', 'ARI-BUG-0007']);
    expect(labels('/p/ARI/recherche')).toEqual(['ARI', 'Recherche']);
    expect(labels('/p/ARI/planification')).toEqual(['ARI', 'Planification']);
    expect(labels('/p/ARI/board/kanban')).toEqual(['ARI', 'Board', 'kanban']);
    expect(labels('/p/ARI/trackers/BUG/config')).toEqual(['ARI', 'BUG', 'Configuration']);
    expect(labels('/p/ARI/trackers/new')).toEqual(['ARI', 'Trackers', 'Nouveau tracker']);
  });

  it('rend chaque segment cliquable sauf le dernier, qui est la page courante', () => {
    render(<MemoryRouter><Breadcrumb pathname="/p/ARI/t/BUG/tableau" search="?i=ARI-BUG-0007" /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(within(nav).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['ARI', '/p/ARI'], ['BUG', '/p/ARI/t/BUG/tableau'], ['Tableau', '/p/ARI/t/BUG/tableau'],
    ]);
    const current = within(nav).getByText('ARI-BUG-0007');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveClass('ath-mono');
    expect(within(nav).queryByRole('link', { name: 'ARI-BUG-0007' })).not.toBeInTheDocument();
  });

  it('n’affiche rien hors d’un projet', () => {
    const { container } = render(<MemoryRouter><Breadcrumb pathname="/me" search="" /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('sélecteur de frères du fil d’Ariane', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      calls.push(input);
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (/\/v1\/projects$/.test(input)) return ok([{ key: 'ARI', name: 'Ariane' }, { key: 'HAK', name: 'Hakuna' }]);
      if (/\/trackers$/.test(input)) return ok([{ key: 'BUG', name: 'Anomalies', typeKey: null }, { key: 'REQ', name: 'Exigences', typeKey: 'requirement' }]);
      if (/\/tracker-types$/.test(input)) return ok([{ key: 'requirement', name: 'Exigence', defaultViews: ['tableau', 'arbre'] }]);
      return new Response('{}', { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const show = (path: string) => render(<MemoryRouter><Breadcrumb pathname={path} search="" /></MemoryRouter>);

  it('ne charge rien tant que le menu est fermé', () => {
    show('/p/ARI/t/BUG/tableau');
    expect(screen.getAllByRole('button')).toHaveLength(3); // projet, tracker, vue
    expect(calls).toEqual([]);
  });

  it('propose les autres projets, avec le projet courant signalé', async () => {
    show('/p/ARI/t/BUG/tableau');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de projet' }));
    const menu = await screen.findByRole('list', { name: 'Changer de projet' });
    expect(within(menu).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['ARI', '/p/ARI'], ['HAK', '/p/HAK']]);
    expect(within(menu).getByRole('link', { name: 'ARI' })).toHaveAttribute('aria-current', 'true');
  });

  it('propose les autres trackers du projet', async () => {
    show('/p/ARI/t/BUG/tableau');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de tracker' }));
    const menu = await screen.findByRole('list', { name: 'Changer de tracker' });
    expect(within(menu).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/p/ARI/t/BUG/tableau', '/p/ARI/t/REQ/tableau']);
  });

  it('propose les vues que le type du tracker offre : toutes les vues sans type, Tableau et Arbre pour une exigence', async () => {
    const first = show('/p/ARI/t/BUG/tableau');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de vue' }));
    expect(within(await screen.findByRole('list', { name: 'Changer de vue' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['Tableau', 'Board', 'Arbre', 'Matrice']);
    first.unmount();
    show('/p/ARI/t/REQ/tableau');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de vue' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Changer de vue' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['Tableau', 'Arbre']));
  });

  it('se ferme avec Échap en rendant le focus au bouton, et n’a aucune violation d’accessibilité', async () => {
    const { container } = show('/p/ARI/t/BUG/tableau');
    const toggle = screen.getByRole('button', { name: 'Changer de tracker' });
    await userEvent.click(toggle);
    await screen.findByRole('list', { name: 'Changer de tracker' });
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'Changer de tracker' })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });
});
