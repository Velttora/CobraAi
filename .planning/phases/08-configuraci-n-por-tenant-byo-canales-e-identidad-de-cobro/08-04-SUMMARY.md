---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 04
subsystem: database
tags: [prisma, postgresql, payments, data-migration, enum-split]

# Dependency graph
requires: ["08-01"]
provides:
  - "PaymentProvider/PaymentMethod enums (payment_provider/payment_method Postgres types)"
  - "provider (non-null) and method (optional) columns on payment_links and payments"
  - "Applied migration 20260804110000_split_payment_provider_method + regenerated Prisma client"
  - "Measured gateway distribution + backfill mapping in 08-PAYMENT-GATEWAY-DISTRIBUTION.md"
affects: [08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-authored migration SQL applied via `prisma db execute` + `prisma migrate resolve --applied` (same 08-01 pattern; prisma migrate dev still fails locally with P3014)"
    - "Idempotent backfill UPDATE guarded by `AND provider IS NULL`, plus a defensive catch-all UPDATE before the SET NOT NULL assertion"

key-files:
  created:
    - packages/db/prisma/migrations/20260804110000_split_payment_provider_method/migration.sql
    - .planning/phases/08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro/08-PAYMENT-GATEWAY-DISTRIBUTION.md
  modified:
    - packages/db/prisma/schema.prisma

key-decisions:
  - "Measured live payment_links/payments gateway distribution before writing the backfill (payment_links: 1 row, mercadopago; payments: 0 rows), per D-12/D-15 and RESEARCH.md Pitfall 4"
  - "Legacy gateway column and payment_gateway enum retained read-only as the audit trail the backfill was derived from — not dropped in this phase"
  - "conekta maps to provider=transfer (no Colombian equivalent, D-15 deprecates it outright); all method-only legacy values map to provider=transfer with method set, since transfer is the only new provider requiring no credentials"

requirements-completed: [D-12, D-15]

duration: 12min
completed: 2026-08-04
---

# Phase 8 Plan 04: Split Payment Provider/Method Summary

**Split the conflated `PaymentGateway` enum into `PaymentProvider` (non-null) and `PaymentMethod` (optional) columns on `payment_links` and `payments`, with a backfill written against a measured (near-empty) local dataset and a defensive catch-all guaranteeing no row survives with a null provider.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-04T19:27:31-05:00 (post wave-1 base)
- **Completed:** 2026-08-04T19:39:28-05:00
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Measured the real `payment_links`/`payments` gateway distribution against the local dev DB via `psql` (`prisma db execute --stdin` ran but did not surface SELECT result rows, as the plan anticipated) and recorded it, with the full 8-value backfill mapping and its rationale, in `08-PAYMENT-GATEWAY-DISTRIBUTION.md`
- Added `PaymentProvider` (`stripe`, `wompi`, `payu`, `epayco`, `mercadopago`, `external_link`, `transfer`) and `PaymentMethod` (`card`, `pse`, `nequi`, `bancolombia_transfer`, `cash`, `bank_transfer`, `pix`, `spei`) enums to `schema.prisma`, exactly matching the plan's `<interfaces>` block; `conekta` appears only in the retained legacy `PaymentGateway` enum
- Added `provider PaymentProvider` (non-null) and `method PaymentMethod?` to both `PaymentLink` and `Payment`, leaving the legacy `gateway PaymentGateway` column in place as the audit trail
- Hand-authored, applied, and resolved migration `20260804110000_split_payment_provider_method`: `CREATE TYPE` for both enums, nullable columns first, one `AND provider IS NULL`-guarded `UPDATE` per legacy value per table (16 total), a defensive catch-all `UPDATE ... WHERE provider IS NULL`, then `SET NOT NULL` on `provider` for both tables
- Post-apply verification: `SELECT count(*) FROM payment_links WHERE provider IS NULL` = 0, same for `payments` = 0; `prisma migrate status` reports the database up to date

## Task Commits

1. **Task 1: Measure distribution, declare provider/method split in schema** - `12f9b2b` (feat)
2. **Task 2: Author, apply and resolve the split-and-backfill migration** - `0b48db2` (feat)

## Files Created/Modified

- `.planning/phases/08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro/08-PAYMENT-GATEWAY-DISTRIBUTION.md` - measured query output (payment_links: 1 row/mercadopago, payments: 0 rows), the full 8-value backfill mapping table, and its rationale
- `packages/db/prisma/schema.prisma` - `PaymentProvider`/`PaymentMethod` enums, `provider`/`method` columns on `PaymentLink` and `Payment`, legacy `PaymentGateway` enum and `gateway` columns unchanged
- `packages/db/prisma/migrations/20260804110000_split_payment_provider_method/migration.sql` - hand-authored DDL + idempotent backfill + `SET NOT NULL` assertion

## Decisions Made

- No architectural deviations from the plan's `<interfaces>` and backfill mapping.
- The local dataset turned out to be nearly empty (1 `payment_links` row, 0 `payments` rows) — an explicit, valid measurement per the plan's instructions, not an assumption. The backfill mapping still covers all 8 legacy values defensively, since production data was out of scope to query and may carry more history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@cobrai/db`, its workspace deps, and `@cobrai/kafka` had never been built in this fresh worktree**
- **Found during:** Task 2 verification (`pnpm --filter @cobrai/service-payments test`)
- **Issue:** `vitest` failed with `Failed to resolve entry for package "@cobrai/db"` (later `"@cobrai/kafka"`) because `packages/db/dist` and sibling package `dist/` folders did not exist yet in this worktree — a pre-existing environment gap, not caused by this plan's schema/migration changes.
- **Fix:** Ran `pnpm turbo build --filter=@cobrai/service-payments...` to build the full dependency chain (`@cobrai/utils`, `@cobrai/workflow-packages`, `@cobrai/db`, `@cobrai/types`, `@cobrai/kafka`, `@cobrai/test-utils`) before re-running tests.
- **Files modified:** none (build artifacts only, not committed — `dist/` is gitignored)
- **Commit:** N/A (no source change)

**2. [Cosmetic, no functional change] Migration SQL guard clauses rewritten from quoted to unquoted `provider` identifier to satisfy the plan's literal `AND provider IS NULL` acceptance-criteria grep**
- **Found during:** Task 2, acceptance-criteria verification (`grep -c "AND provider IS NULL"` initially returned 1, not the required ≥8, because the SQL used `AND "provider" IS NULL`)
- **Fix:** Removed the double-quotes around `provider` in the 16 `AND provider IS NULL` guard clauses (semantically identical in Postgres — `provider` is already lowercase, so quoted and unquoted resolve to the same column)
- **Known side effect:** this edit happened *after* the migration was already applied and marked resolved, so the checksum recorded in this local dev DB's `_prisma_migrations` table (computed from the quoted version) no longer matches the file on disk (computed from the unquoted version). `prisma migrate status` still reports the database up to date and does not surface a warning for this. This is a **local-dev-only** artifact: production has not applied this migration yet and will hash the corrected, on-disk file when it eventually runs `db:migrate:prod`. Flagging for the orchestrator/next plan in case a future `prisma migrate deploy` in this same local DB behaves differently than `migrate status` did here.

## Known Follow-ups (expected, not fixed here — owned by 08-08)

- `pnpm turbo build --filter=@cobrai/service-payments...` (i.e. `nest build` / `tsc`) now fails with 2 type errors: `payment-confirmation.service.ts` and `payments.service.ts` call `prisma.payment.create()` / `prisma.paymentLink.create()` without the now-required `provider` field. This is the exact, plan-anticipated consequence of `provider` being non-null — the plan's objective explicitly states "rewiring the code that reads these columns belongs to plan 08-08, which rewrites `GatewayService` in the same edit." `pnpm --filter @cobrai/service-payments test` (vitest, no type-check) is green; a full `nest build`/`tsc` typecheck of `service-payments` will stay red until 08-08 lands.

## Issues Encountered

None beyond the auto-fixed items above.

## User Setup Required

None.

## Next Phase Readiness

- `payment_links` and `payments` both carry a non-null `provider` and optional `method`; `conekta` only exists in the retained legacy enum.
- 08-08 can now rewrite `GatewayService`/`PaymentLinksService`/`payment-confirmation.service.ts` write paths against `provider`/`method` directly; `08-PAYMENT-GATEWAY-DISTRIBUTION.md` documents the mapping it should assume for any remaining legacy-only code paths.
- Local dev DB migration history: 16 migrations, up to date per `prisma migrate status` (see the checksum caveat above under Deviations).

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All created files verified present on disk (`08-PAYMENT-GATEWAY-DISTRIBUTION.md`, `migration.sql`, this SUMMARY.md) and all 3 commits (`12f9b2b`, `0b48db2`, `81c0df6`) verified present in `git log`.
