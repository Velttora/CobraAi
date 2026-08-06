---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 01
subsystem: database
tags: [prisma, postgresql, crypto, aes-256-gcm, node-crypto, envelope-encryption]

# Dependency graph
requires: []
provides:
  - "AES-256-GCM envelope encryption (`@cobrai/utils`): encryptSecretBundle/decryptSecretBundle/currentKeyVersion/lastFour"
  - "TenantIntegration model + IntegrationProvider/IntegrationMode/IntegrationStatus enums"
  - "contacts.simulated and messages.simulated columns (D-17)"
  - "Applied migration 20260804100000_add_tenant_integrations + regenerated Prisma client exposing prisma.tenantIntegration"
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-07, 08-08, 08-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Envelope encryption: iv(12)||ciphertext(n)||authTag(16) Buffer layout, versioned key via ENCRYPTION_KEY_V{n} env var"
    - "Hand-authored migration SQL applied via `prisma db execute` + `prisma migrate resolve --applied` (prisma migrate dev fails locally with P3014)"

key-files:
  created:
    - packages/utils/src/crypto/envelope-encryption.ts
    - packages/utils/src/crypto/envelope-encryption.spec.ts
    - packages/db/prisma/migrations/20260804100000_add_tenant_integrations/migration.sql
  modified:
    - packages/utils/src/index.ts
    - packages/db/prisma/schema.prisma
    - .env.example

key-decisions:
  - "Followed the plan's exact interface contracts (D-08, D-09, D-10, D-11, D-17) with no architectural deviation"
  - "Caught up 5 pre-existing pending migrations (unrelated to this plan) on the local dev DB via `prisma migrate deploy` so `migrate status` reports clean for downstream plans"

patterns-established:
  - "Pattern: per-tenant secret bundles are JSON-serialized then AES-256-GCM encrypted as a single Buffer; decrypt throws (never returns garbage) on GCM auth-tag mismatch"
  - "Pattern: new Bytes-typed Prisma columns map to Postgres BYTEA, following the same @map/@@map snake_case convention as the rest of the schema"

requirements-completed: [D-08, D-09, D-10, D-11, D-17]

duration: 10min
completed: 2026-08-04
---

# Phase 8 Plan 01: Envelope Encryption + TenantIntegration Foundation Summary

**AES-256-GCM envelope encryption in `@cobrai/utils` (versioned key, GCM tamper detection) plus the `TenantIntegration` Prisma model, three integration enums, and `simulated` flags on `contacts`/`messages`, migration applied locally.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-04T19:11:31-05:00
- **Completed:** 2026-08-04T19:20:48-05:00
- **Tasks:** 3 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Greenfield AES-256-GCM envelope encryption primitive built from Node's built-in `node:crypto` only (zero new dependencies), round-trips secrets, detects tampering via GCM auth tag, and supports key rotation via `ENCRYPTION_KEY_V{n}` + `keyVersion` column
- `TenantIntegration` Prisma model with `unique(tenantId, provider)` (D-09), `Bytes`-typed `secretsCipher` column (no plaintext mirror), opaque unique `webhookToken` (D-19 precursor), and `secretsMeta` scoped to `lastFour`/`savedAt` only (D-26)
- `contacts.simulated` / `messages.simulated` columns (D-17) so simulated sends never inflate delivery metrics or consume the Ley 1266 contact quota
- Migration hand-authored and applied locally following the Phase 7 `db execute` + `migrate resolve --applied` pattern; `pnpm db:generate` regenerated a client that exposes `prisma.tenantIntegration`

## Task Commits

Each task was committed atomically (Task 1 followed TDD RED/GREEN):

1. **Task 1a: Failing test for envelope encryption (RED)** - `017c6a7` (test)
2. **Task 1b: Implement AES-256-GCM envelope encryption (GREEN)** - `033ada1` (feat)
3. **Task 2: TenantIntegration model, enums, simulated flags** - `2fa311b` (feat)
4. **Task 3: Hand-author and apply migration, regenerate Prisma client** - `fcf2724` (feat)

