import { useCallback } from 'react';
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
