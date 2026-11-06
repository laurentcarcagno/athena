import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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
    expect(labels('/p/ARI/board/kanban')).toEqual(['ARI', 'Planification', 'kanban']);
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
