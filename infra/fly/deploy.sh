#!/usr/bin/env bash
# Despliega los servicios en Fly.io (desde la raíz del monorepo).
# Uso: bash infra/fly/deploy.sh              -> todos los servicios
#      bash infra/fly/deploy.sh gateway      -> solo los servicios indicados
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

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

ALL_CONFIGS=(
  "infra/fly/payments.fly.toml"
  "infra/fly/notifications.fly.toml"
  "infra/fly/workflows.fly.toml"
  "infra/fly/portfolios.fly.toml"
  "infra/fly/gateway.fly.toml"
)

# A service name is the prefix of its config file: `gateway` -> gateway.fly.toml
if [[ $# -eq 0 ]]; then
  CONFIGS=("${ALL_CONFIGS[@]}")
else
  CONFIGS=()
  for service in "$@"; do
    config="infra/fly/${service}.fly.toml"
    if [[ ! -f "$config" ]]; then
      echo "Servicio desconocido: $service (no existe $config)" >&2
      exit 1
    fi
    CONFIGS+=("$config")
  done
fi

echo "==> Fly auth"
"$FLY" auth whoami

for config in "${CONFIGS[@]}"; do
  app=$(grep '^app' "$config" | awk -F'"' '{print $2}')
  region=$(grep '^primary_region' "$config" | awk -F'"' '{print $2}')
  echo ""
  echo "==> Desplegando $app en región $region"
  # --depot=false: Fly remote builder (evita timeouts subiendo contexto a Depot)
  # --regions: solo crea/actualiza máquinas en la región objetivo (evita EWR/iad sin capacidad)
  "$FLY" deploy "$ROOT" --config "$config" --ha=false --yes --depot=false \
    --primary-region "$region" --regions "$region" --wait-timeout 20m
  # Apagar máquinas huérfanas en otras regiones
  while read -r mid mregion; do
    [[ -z "$mid" || "$mregion" == "$region" ]] && continue
    echo "  · Eliminando máquina $mid en $mregion"
    "$FLY" machine destroy "$mid" -a "$app" --force 2>/dev/null || true
  done < <("$FLY" machines list -a "$app" --json 2>/dev/null | \
    node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')||'[]'); d.forEach(m=>console.log(m.id,m.region))")
done

echo ""
echo "Listo."
if [[ $# -eq 0 ]]; then
  echo "  Gateway:    https://cobrai-api.fly.dev/health"
  echo "  Portfolios: https://cobrai-portfolios.fly.dev/api/health"
  echo "  Payments:   https://cobrai-payments.fly.dev/api/health"
fi
