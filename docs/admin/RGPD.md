# Protection des données personnelles (RGPD)

Plan § 10 : export et effacement par utilisateur ; pseudonymisation documentée pour l'historique Git.

## Données personnelles détenues par Athena

| Donnée | Où | Export | Effacement |
|---|---|---|---|
| Nom, courriel, identifiant de connexion | `user_account` (copie du profil Keycloak) | oui | pseudonymisé : identifiant `effacé-<empreinte>`, nom « Utilisateur effacé », courriel supprimé |
| Préférences de notification, épingles, abonnements, notifications reçues, résumé quotidien | tables personnelles | oui | supprimées |
| Sessions web | `web_session` | non (technique) | supprimées |
| Jetons d'accès personnels | `personal_access_token` | métadonnées (jamais la valeur) | révoqués, nom et courriel retirés |
| Commentaires, tickets créés, temps passé, absences, appartenances | tables métier | oui | conservés sous l'identifiant opaque du compte (pièces d'activité) |
| Journal d'audit chaîné | `audit_log` | oui (actions de la personne) | conservé : immuable par conception, il ne porte que l'identifiant opaque |
| Auteur et courriel des commits d'historique | dépôts GitLab d'historique | non | **voir ci-dessous** |

L'identifiant opaque (`sub` Keycloak) ne désigne une personne que tant que le compte existe dans l'annuaire. Après suppression du compte dans Keycloak, il devient un pseudonyme : les pièces d'activité restent cohérentes sans permettre de remonter à la personne.

## Procédures

**Droit d'accès.** La personne télécharge ses données depuis son profil (« Télécharger mes données »), ou `GET /v1/me/data-export`. Pour une demande instruite par le délégué à la protection des données : `GET /v1/admin/users/<sub>/data-export` (rôle administrateur).

**Droit à l'effacement.**
1. Supprimer ou désactiver le compte dans **Keycloak** (sinon la personne se reconnecte et son profil est recréé).
2. `POST /v1/admin/users/<sub>/erase` avec `{"confirm":"effacer"}` (rôle administrateur ; un administrateur ne peut pas effacer son propre compte). L'opération est tracée dans le journal d'audit sans donnée personnelle.
3. Conserver la réponse (pseudonyme, nombre de lignes supprimées) dans le registre des traitements.

## Historique Git : pseudonymisation

Les commits d'historique portent le nom et le courriel de l'auteur (plan § 4 et 13.4) ; l'historique est immuable (jamais de réécriture). Deux dispositions, à choisir par l'organisation lors de sa revue RGPD :

1. **Base légale de traçabilité** (par défaut) : l'historique est un registre d'audit ; sa conservation est fondée sur l'obligation de traçabilité, avec durée de conservation fixée par l'organisation. L'accès aux dépôts d'historique est restreint.
2. **Réécriture ciblée** (exceptionnelle) : sur décision du délégué à la protection des données, remplacer l'identité dans le dépôt d'historique par `git filter-repo --mailmap`, puis reconstruire la base (`rebuild --from-git`) pour vérifier la cohérence. Les signatures du service sont alors à reposer ; l'opération est tracée.

Aucune donnée personnelle n'est écrite ailleurs que dans les tables listées plus haut ; les journaux applicatifs ne portent ni courriel ni jeton.
