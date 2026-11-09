import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ArtifactTable } from './components/ArtifactTable';
import type { Hit } from './api';

const hit = (key: string, tracker: string): Hit => ({ key, tracker, status: 'open', statusName: 'Ouvert', category: 'todo', values: { title: key }, version: 1, updatedAt: '2026-11-09T10:00:00Z' });
const props = { project: 'ARI', offset: 0, pageSize: 50, sortOf: () => ({ field: '', dir: 'asc' }) as never, sortBy: () => () => undefined, onPage: () => undefined };

describe('recherche groupée par tracker (retour manuel n° 26)', () => {
  const result = { total: 3, hits: [hit('ARI-REQ-0001', 'REQ'), hit('ARI-BUG-0001', 'BUG'), hit('ARI-REQ-0002', 'REQ')] };
  it('un tableau par tracker quand la page en mélange plusieurs', () => {
    render(<MemoryRouter><ArtifactTable {...props} result={result} groupByTracker /></MemoryRouter>);
    const req = within(screen.getByRole('region', { name: 'REQ' }));
    expect(req.getAllByRole('link').map((l) => l.textContent)).toEqual(['ARI-REQ-0001', 'ARI-REQ-0002']);
    expect(within(screen.getByRole('region', { name: 'BUG' })).getAllByRole('link')).toHaveLength(1);
  });
  it('un seul tableau sinon', () => {
    render(<MemoryRouter><ArtifactTable {...props} result={{ total: 1, hits: [hit('ARI-BUG-0001', 'BUG')] }} groupByTracker /></MemoryRouter>);
    expect(screen.queryByRole('region', { name: 'BUG' })).toBeNull();
  });
});

import { Markdown } from './lib/markdown';
describe('guide intégré à l’aide (retour manuel n° 46)', () => {
  it('rend titres, listes, gras, code et blocs', () => {
    render(<Markdown source={'# Titre\n\nUn **mot** et `code`.\n\n- un\n- deux\n\n```\nstatus = open\n```'} />);
    expect(screen.getByRole('heading', { name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByText('mot').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('status = open')).toBeInTheDocument();
  });
});
