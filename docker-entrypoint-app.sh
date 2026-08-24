#!/bin/sh
set -eu

export PGHOST="${DB_HOST:-database}"
export PGPORT="${DB_PORT:-5432}"
export PGDATABASE="${DB_NAME:-zhixu}"
export PGUSER="${DB_USER:-zhixu}"
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"

until pg_isready -q; do
  sleep 1
done

psql -v ON_ERROR_STOP=1 -f /app/database/001_schema.sql
psql -v ON_ERROR_STOP=1 \
  -v admin_password="${ZHIXU_ADMIN_PASSWORD:?ZHIXU_ADMIN_PASSWORD is required}" \
  -f /app/database/002_admin.sql

if [ -f /app/site/build-info.json ]; then
  echo '织序ERP'
  echo "Environment: ${ZHIXU_BUILD_ENV:-production}"
  sed -n 's/.*"buildId": "\([^"]*\)".*/Build ID: \1/p' /app/site/build-info.json
  sed -n 's/.*"gitCommit": "\([^"]*\)".*/Git Commit: \1/p' /app/site/build-info.json
  sed -n 's/.*"buildTime": "\([^"]*\)".*/Build Time: \1/p' /app/site/build-info.json
fi

exec nc -lk -p 3000 -e /app/serve.sh
