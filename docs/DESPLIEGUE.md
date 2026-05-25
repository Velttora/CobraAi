# Despliegue CobraAI — desde cero

| Capa | Plataforma |
|------|------------|
| Frontend | **Vercel** (`apps/web`) |
| API + microservicios | **Fly.io** (región `iad`, misma que Postgres) |
| Postgres | Fly Postgres `cobrai-db` |
| Redis | Fly Redis / Upstash `cobrai-redis` |
| Kafka | [Upstash Kafka](https://console.upstash.com/) (consola web) |

---

## 1. Infraestructura base (una sola vez)

```bash
fly auth login
bash infra/fly/setup-infra.sh
```

O manualmente:

```bash
# Postgres
fly postgres create --name cobrai-db --region iad

# Redis (Upstash en Fly)
fly redis create --name cobrai-redis --region iad

# Kafka → https://console.upstash.com/ → crear cluster → copiar bootstrap URL
```

Adjunta Postgres a cada app (si `setup-infra.sh` no lo hizo):

```bash
for app in cobrai-api cobrai-portfolios cobrai-workflows cobrai-notifications cobrai-payments; do
  fly postgres attach cobrai-db --app "$app"
done
```

Obtén `DATABASE_URL` y `REDIS_URL`:

```bash
fly postgres db list --app cobrai-db
fly redis status cobrai-redis
# DATABASE_URL también queda en: fly secrets list -a cobrai-api
```

---

## 2. Secrets por servicio

Copia la plantilla y reemplaza valores reales (no commitear claves):

```bash
cp apps/web/.env.production.example apps/web/.env.production
# Editar con tus keys de Clerk, DB, Redis, Kafka, URL de Vercel
```

### Gateway

```bash
fly secrets set --config infra/fly/gateway.fly.toml \
  CLERK_SECRET_KEY="sk_live_..." \
  CLERK_PUBLISHABLE_KEY="pk_live_..." \
  CLERK_WEBHOOK_SECRET="whsec_..." \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="redis://..." \
  WEB_ORIGIN="https://tu-app.vercel.app"
```

Las URLs internas de microservicios ya están en `gateway.fly.toml` (`*.internal:8080`).

### Portfolios

```bash
fly secrets set --config infra/fly/portfolios.fly.toml \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="redis://..." \
  KAFKA_BROKERS="host:9092"
```

### Workflows

```bash
fly secrets set --config infra/fly/workflows.fly.toml \
  DATABASE_URL="postgresql://..." \
  KAFKA_BROKERS="host:9092"
```

### Notifications

```bash
fly secrets set --config infra/fly/notifications.fly.toml \
  DATABASE_URL="postgresql://..." \
  KAFKA_BROKERS="host:9092" \
  SENDGRID_API_KEY="" \
  SENDGRID_FROM_EMAIL="noreply@tudominio.com"
```

### Payments

```bash
fly secrets set --config infra/fly/payments.fly.toml \
  DATABASE_URL="postgresql://..." \
  KAFKA_BROKERS="host:9092" \
  CONEKTA_PRIVATE_KEY="" \
  CONEKTA_WEBHOOK_SECRET="" \
  MP_ACCESS_TOKEN="" \
  MP_WEBHOOK_SECRET=""
```

---

## 3. Migraciones de DB

En local, apuntando a la base de Fly (misma `DATABASE_URL` que en secrets):

```bash
export DATABASE_URL="postgresql://..."
pnpm db:migrate:deploy
```

Opcional: datos demo alineados con tu org de Clerk:

```bash
pnpm db:seed:align
```

---

## 4. Despliegue backend

```bash
bash infra/fly/deploy.sh
```

Orden: payments → notifications → workflows → portfolios → **gateway al final**.

Verificar:

```bash
curl https://cobrai-api.fly.dev/health
curl https://cobrai-portfolios.fly.dev/api/health
curl https://cobrai-payments.fly.dev/api/health
```

Clerk webhook:

```text
POST https://cobrai-api.fly.dev/api/v1/webhooks/clerk
```

---

## 5. Vercel (frontend)

1. [vercel.com](https://vercel.com) → **Add New Project** → importar el repo.
2. **Root Directory**: `apps/web`
3. Activar **Include source files outside of the Root Directory** (Settings → General).
4. **Environment Variables** → **Production** → **Import .env** → `apps/web/.env.production` (crear desde `.env.production.example`).
5. Deploy.

Variables mínimas (ver `apps/web/.env.production.example`):

| Variable | Producción |
|----------|------------|
| `NEXT_PUBLIC_API_URL` | `https://cobrai-api.fly.dev` |
| `SERVICE_PORTFOLIOS_URL` | `https://cobrai-portfolios.fly.dev` |
| `PAYMENTS_SERVICE_URL` | `https://cobrai-payments.fly.dev` |
| `PAYMENT_LINK_BASE_URL` | `https://TU-APP.vercel.app/pay` |
| Clerk keys | Dashboard Clerk (test o live) |

Tras el primer deploy, actualiza `PAYMENT_LINK_BASE_URL` y en Fly:

```bash
fly secrets set WEB_ORIGIN="https://TU-APP.vercel.app" --config infra/fly/gateway.fly.toml
```

---

## Seguridad

- **No commitear** `apps/web/.env.production` con claves reales (está en `.gitignore`).
- Usa `apps/web/.env.production.example` como plantilla en el repo.
- En producción preferir claves Clerk **live** (`pk_live_` / `sk_live_`).

---

## Archivos de referencia

| Archivo | Uso |
|---------|-----|
| `Dockerfile` | Build de todos los servicios Nest (`APP_NAME`) |
| `infra/fly/*.fly.toml` | Config por app |
| `infra/fly/deploy.sh` | Deploy de las 5 apps |
| `infra/fly/setup-infra.sh` | Postgres + crear apps |
| `apps/web/vercel.json` | Build monorepo en Vercel |
