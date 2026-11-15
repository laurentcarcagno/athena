import { fr } from '../i18n';

export type RoleKind = 'admin' | 'director' | 'manager' | 'lead' | 'user';

/** Rôle principal affiché sous le nom : le plus étendu des rôles portés (administrateur, PMO, directeur, chef de projet, manager, membre). */
export function primaryRole(roles: readonly string[]): { label: string; kind: RoleKind } {
  const name = (role: string) => fr.steer.roleNames[role] ?? role;
  if (roles.includes('athena-admin')) return { label: name('athena-admin'), kind: 'admin' };
  // Le PMO partage l'icône de pilotage du directeur ; son libellé le distingue.
  if (roles.includes('athena-pmo')) return { label: name('athena-pmo'), kind: 'director' };
  if (roles.includes('athena-director')) return { label: name('athena-director'), kind: 'director' };
  if (roles.includes('athena-pm')) return { label: name('athena-pm'), kind: 'manager' };
  if (roles.includes('athena-manager')) return { label: name('athena-manager'), kind: 'lead' };
  if (roles.includes('athena-qa')) return { label: name('athena-qa'), kind: 'user' };
  return { label: name('athena-team-member'), kind: 'user' };
}
