import { AsyncLocalStorage } from 'node:async_hooks';

/** Contexte d'une requête authentifiée : le sujet dont les listes d'ayants droit filtrent toutes les lectures. */
export interface RequestContext { subject: string }

const store = new AsyncLocalStorage<RequestContext>();

export const currentSubject = (): string | undefined => store.getStore()?.subject;

/** Exécute `fn` en tant que `subject` : toutes les transactions qu'elle ouvre sont filtrées par ses droits (tests, tâches déléguées). */
export function runAs<T>(subject: string, fn: () => T): T {
  return store.run({ subject }, fn);
}

/** Sort du contexte de requête : traitement système, non filtré (historique, webhooks entrants, gestion des listes elles-mêmes). */
export function runAsSystem<T>(fn: () => T): T {
  return store.exit(fn);
}
