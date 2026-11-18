#!/bin/sh
# Vérifie que chaque commit d'une plage est signé (SSH ou GPG) par une clé de confiance (plan § 13.4).
# Usage : tools/check-commit-signatures.sh <plage>        ex. origin/develop..HEAD
# Clés SSH de confiance : fichier `allowed_signers` indiqué par ALLOWED_SIGNERS (défaut : tools/allowed_signers). Clés GPG : trousseau de l'exécuteur.
set -eu
range="${1:?plage de commits requise}"
signers="${ALLOWED_SIGNERS:-tools/allowed_signers}"
[ -f "$signers" ] && git config gpg.ssh.allowedSignersFile "$signers"
bad=0
for sha in $(git rev-list "$range"); do
  # G = bonne signature ; toute autre valeur (N absente, B mauvaise, E introuvable, U non fiable...) est un échec
  status=$(git log -1 --format='%G?' "$sha")
  if [ "$status" != "G" ]; then
    echo "Commit $(git log -1 --format='%h %s' "$sha") : signature absente ou non fiable ($status)" >&2
    bad=1
  fi
done
[ "$bad" = 0 ] && echo "Tous les commits de $range sont signés par une clé de confiance."
exit "$bad"
