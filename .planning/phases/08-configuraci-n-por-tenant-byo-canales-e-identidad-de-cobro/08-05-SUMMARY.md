---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 05
subsystem: compliance
tags: [compliance, channel-not-configured, tenant-integration, waterfall, escalation, ley-1266]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-03's TenantIntegrationService.hasVerifiedChannel(tenantId, channel)"
provides:
  - "channel_not_configured as a first-class ContactCheckReason, gated in both ComplianceService lanes (checkContact/checkBeforeSend and isChannelEligible)"
  - "ContactsService.availableChannels(tenantId, debtor) — async, filtered by verified TenantIntegration, consumed by the waterfall"
  - "Human escalation (cobrai.debt.escalated, target: human) when a debtor is reachable but the tenant has no configured channel"
affects: [08-10, 08-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "compliance.service.ts kept under the 300-line limit by extracting isHoliday/nextNonHolidaySendTime into holiday-rules.ts and getRetryState's body into retry-state.ts as standalone functions taking PrismaService as an explicit param"
    - "reachableChannels(debtor) (sync, debtor-only reachability) vs availableChannels(tenantId, debtor) (async, also filtered by hasVerifiedChannel) — the split lets handleContactRequested distinguish no_available_channel from no_channel_configured"

key-files:
  created:
    - packages/compliance/src/holiday-rules.ts
    - packages/compliance/src/retry-state.ts
  modified:
    - packages/compliance/package.json
    - packages/compliance/src/types.ts
    - packages/compliance/src/compliance.service.ts
    - packages/compliance/src/compliance.service.spec.ts
    - apps/service-notifications/src/compliance/compliance.module.ts
    - apps/service-notifications/test/compliance.e2e-spec.ts
    - apps/service-workflows/package.json
    - apps/service-workflows/src/compliance/compliance.module.ts
    - apps/service-notifications/src/contacts/contacts.service.ts
    - apps/service-notifications/src/contacts/contacts.service.spec.ts

key-decisions:
  - "ComplianceService constructor arity is now 5: (prisma, consent, optOut, audit, integrations: TenantIntegrationService). Every existing new ComplianceService(...) call site was found and updated (service-notifications module + e2e spec, service-workflows module, the package's own unit spec) — grep -rn \"new ComplianceService(\" apps packages shows all five call sites passing five args."
  - "availableChannels(tenantId, debtor): Promise<ContactChannel[]> replaces the old sync availableChannels(debtor). Plan 08-10 and the health screen (08-19) should call this new async signature, not the old one."
  - "ContactChannel has a member the plan's interfaces block didn't mention: 'portal'. Treated it the same as 'internal' — never gated — since neither has a matching TenantIntegration provider and portal isn't a channel any adapter sends through."
  - "service-workflows didn't depend on @cobrai/integrations before this plan (only service-notifications and service-payments did, from 08-03). Added the workspace dependency and wired TenantIntegrationService as a factory provider in its ComplianceModule too, since it also constructs ComplianceService directly."

patterns-established:
  - "isChannelConfigured helper (mirrored in both ComplianceService and ContactsService) maps sms -> whatsapp integration, passes whatsapp/voice/email through unchanged, and treats internal/portal as always configured — any future caller gating a channel on TenantIntegration should reuse this exact mapping, not reinvent it."

requirements-completed: [D-16]

duration: ~25min
completed: 2026-08-04
---

# Phase 8 Plan 05: channel_not_configured Compliance Gate + Waterfall Skip/Escalate Summary

**Adds `channel_not_configured` to `ComplianceService`'s reason union, gates both lanes on `TenantIntegrationService.hasVerifiedChannel`, and makes the notifications waterfall skip unconfigured channels and escalate a debt to a human inbox when nothing is left.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments
- `channel_not_configured` added to `ContactCheckReason`, wired into `checkContact` (ordered after opt-out/consent, before hours/frequency, no `next_allowed_at`) and `isChannelEligible` (after `no_consent`, before `holiday`, still skipping hours/frequency per that lane's deliberate design)
- New private `isChannelConfigured(tenantId, channel)` helper in `ComplianceService`, delegating to `TenantIntegrationService.hasVerifiedChannel` with `sms -> whatsapp` mapping and `internal`/`portal` always passing
- `compliance.service.ts` split to respect the 300-line hard limit: `isHoliday`/`nextNonHolidaySendTime` moved to `holiday-rules.ts`, `getRetryState`'s body moved to `retry-state.ts` (the public method itself stays, now a 3-line delegate, since other services call `compliance.getRetryState(...)` directly)
- `ContactsService.availableChannels` is now async and tenant-aware: reachable channels (whatsapp/voice/sms/email based on debtor phones/email/opt-in) are further filtered by `hasVerifiedChannel`, so the waterfall in `handleContactRequested` skips a step the tenant hasn't configured instead of attempting it and getting blocked
- When a debtor is reachable but the tenant has zero configured channels, `handleContactRequested` publishes `cobrai.contact.failed.no_response` with `reason: "no_channel_configured"` (kept distinct from the pre-existing `no_available_channel` for genuinely unreachable debtors) and additionally `cobrai.debt.escalated` with `target: "human"`, reusing `WorkflowsService.escalateDebt`'s exact payload shape and the notifications Kafka consumer's existing `target: "human"` → inbox-escalation handling — no new topic, no new consumer
- 25 compliance package tests pass (7 new + 18 existing, all updated to stub `hasVerifiedChannel`), 143 service-notifications tests pass (11 new + 132 existing), 44 service-workflows tests pass unaffected

## Task Commits

1. **Task 1: channel_not_configured gate in both ComplianceService lanes** - `e1cb1b3` (feat)
2. **Task 2: Waterfall skips unconfigured channels and escalates to a human when none remain** - `6d59db6` (feat)

## Files Created/Modified
- `packages/compliance/src/types.ts` - added `channel_not_configured` to `ContactCheckReason`
- `packages/compliance/src/compliance.service.ts` - 5th constructor param `TenantIntegrationService`, `isChannelConfigured` gate in both lanes, `isHoliday`/`nextNonHolidaySendTime`/`getRetryState` body extracted out
- `packages/compliance/src/holiday-rules.ts` (new) - `isHoliday`, `nextNonHolidaySendTime` as standalone functions
- `packages/compliance/src/retry-state.ts` (new) - `computeRetryState` standalone function
- `packages/compliance/src/compliance.service.spec.ts` - `hasVerifiedChannel` stub in every existing test + 7 new tests for the gate
- `packages/compliance/package.json` - added `@cobrai/integrations: workspace:*`
- `apps/service-notifications/src/compliance/compliance.module.ts` - `TenantIntegrationService` factory provider, exported, passed as 5th `ComplianceService` arg
- `apps/service-notifications/test/compliance.e2e-spec.ts` - updated `new ComplianceService(...)` call site
- `apps/service-workflows/package.json` - added `@cobrai/integrations: workspace:*` (new dependency for this app)
- `apps/service-workflows/src/compliance/compliance.module.ts` - same factory-provider wiring as service-notifications
- `apps/service-notifications/src/contacts/contacts.service.ts` - `TenantIntegrationService` injected, `availableChannels` made async and integration-filtered, `reachableChannels` extracted for the reason-distinguishing logic, human escalation added, terminal-block comment added
- `apps/service-notifications/src/contacts/contacts.service.spec.ts` - `makeIntegrations()` stub added to all existing constructor call sites, new describe block with 6 tests for the behavior bullets

## Decisions Made
- `ContactChannel` includes `"portal"`, not mentioned in the plan's interfaces block. Treated identically to `"internal"` (never gated) since no `TenantIntegration` provider maps to it.
- `service-workflows` needed `@cobrai/integrations` added as a new dependency (it wasn't added in 08-03, unlike service-notifications and service-payments) because its `ComplianceModule` also constructs `ComplianceService` directly and needed the same factory-provider wiring.
- Kept `ComplianceService.getRetryState` as a thin public delegate to the extracted `computeRetryState` function rather than removing the method, since `debtor-contact-coordinator.service.ts` and `workflows.service.ts` call `compliance.getRetryState(...)` directly — removing it would have been an unplanned public API break.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `packages/compliance/src/compliance.service.ts` would have exceeded the repo's 300-line file-size rule**
- **Found during:** Task 1, immediately after wiring the new constructor param and gate logic (file reached 375 lines)
- **Issue:** The user's hard rule caps source files at 300 lines. Adding the gate to an already ~344-line file pushed it over.
- **Fix:** Extracted `isHoliday`/`nextNonHolidaySendTime` into a new `holiday-rules.ts` and `getRetryState`'s body into a new `retry-state.ts`, both as standalone functions taking `PrismaService` as an explicit parameter instead of `this.prisma`. `compliance.service.ts` now calls the imported functions directly (or, for `getRetryState`, delegates via a 3-line public wrapper since it's called externally as `compliance.getRetryState(...)`).
- **Files modified:** `packages/compliance/src/compliance.service.ts` (274 lines), `packages/compliance/src/holiday-rules.ts` (44 lines, new), `packages/compliance/src/retry-state.ts` (78 lines, new)
- **Verification:** All 25 compliance tests still pass after the extraction; `wc -l` confirms all three files are under 300 lines
- **Committed in:** `e1cb1b3` (Task 1 commit)

**2. [Rule 3 - Blocking issue] Every other `new ComplianceService(...)` call site needed updating**
- **Found during:** Task 1, after adding the 5th constructor parameter
- **Issue:** The plan's file list only named `apps/service-notifications/src/compliance/compliance.module.ts`, but `grep -rn "new ComplianceService("` found three more call sites that would fail to compile or construct correctly: `apps/service-notifications/test/compliance.e2e-spec.ts`, `apps/service-workflows/src/compliance/compliance.module.ts`, and `packages/compliance/src/compliance.service.spec.ts` (the last was already in the plan's file list).
- **Fix:** Updated the e2e spec to construct and pass a `TenantIntegrationService`; added `@cobrai/integrations` as a new dependency to `apps/service-workflows/package.json` and wired the same factory-provider pattern into its `ComplianceModule`.
- **Files modified:** `apps/service-notifications/test/compliance.e2e-spec.ts`, `apps/service-workflows/package.json`, `apps/service-workflows/src/compliance/compliance.module.ts`
- **Verification:** `pnpm --filter @cobrai/service-workflows typecheck` and `pnpm --filter @cobrai/service-notifications typecheck` both exit 0; `grep -rn "new ComplianceService(" apps packages` shows all five call sites passing five arguments
- **Committed in:** `e1cb1b3` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical file-size compliance, 1 blocking compile-breakage from an incomplete call-site list)
**Impact on plan:** Both auto-fixes were necessary to satisfy the plan's own acceptance criteria (`pnpm --filter @cobrai/service-notifications typecheck` exits 0, catching missed call sites) and the project's hard file-size rule. No scope creep beyond what those two requirements demanded.

