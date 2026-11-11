# T-0142 : session et limitation de débit

- **Objectif** : un serveur sollicité ne déconnecte plus personne (revue d'ergonomie, B1 ; ADR-0005 § 2.1).
- **Critères d'acceptation** : la lecture de session suit la limite générale, pas celle des connexions ; un 429 n'est jamais traité comme une déconnexion (message, compte à rebours selon `Retry-After`, « Réessayer maintenant ») ; tests API et web ; e2e vert.
- **Fichiers** : `apps/api/src/security/hardening.ts` (+ test) ; `apps/web/src/api.ts` (`RateLimitedError`), `App.tsx`, `components/SessionBusy.tsx`, `i18n.ts`, `session-busy.test.tsx`.
