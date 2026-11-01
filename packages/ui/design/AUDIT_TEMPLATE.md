# Rapport d'audit d'interface

Gabarit de la section « Audit d'interface » de `DESIGN.md` (§7). Copier ce fichier, le renseigner, ne laisser aucun champ vide : écrire `NV` (non vérifié) avec la raison. Un constat commence par un fait observé, pas par une opinion.

## 1. Périmètre et contexte

| Rubrique | Contenu |
|---|---|
| Interface auditée | Nom, version, URL ou dépôt |
| Matériau | Captures (noms de fichiers), URL, ou chemin du code ; date de l'observation |
| Écrans et états couverts | Nominal, vide, erreur, chargement, contenu long, rôle restreint |
| Utilisateur type | Rôle, expertise, vocabulaire |
| Tâches principales | 1. … 2. … 3. … (3 à 5 actions) |
| Fréquence d'usage | Quotidien / hebdomadaire / occasionnel, par tâche |
| Environnement | Écran et résolution, clavier ou souris, thème, langue, données et rôles de test |
| Contraintes | Délai, données sensibles, parties inaccessibles |
| Version de DESIGN.md / DESIGN.json | `3.0.0` ou ultérieure |

## 2. Grille d'évaluation

Note de 0 à 3, `NV` si non vérifié (exclu du score). Preuve obligatoire : zone de l'écran, sélecteur, ligne de code ou nom de capture.

| ID | Critère | Note | Preuve | Constats liés |
|---|---|---|---|---|
| N1 | Visibilité de l'état du système | | | |
| N2 | Correspondance avec le monde réel | | | |
| N3 | Contrôle et liberté de l'utilisateur | | | |
| N4 | Cohérence et standards | | | |
| N5 | Prévention des erreurs | | | |
| N6 | Reconnaissance plutôt que rappel | | | |
| N7 | Flexibilité et efficacité d'usage | | | |
| N8 | Design esthétique et minimaliste | | | |
| N9 | Aide à la récupération d'erreur | | | |
| N10 | Aide et documentation | | | |
| H1 | Hiérarchie visuelle et lisibilité | | | |
| T1 | Cohérence avec les tokens et composants | | | |
| A1 | Accessibilité : contrastes | | | |
| A2 | Accessibilité : clavier et ordre de focus | | | |
| A3 | Accessibilité : focus visible | | | |
| A4 | Accessibilité : libellés, noms et rôles | | | |
| A5 | Accessibilité : zones cliquables et couleur seule | | | |
| D1 | Densité et charge cognitive | | | |
| P1 | Performance perçue et retours d'action | | | |
| R1 | Responsive et contenus longs, vides ou en erreur | | | |

## 3. Constats

Un bloc par constat, copié autant de fois que nécessaire.

### F-01 : titre court

| Champ | Contenu |
|---|---|
| Gravité | bloquant / majeur / mineur / suggestion |
| Critère violé | ex. A1 |
| Nature | fait observé / interprétation / recommandation |
| Preuve | Emplacement : zone, sélecteur, ligne de code ou capture |
| Fait observé | Ce qui est mesuré ou vu, avec la valeur (ex. `4,16:1` sur `{colors.cold-mist}`) |
| Impact utilisateur | Qui, quelle tâche, quelle conséquence |
| Correction recommandée | En tokens du système (ex. `{semantic.text.mute-aa}`) |
| Effort | S / M / L |
| Vérifié | Oui / non, comment ; ce qui n'a pas pu l'être |

## 4. Synthèse

### 4.1 Score par critère

| Famille | Critères | Moyenne (0 à 3) |
|---|---|---|
| Nielsen | N1 à N10 | |
| Hiérarchie | H1 | |
| Système | T1 | |
| Accessibilité | A1 à A5 | |
| Densité | D1 | |
| Performance | P1 | |
| Robustesse | R1 | |

### 4.2 Top 5 des problèmes

Tri par gravité, puis par impact sur les tâches fréquentes.

1. F-… : …
2. …

### 4.3 Gains rapides

Gravité bloquant ou majeur **et** effort S.

| Constat | Correction | Tokens |
|---|---|---|
| | | |

### 4.4 Plan de correction priorisé

| Ordre | Constats | Action | Effort | Dépend de |
|---|---|---|---|---|
| 1 | | Corrections de tokens d'abord (elles se propagent) | | |

### 4.5 Périmètre non vérifié

Liste des états, rôles, écrans et flux non testés, avec la raison.

- …

## 5. Règles de rigueur (rappel)

- Ne jamais affirmer sans preuve.
- Distinguer fait observé, interprétation et recommandation.
- Signaler ce qui n'a pas pu être vérifié.
- Ne pas proposer de re-design avant la fin de l'audit : la refonte suit la méthode de la §8 de `DESIGN.md`.
