import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../api';
import { ArtifactTable } from './ArtifactTable';

const long = `https://exemple.test/${'a'.repeat(140)}`;
const result: SearchResult = {
  total: 1,
  hits: [{ key: 'ARI-BUG-0001', tracker: 'BUG', status: 'open', statusName: 'Ouvert', category: 'todo', version: 1, updatedAt: '2026-11-05T10:00:00.000Z', values: { title: long } }],
};

describe('tableau d’artefacts : contenus longs (constat F-07)', () => {
  it('tronque le titre avec une infobulle complète et garde la clé en mono insécable', () => {
    render(<MemoryRouter><ArtifactTable project="ARI" result={result} offset={0} pageSize={25} sortOf={() => null} sortBy={() => vi.fn()} onPage={vi.fn()} /></MemoryRouter>);
    const title = screen.getByText(long);
    expect(title).toHaveClass('ath-clip');
    expect(title).toHaveAttribute('title', long);
    expect(screen.getByRole('link', { name: 'ARI-BUG-0001' })).toHaveClass('ath-link', 'ath-mono');
  });
});
