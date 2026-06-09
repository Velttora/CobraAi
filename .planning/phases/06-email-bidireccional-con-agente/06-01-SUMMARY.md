---
phase: 06-email-bidireccional-con-agente
plan: "01"
subsystem: api
tags: [sendgrid, email, reply_to, vitest]

# Dependency graph
requires: []
provides:
  - EmailAdapter.sendTemplate passes reply_to as { email } object to SendGrid v3 mail/send body
  - Unit tests verify reply_to is included when present and omitted when absent
affects:
  - 06-email-bidireccional-con-agente (Plans 02+: agent multi-canal que pasa reply_to al llamar sendTemplate)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional object spread to omit optional SendGrid fields when falsy: ...(value ? { key: value } : {})
    - Nested describe + afterEach to restore global.fetch after mock, preventing mock leak across tests

key-files:
  created: []
  modified:
    - apps/service-notifications/src/adapters/email.adapter.ts
    - apps/service-notifications/src/adapters/email-adapter.spec.ts

key-decisions:
  - "Use conditional spread (not undefined assignment) for reply_to so the key is fully absent from the JSON body when falsy — SendGrid v3 rejects reply_to: undefined"
  - "Restore global.fetch in afterEach (not beforeEach) to guarantee cleanup even if test throws"

patterns-established:
  - "Global fetch mock pattern: save original in beforeEach, assign vi.fn(), restore in afterEach"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-06-09
---

# Phase 6 Plan 01: Email reply_to wiring in EmailAdapter Summary

**EmailAdapter.sendTemplate now passes reply_to: { email } to SendGrid v3 mail/send via conditional spread, enabling Reply-To header on all outbound CobraAI emails**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-09T16:09:24Z
- **Completed:** 2026-06-09T16:11:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired the pre-existing `reply_to?: string` field in `SendEmailTemplateInput` through to the SendGrid v3 `mail/send` body as `reply_to: { email: input.reply_to }`
- Used conditional spread so the key is completely absent from JSON when `input.reply_to` is falsy — avoids SendGrid v3 rejection of `reply_to: undefined`
- Added two new spec tests with mocked `global.fetch` (positive: key present; negative: key absent); existing sandbox test untouched and still passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Pasar reply_to al body v3 de SendGrid en EmailAdapter** - `dc4ed77` (feat)
2. **Task 2: Test de reply_to en email-adapter.spec.ts con fetch mockeado** - `c510d07` (test)
3. **[Rule 1 - Bug] Fix TS2532 possibly-undefined cast in spec** - `7ea3421` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/service-notifications/src/adapters/email.adapter.ts` - Added `...(input.reply_to ? { reply_to: { email: input.reply_to } } : {})` inside the JSON.stringify body of the fetch call to SendGrid
- `apps/service-notifications/src/adapters/email-adapter.spec.ts` - Added nested `describe("con SENDGRID_API_KEY presente")` with two tests and `afterEach` fetch restore

## Decisions Made

- Conditional spread over ternary assignment: `...(cond ? { k: v } : {})` rather than `reply_to: input.reply_to ? { email } : undefined` — the spread guarantees the key never appears in the serialized object when falsy
- `global.fetch` restored in `afterEach` (not `beforeEach`) so cleanup runs even when a test assertion throws

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2532 Object possibly undefined in spec assertions**
- **Found during:** Task 2 verification (typecheck)
- **Issue:** `fetchMock.mock.calls[0][1]` typed as `unknown[] | undefined`; TypeScript TS2532 error on index access
- **Fix:** Cast `fetchMock.mock.calls[0]` to `[string, RequestInit]` tuple so index access is safe
- **Files modified:** `apps/service-notifications/src/adapters/email-adapter.spec.ts`
- **Verification:** `npx tsc --noEmit` passes; all 3 tests green
- **Committed in:** `7ea3421` (separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — TypeScript correctness)
**Impact on plan:** Fix required for typecheck gate. No scope change.

## Issues Encountered

TypeScript strict mode flagged index access on `mock.calls[0][1]` as possibly undefined. Fixed with explicit tuple cast — zero behavioral change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `EmailAdapter.sendTemplate` is now fully wired for `reply_to` — Plan 02 (agent multi-canal) can pass `reply_to: "reply@reply.fogging.org"` when `channel === "email"` without any further adapter changes
- No blockers

---
*Phase: 06-email-bidireccional-con-agente*
*Completed: 2026-06-09*
