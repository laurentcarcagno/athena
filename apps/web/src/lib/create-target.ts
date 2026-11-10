import { placeOf } from './navigation';

/**
 * Où crée-t-on un ticket (ADR-0003, T-0111) : partout (le projet est à choisir), dans un projet (le tracker est à choisir),
 * ou dans un tracker (pré-choisi, modifiable dans le projet).
 */
export type CreateTarget =
  | { scope: 'global' }
  | { scope: 'project'; project: string }
  | { scope: 'tracker'; project: string; tracker: string };

/** Ticket créé : sa clé canonique, son projet et son tracker. */
export interface Created { key: string; project: string; tracker: string }

/** Cible de création déduite de l'adresse : le tracker de la page s'il est connu, sinon le projet, sinon aucune. */
export function targetOf(pathname: string): CreateTarget {
  const place = placeOf(pathname);
  if (!place) return { scope: 'global' };
  if (place.tracker) return { scope: 'tracker', project: place.project, tracker: place.tracker };
  return { scope: 'project', project: place.project };
}

export const projectOfTarget = (target: CreateTarget): string | null => (target.scope === 'global' ? null : target.project);
export const trackerOfTarget = (target: CreateTarget): string | null => (target.scope === 'tracker' ? target.tracker : null);
