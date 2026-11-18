import { AsyncLocalStorage } from 'node:async_hooks';

/** Contexte d'une requête authentifiée : le sujet dont les listes d'ayants droit filtrent toutes les lectures. */
/** `managedOnly` : la personne n'a que le rôle de chef de projet ; elle ne voit que les projets dont elle est responsable (migration 092). */
export interface RequestContext { subject: string; managedOnly?: boolean }

const store = new AsyncLocalStorage<RequestContext>();

export const currentSubject = (): string | undefined => store.getStore()?.subject;
export const currentManagedOnly = (): boolean => store.getStore()?.managedOnly === true;

/** Les chefs de projet qui n'ont ni le rôle d'administrateur, de PMO ni de directeur ne voient que leurs projets. */
export const isManagedOnly = (roles: readonly string[]): boolean => roles.includes('athena-pm') && !['athena-admin', 'athena-pmo', 'athena-director'].some((r) => roles.includes(r));

/** Exécute `fn` en tant que `subject` : toutes les transactions qu'elle ouvre sont filtrées par ses droits (tests, tâches déléguées). */
export function runAs<T>(subject: string, fn: () => T, options: { managedOnly?: boolean } = {}): T {
  return store.run({ subject, ...(options.managedOnly ? { managedOnly: true } : {}) }, fn);
}

/** Sort du contexte de requête : traitement système, non filtré (historique, webhooks entrants, gestion des listes elles-mêmes). */
export function runAsSystem<T>(fn: () => T): T {
  return store.exit(fn);
}
