# Journal de la tâche T-0063

## Fait
- Migration **034** (numéro du prochain libre ; la fiche disait 033) : `link_type.project_id` nullable + unicité `(organization_id, key)` pour les types d'organisation, table `link_type_pair` (RLS forcée), droits `update`/`delete`.
- `link-types.ts` : six types livrés (données, avec paires de types de tracker) ; `link-type.service.ts` : `resolveLinkType` (projet, puis organisation, puis livré écrit au premier usage), `assertPairAllowed`, administration (liste fusionnée livrés + organisation, création, modification d'un livré = écriture en base, suppression/réinitialisation refusées si des liens l'utilisent, changement hiérarchique refusé si des liens existent) ; routes `/v1/link-types` ; `LinkService.listTypes` fusionne types du projet et de l'organisation (`scope`).
- Web : Organisation > Liens (`LinkTypesTab`), paires avec noms de types de tracker.
- Tests : `link-types.test.ts` (surcharge, paires dans les deux sens, tracker sans type, type sans paire, cycles, CRUD, isolation, migration de données sur base ancienne), `web13.test.tsx`.

## Reste à faire
- Le sélecteur de création de lien propose tous les types ; le refus (422) est affiché à la création. Un filtrage par paires dans le sélecteur est possible plus tard.
- Les liens existants ne sont pas revérifiés quand les paires changent (documenté).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0064 (suspicion sur champs de contenu).
