#!/bin/sh
# Recette du déploiement en réseau isolé sur un cluster `kind` (Calico), d'un seul tenant et reproductible :
#   sh tools/recette-kind.sh            (images athena-api:0.1.0 et athena-web:0.1.0 construites au préalable)
# 1. cluster sans CNI par défaut + Calico ; DNS du cluster isolé (coredns-isolated.yaml) AVANT tout déploiement ;
# 2. images tierces et Athena chargées comme depuis un registre interne (reg.test/athena, imagePullPolicy Never) ;
# 3. chart rendu avec values-isolated.yaml : PostgreSQL (hors chart), migrations, API, worker, web, Keycloak, OpenBao ;
# 4. OpenBao initialisé, jeton applicatif ; parcours de bout en bout avec un jeton du Keycloak du cluster ;
# 5. connectivité mesurée DEPUIS LES VRAIS PODS du chart (aucun pod de test) ; résolution DNS depuis le pod API.
set -u
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CTX=kind-athena-iso
K="kubectl --context $CTX"
KA="$K -n athena"
R=reg.test/athena
cd "$ROOT"
WORK=.recette-kind-tmp   # chemin relatif : kind et kubectl (binaires Windows) ne lisent pas /tmp
mkdir -p "$WORK"; trap 'rm -rf "$WORK"; kind delete cluster --name athena-iso >/dev/null 2>&1' EXIT
H="Host: athena-keycloak:8080"

step() { printf '\n== %s\n' "$*"; }

step "1. Cluster kind + Calico + DNS isolé"
kind delete cluster --name athena-iso >/dev/null 2>&1 || true
printf 'kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nnetworking:\n  disableDefaultCNI: true\n  podSubnet: 192.168.0.0/16\n' > "$WORK/kind.yaml"
kind create cluster --name athena-iso --config "$WORK/kind.yaml" --wait 0s >/dev/null 2>&1
$K apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.1/manifests/calico.yaml >/dev/null
$K -n kube-system rollout status ds/calico-node --timeout=300s >/dev/null
cat deploy/helm/athena/coredns-isolated.yaml | $K apply -f - >/dev/null 2>&1
$K -n kube-system rollout restart deploy/coredns >/dev/null
$K -n kube-system rollout status deploy/coredns --timeout=120s >/dev/null
echo "CoreDNS sans forward : $($K -n kube-system get cm coredns -o jsonpath='{.data.Corefile}' | grep -c forward) ligne(s) forward"

step "2. Images (registre interne simulé)"
for pair in athena-api:0.1.0 athena-web:0.1.0 postgres:16 quay.io/keycloak/keycloak:26.0 openbao/openbao:2.1; do
  name=$(basename "${pair%%:*}"); tag="${pair##*:}"
  docker tag "$pair" "$R/$name:$tag"
  kind load docker-image --name athena-iso "$R/$name:$tag" >/dev/null 2>&1
done

step "3. PostgreSQL, secrets, chart isolé"
printf 'apiVersion: v1\nkind: Namespace\nmetadata: { name: athena }\n---\napiVersion: v1\nkind: Namespace\nmetadata: { name: db }\n---\napiVersion: v1\nkind: Pod\nmetadata: { name: pg, namespace: db, labels: { app: pg } }\nspec:\n  containers:\n    - name: pg\n      image: %s/postgres:16\n      imagePullPolicy: Never\n      env: [{ name: POSTGRES_PASSWORD, value: pgpass-recette }]\n---\napiVersion: v1\nkind: Service\nmetadata: { name: pg, namespace: db }\nspec: { selector: { app: pg }, ports: [{ port: 5432 }] }\n' "$R" | $K apply -f - >/dev/null
$K -n db wait --for=condition=Ready pod/pg --timeout=180s >/dev/null; sleep 5
$K -n db exec pg -- psql -U postgres -q -c "create role athena_owner login superuser password 'ownerpass'" -c "create database athena owner athena_owner" -c "create role keycloak login password 'kcpass'" -c "create database keycloak owner keycloak" >/dev/null
DB=$($K -n db get pod pg -o jsonpath='{.status.podIP}')
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$WORK/tls.key" -out "$WORK/tls.crt" -days 2 -subj "/CN=athena-openbao" -addext "subjectAltName=DNS:athena-openbao,DNS:athena-openbao.athena.svc" >/dev/null 2>&1
$KA create secret generic athena-env --from-literal=DATABASE_URL='postgres://athena_login:loginpass@pg.db.svc.cluster.local:5432/athena' --from-literal=KEYCLOAK_WEB_CLIENT_SECRET=dev-only-athena-web-secret --from-literal=SESSION_SECRET=recette-session-secret-0123456789abcdef --from-literal=OPENBAO_TOKEN=pending-init >/dev/null
$KA create secret generic athena-migration --from-literal=MIGRATION_DATABASE_URL='postgres://athena_owner:ownerpass@pg.db.svc.cluster.local:5432/athena' >/dev/null
$KA create secret generic athena-keycloak --from-literal=KC_DB_URL='jdbc:postgresql://pg.db.svc.cluster.local:5432/keycloak' --from-literal=KC_DB_USERNAME=keycloak --from-literal=KC_DB_PASSWORD=kcpass --from-literal=KEYCLOAK_ADMIN=admin --from-literal=KEYCLOAK_ADMIN_PASSWORD=admin-recette >/dev/null
$KA create secret tls athena-openbao-tls --cert="$WORK/tls.crt" --key="$WORK/tls.key" >/dev/null
$KA create configmap athena-realm --from-file=athena-realm.json=deploy/dev/keycloak/athena-realm.json >/dev/null
sh tools/helm-docker.sh template t /c/athena -f /c/athena/values-isolated.yaml --set image.registry=$R --set image.pullPolicy=Never --set networkPolicy.databaseCidr=$DB/32 --set isolated.keycloak.realmConfigMap=athena-realm --set isolated.keycloak.host=athena-keycloak --set config.keycloakIssuer=http://athena-keycloak:8080/realms/athena --set config.openbaoAddr=https://athena-openbao:8200 --set ingress.enabled=false --set publicUrl=http://athena-web:8080 | $KA apply -f - >/dev/null
$KA wait --for=condition=complete job/athena-migrate-1 --timeout=240s >/dev/null
echo "migrations : $($KA logs job/athena-migrate-1 | grep -c '^  + ') appliquée(s)"
$K -n db exec pg -- psql -U postgres -d athena -q -c "create role athena_login login password 'loginpass' in role athena_app" -c "insert into organization (key, name) values ('demo','Démo')" >/dev/null

