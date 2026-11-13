import { describe, expect, it } from 'vitest';
import { flowOrder, nextRow, placeAt, resizeTo, resolve, withBoxes } from './grid';

describe('grille 2D', () => {
  const base = withBoxes([{ id: 'a', size: 'S' as const }, { id: 'b', size: 'S' as const }, { id: 'c', size: 'M' as const }]);
  it('place les cartes sans position comme l’API', () => {
    expect(base.map((w) => [w.id, w.x, w.y, w.w])).toEqual([['a', 0, 0, 4], ['b', 4, 0, 4], ['c', 0, 3, 6]]);
    expect(withBoxes(base)).toEqual(base);
  });
  it('déplacer repousse la carte touchée vers le bas, sans chevauchement', () => {
    const moved = placeAt(base, 'a', 4, 0); // sur b
    const a = moved.find((w) => w.id === 'a')!;
    const b = moved.find((w) => w.id === 'b')!;
    expect([a.x, a.y]).toEqual([4, 0]);
    expect(b.y).toBeGreaterThanOrEqual(3);
    const spots = moved.map((w) => `${w.x},${w.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });
  it('borne la position à la grille', () => {
    const moved = placeAt(base, 'a', 11, -4);
    expect(moved.find((w) => w.id === 'a')).toMatchObject({ x: 8, y: 0 });
  });
  it('redimensionner met à jour size et repousse', () => {
    const grown = resizeTo(base, 'a', 12, 2);
    expect(grown.find((w) => w.id === 'a')).toMatchObject({ w: 12, h: 2, size: 'XL' });
    expect(grown.find((w) => w.id === 'b')!.y).toBeGreaterThanOrEqual(2);
  });
  it('ordre de lecture et première ligne libre', () => {
    expect(flowOrder(placeAt(base, 'c', 0, 0)).map((w) => w.id)[0]).toBe('c');
    expect(nextRow(base)).toBe(6);
    expect(resolve(base)).toEqual(base);
  });
});
