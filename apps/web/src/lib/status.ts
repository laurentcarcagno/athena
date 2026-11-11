import { isHue, type Hue, type PillKind } from '@athena/ui';

/** Sens d'une catégorie de statut (couleur par défaut d'une pastille). */
export const pillKind = (category: string): PillKind => (category === 'done' ? 'success' : category === 'in_progress' ? 'warning' : 'info');

/** Pastille d'un statut (T-0138) : la teinte nommée choisie par l'administration, sinon la couleur de la catégorie. */
export const statusPill = (category: string, color?: string | null): { kind: PillKind; hue: Hue | null } => ({ kind: pillKind(category), hue: isHue(color) ? color : null });
