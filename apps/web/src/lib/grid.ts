// Grille 2D du tableau de bord (ADR-0007, T-0171 et T-0172) : 12 colonnes, lignes de 88 px. Fonctions pures, miroir du service API.
export const GRID_COLUMNS = 12;
export const MAX_ROWS = 8;
export const DEFAULT_ROWS = 3;
export const SIZE_COLUMNS = { S: 4, M: 6, L: 8, XL: 12 } as const;
export type Size = keyof typeof SIZE_COLUMNS;

export interface Box { x: number; y: number; w: number; h: number }
export interface Placed extends Partial<Box> { id: string; size?: Size | undefined }

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const boxOf = (w: Placed): Box => ({ x: w.x ?? 0, y: w.y ?? 0, w: w.w ?? SIZE_COLUMNS[w.size ?? 'S'], h: w.h ?? DEFAULT_ROWS });
export const sizeOfWidth = (w: number): Size => (w <= 4 ? 'S' : w <= 6 ? 'M' : w <= 8 ? 'L' : 'XL');

/** Pose les cartes sans position à la première place libre, dans l'ordre (comme l'API) ; les positions présentes sont gardées. */
export function withBoxes<T extends Placed>(widgets: readonly T[]): Array<T & Box> {
  const taken: Box[] = widgets.filter((w) => w.x !== undefined && w.y !== undefined).map(boxOf);
  return widgets.map((widget) => {
    let box = boxOf(widget);
    if (widget.x === undefined || widget.y === undefined) {
      search: for (let y = 0; ; y++) for (let x = 0; x + box.w <= GRID_COLUMNS; x++) {
        const candidate = { ...box, x, y };
        if (!taken.some((t) => overlaps(t, candidate))) { box = candidate; taken.push(candidate); break search; }
      }
    }
    return { ...widget, ...box, size: sizeOfWidth(box.w) };
  });
}

/** Ordre de lecture : ligne puis colonne (c'est aussi l'ordre sur téléphone, où la grille tient sur une colonne). */
export const flowOrder = <T extends Box>(widgets: readonly T[]): T[] => [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);

/** Fait de la place : toute carte qui touche une carte déjà fixée descend sous elle ; `anchor` est fixée la première. */
export function resolve<T extends Box & { id: string }>(widgets: readonly T[], anchor?: string): T[] {
  const fixed: T[] = [];
  const first = widgets.find((w) => w.id === anchor);
  const queue = flowOrder(widgets.filter((w) => w !== first));
  if (first) fixed.push(first);
  for (const widget of queue) {
    let next = widget;
    for (let guard = 0; guard < 500; guard++) {
      const hit = fixed.find((f) => overlaps(f, next));
      if (!hit) break;
      next = { ...next, y: hit.y + hit.h };
    }
    fixed.push(next);
  }
  return widgets.map((w) => fixed.find((f) => f.id === w.id)!);
}

const clampBox = (b: Box): Box => {
  const w = Math.max(1, Math.min(GRID_COLUMNS, b.w));
  return { w, h: Math.max(1, Math.min(MAX_ROWS, b.h)), x: Math.max(0, Math.min(GRID_COLUMNS - w, b.x)), y: Math.max(0, b.y) };
};

/** Place la carte `id` en (x, y) et repousse les autres si besoin. */
export function placeAt<T extends Box & { id: string; size?: Size }>(widgets: readonly T[], id: string, x: number, y: number): T[] {
  const moved = widgets.map((w) => (w.id === id ? { ...w, ...clampBox({ ...w, x, y }) } : w));
  return resolve(moved, id);
}

/** Change la taille (largeur en colonnes, hauteur en lignes) de la carte `id`. */
export function resizeTo<T extends Box & { id: string; size?: Size }>(widgets: readonly T[], id: string, w: number, h: number): T[] {
  const next = widgets.map((c) => {
    if (c.id !== id) return c;
    const box = clampBox({ ...c, w, h });
    return { ...c, ...box, size: sizeOfWidth(box.w) };
  });
  return resolve(next, id);
}

/** Première ligne libre sous toutes les cartes, pour une carte ajoutée. */
export const nextRow = (widgets: readonly Box[]): number => widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
