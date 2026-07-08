# Variables de entorno — CobraAI

Checklist unificado para desarrollo local. Los puertos reflejan la configuración actual del monorepo (`pnpm infra:up` + servicios Nest).

## Mapa de puertos

| Servicio | Puerto | URL |
|----------|--------|-----|
| Web (Next.js) | 3001 | http://localhost:3001 |
| API Gateway | 3000 | http://localhost:3000 |
| service-portfolios | **3011** | http://localhost:3011 |
| service-workflows | 3002 | http://localhost:3002 |
| service-notifications | 3003 | http://localhost:3003 |
| service-payments | 3004 | http://localhost:3004 |
| PostgreSQL (Docker) | **5433** | `localhost:5433` → contenedor `:5432` |
| Redis | 6379 | redis://localhost:6379 |
| Kafka | 9092 | localhost:9092 |
| Kafka UI | 8080 | http://localhost:8080 |

> **Nota:** Web y portfolios comparten el número 3001 en documentación antigua. En dev, portfolios corre en **3011** para evitar conflicto con Next.js.

---

## Setup rápido

```bash
pnpm install
pnpm infra:up
bash scripts/env-setup.sh   # copia .env.example → .env en cada app
# Editar claves de Clerk en .env y apps/web/.env.local
pnpm db:generate && pnpm db:migrate && pnpm db:seed
# Tras login + org en Clerk:
pnpm db:seed:align
pnpm services    # gateway + 4 microservicios
pnpm front       # web :3001
```

---

## Archivos `.env` por app

| Archivo | Origen |
|---------|--------|
| `.env` | `.env.example` (raíz — referencia + Prisma seed) |
| `apps/web/.env.local` | `apps/web/.env.example` |
| `apps/api-gateway/.env` | `apps/api-gateway/.env.example` |
| `apps/service-portfolios/.env` | `apps/service-portfolios/.env.example` |
| `apps/service-workflows/.env` | `apps/service-workflows/.env.example` |
| `apps/service-notifications/.env` | `apps/service-notifications/.env.example` |
| `apps/service-payments/.env` | `apps/service-payments/.env.example` |
| `packages/db/.env` | `packages/db/.env.example` |

---

## Checklist por prioridad

### Obligatorio (MVP local)

- [ ] **Clerk** — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (web + gateway)
- [ ] **DATABASE_URL** — `postgresql://cobrai:cobrai_dev@localhost:5433/cobrai_dev?schema=public`
- [ ] **NEXT_PUBLIC_API_URL** — `http://localhost:3000`
- [ ] **SERVICE_PORTFOLIOS_URL** — `http://localhost:3011` (gateway + web)
- [ ] **pnpm db:seed:align** — datos demo bajo tu org de Clerk

### Infra (recomendado)

- [ ] **REDIS_URL** — rate limit gateway, cola import CSV
- [ ] **KAFKA_BROKERS** — eventos pagos → workflows → notificaciones. En local apunta a `localhost:9092` (docker-compose, sin auth). En producción (Redpanda Cloud Serverless) además requiere **KAFKA_SASL_USERNAME** y **KAFKA_SASL_PASSWORD** — sin ellas el cliente no puede autenticar por SASL_SSL. Ver `docs/DESPLIEGUE.md`.
- [ ] **CLERK_WEBHOOK_SECRET** — sync org/usuarios vía webhook Svix

### Integraciones externas (opcional)

| Proveedor | Variables | Sin configurar |
|-----------|-----------|----------------|
| SendGrid | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Email simulado en logs |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS no se envía |
| Conekta | `CONEKTA_PRIVATE_KEY`, `CONEKTA_WEBHOOK_SECRET` | Checkout sandbox/stub |
| Mercado Pago | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Igual |
| WhatsApp / Voz | — | Stubs vía `@cobrai/ports` |

### Pagos públicos

- [ ] **PAYMENTS_SERVICE_URL** — web BFF para `/pay/:token` (default `http://localhost:3004`)
- [ ] **PAYMENT_LINK_BASE_URL** — URLs generadas en links (`http://localhost:3001/pay`)

### Tests E2E

- [ ] **Docker** — requerido para `pnpm test:e2e`
- [ ] **E2E_AUTH_READY=1** — Playwright con sesión Clerk
- [ ] **E2E_DEBT_ID** — test de detalle de deuda

---

## Clerk — pasos

1. Crear aplicación en [Clerk Dashboard](https://dashboard.clerk.com) con **Organizations**.
2. Roles de org: `admin`, `manager`, `agent`, `viewer`.
3. En **Organizations → Settings**, desactiva la creación de org durante el registro (Sign-up). La org se crea solo en `/onboarding` para evitar duplicados.
4. Copiar **Publishable key** y **Secret key** a web y gateway.
5. Webhook endpoint: `POST http://localhost:3000/api/v1/webhooks/clerk`
6. Copiar **Signing secret** → `CLERK_WEBHOOK_SECRET`.
7. Tras registrarte y crear org: `pnpm db:seed:align`.

---

## Producción

Guía paso a paso: **[DESPLIEGUE.md](./DESPLIEGUE.md)** (Fly `mia` + Vercel).

- Vercel: `apps/web/.env.production.example` → copiar a `.env.production` e importar en el dashboard.
- Fly: `fly secrets set --config infra/fly/gateway.fly.toml ...`
- No commitear `.env.production` con claves reales.
