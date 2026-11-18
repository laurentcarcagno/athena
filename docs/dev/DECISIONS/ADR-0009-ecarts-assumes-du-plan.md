# ADR-0009 : écarts d'architecture assumés par rapport au plan

Statut : accepté (2026-11-18), à la suite de l'audit du plan (`docs/dev/AUDIT-PLAN.md`). Décisions prises sans question, conformément à la consigne de décider seul.

## 1. Pas de Redis ni de BullMQ (plan § 3.1)

**Plan** : Redis + BullMQ pour les jobs (webhooks, synchronisation GitLab, notifications, automatisations).
**Réalisé** : l'outbox transactionnelle est dans PostgreSQL ; un processus worker la consomme par boucles ; les sessions web sont en PostgreSQL ; la limitation de débit partagée est en PostgreSQL (`RATE_LIMIT_STORE=postgres`) ; le flux temps réel relit PostgreSQL.
**Pourquoi** : une seule base à exploiter, sauvegarder et restaurer ; l'outbox garantit déjà la livraison au moins une fois et l'ordre par agrégat ; les volumes mesurés (palier 2 : 300 projets, 500 000 tickets) n'exigent pas une file externe. Moins de composants, moins de surface d'attaque.
**Conséquence** : pas de Redis à déployer, ni sur Kubernetes ni sur VM. À revoir si le débit d'événements dépasse ce que le worker consomme (alerte `AthenaOutboxSature`) : le seuil est surveillé, l'ajout d'une file est alors localisé au worker.

## 2. mTLS interne par PKI OpenBao (plan § 13.3 et 14.2)

**Plan** : certificats courts émis par le moteur PKI d'OpenBao pour le chiffrement interne.
**Décision** : relève de l'infrastructure, pas du code applicatif. Sur Kubernetes : maillage de services ou `cert-manager` avec l'émetteur PKI d'OpenBao ; sur VM : TLS terminé au reverse proxy et pare-feu de l'hyperviseur entre les VM. L'application n'ouvre aucune connexion sortante non chiffrée vers GitLab, OpenBao, Keycloak, S3 en production (schémas `https` exigés par les relevés d'environnement).
**Reste** : à poser lors de la recette sur l'infrastructure cible.

## 3. Composants partagés `DiffViewer`, éditeur Markdown, `DatePicker`, `UserPicker`, `Skeleton` (plan § 9.2)

**Plan** : extensions de `@athena/ui`.
**Réalisé** : les fonctions existent dans l'application web (historique avec différences par champ, champs date natifs, sélecteurs propres aux écrans, commentaires Markdown assainis) mais ne sont pas des composants partagés.
**Décision** : extraire un composant dans `@athena/ui` seulement lorsqu'un second consommateur (plugin ou écran) en a besoin, pour éviter une API prématurée. Aucune fonctionnalité du plan n'est absente de ce fait.

## 4. Plugins : pas de rendu client arbitraire (plan § 6.3)

**Plan** : composants client en iframe sandboxée ou Web Component.
**Réalisé** : un plugin renvoie un **modèle de données** (jamais du HTML) que l'application rend (widgets, vues tabulaires) ; les actions et connecteurs s'exécutent dans le processus isolé.
**Pourquoi** : c'est plus sûr que l'iframe (aucune exécution de code tiers dans le navigateur, aucun contournement de la charte, pas de CSP à assouplir). Le risque R2 du plan (sandbox contournable) est ainsi réduit côté client.
**Conséquence** : les points d'extension d'interface supplémentaires (`artifactTab`, `menuItem`) suivent le même principe (modèle de données).

## 5. Thème sombre (plan § 23.1, décision 5)

Dépassée par l'ADR-0004 : système de thèmes, clair et sombre, plusieurs thèmes. Le plan est mis à jour.
