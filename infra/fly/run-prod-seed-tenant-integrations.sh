#!/usr/bin/env bash
# Siembra TenantIntegration desde las credenciales globales actuales (D-18) en producción (Fly).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/packages/db/scripts/prod-seed-tenant-integrations.cjs"
STAGING="/tmp/prod-seed-tenant-integrations.cjs"
APP="${FLY_DB_FIX_APP:-cobrai-api}"

# The official installer provides `fly`, but the flyctl GitHub Action unpacks a
# tarball whose only binary is `flyctl`. Accept either.
if command -v fly >/dev/null 2>&1; then
  FLY=fly
elif command -v flyctl >/dev/null 2>&1; then
  FLY=flyctl
else
  echo "No se encontró el CLI de Fly (ni 'fly' ni 'flyctl') en el PATH" >&2
  exit 1
fi

echo "=================================================================="
echo " Sembrado de TenantIntegration desde las credenciales globales (D-18)"
echo "=================================================================="
echo "Este script escribe credenciales para TODOS los tenants en producción."
echo "No debe ejecutarse por accidente. Antes de continuar, confirma que:"
echo ""
echo "  1. 'pnpm db:migrate:prod' ya aplicó las migraciones:"
echo "     - 20260804100000_add_tenant_integrations"
echo "     - 20260804110000_split_payment_provider_method"
echo "  2. ENCRYPTION_KEY_V1 ya está configurada como secreto de Fly en '$APP'"
echo "     (fly secrets list -a $APP)."
echo ""
read -r -p "Escribe exactamente 'si' para continuar: " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Abortado: no se recibió 'si'." >&2
  exit 1
fi

cp "$SCRIPT" "$STAGING"

echo "==> Subiendo script a $APP"
"$FLY" ssh sftp shell -a "$APP" <<EOF
put $STAGING /app/prod-seed-tenant-integrations.cjs
EOF

echo "==> Ejecutando sembrado de integraciones"
"$FLY" ssh console -a "$APP" -C "node /app/prod-seed-tenant-integrations.cjs"

echo "==> Listo"
