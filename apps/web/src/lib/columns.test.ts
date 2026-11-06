import { describe, expect, it } from 'vitest';
import type { TrackerDefinition } from '../api';
import { columnOptions, columnsParam, selectedColumns } from './columns';

const def = {
  key: 'BUG', name: 'Anomalies',
  fields: [
    { id: '1', key: 'title', label: 'Titre', type: 'text', config: {}, required: true, semanticRole: 'title' },
    { id: '2', key: 'severity', label: 'Sévérité', type: 'select', config: {}, required: false, semanticRole: null },
    { id: '3', key: 'points', label: 'Points', type: 'number', config: {}, required: false, semanticRole: null },
  ],
  statuses: [], transitions: [],
} as unknown as TrackerDefinition;

describe('colonnes du tableau', () => {
  it('propose les colonnes standard puis un champ du tracker chacun, sans doubler le titre', () => {
    expect(columnOptions(def).map((o) => o.id)).toEqual(['title', 'status', 'tracker', 'updated', 'f:severity', 'f:points']);
    expect(columnOptions(null).map((o) => o.id)).toEqual(['title', 'status', 'tracker', 'updated']);
  });
  it('applique les colonnes par défaut sans paramètre, et ignore les identifiants inconnus', () => {
    expect(selectedColumns(null, def)).toEqual(['title', 'status', 'updated']);
    expect(selectedColumns('f:points,title,inconnue,f:absent', def)).toEqual(['title', 'f:points']); // ordre des options
    expect(selectedColumns('', def)).toEqual([]);
  });
  it('n’écrit dans l’adresse que ce qui diffère du choix par défaut', () => {
    expect(columnsParam(['title', 'status', 'updated'], def)).toBeNull();
    expect(columnsParam(['title', 'f:severity'], def)).toBe('title,f:severity');
    expect(columnsParam([], def)).toBe('');
  });
});
