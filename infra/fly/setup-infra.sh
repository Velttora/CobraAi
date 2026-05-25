#!/usr/bin/env bash
# Infraestructura base en Fly (una sola vez). Región: iad (misma que cobrai-db).
# Uso: bash infra/fly/setup-infra.sh
set -euo pipefail

REGION="${FLY_REGION:-iad}"
ORG="${FLY_ORG:-personal}"

APPS=(
  cobrai-api
  cobrai-portfolios
  cobrai-workflows
  cobrai-notifications
  cobrai-payments
)

echo "==> Login"
fly auth whoami 2>/dev/null || fly auth login

echo "==> Apps Fly"
for app in "${APPS[@]}"; do
  if fly apps list --org "$ORG" 2>/dev/null | grep -qw "$app"; then
    echo "  · $app ya existe"
  else
    fly apps create "$app" --org "$ORG"
  fi
done

echo ""
echo "==> Postgres (si no existe: cobrai-db)"
if fly apps list --org "$ORG" 2>/dev/null | grep -qw "cobrai-db"; then
  echo "  · cobrai-db ya existe"
else
  fly postgres create --name cobrai-db --region "$REGION"
fi

echo ""
echo "==> Adjuntar Postgres a cada app"
for app in "${APPS[@]}"; do
  echo "  · $app"
  fly postgres attach cobrai-db --app "$app" 2>/dev/null || true
done

echo ""
echo "==> Redis Upstash en Fly (crear manualmente si el prompt es interactivo)"
echo "  fly redis create --name cobrai-redis --region $REGION"
echo ""
echo "==> Kafka: crear cluster en https://console.upstash.com/ (Kafka)"
echo "  Copiar KAFKA_BROKERS y configurarlo en secrets de cada servicio"
echo ""
echo "Siguiente: secrets (paso 2 en docs/DESPLIEGUE.md) y luego bash infra/fly/deploy.sh"
