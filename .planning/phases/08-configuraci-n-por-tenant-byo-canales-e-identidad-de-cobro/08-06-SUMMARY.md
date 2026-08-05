---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 06
subsystem: database
tags: [prisma, data-migration, aes-256-gcm, idempotency, twilio, sendgrid, mercadopago, fly]

# Dependency graph
requires:
  - phase: 08-01
    provides: "AES-256-GCM envelope encryption (encryptSecretBundle/lastFour) + TenantIntegration model"
  - phase: 08-03
    provides: "IntegrationProvider enum values and the WEBHOOK_CAPABLE_PROVIDERS convention (mirrored locally, not imported, to avoid a circular workspace dependency)"
  - phase: 08-04
    provides: "20260804110000_split_payment_provider_method migration, required before this seed runs in production"
provides:
  - "packages/db/src/seed-tenant-integrations.ts: idempotent TS data migration seeding twilio_whatsapp/twilio_voice/sendgrid/mercadopago TenantIntegration rows for every pre-existing, non-deleted tenant from current global env credentials (D-18)"
  - "pnpm db:seed:tenant-integrations (local) and pnpm db:seed:tenant-integrations:prod (guarded Fly runner)"
  - "Precedent: main() guarded behind require.main === module so a seed/backfill script's module-scope side effects don't fire on import — needed by every future spec file that imports a similar script"
