# Lot 17 : PPM, incrément I0, prérequis de niveau projet

Étude : `docs/ppm/` (vision, modèle de données `03`, architecture `06`, plan `07`, backlog `08`). Ouvert par l'utilisateur le 2026-11-17, après la levée des écarts des lots 13 et 16. Décisions du plan de livraison (D1 à D7) prises ; un lot par incrément (D2). Travail fait par un seul agent, sans sous-agent (consigne du 2026-11-17).

Migrations réelles : la prochaine est la **065**.

| Tâche | Backlog | Contenu | État |
|---|---|---|---|
| T-0185 | B04 | `PpmModule` : portefeuilles et équipes déplacés dans `apps/api/src/ppm/`, exports de `CoreModule` | faite |
| T-0186 | B05 | Interrupteurs de fonctionnalité par organisation (`organization_feature`, migration 065), prise en compte par l'API (404) et le rail | faite |
| T-0187 | B06 | Réglages PPM de l'organisation : durée de la journée en heures et minutes, rétention et fréquence des instantanés, seuils ; Administration › PPM (migration 066, `DurationField`, interrupteurs) | faite |
| T-0188 | B07, B08 | Vérifications ECharts : rendu SVG sous la CSP de production, poids du chunk | faite (CSP confirmée en infobulle `richText` ; poids 220 Ko gzip / 179 Ko brotli : décision à prendre) |
| T-0189 | B09 | Composant `<Chart>` : thème par jetons, `aria`, motifs, vue tableau | faite (`packages/ui/src/chart.tsx`, gzip activé dans nginx ; poids ECharts accepté par l'utilisateur) |
| T-0190 | B10 | Méta du projet (dates, sponsor, description, granularité) : migration, API, carte | faite (migration 067, table `project_meta`, `GET/PATCH /v1/projects/:p/meta`, carte « Informations ») |
| T-0191 | B11 | Cycle de vie configurable : migration, états livrés, transitions, historique, API | faite (migration 068, `ppm/lifecycle*.ts`) |
| T-0192 | B11 | Cycle de vie : Administration › Cycle de vie et action de transition dans le projet | faite |
| T-0193 | B12 | Phases datées et décisions de gate : migration, API, historique des dates | faite (migration 069) |
| T-0194 | B12 | Phases datées : frise des gates avec dates et décisions | faite |
| T-0195 | B13 | Rôles sémantiques probabilité et impact | faite (migration 070) |
| T-0196 | B14 | Test d'architecture des politiques RLS | faite |
| T-0197 | B15 | Vérification : unité de `remaining` dans les données existantes | faite |
| T-0198 | B16 | Vérification : performance du tableau de santé au palier 1 | faite (P95 1,6 s) |
| T-0199 | — | `LOT17-VERIFICATION.md`, `STATE.md` | faite |

Règle de l'agent : un commit par tâche, tests ciblés, e2e seulement à la vérification du lot. Handoff vers une nouvelle session si le contexte approche 70 %.
