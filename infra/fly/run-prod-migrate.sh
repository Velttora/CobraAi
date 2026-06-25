#!/usr/bin/env bash
# Aplica migraciones Prisma pendientes en producción (Fly).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${FLY_DB_FIX_APP:-cobrai-api}"
BUNDLE="/tmp/cobrai-prisma-migrate-bundle.tgz"
SCRIPT="/tmp/prod-migrate-deploy.cjs"

cp "$ROOT/packages/db/scripts/prod-migrate-deploy.cjs" "$SCRIPT"
tar -C "$ROOT/packages/db/prisma" -czf "$BUNDLE" .

echo "==> Ejecutando migraciones pendientes"
fly ssh console -a "$APP" -C 'sh -lc "rm -f /app/prod-migrate-deploy.cjs && mkdir -p /app/prisma-migrate"'
fly ssh sftp shell -a "$APP" <<EOF
put $SCRIPT /app/prod-migrate-deploy.cjs
put $BUNDLE /tmp/prisma-migrate.tgz
EOF
fly ssh console -a "$APP" -C 'sh -lc "tar -xzf /tmp/prisma-migrate.tgz -C /app/prisma-migrate && rm -f /tmp/prisma-migrate.tgz && node /app/prod-migrate-deploy.cjs"'

echo "==> Listo"
