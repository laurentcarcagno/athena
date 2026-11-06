# Journal de la tâche T-0070

## Fait
- `template-inherit.ts` (fonctions pures) : `mergeLayers` (fusion déterministe : parent d'abord, enfant redéfinit sur place ou ajoute ; retraits `remove` appliqués, transitions orphelines retirées), `inheritanceProblems` (retrait ou renommage d'un élément obligatoire refusé, retrait d'un élément inconnu refusé), `resolveLayers`, `chainProblems` (cycles, profondeur maximale 5).
- `TemplateService` : `create`/`update` acceptent `parent {key, version?}` ; un gabarit incohérent ou qui viole l'héritage est refusé avec la liste des éléments ; le parent doit avoir une version publiée ; `resolve` (aperçu du gabarit fusionné) ; `publish` fige le gabarit résolu et épingle la version du parent ; l'import YAML conserve le parent.
- Routes : `GET /v1/project-templates/:key/resolved`, `parent` dans les corps de création et de modification.
- Tests : `template-inherit.test.ts` (8, table de fusion, retraits, cycles) et 2 tests d'intégration dans `template-versions.test.ts`.

## Décisions
- Un dérivé s'appuie sur une version **publiée** de son parent (dernière par défaut) : une nouvelle version du parent n'altère jamais un dérivé déjà publié.
- Les éléments obligatoires sont déclarés dans `normative.mandatory` (chemins `tracker:SRS`, `field:SRS.title`, `status:RID.closed`, `phase:pdr`…) ; l'ensemble est transmis aux dérivés.

## Écarts
- Aucun.
