# T-0032 : CLI athena et job CI athena-check
- Livre : paquet @athena/cli sans dependance : athena branch <CLE> (cree la branche via lAPI avec jeton Bearer, --checkout), athena hook install|commit-msg (ajoute Refs <CLE> depuis la branche, respecte commentaires git, fusions et reverts), athena check --range (cle exigee sauf prefixes chore/docs/ci/build/style, verification de lexistence via lAPI, 401/403 distincts) ; gabarit GitLab CI deploy/ci/athena-check.gitlab-ci.yml.
- Tests : 8 (dont CLI reel contre un serveur HTTP de test et un depot git temporaire).
- Non fait : distribution du CLI (registre interne), authentification interactive (seul un jeton est supporte).
