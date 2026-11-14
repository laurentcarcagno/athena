import type { ReactNode } from 'react';

/**
 * Icônes du rail (T-0136) : visibles seules quand le rail est replié (tablette, choix de l'utilisateur), à côté du libellé
 * sinon. Décoratives (le libellé reste le nom accessible) ; tracé de 2 px en couleur courante, comme les autres icônes.
 */
const icon = (paths: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">{paths}</svg>
);

export const RAIL_ICONS: Record<string, ReactNode> = {
  favorites: icon(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />),
  recents: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  projects: icon(<path d="M3 6h7l2 2h9v11H3z" />),
  work: icon(<><path d="M3 13h5l1 3h6l1-3h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>),
  teams: icon(<><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2" /><path d="M16 5a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v2" /></>),
  portfolios: icon(<><rect x="3" y="7" width="18" height="13" /><path d="M9 7V4h6v3M3 13h18" /></>),
  search: icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  admin: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>),
  overview: icon(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>),
  backlog: icon(<path d="M4 6h16M4 12h16M4 18h10" />),
  board: icon(<><rect x="3" y="4" width="5" height="16" /><rect x="10" y="4" width="5" height="10" /><rect x="17" y="4" width="4" height="13" /></>),
  trackers: icon(<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" />),
  planning: icon(<path d="M5 21V4h11l-2 4 2 4H5" />),
  documents: icon(<><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>),
  reports: icon(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  settings: icon(<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />),
};

/** Icône d'une section de projet (repli : celle de la vue d'ensemble). */
export const sectionIcon = (section: string): ReactNode => RAIL_ICONS[section] ?? RAIL_ICONS['overview'];
