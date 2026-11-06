# Journal de la tâche T-0071

## Fait
- `TemplateUpgradeService` : `status` (version du projet, dernière version publiée, phase, dérive = ce que le projet a ajouté au gabarit), `preview` (rapport d'impact, ne modifie rien), `apply` (réutilise les évolutions de tracker : chaque évolution incrémente `schema_version` et émet `tracker.updated`, donc un commit de `tracker.yaml`).
- `TrackerService` : `updateStatus` et `removeStatus` (refusé si des items sont dans l'état).
- Routes : `GET /v1/projects/:p/template`, `POST .../template/upgrade-preview`, `POST .../template/upgrade` (administrateurs).
- Rapport : trackers à créer ou modifier, champs ajoutés ou renommés, états ajoutés, renommés, supprimés (avec nombre d'items), transitions ajoutées, règles ajoutées ou mises à jour, phases, avertissements, items concernés.
- Web : `UpgradeReport.tsx` (rapport, blocage en texte, boutons) et 5 tests dont axe ; textes FR/EN `upgrade`.
- Tests API : `template-upgrade.test.ts` (5 : dérive, aperçu sans effet de bord, blocage avec liste, application, refus).

## Décisions
- La montée ne supprime jamais un champ (ses valeurs sont des données) ni un état ou une règle propres au projet : ils restent comme dérive. Un champ retiré du gabarit est signalé « conservé ».
- Un état retiré par le gabarit n'est supprimé que s'il ne porte aucun item ; sinon la montée est bloquée avec la liste (code `conflict`, détails = blocages).
- Un champ obligatoire ajouté dans un tracker qui contient déjà des items est créé facultatif et signalé en avertissement.
- Une règle modifiée dans le projet est conservée (`keptLocal`) ; seule une règle identique à l'ancienne version du gabarit est mise à jour.
- Le composant est branché dans la vue d'ensemble du projet par T-0075.

## Écarts
- Aucun.
