#!/usr/bin/env bash
# Carga idempotente de festivos colombianos (2026 + 2027) en producción (Fly).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/packages/db/scripts/prod-seed-holidays.cjs"
STAGING="/tmp/prod-seed-holidays.cjs"
APP="${FLY_DB_FIX_APP:-cobrai-api}"

cp "$SCRIPT" "$STAGING"

echo "==> Subiendo script a $APP"
# rm-before-put: sftp put no sobrescribe de forma fiable un archivo existente.
fly ssh console -a "$APP" -C 'sh -lc "rm -f /app/prod-seed-holidays.cjs"'
fly ssh sftp shell -a "$APP" <<EOF
put $STAGING /app/prod-seed-holidays.cjs
EOF

echo "==> Cargando festivos colombianos 2026 + 2027"
fly ssh console -a "$APP" -C "node /app/prod-seed-holidays.cjs"

echo "==> Listo"
