# Gabarits de tableaux de bord (administration)

Réservé à l'administrateur : **Organisation › Gabarits › Tableaux de bord**. Décisions : `docs/dev/DECISIONS/ADR-0010-gabarits-de-tableaux-de-bord.md`.

## Ce qu'est un gabarit

Un gabarit est un point de départ pour un type de tableau de bord (Mon travail, vue d'ensemble d'un projet, avancement d'un projet, portefeuille), à un à neuf onglets. Il cible des **rôles**, et pour un projet des **natures** (logiciel spatial, projet spatial, logiciel de défense, opération d'armement, générique : déduite du gabarit normatif du projet, héritages compris) et des **rôles dans le projet** (chef, membre, lecteur). Une liste vide veut dire « tous ».

Athena en livre 23, qui ne se modifient pas. Vous pouvez les **masquer** (ils ne sont plus proposés) ou les **dupliquer** en gabarits d'organisation, que vous modifiez. Favoris et Récents n'y figurent pas.

## Les cartes d'un gabarit

- Aucune clé de projet ni de portefeuille n'y est écrite. Dans un tableau de bord de projet, les cartes visent le projet courant ; dans un portefeuille, le portefeuille courant.
- Dans Mon travail, une carte de projet se règle **Une par projet** (projets dont la personne est chef, à défaut membre ; pour l'administrateur, le PMO, le directeur et la finance sans projet, tous les projets visibles) et une carte de portefeuille **Un par portefeuille**. Au plus 24 cartes par onglet : le surplus est écarté et signalé à la personne.
- Le catalogue de l'éditeur est l'intersection de ce que chacun des rôles ciblés peut poser. Un gabarit qui contient une carte refusée à l'un de ces rôles est refusé à l'enregistrement.
- Les requêtes de recherche portent sur des **types** de tracker (`type = risk`), pas sur des clés, pour fonctionner quelle que soit la nature du projet.

## Gabarit par défaut

**Par défaut pour…** désigne, pour un type et un rôle, le gabarit que reçoit une personne qui n'a encore rien enregistré dans ce tableau de bord (ni disposition, ni onglet nommé). Elle en reçoit une copie à sa première ouverture, puis elle est chez elle. Si elle a plusieurs rôles, le premier de cet ordre qui a un défaut l'emporte : administrateur, PMO, directeur, chef de projet, responsable d'équipe, finance, assurance produit, membre d'équipe. Sans défaut, les tableaux de bord restent vides (réglage de livraison).

## Aperçu

**Aperçu** résout un gabarit sur un projet ou un portefeuille réels, avec les droits de l'administrateur, sans rien enregistrer. Dans Mon travail, les cartes répétées suivent les projets et portefeuilles de l'administrateur.

## Notes

- Un gabarit supprimé ou modifié ne change jamais les tableaux de bord déjà copiés.
- Un gabarit de projet est aussi filtré par la nature du projet et le rôle de la personne dans ce projet ; un projet hors des projets d'un chef de projet limité à ses projets reste invisible.
- Les données de démonstration laissent tous les tableaux de bord vides et ne désignent aucun gabarit par défaut.
- Routes : `GET/POST /v1/dashboard-templates`, `PUT/DELETE /v1/dashboard-templates/{clé}`, `POST …/{clé}/duplicate`, `PUT …/{clé}/hidden`, `PUT/DELETE /v1/dashboard-templates/defaults/{type}/{rôle}`, `POST …/{clé}/preview`, `GET /v1/dashboard-templates/catalog` ; côté personne : `GET /v1/me/dashboard/templates`, `POST /v1/me/dashboard/templates/{clé}/apply`.