step "4. OpenBao et parcours de bout en bout"
$KA wait --for=condition=Ready pod/athena-openbao-0 --timeout=240s >/dev/null
BAO="$KA exec athena-openbao-0 -- env BAO_ADDR=https://127.0.0.1:8200 BAO_SKIP_VERIFY=true"
$BAO bao operator init -key-shares=1 -key-threshold=1 -format=json > "$WORK/init.json"
KEY=$(grep -A1 unseal_keys_b64 "$WORK/init.json" | tail -1 | tr -d ' ",'); ROOTTOK=$(grep root_token "$WORK/init.json" | sed 's/.*: "\(.*\)".*/\1/')
$BAO bao operator unseal "$KEY" >/dev/null
BAOT="$KA exec athena-openbao-0 -- env BAO_ADDR=https://127.0.0.1:8200 BAO_SKIP_VERIFY=true BAO_TOKEN=$ROOTTOK"
$BAOT bao secrets enable -path=secret kv-v2 >/dev/null; $BAOT bao secrets enable transit >/dev/null
cat deploy/dev/openbao/athena-api.hcl | $KA exec -i athena-openbao-0 -- env BAO_ADDR=https://127.0.0.1:8200 BAO_SKIP_VERIFY=true BAO_TOKEN=$ROOTTOK bao policy write athena-api - >/dev/null
TOK=$($BAOT bao token create -policy=athena-api -format=json | grep client_token | sed 's/.*: "\(.*\)".*/\1/')
$KA create secret generic athena-env --from-literal=DATABASE_URL='postgres://athena_login:loginpass@pg.db.svc.cluster.local:5432/athena' --from-literal=KEYCLOAK_WEB_CLIENT_SECRET=dev-only-athena-web-secret --from-literal=SESSION_SECRET=recette-session-secret-0123456789abcdef --from-literal=OPENBAO_TOKEN="$TOK" --dry-run=client -o yaml | $KA apply -f - >/dev/null 2>&1
$KA rollout restart deploy/athena-api deploy/athena-worker >/dev/null
for d in athena-api athena-worker athena-web athena-keycloak; do $KA rollout status deploy/$d --timeout=300s >/dev/null; done
$KA get pods --no-headers | awk '{print "  " $1 " " $2 " " $3}'
$KA port-forward svc/athena-keycloak 18080:8080 >/dev/null 2>&1 & PF1=$!
$KA port-forward svc/athena-api 13001:3001 >/dev/null 2>&1 & PF2=$!
for i in $(seq 40); do curl -s -o /dev/null http://localhost:18080/realms/master && curl -s -o /dev/null http://localhost:13001/healthz && break; sleep 2; done
M=$(curl -s -H "$H" -d grant_type=password -d client_id=admin-cli -d username=admin -d password=admin-recette http://localhost:18080/realms/master/protocol/openid-connect/token | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//;s/"$//')
ID=$(curl -s -H "$H" -H "Authorization: Bearer $M" "http://localhost:18080/admin/realms/athena/users?username=admin.dev&exact=true" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"$//')
curl -s -o /dev/null -X PUT -H "$H" -H "Authorization: Bearer $M" -H "Content-Type: application/json" -d '{"requiredActions":[]}' http://localhost:18080/admin/realms/athena/users/$ID
tok() { curl -s -H "$H" -d grant_type=password -d client_id=athena-dev-cli -d "username=$1" -d "password=$2" http://localhost:18080/realms/athena/protocol/openid-connect/token | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//;s/"$//'; }
A=$(tok admin.dev dev-only-admin); Q=$(tok qa.dev dev-only-qa)
echo "  admin.dev /v1/me : $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $A" http://localhost:13001/v1/me)"
echo "  projet Spatial   : $(curl -s -X POST -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"key":"SPA","name":"Satellite","template":"spatial","criticality":"B"}' http://localhost:13001/v1/projects | grep -o '"templateVersion":"[^"]*"')"
echo "  projet Défense   : $(curl -s -X POST -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"key":"DEF","name":"Programme","template":"defense","criticality":"C"}' http://localhost:13001/v1/projects | grep -o '"templateVersion":"[^"]*"')"
echo "  qa.dev lit (GET) : $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $Q" http://localhost:13001/v1/projects/SPA/approvals)"
echo "  qa.dev écrit     : $(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $Q" -H 'Content-Type: application/json' -d '{}' http://localhost:13001/v1/projects/SPA/trackers)"
kill $PF1 $PF2 2>/dev/null || true

step "5. Connectivité mesurée depuis les vrais pods du chart"
pod() { $KA get pod -l app.kubernetes.io/component=$1 -o jsonpath='{.items[0].metadata.name}'; }
API=$(pod api); WRK=$(pod worker); WEB=$(pod web); KC=$(pod keycloak)
KCIP=$($KA get svc athena-keycloak -o jsonpath='{.spec.clusterIP}'); BAOIP=$($KA get svc athena-openbao -o jsonpath='{.spec.clusterIP}'); WEBIP=$($KA get svc athena-web -o jsonpath='{.spec.clusterIP}'); APIIP=$($KA get svc athena-api -o jsonpath='{.spec.clusterIP}')
node_probe() { # pod conteneur hôte port
  $KA exec "$1" -c "$2" -- /nodejs/bin/node -e "const s=require('net').connect({host:'$3',port:$4,timeout:3000});s.on('connect',()=>{console.log('OUVERT');process.exit(0)});s.on('timeout',()=>{console.log('BLOQUE');process.exit(0)});s.on('error',()=>{console.log('BLOQUE');process.exit(0)})" 2>&1 | tail -1; }
sh_probe() { # pod conteneur hôte port (bash /dev/tcp ou nc)
  $KA exec "$1" -c "$2" -- sh -c "(timeout 3 sh -c 'exec 3<>/dev/tcp/$3/$4' 2>/dev/null || timeout 3 nc -z $3 $4 2>/dev/null) && echo OUVERT || echo BLOQUE" 2>&1 | grep -oE 'OUVERT|BLOQUE' | tail -1 | grep . || echo BLOQUE; }
row() { printf '  %-9s -> %-22s : %s\n' "$1" "$2" "$3"; }
for t in "1.1.1.1 443" "8.8.8.8 53" "$KCIP 8080" "$BAOIP 8200" "$WEBIP 8080"; do set -- $t; row api "$1:$2" "$(node_probe $API api $1 $2)"; done
for t in "1.1.1.1 443" "$KCIP 8080" "$BAOIP 8200"; do set -- $t; row worker "$1:$2" "$(node_probe $WRK worker $1 $2)"; done
for t in "$APIIP 3001" "1.1.1.1 443" "$KCIP 8080"; do set -- $t; row web "$1:$2" "$(sh_probe $WEB web $1 $2)"; done
for t in "1.1.1.1 443" "$BAOIP 8200"; do set -- $t; row keycloak "$1:$2" "$(sh_probe $KC keycloak $1 $2)"; done
for t in "1.1.1.1 443" "$KCIP 8080"; do set -- $t; row openbao "$1:$2" "$(sh_probe athena-openbao-0 openbao $1 $2)"; done
res() { $KA exec "$API" -c api -- /nodejs/bin/node -e "require('dns').lookup('$1',(e,a)=>console.log(e?'ECHEC '+e.code:'RESOLU '+a));setTimeout(()=>process.exit(0),8000)" 2>&1 | tail -1; }
echo "  DNS depuis le pod API : example.com = $(res example.com) ; athena-keycloak = $(res athena-keycloak)"

step "Fin"
kind delete cluster --name athena-iso >/dev/null 2>&1
