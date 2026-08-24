#!/bin/sh

IFS=' ' read -r method target protocol
[ -n "$target" ] || exit 0

content_length=0
cookie_header=''
request_marker=''

while IFS= read -r raw_header; do
  header="$(printf '%s' "$raw_header" | tr -d '\r')"
  [ -z "$header" ] && break
  case "$header" in
    Content-Length:*|content-length:*)
      content_length="$(printf '%s' "${header#*:}" | tr -d ' ')"
      ;;
    Cookie:*|cookie:*)
      cookie_header="$(printf '%s' "${header#*:}" | sed 's/^ *//')"
      ;;
    X-Zhixu-Request:*|x-zhixu-request:*)
      request_marker="$(printf '%s' "${header#*:}" | tr -d ' ')"
      ;;
  esac
done

request_body='{}'
if [ "${content_length:-0}" -gt 0 ] 2>/dev/null; then
  request_body="$(dd bs=1 count="$content_length" 2>/dev/null)"
fi

path="${target%%\?*}"

send_response() {
  response_status="$1"
  response_type="$2"
  response_body="$3"
  response_cookie="${4:-}"
  response_size="$(printf '%s' "$response_body" | wc -c | tr -d ' ')"

  case "$response_status" in
    200) reason='OK' ;;
    201) reason='Created' ;;
    400) reason='Bad Request' ;;
    401) reason='Unauthorized' ;;
    403) reason='Forbidden' ;;
    404) reason='Not Found' ;;
    409) reason='Conflict' ;;
    429) reason='Too Many Requests' ;;
    *) reason='Internal Server Error' ;;
  esac

  printf 'HTTP/1.1 %s %s\r\n' "$response_status" "$reason"
  printf 'Content-Type: %s\r\n' "$response_type"
  printf 'Content-Length: %s\r\n' "$response_size"
  printf 'Cache-Control: no-store\r\n'
  printf 'X-Content-Type-Options: nosniff\r\n'
  printf 'X-Frame-Options: DENY\r\n'
  printf 'Referrer-Policy: same-origin\r\n'
  [ -n "$response_cookie" ] && printf 'Set-Cookie: %s\r\n' "$response_cookie"
  printf 'Connection: close\r\n\r\n'
  [ "$method" = 'HEAD' ] || printf '%s' "$response_body"
}

if [ "${path#/api/}" != "$path" ]; then
  if [ "$method" != 'GET' ] && [ "$method" != 'HEAD' ] && [ "$request_marker" != '1' ]; then
    send_response 403 'application/json; charset=utf-8' '{"error":"请求校验失败"}'
    exit 0
  fi
  token="$(printf '%s' "$cookie_header" | sed -n 's/.*zhixu_session=\([^;]*\).*/\1/p')"
  method_b64="$(printf '%s' "$method" | base64 | tr -d '\n')"
  path_b64="$(printf '%s' "$path" | base64 | tr -d '\n')"
  body_b64="$(printf '%s' "$request_body" | base64 | tr -d '\n')"
  token_b64="$(printf '%s' "$token" | base64 | tr -d '\n')"

  sql_result="$(psql -X -A -t -v ON_ERROR_STOP=1 \
    -v method_b64="$method_b64" \
    -v path_b64="$path_b64" \
    -v body_b64="$body_b64" \
    -v token_b64="$token_b64" \
    2>/dev/null <<'SQL'
SELECT http_status::text || '|' || replace(encode(convert_to(response_body::text, 'UTF8'), 'base64'), E'\n', '') || '|' || replace(encode(convert_to(coalesce(response_cookie, ''), 'UTF8'), 'base64'), E'\n', '')
FROM api_dispatch(
  convert_from(decode(:'method_b64', 'base64'), 'UTF8'),
  convert_from(decode(:'path_b64', 'base64'), 'UTF8'),
  coalesce(nullif(convert_from(decode(:'body_b64', 'base64'), 'UTF8'), ''), '{}')::jsonb,
  convert_from(decode(:'token_b64', 'base64'), 'UTF8')
);
SQL
  )"
  query_exit=$?

  if [ "$query_exit" -ne 0 ] || [ -z "$sql_result" ]; then
    send_response 500 'application/json; charset=utf-8' '{"error":"数据库接口暂时不可用"}'
    exit 0
  fi

  api_status="${sql_result%%|*}"
  result_rest="${sql_result#*|}"
  api_body_b64="${result_rest%%|*}"
  api_cookie_b64="${result_rest#*|}"
  api_body="$(printf '%s' "$api_body_b64" | base64 -d 2>/dev/null)"
  api_cookie="$(printf '%s' "$api_cookie_b64" | base64 -d 2>/dev/null)"
  send_response "$api_status" 'application/json; charset=utf-8' "$api_body" "$api_cookie"
  exit 0
fi

[ "$path" = '/' ] && path='/index.html'
case "$path" in
  *'..'*) send_response 403 'text/plain; charset=utf-8' 'Forbidden'; exit 0 ;;
esac

file="/app/site$path"
status=200
if [ ! -f "$file" ]; then
  if [ -f "/app/site$path.html" ]; then
    file="/app/site$path.html"
  elif [ -f "/app/site$path/index.html" ]; then
    file="/app/site$path/index.html"
  else
    file='/app/site/404.html'
    status=404
  fi
fi

case "$file" in
  *.html) content_type='text/html; charset=utf-8' ;;
  *.css) content_type='text/css; charset=utf-8' ;;
  *.js|*.mjs) content_type='text/javascript; charset=utf-8' ;;
  *.json) content_type='application/json; charset=utf-8' ;;
  *.png) content_type='image/png' ;;
  *.jpg|*.jpeg) content_type='image/jpeg' ;;
  *.svg) content_type='image/svg+xml' ;;
  *.ico) content_type='image/x-icon' ;;
  *.woff2) content_type='font/woff2' ;;
  *) content_type='application/octet-stream' ;;
esac

size="$(wc -c < "$file" | tr -d ' ')"
case "$status" in 200) reason='OK' ;; *) reason='Not Found' ;; esac
case "$file" in
  *.html|*/build-info.json) cache_control='no-store, max-age=0, must-revalidate' ;;
  /app/site/assets/*) cache_control='public, max-age=31536000, immutable' ;;
  *) cache_control='public, max-age=3600' ;;
esac
printf 'HTTP/1.1 %s %s\r\n' "$status" "$reason"
printf 'Content-Type: %s\r\n' "$content_type"
printf 'Content-Length: %s\r\n' "$size"
printf 'Cache-Control: %s\r\n' "$cache_control"
printf 'X-Content-Type-Options: nosniff\r\n'
printf 'X-Frame-Options: DENY\r\n'
printf 'Referrer-Policy: same-origin\r\n'
printf 'Connection: close\r\n\r\n'
[ "$method" = 'HEAD' ] || cat "$file" 2>/dev/null || true
