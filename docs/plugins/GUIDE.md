# Écrire un plugin Athena

## Ce qu'un plugin peut faire (v1)
- **Types de champ** (`fieldTypes`) : valider une valeur selon une règle métier.
- **Actions** (`actions`) : fonctions appelées à la demande via `POST /v1/plugins/:id/actions/:nom` (reçoivent clé, version, acteur ; jamais de valeurs).
- **Widgets** (`widgets`) : `GET /v1/plugins/:id/widgets/:nom?project=` renvoie un modèle de données JSON (100 Ko max), rendu par l'interface, jamais du HTML du plugin.
- **Vues** : un widget de modèle `table` (`title`, `columns`, `rows`) est rendu comme vue tabulaire dans le tableau de bord.
- **Connecteurs** (`connectors`) : `POST /v1/projects/:p/plugins/:id/connectors/:nom` {payload} ; le plugin transforme la charge externe en `[{ tracker, values }]` (50 au plus), Athena crée les artefacts sous l'identité de l'appelant avec la validation habituelle. Le plugin n'a aucun accès réseau.
- **Désinstallation** : `DELETE /v1/plugins/:id` (administrateur). Refusée tant qu'un champ utilise un type du plugin ; le stockage du plugin est supprimé, sauf avec `?keepData=true`.
- **Hooks** (`hooks`) : réagir à `artifact.created`, `artifact.updated`, `artifact.transitioned` (reçoit la clé, la version, l'acteur et les **noms** des champs modifiés, jamais leurs valeurs). Une replanification (`POST /v1/projects/:p/schedule/apply`) émet en plus `schedule.changed` (projet, nombre et clés des tickets déplacés).
- Stockage clé/valeur (permission `storage`) et lecture d'artefacts (permission `artifacts:read`).

Les vues, widgets, actions de workflow et connecteurs ne sont pas encore proposés.

## Démarrage
```
node packages/plugin-sdk/bin/athena-plugin.mjs init mon-plugin
node packages/plugin-sdk/bin/athena-plugin.mjs keygen cles/mon-editeur     # crée .key (secrète) et .pub
node packages/plugin-sdk/bin/athena-plugin.mjs pack mon-plugin --key cles/mon-editeur.key
node packages/plugin-sdk/bin/athena-plugin.mjs verify mon-plugin/dist/<id>-<version>.athena.json --pub cles/mon-editeur.pub
```
Ne versionnez jamais la clé `.key`. Donnez la clé `.pub` à l'administrateur : elle est déclarée dans `PLUGIN_TRUSTED_KEYS` sous le nom de l'éditeur (`{"mon-editeur": "-----BEGIN PUBLIC KEY…"}`).

## Manifeste (`manifest.json`)
```json
{
  "id": "com.exemple.couleurs", "name": "Couleurs", "version": "1.0.0", "athena": ">=1.0.0",
  "publisher": "mon-editeur",
  "permissions": ["storage"],
  "contributes": { "fieldTypes": ["hex-color"], "hooks": ["artifact.created"] }
}
```
Un plugin ne peut contribuer que ce que son manifeste déclare. Les permissions demandées doivent être accordées par l'administrateur à l'installation, et sont contrôlées côté serveur.

## Code (`plugin.js`)
```js
plugin = {
  fieldTypes: {
    'hex-color': { validate: (value) => (/^#[0-9a-f]{6}$/i.test(value) ? null : 'couleur #RRGGBB attendue') },
  },
  hooks: {
    'artifact.created': async (event) => { await athena.storage.set('dernier', event.key); },
  },
};
```
Un type de champ retourne `null` si la valeur est valide, sinon un message. Dans un tracker, le type s'appelle `<id du plugin>.<nom>` (ici `com.exemple.couleurs.hex-color`).

## Environnement d'exécution
Le plugin s'exécute dans un processus isolé : pas de `require`, `process`, `fetch`, ni de système de fichiers ; mémoire et durée d'un appel bornées (un appel trop long arrête le plugin) ; l'objet `athena` est la seule interface. Quotas de stockage : 100 clés, 64 Ko par valeur, 1 Mo au total. Si un plugin est arrêté, les valeurs de ses types de champ sont **refusées** (échec fermé).

## Installation
`POST /v1/plugins` avec `{ "package": <fichier .athena.json>, "granted": ["storage"] }` (administrateur). Une version non supérieure à celle installée est refusée. Le paquet est revérifié (signature) à chaque démarrage.
