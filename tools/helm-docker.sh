#!/bin/sh
# Exécute helm dans un conteneur (sans installation locale) sur une copie de deploy/helm. Usage : tools/helm-docker.sh template t /c/athena -f /c/athena/values-isolated.yaml
export MSYS_NO_PATHCONV=1
set -eu
name="helm-run-$$"
docker create --name "$name" alpine/helm:3.16.2 "$@" >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1' EXIT
docker cp "$(dirname "$0")/../deploy/helm" "$name:/c"
docker start -a "$name"
