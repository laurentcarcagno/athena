# Journal de la tâche T-0079

## Fait
- Migration **039** (`0xx_access_lists` de la fiche) : `access_list` (portée projet ou tracker, une liste par portée) et `access_list_member`, RLS forcée `org_isolation`, droits `athena_app`.
- **Filtrage par la base** : politiques RLS *restrictives* (qui s'ajoutent à l'isolation par organisation) sur `project`, `tracker`, `artifact` et toutes les tables rattachées (révisions, commentaires, pièces jointes, liens, champs, statuts, transitions, sprints, jalons, baselines, règles, tailoring, sources documentaires et entrantes, favoris…). Donc recherche, ATQL, plein texte, palette, tableaux de bord, compteurs, couverture, arbre et matrice ne peuvent pas fuiter, quel que soit le service. Un lien dont une extrémité est cachée disparaît.
- `Db.tx` pose, dans une requête authentifiée, le sujet et les projets et trackers que ses listes lui refusent (`app.subject`, `app.denied_projects`, `app.denied_trackers`) ; `AccessContextInterceptor` place le sujet dans un `AsyncLocalStorage` (`request-context.ts`) ; `runAsSystem` (historique, webhooks entrants) et `Db.tx(..., { system: true })` (gestion des listes) ne sont pas filtrés.
- Performance : chaque politique commence par `(select acl_off())` (sous-requête non corrélée, court-circuit) et les contrôles par jointure sont des fonctions à coût déclaré faible : le test des 100 000 artefacts de la couverture reste sous 2 s (une première version avec des `exists` directs le faisait dépasser).
- `AccessService` / `AccessController` : `GET/PUT/DELETE /v1/projects/:p/access-lists` (administrateurs et chefs de projet). Une liste garde au moins un membre ; les membres doivent être des comptes connus ; chaque modification est auditée (ajoutés, retirés, créée) dans le journal chaîné.
- Interface : `AccessLists.tsx` dans l'onglet Membres (création confirmée, avertissement si le créateur n'en fait pas partie, retrait désactivé pour le dernier membre, suppression confirmée).
- Tests : `access.test.ts` (9 : matrice rôle × liste × lecture, recherche, compteurs, couverture, favoris, écriture, liste de tracker, liens, audit, suppression, autre organisation), `access.interceptor.test.ts` (3), `web20.test.tsx` (5, dont axe).

## Décisions
- Un administrateur d'organisation non membre ne lit pas la portée mais peut en gérer la liste (action auditée) : sinon une liste mal faite serait irrécupérable.
- Les favoris qui visent une cible devenue illisible disparaissent de la liste de l'utilisateur.
- Le journal d'audit lui-même n'est pas filtré (consultation réservée aux administrateurs).

## Écarts
- Aucun. Numéros de migration suivants : 040 (T-0099), 041 (T-0080).
