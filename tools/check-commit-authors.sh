#!/bin/sh
# Contrôle CI : tous les commits de la plage ont l'auteur et le committer uniques.
# Usage : tools/check-commit-authors.sh <base>..<head>
RANGE="${1:?plage requise}"
EXPECTED="Laurent Carcagno <laurent.carcagno@gmail.com>"
if git log --format='%an <%ae>%n%cn <%ce>' "$RANGE" | grep -vxF "$EXPECTED" | grep -q .; then
  echo "Commits avec une identité non autorisée dans $RANGE :" >&2
  git log --format='%h %an <%ae> / %cn <%ce>' "$RANGE" >&2
  exit 1
fi
if git log --format=%B "$RANGE" | grep -qiE '^co-authored-by'; then
  echo "Trailer Co-Authored-By interdit." >&2; exit 1
fi
echo "OK : auteur unique respecté."
