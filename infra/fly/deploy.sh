#!/usr/bin/env bash
# Despliega todos los servicios en Fly.io (desde la raíz del monorepo).
# Uso: bash infra/fly/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

CONFIGS=(
  "infra/fly/payments.fly.toml"
  "infra/fly/notifications.fly.toml"
  "infra/fly/workflows.fly.toml"
  "infra/fly/portfolios.fly.toml"
  "infra/fly/gateway.fly.toml"
)

echo "==> Fly auth"
fly auth whoami

for config in "${CONFIGS[@]}"; do
  app=$(grep '^app' "$config" | awk -F'"' '{print $2}')
  echo ""
  echo "==> Desplegando $app"
  fly deploy "$ROOT" --config "$config" --ha=false --yes --wait-timeout 10m
done

echo ""
echo "Listo."
echo "  Gateway:    https://cobrai-api.fly.dev/health"
echo "  Portfolios: https://cobrai-portfolios.fly.dev/api/health"
echo "  Payments:   https://cobrai-payments.fly.dev/api/health"
