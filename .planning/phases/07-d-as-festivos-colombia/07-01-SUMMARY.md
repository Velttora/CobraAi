---
phase: 07-d-as-festivos-colombia
plan: "01"
subsystem: db
tags: [prisma, holidays, seed, colombia, migration]

# Dependency graph
requires: []
provides:
  - Prisma model Holiday { id, date @unique @db.Date, name, createdAt } mapped to holidays table
  - Migration 20260714120000_add_holidays (CREATE TABLE holidays + unique index on date)
  - Idempotent seed src/seed-holidays.ts upserting the 18 CO holidays of 2026 and 18 of 2027 (36 rows)
  - npm script db:seed:holidays
affects:
  - 07-d-as-festivos-colombia (Plan 02: ComplianceService queries prisma.holiday)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Holiday date stored as UTC-midnight civil date so the compliance query key aligns exactly
    - Idempotent seed via prisma.holiday.upsert({ where: { date }, ... }) over the unique column
key-files:
  created:
    - packages/db/src/seed-holidays.ts
    - packages/db/prisma/migrations/20260714120000_add_holidays/migration.sql
  modified:
    - packages/db/prisma/schema.prisma
    - packages/db/package.json

key-decisions:
  - "Colombia-only minimal model (no countryCode, no tenantId) per user decision — national holidays are global"
  - "Shadow DB unavailable on the dev role (P3014); applied the migration via prisma db execute + migrate resolve --applied, wrote the migration file by hand so prod migrate deploy is covered"
  - "Holiday names kept in Spanish (content); code comments in English per repo rule"

patterns-established:
  - "Annual maintenance: append the next year's 18 festivos to HOLIDAYS_CO and re-run db:seed:holidays (idempotent)"

requirements-completed: []

# Verification
verification:
  - "pnpm --filter @cobrai/db typecheck passes"
  - "prisma.holiday available on generated client; holidays table created"
  - "Seed run twice → 36 rows both times (idempotent); date lookup 2026-01-01 → Año Nuevo"

# Metrics
completed: 2026-07-14
---

## What shipped

`Holiday` Prisma model + `holidays` table, an idempotent `seed-holidays.ts` loading the 36 Colombian national holidays for 2026–2027 (verified against the official Ley Emiliani / Holy Week calendar), and the `db:seed:holidays` npm script. Dev DB blocks shadow-DB creation, so the migration was applied via `prisma db execute` + `migrate resolve` and the migration file authored by hand for prod parity.
