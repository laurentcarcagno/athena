import { useEffect, useState } from 'react';
import { Btn } from '@athena/ui';
import { fr } from '../i18n';

/**
 * Serveur saturé au chargement de la session (429) : on n'envoie jamais vers la connexion, on attend et on réessaie
 * (ADR-0005, T-0142). Le compte à rebours suit `Retry-After` ; « Réessayer maintenant » relance aussitôt.
 */
export function SessionBusy({ seconds, onRetry }: { seconds: number; onRetry: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const timer = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  useEffect(() => { if (left === 0) onRetry(); }, [left, onRetry]);
  return (
    <div className="ath-root ath-page__main">
      <div className="ath-toast ath-toast--warning" role="status">
        <span className="ath-toast__message"><strong>{fr.errors.busyTitle}</strong> {fr.errors.busyBody(left)}</span>
        <Btn variant="ghost" size="sm" onClick={onRetry}>{fr.errors.retryNow}</Btn>
      </div>
    </div>
  );
}
