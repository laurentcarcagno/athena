import { useEffect, useRef } from 'react';

/** Changement de ticket reçu par le flux temps réel : clé, projet, type et noms des champs modifiés, jamais de valeurs. */
export interface TicketChange { id: string; event: string; key: string; project: string; fields: string[] }

const EVENT = 'athena:ticket';

/** Relaie un changement du flux SSE aux pages ouvertes (appelé par le centre de notifications, qui détient l'unique connexion). */
export function publishTicketChange(change: TicketChange): void {
  window.dispatchEvent(new CustomEvent<TicketChange>(EVENT, { detail: change }));
}

/** La page recharge ses données quand un ticket du projet change ; `project` absent = tous les projets. */
export function useTicketChanges(project: string | undefined, handler: (change: TicketChange) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const on = (e: Event) => {
      const change = (e as CustomEvent<TicketChange>).detail;
      if (project === undefined || change.project === project) latest.current(change);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [project]);
}
