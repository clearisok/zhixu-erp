#!/usr/bin/env bash
# Site-specific DNS-01 lifecycle. Starts/reloads only the independent LAN ingress.
set -euo pipefail
umask 077
export PATH=/usr/bin:/bin
ROOT=/home/jackson/weaveops-staging-lan
IMAGE=sha256:6d5e1e84f687ce81786c97cbeccb9dda94d86bbb29a81dbb85527bd68008d77d
NAME=staging-weaveops-lan-163
DOMAIN=staging.weaveops.top
mode=${1:-check}
[[ "$mode" = issue || "$mode" = renew || "$mode" = check ]] || exit 2
[[ $(id -u) = 1000 && $(stat -c %u "$ROOT") = 1000 ]] || exit 2
mkdir -p "$ROOT/private" "$ROOT/private/acme/config" "$ROOT/private/acme/work" "$ROOT/private/acme/logs" "$ROOT/tls"
chmod 700 "$ROOT/private" "$ROOT/private/acme" "$ROOT/private/acme/config" "$ROOT/private/acme/work" "$ROOT/private/acme/logs" "$ROOT/tls"
exec 9>"$ROOT/private/certificate.lock"
flock -n 9 || { echo 'SKIPPED: certificate operation already holds lock'; exit 0; }
status() {
  local state=$1 code=${2:-0}
  printf '{"schema":"weaveops-lan-certificate.v1","at":"%s","mode":"%s","state":"%s","exitCode":%s}\n' \
    "$(date -u +%FT%TZ)" "$mode" "$state" "$code" > "$ROOT/private/certificate-status.json.next"
  mv -f "$ROOT/private/certificate-status.json.next" "$ROOT/private/certificate-status.json"
}
on_exit() {
  local code=$?
  if ((code)); then
    status failed "$code"
    logger -t weaveops-staging-lan-cert -p user.err "certificate $mode failed, code=$code; inspect owner-only logs"
    echo "CERTIFICATE_FAILED: mode=$mode code=$code; private log retained"
  fi
}
trap on_exit EXIT
verify_pair() {
  local cert=$1 key=$2 a b
  [[ -r "$cert" && -r "$key" ]] || return 1
  openssl x509 -in "$cert" -noout -checkend 1209600 >/dev/null
  openssl verify -purpose sslserver -verify_hostname "$DOMAIN" -CApath /etc/ssl/certs -untrusted "$cert" "$cert" >/dev/null
  a=$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
  b=$(openssl pkey -in "$key" -pubout -outform DER | sha256sum | cut -d' ' -f1)
  test "$a" = "$b"
}
if [[ "$mode" = check ]]; then
  cert="$ROOT/tls/current/fullchain.pem"
  verify_pair "$cert" "$ROOT/tls/current/privkey.pem"
  openssl x509 -in "$cert" -noout -checkend 1814400 >/dev/null
  curl --noproxy '*' --fail --silent --show-error --connect-timeout 5 --max-time 15 \
    --resolve "$DOMAIN:443:192.168.66.69" "https://$DOMAIN/api/v1/health" | \
    python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("status")=="ok" and d.get("database")=="ready"'
  status healthy
  echo 'CERTIFICATE_HEALTHY: trusted hostname, over 21 days, LAN endpoint ready'
  exit 0
fi
credential="$ROOT/private/cloudflare.ini"
test -f "$credential" && test ! -L "$credential"
test "$(stat -c %a "$credential")" = 600
test "$(stat -c %u "$credential")" = 1000
test "$(docker image inspect "$IMAGE" --format '{{.Id}}')" = "$IMAGE"
log="$ROOT/private/acme/$mode-$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
args=(certonly --dns-cloudflare --dns-cloudflare-credentials /run/cloudflare.ini
  --dns-cloudflare-propagation-seconds 60 --non-interactive --agree-tos
  --register-unsafely-without-email --cert-name "$NAME" -d "$DOMAIN" --keep-until-expiring)
if [[ "$mode" = renew ]]; then
  test -f "$ROOT/private/acme/config/renewal/$NAME.conf"
  args=(renew --cert-name "$NAME" --non-interactive --no-random-sleep-on-renew)
fi
status running
# No host ports, Docker socket, proxy overrides, or credential values in argv/env.
docker run --rm --pull never --network host --user 1000:1000 --read-only --tmpfs /tmp:rw,nosuid,noexec,size=32m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$credential:/run/cloudflare.ini:ro" \
  -v "$ROOT/private/acme/config:/etc/letsencrypt" \
  -v "$ROOT/private/acme/work:/var/lib/letsencrypt" \
  -v "$ROOT/private/acme/logs:/var/log/letsencrypt" \
  "$IMAGE" "${args[@]}" > "$log" 2>&1
source="$ROOT/private/acme/config/live/$NAME"
verify_pair "$source/fullchain.pem" "$source/privkey.pem"
version="certificate-$(sha256sum "$source/fullchain.pem" | cut -d' ' -f1)"
current="$ROOT/tls/current"
old=''
if [[ -e "$current" || -L "$current" ]]; then
  test -L "$current"
  old=$(readlink "$current")
  [[ "$old" =~ ^certificate-[0-9a-f]{64}$ ]]
fi
if [[ "$old" != "$version" ]]; then
  target="$ROOT/tls/$version"
  if [[ -e "$target" ]]; then
    cmp -s "$target/fullchain.pem" "$source/fullchain.pem"
    cmp -s "$target/privkey.pem" "$source/privkey.pem"
  else
    mkdir -m 700 "$target"
    install -m 600 "$source/fullchain.pem" "$target/fullchain.pem"
    install -m 600 "$source/privkey.pem" "$target/privkey.pem"
  fi
  ingress=$(docker ps -q --filter label=com.docker.compose.project=weaveops-staging-lan --filter label=com.docker.compose.service=ingress)
  [[ $(printf '%s\n' "$ingress" | grep -c . || true) -le 1 ]]
  [[ -z "$ingress" || -n "$old" ]]
  ln -s "$version" "$ROOT/tls/.next-$$"
  mv -Tf "$ROOT/tls/.next-$$" "$current"
  if [[ -n "$ingress" ]]; then
    if ! docker exec "$ingress" nginx -t >> "$log" 2>&1 || ! docker exec "$ingress" nginx -s reload >> "$log" 2>&1; then
      ln -s "$old" "$ROOT/tls/.restore-$$"
      mv -Tf "$ROOT/tls/.restore-$$" "$current"
      exit 1
    fi
  fi
fi
status published
openssl x509 -in "$current/fullchain.pem" -noout -enddate
echo 'CERTIFICATE_PUBLISHED: original gateway/CA unchanged; no service started'
