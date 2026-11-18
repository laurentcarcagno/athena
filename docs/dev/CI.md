# Chaîne d'intégration et de sécurité (plan § 13.2)

Pipeline GitLab : `.gitlab-ci.yml`. Étapes : `verify`, `security`, `package`, `recette`, `nightly`.

| Job | Quand | Contrôle | Bloquant |
|---|---|---|---|
| `verify` | toujours | lint, types, tests (PostgreSQL de service), build | oui |
| `commit-authors` | merge request | auteur et committer uniques (§ 13.4) | oui |
| `commit-signatures` | merge request | chaque commit est signé par une clé de `tools/allowed_signers` (SSH) ou du trousseau (GPG) | oui |
| `secrets` | toujours | gitleaks sur le dépôt et l'historique | oui |
| `audit` | toujours | `pnpm audit --audit-level=high` | oui |
| `sast-semgrep` | toujours | règles `p/typescript`, `p/nodejs`, `p/jwt` et `tools/semgrep/athena.yml` (SQL concaténé, `eval`, `child_process`, JWT non vérifié, `fetch` non protégé) | oui |
| `sca-osv` | toujours | osv-scanner sur `pnpm-lock.yaml` | oui |
| `sbom-licences` | toujours | SBOM CycloneDX (`sbom.cdx.json`) et contrôle des licences (`tools/check-licenses.mjs`) | oui |
| `iac-trivy` | toujours | Trivy sur Dockerfile, chart Helm et déploiement VM | oui (HIGH, CRITICAL) |
| `images` | étiquette | construction (kaniko) des images `api` et `web` | oui |
| `images-scan-sign` | étiquette | Trivy sur les images, signature cosign, attestation de provenance (SLSA) | oui |
| `dast-zap` | étiquette, si `RECETTE_URL` | OWASP ZAP (baseline) sur la recette | rapport |
| `contract-schemathesis` | étiquette, si `RECETTE_URL` et `RECETTE_TOKEN` | contrat OpenAPI : pas d'erreur serveur, conformité des réponses | oui |
| `charge-k6` | planification nocturne | `tools/k6/athena.js` : liste, recherche, création, rafale de webhooks ; seuils du plan | oui |

Le fuzzing des analyseurs (ATQL, mappeurs de webhooks entrants, import YAML des tickets, lecteur `.sdoc`) est dans la suite de tests (`apps/api/src/security/fuzz.test.ts`) : il tourne dans `verify`.

## Variables de projet à définir

| Variable | Usage |
|---|---|
| `RECETTE_URL` | URL de l'environnement de recette (DAST, contrat, charge) |
| `RECETTE_TOKEN` | jeton d'accès personnel en écriture d'un compte de recette (profil, « Jetons d'accès personnels ») |
| `COSIGN_PRIVATE_KEY`, `COSIGN_PASSWORD` | clé de signature des images (variables masquées et protégées) |
| `K6_PROJECT`, `K6_TRACKER`, `K6_HOOK_PATH`, `K6_HOOK_SECRET` | cibles de la charge nocturne |

## Planification

Créer dans GitLab (CI/CD, planifications) une exécution quotidienne à 2 h pour `charge-k6`. Les analyses de recette (ZAP, Schemathesis) s'exécutent à chaque étiquette de version.

## Limites

Ces jobs n'ont pas pu être exécutés depuis le poste de développement (pas de GitLab Runner, ni de recette) : leur syntaxe est validée (YAML, scripts), et `check-licenses.mjs`, `check-commit-signatures.sh` et `tools/k6/athena.js` ont été essayés localement. Le premier pipeline sur l'instance GitLab de l'organisation servira de recette de la chaîne.
