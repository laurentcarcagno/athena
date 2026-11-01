import { useCallback, useRef, useState } from 'react';
import { useToast } from '@athena/ui';
import { ApiError, UnauthorizedError, loginUrl } from './api';
import { fr } from './i18n';

/** Convertit une erreur d'API en message sobre et gère l'expiration de session. */
export function useFailure() {
  const toast = useToast();
  return useCallback((error: unknown) => {
    if (error instanceof UnauthorizedError) {
      window.location.assign(loginUrl(window.location.pathname + window.location.search));
      return;
    }
    toast('danger', error instanceof ApiError ? error.readable : fr.errors.generic);
  }, [toast]);
}

/** Évite le double envoi : `guard` ignore un second appel tant que le premier n'est pas terminé, `busy` pilote `Btn loading`. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try { await fn(); } finally { running.current = false; setBusy(false); }
  }, []);
  return { busy, guard };
}
