# Journal de la tâche T-0077

## Fait
- `apps/api/src/testing/no-egress.ts` : garde sur `net.Socket.connect` (donc http, https, tls et clients de bases), `http/https.request|get`, `dns.lookup` et `dns.promises.*`. Autorise le local et les hôtes internes configurés (option `allowHosts`, variable `ATHENA_INTERNAL_HOSTS`, `.suffixe` pour un domaine). Toute tentative refusée est consignée : un test qui avale l'erreur échoue quand même.
- `no-egress-setup.ts` (vitest `setupFiles`) : garde actif dans **tous** les tests de l'API ; 464 tests passent, aucune sortie.
- `no-egress.test.ts` (7) : liste d'autorisation, TCP, http/https, DNS, local autorisé, preuve « rouge sur un appel fictif vers un hôte public » (`assertClean` lève), désinstallation.
- e2e `no-egress.spec.ts` (2) : le navigateur consigne toute requête qui quitte l'origine (navigations comprises) ; preuve par une requête fictive vers un hôte public, puis aucune requête externe sur dix pages principales.

## Décisions
- Observation seule côté navigateur : une route Playwright sur `**/*` provoque `net::ERR_ABORTED` sur les redirections vers Keycloak.

## Écarts
- Aucun.
