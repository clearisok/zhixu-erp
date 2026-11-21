#!/usr/bin/env bash
# Read-only, site-specific gate. Does not issue certificates, change routes or start services.
set -euo pipefail
cd -- "$(dirname -- "$0")"
test -f .env || { echo 'BLOCKED: private .env missing'; exit 1; }
# .env must contain only these three non-secret deployment paths/image values.
test "$(grep -c '^LAN_' .env)" -eq 3
if grep -Ev '^(#.*|[[:space:]]*|LAN_(NGINX_IMAGE|TLS_DIRECTORY|ORIGIN_CA)=[A-Za-z0-9_./:@-]+)$' .env >/dev/null; then
  echo 'BLOCKED: unexpected .env content'; exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a
[[ "$LAN_NGINX_IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$LAN_TLS_DIRECTORY" = /* && "$LAN_ORIGIN_CA" = /* ]]
test "$(docker image inspect "$LAN_NGINX_IMAGE" --format '{{.Id}}')" = "$LAN_NGINX_IMAGE"
ip -4 -o address show dev enp3s0 | grep -Fq 'inet 192.168.66.69/'
ip route get 192.168.83.51 | grep -Fq 'via 192.168.66.1 dev enp3s0' || { echo 'BLOCKED: office return route not verified'; exit 1; }
if ss -H -lnt '( sport = :443 )' | grep -q .; then echo 'BLOCKED: port 443 in use; inspect owner, do not stop it'; exit 1; fi
cert="$LAN_TLS_DIRECTORY/current/fullchain.pem"
key="$LAN_TLS_DIRECTORY/current/privkey.pem"
test -r "$cert" && test -r "$key"
openssl x509 -in "$cert" -noout -checkend 1209600 >/dev/null
openssl verify -purpose sslserver -verify_hostname staging.weaveops.top -CApath /etc/ssl/certs -untrusted "$cert" "$cert" >/dev/null
cert_public=$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
key_public=$(openssl pkey -in "$key" -pubout -outform DER | sha256sum | cut -d' ' -f1)
test "$cert_public" = "$key_public" || { echo 'BLOCKED: certificate/key mismatch'; exit 1; }
# Builds must remain identical through both entrances. Anonymous health never authenticates a user.
curl --noproxy '*' --fail --silent --connect-timeout 5 --max-time 10 --cacert "$LAN_ORIGIN_CA" \
  -H 'Host: staging.weaveops.top' https://localhost:3003/api/v1/health | \
  python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("status")=="ok" and d.get("database")=="ready"'
docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml run --rm --no-deps ingress -t
echo 'PREFLIGHT_PASS: no service started; next step still requires verified client path and auth/Access review'
