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
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm build
```

For local infrastructure:

```bash
docker compose up -d postgres
```

Copy `.env.example` to `.env` and fill provider credentials before running app
flows that touch Clerk, Twilio, OpenAI, S3/R2, Resend, or Sentry.