affects: [08-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TS data migration (not .sql) for reference data that requires runtime crypto — extends the repo's existing db:backfill-* / db:seed:* script family, structurally following backfill-escalations.ts"
    - "Skip-if-exists (findUnique + create, never upsert) as the application-level equivalent of ON CONFLICT ... DO NOTHING, for writes that must never overwrite user-owned data"
    - "Prod .cjs runner duplicates its TS source's logic in plain JS rather than requiring the workspace package's dist — same choice prod-fix-escalations.cjs already made for backfill-escalations.ts"

key-files:
  created:
    - packages/db/src/seed-tenant-integrations.ts
    - packages/db/src/seed-tenant-integrations.spec.ts
    - packages/db/src/seed-tenant-integrations.fixtures.ts
    - infra/fly/run-prod-seed-tenant-integrations.sh
    - packages/db/scripts/prod-seed-tenant-integrations.cjs
  modified:
    - packages/db/package.json
    - package.json

key-decisions:
  - "Added seed-tenant-integrations.fixtures.ts (not in the plan's files_modified list) to keep both the implementation and the spec file under the 300-line hard limit, following the packages/integrations/tenant-integration.fixtures.ts precedent."
  - "WEBHOOK_CAPABLE_PROVIDERS is not imported from @cobrai/integrations — that package depends on @cobrai/db, so importing it back would create a circular workspace dependency. Mirrored as a local 3-entry constant (SEED_WEBHOOK_CAPABLE_PROVIDERS) covering only the providers this seed writes (twilio_whatsapp, sendgrid, mercadopago)."
  - "twilio_voice is skipped alongside twilio_whatsapp when no from-number can be resolved for a tenant, since its outboundNumber is derived from the same number — the plan's behavior block ties the pair together ('the same number')."
  - "SendGrid's fromEmail falls back to the same 'noreply@cobrai.dev' default email.adapter.ts already uses today when SENDGRID_FROM_EMAIL is set but empty, keeping the seeded row consistent with what the adapter is actually sending with right now."

patterns-established:
  - "Pattern: guard a script's module-scope main() invocation with `if (require.main === module)` whenever the script also exports functions meant to be unit-tested — otherwise importing it for a spec triggers a real PrismaClient connection and process.exit as a side effect of import."

requirements-completed: [D-18]

duration: ~20min
completed: 2026-08-04
---

# Phase 8 Plan 06: Idempotent Tenant Integration Seed Summary

**Idempotent TypeScript data migration that copies the platform's current global Twilio/SendGrid/Mercado Pago credentials into per-tenant, AES-256-GCM-encrypted `TenantIntegration` rows for every pre-existing tenant, plus its guarded production runner — the D-18 cutover bridge for plan 08-09.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-04T19:53:00-05:00 (approx, first file read)
- **Completed:** 2026-08-04T20:16:00-05:00
- **Tasks:** 2 completed (Task 1 followed TDD RED/GREEN)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- `seed-tenant-integrations.ts`: seeds `twilio_whatsapp` + `twilio_voice` (paired, sharing the resolved WhatsApp number and Twilio secrets), `sendgrid`, and `mercadopago` rows for every existing, non-deleted tenant, reproducing the exact env-var names and `whatsapp:` prefix normalization the live adapters use today
- Skip-if-exists via `findUnique` + `create` (never `upsert`) on `(tenantId, provider)` — a tenant's own manually configured credentials, or a soft-deleted row, are never touched; a second run creates nothing
- Fails fast (`process.exit(1)`) before any Prisma write when `ENCRYPTION_KEY_V1` is missing or malformed, via a probe call to `encryptSecretBundle`
- `secretsCipher` is always a `Buffer`; `secretsMeta` carries only `lastFour`/`savedAt` — verified by a test that greps the plaintext token out of both write arguments
- Webhook-capable seeded providers (`twilio_whatsapp`, `sendgrid`, `mercadopago`) get a 32-byte base64url `webhookToken`; `twilio_voice` does not
- Production runner (`infra/fly/run-prod-seed-tenant-integrations.sh` + `prod-seed-tenant-integrations.cjs`) follows the `run-prod-db-fix.sh` sftp-then-ssh-console pattern, adds the `fly`/`flyctl` fallback from `run-prod-migrate.sh`, prints a Spanish precondition banner naming both required migrations and `ENCRYPTION_KEY_V1`, and requires typing `si` before touching production
- Verified locally end-to-end against a real Postgres (see Local Run Outputs below): 2 active tenants + 1 soft-deleted tenant → first run creates 8 rows (0 for the soft-deleted tenant), second run creates 0 and reports all 8 as skipped; a tenant's own `settings.whatsappFromNumber` was correctly preferred over the global env number

## Local Run Outputs

Run against a throwaway local Postgres (migrations `20260804100000_add_tenant_integrations` and `20260804110000_split_payment_provider_method` applied via `prisma migrate deploy`), 2 active tenants (one with its own `settings.whatsappFromNumber`) + 1 soft-deleted tenant, full Twilio/SendGrid/Mercado Pago/Vapi env set:

**First run:**
```
Sembrado de integraciones: 2 tenants procesados → 8 filas creadas, 0 omitidas.
```

**Second run (idempotent re-run):**
```
Sembrado de integraciones: 2 tenants procesados → 0 filas creadas, 8 omitidas.
```

The soft-deleted tenant never appears in either run's tenant count (2, not 3), confirming `fetchActiveTenants`'s `deletedAt: null` filter. Row-level inspection confirmed `mode: managed`, `status: verified`, non-null `verifiedAt`, `secretsCipher` as a `Buffer`, `webhookToken` present for `twilio_whatsapp`/`sendgrid`/`mercadopago` and absent for `twilio_voice`, and the tenant-owned `whatsapp:+573001234567` number winning over the global `whatsapp:+14155550100` for the tenant that had it set.

**The production run itself is still pending** — `run-prod-seed-tenant-integrations.sh` was only parse-checked (`bash -n`) per the plan; it was deliberately not executed against Fly in this task.

## Task Commits

Each task was committed atomically (Task 1 followed TDD RED/GREEN):

1. **Task 1a: Failing tests for the seed (RED)** - `61b7e3d` (test)
2. **Task 1b: Implement the idempotent seed (GREEN)** - `c2aef7f` (feat)
3. **Task 2: Production runner (shell + .cjs)** - `cf99b21` (feat)

## Files Created/Modified
- `packages/db/src/seed-tenant-integrations.ts` - the idempotent seed: `loadProviderEnv`, `fetchActiveTenants`, `seedTenantIntegrations`, `assertEncryptionKeyConfigured`, `main` (guarded by `require.main === module`)
- `packages/db/src/seed-tenant-integrations.spec.ts` - 14 tests covering every behavior bullet
- `packages/db/src/seed-tenant-integrations.fixtures.ts` - hand-rolled Prisma mock, `withEnv`/`withTestEncryptionKey`, `buildTenant` (new file, see Decisions)
- `packages/db/scripts/prod-seed-tenant-integrations.cjs` - self-contained CJS reimplementation for the deployed container, importing `encryptSecretBundle`/`lastFour` from `@cobrai/utils`
- `infra/fly/run-prod-seed-tenant-integrations.sh` - guarded Fly runner with precondition banner + `si` confirmation gate
- `packages/db/package.json` / `package.json` - registered `db:seed:tenant-integrations` (local) and `db:seed:tenant-integrations:prod` (Fly)

## Decisions Made
- `seed-tenant-integrations.fixtures.ts` was added beyond the plan's `files_modified` list to keep the implementation (292 lines) and spec (238 lines) files under the project's 300-line hard limit — matches the existing `tenant-integration.fixtures.ts` pattern in `packages/integrations`.
- `WEBHOOK_CAPABLE_PROVIDERS` from `@cobrai/integrations` could not be imported (that package depends on `@cobrai/db`, so the reverse import would be circular); mirrored locally as a 3-entry constant scoped to only the providers this seed writes, with a comment explaining why.
- `twilio_voice` shares the from-number skip condition with `twilio_whatsapp` (both skipped together when no number resolves), since `outboundNumber` is derived from the same value.
- Production `.cjs` runner duplicates the seed's JS logic rather than requiring `@cobrai/db`'s compiled `dist/seed-tenant-integrations.js` — this mirrors the existing `prod-fix-escalations.cjs` precedent for `backfill-escalations.ts` and avoids coupling the Fly runner to another workspace package's internal `dist/` file layout. The crypto helper (`encryptSecretBundle`/`lastFour`) is imported from `@cobrai/utils`, never reimplemented — verified by `grep -cE "createCipheriv|aes-256-gcm"` returning 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `main()` executing as a side effect of the spec file's import**
- **Found during:** Task 1, first test run (GREEN phase)
- **Issue:** `backfill-escalations.ts`'s established pattern calls `main().catch(...).finally(...)` at module scope. Since the plan requires a spec file that imports the same module to reach its exported functions, that import triggered a real `PrismaClient` instantiation and, because `ENCRYPTION_KEY_V1` wasn't set at import time, a real `process.exit(1)` — an unhandled rejection inside the test run.
- **Fix:** Wrapped the module-scope `main()` invocation in `if (require.main === module) { ... }`, the standard Node idiom for "only run when executed directly, not when imported." No behavior change for the script when run via `tsx src/seed-tenant-integrations.ts` (still `require.main === module` in that case).
- **Files modified:** `packages/db/src/seed-tenant-integrations.ts`
- **Verification:** Full spec suite (14 tests) runs clean with zero unhandled errors; `pnpm exec tsx src/seed-tenant-integrations.ts` still runs `main()` normally when invoked as a script (confirmed via the local Postgres run above).
- **Commit:** `c2aef7f`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the spec file the plan itself requires to be importable without side effects. No scope creep — the script's CLI behavior is unchanged.

## Issues Encountered
- `@cobrai/utils` had no built `dist/` in this worktree (same class of issue documented in 08-03-SUMMARY.md for other packages) — `Cannot find module "@cobrai/utils"` on the first vitest run. Fixed by running `pnpm --filter @cobrai/utils --filter @cobrai/workflow-packages build` before continuing; no source changes, build artifacts only (gitignored).
- Port 5433 (this docker-compose's default Postgres port) was already occupied by an unrelated container (`renova-postgres`, a different project sharing the host). Ran a throwaway `postgres:16-alpine` container on port 5434 instead for the local verification run in "Local Run Outputs" above, then removed it afterward. No project files were changed by this; purely a local verification environment choice.

## User Setup Required

None for this plan's code. The production run itself requires an operator to have `ENCRYPTION_KEY_V1` already set as a Fly secret on the target app and to have run `pnpm db:migrate:prod` first — both are checked in the precondition banner the script prints, and neither was configured or verified here since the script was deliberately not executed against Fly.

## Next Phase Readiness
- Plan 08-09 (adapters switching to per-tenant resolution) can rely on every pre-existing tenant having verified `TenantIntegration` rows once this seed has been run in production — it has not been run in production yet, only verified locally.
- **Flag for the orchestrator / plan 08-09:** the production seed (`pnpm db:seed:tenant-integrations:prod`) still needs to be executed by an operator against the real Fly app, after `pnpm db:migrate:prod` and after `ENCRYPTION_KEY_V1` is confirmed set as a Fly secret, before 08-09's adapter cutover ships. This is a manual production step by design (D-18's safety gate), not an automation gap.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 5 created files verified present on disk (`seed-tenant-integrations.ts`, `seed-tenant-integrations.spec.ts`, `seed-tenant-integrations.fixtures.ts`, `run-prod-seed-tenant-integrations.sh`, `prod-seed-tenant-integrations.cjs`) and all 3 task commits (`61b7e3d`, `c2aef7f`, `cf99b21`) verified present in `git log`.
