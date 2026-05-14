# Renova

Fase 1 MVP for a cobranza platform: Excel portfolio import, dashboard, WhatsApp,
and AI voice outreach.

## Stack

- Monorepo: Turbo + pnpm
- Frontend: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui foundations
- Backend: NestJS 10 + TypeScript, MVC by business domain
- Database: PostgreSQL 16 + Prisma 5
- Auth: Clerk organizations, invitations, sessions, and roles
- Jobs: Postgres-backed queue (`pg-boss`), no Redis and no dedicated cache layer
- Messaging: Twilio WhatsApp and Twilio Voice + OpenAI voice flow
- Observability: Pino, Better Stack, Sentry

## Workspace Layout

```txt
apps/
  web/      Next.js app
  api/      NestJS API
  worker/   Postgres-backed background jobs
packages/
  db/       Prisma schema and client
  shared/   Shared TypeScript contracts and Zod schemas
  config/   Shared lint and TypeScript config
```

Backend modules use Screaming Architecture names:

```txt
organizations, users, sellers, cartera, clients, invoices, conversations,
voice, campaigns, payments, erp-sync
```

The broader technical diagram mentions Redis/BullMQ and JWT auth, but this MVP
intentionally replaces them with Clerk and a Postgres-backed queue.

## Week 0 Commands

```bash
pnpm install
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm build
```

Copy `.env.example` to `.env` and fill provider credentials before running app
flows that touch Clerk, Twilio, OpenAI, S3/R2, Resend, or Sentry.

Postgres is exposed on host port `5433` to avoid conflicts with a local
Postgres already using `5432`.

## Week 1 Cartera Import

With `pnpm dev` running, open the upload UI at:

```txt
http://localhost:3000
```

Download the canonical Excel template:

```bash
curl -o cartera-template.xlsx http://localhost:4000/api/cartera/template.xlsx
```

Upload an Excel file:

```bash
curl -X POST http://localhost:4000/api/cartera/import \
  -H "x-renova-org-id: dev_org" \
  -H "x-renova-org-name: Renova Dev Organization" \
  -F "file=@cartera-template.xlsx"
```

If the response includes `errorReportUrl`, download row-level errors:

```bash
curl -o import-errors.csv http://localhost:4000/api/cartera/imports/<importBatchId>/errors.csv
```

Check import status:

```bash
curl http://localhost:4000/api/cartera/imports/<importBatchId>
```
