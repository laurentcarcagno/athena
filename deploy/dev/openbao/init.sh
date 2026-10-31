#!/bin/sh
set -e
until bao status >/dev/null 2>&1; do sleep 1; done
bao secrets list | grep -q '^transit/' || bao secrets enable transit
bao read transit/keys/athena-org-default >/dev/null 2>&1 || bao write -f transit/keys/athena-org-default type=aes256-gcm96
bao policy write athena-api /athena-api.hcl
bao kv put secret/athena/dev/webhook-signing key=dev-only-hmac-secret >/dev/null
echo "openbao-init: OK"
