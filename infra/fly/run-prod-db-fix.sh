#!/usr/bin/env bash
# Aplica migración internal + backfill de escalaciones en producción (Fly).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/packages/db/scripts/prod-fix-escalations.cjs"
STAGING="/tmp/prod-fix-escalations.cjs"
APP="${FLY_DB_FIX_APP:-cobrai-portfolios}"

cp "$SCRIPT" "$STAGING"

echo "==> Subiendo script a $APP"
fly ssh sftp shell -a "$APP" <<EOF
put $STAGING /app/prod-fix-escalations.cjs
EOF

echo "==> Ejecutando migración + backfill"
fly ssh console -a "$APP" -C "node /app/prod-fix-escalations.cjs"

echo "==> Listo"
