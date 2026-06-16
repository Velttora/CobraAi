#!/usr/bin/env bash
# Backfill de reglas payment_confirmed → send_notification en producción (Fly).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/packages/db/scripts/prod-fix-payment-thank-you.cjs"
STAGING="/tmp/prod-fix-payment-thank-you.cjs"
APP="${FLY_DB_FIX_APP:-cobrai-portfolios}"

cp "$SCRIPT" "$STAGING"

echo "==> Subiendo script a $APP"
fly ssh sftp shell -a "$APP" <<EOF
put $STAGING /app/prod-fix-payment-thank-you.cjs
EOF

echo "==> Ejecutando backfill de reglas de pago confirmado"
fly ssh console -a "$APP" -C "node /app/prod-fix-payment-thank-you.cjs"

echo "==> Listo"
