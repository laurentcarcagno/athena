# SDK de l'API (TypeScript et Python)

Plan § 7.3 : SDK générés. Les deux clients sont produits depuis le contrat OpenAPI complet de l'API (`GET /v1/openapi.json`, 300 opérations environ) : aucune route n'est écrite à la main.

## Génération

```
node tools/dump-openapi.mjs docs/api/openapi.json      # contrat depuis le code
node tools/gen-sdk.mjs --spec docs/api/openapi.json     # écrit les deux clients
# ou, depuis une instance en marche :
node tools/gen-sdk.mjs --url https://athena.exemple.lan --token athp_...
```
Régénérer après tout ajout ou changement de route ; le test `openapi-complete.test.ts` garantit que le contrat décrit tous les contrôleurs.

## TypeScript (`@athena/sdk`, `packages/sdk-ts`)

```ts
import { AthenaClient, AthenaError } from '@athena/sdk';
const athena = new AthenaClient({ baseUrl: 'https://athena.exemple.lan', token: process.env.ATHENA_TOKEN! });
const created = await athena.pat.create({ name: 'CI', scope: 'read', expiresInDays: 30 }); // corps typé depuis le schéma
const results = await athena.search.search({ q: 'status = Open', limit: 20 });
await athena.pat.revoke({ id: '...' });
```
Les méthodes sont regroupées par contrôleur (`athena.<groupe>.<méthode>`), les paramètres de chemin sont un objet `{ nom: valeur }`, les paramètres de requête le dernier argument. Une réponse non 2xx lève `AthenaError` (statut et corps).

## Python (`athena-sdk`, `packages/sdk-python`)

```python
from athena_sdk import AthenaClient, AthenaError
athena = AthenaClient("https://athena.exemple.lan", "athp_...")
athena.pat.create(body={"name": "CI", "scope": "read", "expiresInDays": 30})
athena.search.search(query={"q": "status = Open", "limit": 20})
athena.pat.revoke("identifiant")
```
Bibliothèque standard seulement (aucune dépendance). Python 3.9 ou plus.

## Authentification

Un jeton d'accès personnel (profil, « Jetons d'accès personnels ») : portée `read` pour les lectures, `write` pour les écritures, expiration obligatoire. Le jeton est envoyé en `Authorization: Bearer`.

## Tests

`pnpm --filter @athena/sdk test` (client TypeScript, `fetch` simulé) et `cd packages/sdk-python && PYTHONPATH=. python -m unittest discover -s tests` (client Python contre un serveur HTTP local).

## GraphQL (lecture seule)

`POST /v1/graphql` (corps `{ "query", "variables", "operationName" }`) ou `GET /v1/graphql?query=...`. Mêmes droits que l'API REST (listes d'ayants droit, droits de lecture par champ). Aucune mutation ni abonnement : l'écriture reste en REST. Limites : requête de 20 000 caractères au plus, 7 niveaux de profondeur, pages de 200 éléments au plus.

```graphql
{
  projects { key name trackers { key artifactCount } }
  artifact(project: "ARI", key: "ARI-BUG-0001") { key status version values }
  search(q: "status = Open AND severity = majeure", limit: 20) { total hits { key project title statusName } }
  project(key: "ARI") { artifacts(tracker: "BUG", query: "severity = mineure") { hits { key title } } }
}
```
Avec les SDK : `athena.graphql.post({ query: '{ projects { key } }' })` (TypeScript), `athena.graphql.post(body={"query": "{ projects { key } }"})` (Python).
