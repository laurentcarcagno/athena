import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ItemFacts } from './components/ItemHeader';
import type { Artifact, TrackerDefinition } from './api';

// Le champ Responsable affiche le nom de la personne, pas son identifiant de compte.
const def = { key: 'TSK', name: 'Tâches', fields: [{ key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee' }], statuses: [], transitions: [] } as unknown as TrackerDefinition;
const artifact = (over: Partial<Artifact> = {}): Artifact => ({ id: '1', key: 'N-TSK-0001', trackerKey: 'TSK', status: 'todo', version: 1, values: { assignee: 'd668eeb1-805d-453a-ad95-e0bb408aa7df' }, ...over });

describe('Responsable d’une fiche', () => {
  it('montre le nom résolu quand l’API le fournit', () => {
    render(<MemoryRouter><ItemFacts project="N" def={def} artifact={artifact({ userNames: { 'd668eeb1-805d-453a-ad95-e0bb408aa7df': 'User Dev' } })} links={[]} sprint={null} /></MemoryRouter>);
    expect(screen.getByText('User Dev')).toBeInTheDocument();
    expect(screen.queryByText(/d668eeb1/)).toBeNull();
  });
  it('retombe sur la valeur brute sans nom connu', () => {
    render(<MemoryRouter><ItemFacts project="N" def={def} artifact={artifact()} links={[]} sprint={null} /></MemoryRouter>);
    expect(screen.getByText(/d668eeb1/)).toBeInTheDocument();
  });
});
