# T-0124 : Libellés, glossaire (Lot 9, J)

Critère : le test échoue si « artefact », « release » ou « template » restent dans les textes français affichés.

## Fait (2026-11-10)
- `i18n.ts` (français) : Ticket (nouveau ticket, tickets citant…), Version (« Aucune version »), Gabarit (gabarits de projet et de tracker). Remplacement limité aux valeurs de chaîne : les clés (`fr.org.template`…) et les routes d'API (`/project-templates`) ne changent pas.
- Messages d'erreur de l'API affichés à l'utilisateur (`notFound`, `conflict`, `validation`) : « Ticket … », « Version publiée… », « Gabarit … ».
- `vocabulaire.test.ts` : parcourt tout le dictionnaire français (chaînes et fonctions) et refuse `artefact`, `release`, `template` ; vérifie la présence des termes du glossaire.
- Tests web et e2e mis à jour (`Nouveau ticket`, `Gabarits`…). `docs/user/GUIDE.md` et `FORMATION.md` : vocabulaire et navigation (rail, Rapports, Paramètres, Profil, tableau de bord, Administration).
- Web 418/418 ; e2e 43/44 (voir pièges).

## Pièges
- Le dictionnaire anglais garde « artifact », « release », « template » : le glossaire ne concerne que le français.
- Les captures du manuel (`docs/user`) ne sont pas dans le dépôt : à refaire avec le skill `doc:mu` si l'utilisateur le demande.
- `notifications.spec` (suivi d'un item) est instable : la case « Commentaire » reste cochée au premier passage après réinitialisation de la base ; passe au rejeu.
- OpenBao (HTTP 403) : tests d'intégration en échec dans cet environnement, sans lien avec le lot.

## Prompt de reprise
T-0125 : vérification du lot critère par critère (`LOT9-VERIFICATION.md`, modèle `LOT7-VERIFICATION.md`), e2e rejoués, puis arrêt et compte rendu.
