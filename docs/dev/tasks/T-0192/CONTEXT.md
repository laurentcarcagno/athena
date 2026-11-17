# T-0192 : cycle de vie, interface (B11)

- Administration › Cycle de vie (`components/LifecycleAdmin.tsx`) : renommer, masquer, ajouter des états, ajouter ou retirer des transitions et leurs rôles, revenir aux états livrés.
- Vue d'ensemble du projet : carte `ProjectLifecycleCard` (état courant, boutons des seules transitions permises, motif obligatoire pour annuler ou refuser, historique).
- Tests : `components/Lifecycle.test.tsx`. Suite web 627/627.
- Non fait : les clés d'état affichées dans l'historique sont brutes (pas de nom) ; filtres par catégorie dans les listes de projets, avec les consommateurs (I1).
