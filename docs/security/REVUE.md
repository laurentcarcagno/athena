# Revue de sécurité interne (phase 8)

Cette revue est interne et automatisée. **Elle ne remplace pas le test d'intrusion externe prévu en fin de phase 8**, qui reste à commander.

## Dépendances
- `pnpm audit` : 56 vulnérabilités au départ (dont 5 critiques, 16 élevées : Fastify 4, `@fastify/middie`, NestJS 10, Vitest, Vite, zod, React Router).
- Après montée de versions majeures (NestJS 11, Fastify 5, Zod 4, Vitest 4, React Router 7, Turbo, Vite 6) : **aucune vulnérabilité connue**. Les 225 tests de l'API, 30 de l'UI, 27 du web et 4 du SDK passent.
- À maintenir : `pnpm audit --audit-level=high` est bloquant dans la CI (`.gitlab-ci.yml`, tâche `audit`) ; ajouter Renovate.

## Contrôles vérifiés par tests
| Exigence (plan § 13.3) | Contrôle | Test |
|---|---|---|
| Authentification | JWT signature, émetteur, audience, expiration ; OIDC PKCE ; sessions côté serveur ; CSRF + Origin | `auth.test.ts`, `bff.test.ts` |
| Contrôle d'accès | Rôles par route ; RLS PostgreSQL forcée ; isolation entre organisations | `db.test.ts`, `core-http.test.ts` |
| Injection | ATQL compilé en SQL paramétré ; noms de champ validés | `atql.test.ts` |
| SSRF | Contrôle à la connexion, adresses IP littérales comprises | `webhooks.test.ts` |
| Webhooks | HMAC horodaté, comparaison en temps constant, 403 uniforme, idempotence | `webhooks.test.ts`, `integrations.test.ts`, `inbound.test.ts` |
| Plugins | Signature Ed25519, permissions Node, mémoire/délai bornés, API sans fuite d'objets, permissions côté hôte | `plugins.test.ts`, `plugin-service.test.ts` |
| Secrets | OpenBao KV/Transit, clés dérivées liées au champ ; aucun secret dans le dépôt ni les images | `openbao.test.ts` |
| Journalisation | Audit chaîné par hachage, en ajout seul | `db.test.ts` |
| Automatisations | Rôle minimal, profondeur, quota, pas d'auto-déclenchement | `automation.test.ts` |
| Entrées externes | Mappage sans exécution de code ; `.sdoc` en lecture seule, taille bornée | `inbound.test.ts`, `docs.test.ts` |
| Déni de service | Limitation de débit par client (API, authentification/webhooks), corps limité à 1 Mo, requêtes ATQL bornées | `hardening.test.ts`, `atql.test.ts` |
| Navigateur | En-têtes de sécurité ; aucun style en ligne (CSP sans `unsafe-inline` possible) ; pas de jeton côté navigateur | `hardening.test.ts`, `web2.test.tsx` |

## Écarts connus (non couverts)
- **Test d'intrusion externe** : à commander.
- **CSP de l'application web** : la politique est à poser sur le reverse proxy (`default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'`) ; non testée de bout en bout.
- **Limitation de débit** : en mémoire, par instance. Derrière plusieurs instances, prévoir un stockage partagé (Redis).
- **Secret de session** : lu depuis l'environnement ; à fournir par OpenBao en production.
- **Déconnexion back-channel Keycloak** : non implémentée (la session expire à 8 h ou à la déconnexion).
- **MFA** : appliquée par Keycloak aux administrateurs (le compte de démonstration n’en a pas : environnement de développement) ; à vérifier sur l'instance cible.
- **Signature des commits d'historique** : signature unique du service (décision 23.1) ; signature par utilisateur non faite.
- **Réseau des plugins** : Node 22 ne permet pas de le restreindre ; l'API exposée aux plugins n'offre aucun accès réseau.
- **gitleaks** : exécuté en CI seulement ; non installé sur le poste de développement.
