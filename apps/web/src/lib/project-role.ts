import { useEffect, useState } from 'react';
import { api, type Session } from '../api';

/**
 * Responsable du projet : l'administrateur, ou un chef de projet (`athena-pm`) membre `manager` de CE projet. Le serveur le vérifie pour
 * chaque action de gestion ; l'interface s'y aligne pour ne pas montrer à un chef de projet d'un autre projet des formulaires que le
 * serveur refuserait. Réponse en cache par projet et par personne ; `useProjectManager` vaut `false` tant qu'elle n'est pas connue (aucun formulaire ne clignote).
 */
const known = new Map<string, boolean>();

export const isOrgManager = (roles: readonly string[]): boolean => roles.includes('athena-admin') || roles.includes('athena-pm');

/** `undefined` : pas encore connu (chef de projet dont l'appartenance se charge) ; sinon vrai ou faux. */
export function useProjectManagerState(project: string | undefined, session: Pick<Session, 'user'> | undefined): boolean | undefined {
  const user = session?.user;
  const roles = user?.roles ?? [];
  const me = user?.id ?? user?.username ?? '';
  const admin = roles.includes('athena-admin');
  const pm = roles.includes('athena-pm');
  const key = `${project ?? ''}|${me}`;
  const [value, setValue] = useState<boolean | undefined>(known.get(key));
  useEffect(() => {
    if (admin || !pm || !project) return;
    const cached = known.get(key);
    if (cached !== undefined) { setValue(cached); return; }
    let live = true;
    api<Array<{ subject: string; username: string; role: string }>>('GET', `/v1/projects/${project}/members`)
      .then((members) => {
        const mine = (Array.isArray(members) ? members : []).some((m) => (m.subject === me || m.username === user?.username) && m.role === 'manager');
        known.set(key, mine);
        if (live) setValue(mine);
      })
      .catch(() => { if (live) setValue(false); });
    return () => { live = false; };
  }, [admin, pm, project, key, me, user?.username]);
  if (admin) return true;
  if (!pm || !project) return false;
  return value;
}

export const useProjectManager = (project: string | undefined, session: Pick<Session, 'user'> | undefined): boolean => useProjectManagerState(project, session) === true;

/** Oublie les réponses en cache (changement de membres, tests). */
export const forgetProjectRoles = (): void => known.clear();