## Files Created/Modified
- `packages/utils/src/crypto/envelope-encryption.ts` - `encryptSecretBundle`/`decryptSecretBundle`/`currentKeyVersion`/`lastFour`, AES-256-GCM, versioned key resolution
- `packages/utils/src/crypto/envelope-encryption.spec.ts` - 12 tests covering round-trip, UTF-8, tamper detection, missing/short key, random IV, `lastFour`, `currentKeyVersion`
- `packages/utils/src/index.ts` - re-exports the four crypto functions + `EncryptedSecret` type from the barrel
- `.env.example` - documents `ENCRYPTION_KEY_V1` / `ENCRYPTION_KEY_VERSION`
- `packages/db/prisma/schema.prisma` - `IntegrationProvider`/`IntegrationMode`/`IntegrationStatus` enums, `TenantIntegration` model, `Tenant.integrations` relation, `Contact.simulated`, `Message.simulated`
- `packages/db/prisma/migrations/20260804100000_add_tenant_integrations/migration.sql` - hand-authored DDL matching the schema column-for-column

## Decisions Made
- No architectural deviations. Followed the plan's `<interfaces>` block verbatim for both the crypto module signature and the Prisma model shape.
- `simulated` columns added with no explicit `@map` on the field itself (matches the neighboring `status`/`channel` fields' convention of no map for already-lowercase single-word names).

## Deviations from Plan

None - plan executed exactly as written. One environment workaround was required to complete verification (documented below, not a code deviation).

## Issues Encountered

- **pnpm/corepack broken in this worktree's shell environment**: `pnpm` (and `pnpm --filter ... exec prisma ...`) consistently threw `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` from the corepack shim regardless of Node version (20.19.1 or 24.17.0) or invocation path — a pre-existing environment issue, not caused by this plan's changes. Worked around it by running `prisma@5.22.0` (pinned to match `packages/db/package.json`'s `^5.22.0`) directly via `npx`/a locally-copied `node_modules/prisma` for `validate`, `db execute`, `migrate resolve`, `migrate status`, `migrate deploy`, and `generate` — all commands the plan specifies, just invoked without the `pnpm --filter` wrapper. All outcomes (schema validation, migration application, client generation) match what the wrapped commands would have produced. `packages/utils` tests ran fine via `npx vitest run` since that workspace has no cross-package dependency issue.
- **5 pre-existing pending migrations** (`20260610230000_add_internal_contact_channel` through `20260730180000_portfolio_automation_starts_at`) were unapplied on this worktree's local dev DB, unrelated to this plan. Applied them via `prisma migrate deploy` before applying/resolving the new migration, so `prisma migrate status` reports the database as fully up to date for downstream Phase 8 plans that will run in the same worktree/DB.
- Full-repo `pnpm test` could not be run as a single command due to the pnpm/corepack issue above. `packages/utils` tests (64/64) were verified directly via `npx vitest run`; `packages/db` has no test files (`test` script uses `--passWithNoTests`). Downstream plans/waves should re-verify `pnpm test` once the corepack issue is resolved or a working `pnpm` invocation is available.

## User Setup Required

None - no external service configuration required. `ENCRYPTION_KEY_V1` must eventually be set to a real 32-byte base64 value (`openssl rand -base64 32`) for any non-test environment, per the `.env.example` comment, but that is deployment configuration, not a Phase 8 code dependency for this plan.

## Next Phase Readiness
- `@cobrai/utils` crypto module and `TenantIntegration` table are ready for 08-02 onward to build the resolution service, provisioning services, and webhook token guard against.
- Local dev DB is caught up on all migrations, including the new one, so subsequent plans in this wave/worktree can run further migrations cleanly.
- Flag for the orchestrator: verify `pnpm`/corepack health before spawning downstream executors in this worktree, or expect the same `npx <tool>@<pinned-version>` workaround to be needed again.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All created files verified present on disk (`envelope-encryption.ts`, `envelope-encryption.spec.ts`, `migration.sql`, this SUMMARY.md) and all 5 task/docs commits (`017c6a7`, `033ada1`, `2fa311b`, `fcf2724`, `195af23`) verified present in `git log`.
