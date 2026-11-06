import type { TrackerTypeEntry } from '../api';

export const TRACKER_VIEWS = ['tableau', 'board', 'arbre', 'matrice'] as const;
export type TrackerViewId = (typeof TRACKER_VIEWS)[number];

/**
 * Vues proposées pour un tracker : celles de son type (`defaultViews`) que l'application sait afficher, le Tableau toujours en premier.
 * Un tracker sans type propose toutes les vues disponibles (il avait un board avant l'introduction des types).
 */
export function viewsFor(type: Pick<TrackerTypeEntry, 'defaultViews'> | undefined): TrackerViewId[] {
  if (!type) return [...TRACKER_VIEWS];
  return TRACKER_VIEWS.filter((v) => v === 'tableau' || type.defaultViews.includes(v));
}