## Known Pre-Existing File-Size Violations (Out of Scope)

`apps/service-notifications/src/contacts/contacts.service.ts` was already 973 lines before this plan (a pre-existing violation of the 300-line rule accumulated across many prior plans in this and earlier phases) and is now 1021 lines after this plan's additions (~48 net new lines: constructor param, `reachableChannels`/`availableChannels`/`isChannelConfigured`, escalation branch, and comments). `contacts.service.spec.ts` was 476 lines and is now 614.

Per the SCOPE BOUNDARY instruction ("Only auto-fix issues DIRECTLY caused by the current task's changes... pre-existing warnings out of scope"), a full split of this file was **not** attempted here — `ContactsService` is a widely-injected NestJS provider consumed by `kafka.consumer.ts`, `vapi-webhook.handler.ts`, and `debtor-contact-coordinator.service.ts`; restructuring it into modules is an architectural change (Rule 4) affecting many call sites and is not what this plan's task list scoped. Flagging here for a dedicated future refactor plan.

## Issues Encountered
None blocking. `pnpm`/`corepack` and the Node 22 PATH override worked correctly. The `packages/db`/`@cobrai/utils`/etc. `dist/` outputs needed a fresh `pnpm --filter ... build` in this worktree (same one-time setup step noted in 08-03-SUMMARY.md — not committed, `dist/` is gitignored).

## User Setup Required
None. No new external service configuration — this plan only wires an already-existing workspace package (`@cobrai/integrations`, from 08-03) into two more consumers.

## Next Phase Readiness
- `ComplianceService`'s final constructor arity is 5: `(prisma, consent, optOut, audit, integrations: TenantIntegrationService)`.
- `ContactsService.availableChannels` final signature is `(tenantId: string, debtor: Debtor): Promise<ContactChannel[]>` (async, was previously sync `(debtor: Debtor): ContactChannel[]`) — plan 08-10 and the frontend health screen (08-19) should build against this signature, not the pre-08-05 one.
- Plan 08-10's adapters must continue returning an explicit failure as a second line of defence but must never make an eligibility decision themselves — the only gate is in `ComplianceService`, per T-08-05b.
- The pre-existing `contacts.service.ts`/`contacts.service.spec.ts` file-size overage (see above) is a known item for a future dedicated refactor plan, not blocking for 08-10 or 08-19.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

Both new source files (`packages/compliance/src/holiday-rules.ts`, `packages/compliance/src/retry-state.ts`) verified present on disk. Both task commits (`e1cb1b3`, `6d59db6`) verified present in `git log` with the expected file changes via `git show --stat`.
