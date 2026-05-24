#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPORT_DIR="$ROOT/reports/qa-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$REPORT_DIR"

log() {
  echo "[qa-check] $*" | tee -a "$REPORT_DIR/summary.log"
}

run_step() {
  local name="$1"
  shift
  log "==> $name"
  if "$@" >"$REPORT_DIR/${name// /-}.log" 2>&1; then
    log "OK  $name"
    return 0
  fi
  log "FAIL $name (ver $REPORT_DIR/${name// /-}.log)"
  return 1
}

FAILURES=0

run_step "lint" pnpm lint || FAILURES=$((FAILURES + 1))
run_step "typecheck" pnpm typecheck || FAILURES=$((FAILURES + 1))
run_step "unit-tests" pnpm test || FAILURES=$((FAILURES + 1))

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  run_step "integration-e2e" pnpm test:e2e || FAILURES=$((FAILURES + 1))
else
  log "SKIP integration-e2e (Docker no disponible)"
fi

if pnpm --filter @cobrai/web exec playwright --version >/dev/null 2>&1; then
  run_step "playwright" pnpm playwright || FAILURES=$((FAILURES + 1))
else
  log "SKIP playwright (no instalado)"
fi

log "Reporte en $REPORT_DIR"

if [ "$FAILURES" -gt 0 ]; then
  log "QA CHECK FALLÓ ($FAILURES pasos)"
  exit 1
fi

log "QA CHECK OK"
