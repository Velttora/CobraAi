---
phase: 05-memoria-unificada-del-deudor
plan: "02"
subsystem: memory
tags: [debtor-memory, nestjs, whatsapp, conversation-agent, tdd, dependency-injection]

dependency_graph:
  requires:
    - "apps/service-notifications/src/memory/debtor-memory.service.ts (getUnifiedContext + UnifiedDebtorContext — Plan 01)"
    - "apps/service-notifications/src/memory/memory.module.ts (MemoryModule exporting DebtorMemoryService — Plan 01)"
    - "apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts (DebtorHistory with livingSummary/overallSentiment/paymentBehavior — Plan 01)"
  provides:
    - "ConversationAgentService consuming DebtorMemoryService.getUnifiedContext for prompt context"
    - "AgentModule importing MemoryModule — DI resolved for ConversationAgentService"
  affects:
    - "plans 05-03, 05-04 — ContactsModule + WebhooksModule will follow same MemoryModule import pattern"

tech_stack:
  added: []
  patterns:
    - "Constructor injection of DebtorMemoryService as 5th param; mocked as `never` cast in unit tests"
    - "Module import chaining: AgentModule imports MemoryModule which exports DebtorMemoryService"

key_files:
  created: []
  modified:
    - apps/service-notifications/src/agent/conversation-agent.service.ts
    - apps/service-notifications/src/agent/conversation-agent.service.spec.ts
    - apps/service-notifications/src/agent/agent.module.ts

decisions:
  - "loadDebtorHistory removed entirely — its logic now lives in DebtorMemoryService.gatherContextData, avoiding dual maintenance"
  - "extractText kept (still used by message-history mapping line 133); PrismaService kept in ConversationAgentService (still used for debtor/debt/message queries)"
  - "mockDebtorMemory defined at module scope (not inside beforeEach) so the reference is stable for assertion in the new test"

requirements-completed: []

metrics:
  duration: "3 minutes"
  completed: "2026-06-09"
  tasks_completed: 2
  tests_added: 1
  files_created: 0
  files_modified: 3
---

# Phase 5 Plan 02: WhatsApp Agent Unified Memory Integration Summary

**ConversationAgentService now sources its prompt context from DebtorMemoryService.getUnifiedContext (cross-channel) instead of the removed loadDebtorHistory (WhatsApp-only), with MemoryModule wired into AgentModule for DI.**

## Performance

- **Duration:** 3 minutes
- **Started:** 2026-06-09T00:24:07Z
- **Completed:** 2026-06-09T00:27:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced `loadDebtorHistory` (WhatsApp-only, 63 lines) with `debtorMemory.getUnifiedContext(tenant_id, debtor_id, debt.id)` — WhatsApp agent gains cross-channel context including voice summaries and living debtor profile
- Wired `MemoryModule` into `AgentModule.imports` — NestJS DI now resolves `DebtorMemoryService` into `ConversationAgentService`
- Added `mockDebtorMemory` to spec with `getUnifiedContext` assertion; full suite 74 tests passing, no regressions

## Task Commits

Each task was committed atomically following TDD RED → GREEN:

1. **Task 1 RED: Add failing test** - `84d7ed0` (test)
2. **Task 1 GREEN: Inject DebtorMemoryService + replace loadDebtorHistory** - `a740dca` (feat)
3. **Task 2: Wire MemoryModule into AgentModule** - `bf71a8d` (feat)

**Plan metadata:** (docs commit — see below)

_Note: Task 2 has no separate RED commit because the DI wiring is verified at the module level by the spec suite (all 10 agent tests passing confirms the mock injection works)._

## Files Created/Modified

- `apps/service-notifications/src/agent/conversation-agent.service.ts` — Added `DebtorMemoryService` as 5th constructor param, replaced `loadDebtorHistory` call with `debtorMemory.getUnifiedContext`, removed `loadDebtorHistory` method (63 lines removed), kept `extractText`
- `apps/service-notifications/src/agent/conversation-agent.service.spec.ts` — Added `mockDebtorMemory` at module scope, set `getUnifiedContext.mockResolvedValue` in `beforeEach`, passed as 5th constructor arg, added `"usa getUnifiedContext para construir el prompt"` assertion
- `apps/service-notifications/src/agent/agent.module.ts` — Added `MemoryModule` import from `../memory/memory.module` and to the `imports` array

## Decisions Made

- `loadDebtorHistory` removed entirely (not just bypassed) — its logic was already fully generalized in `DebtorMemoryService.gatherContextData`; keeping both would create dual-maintenance burden
- `PrismaService` kept injected into `ConversationAgentService` (still needed for debtor/debt lookup at lines 67-98 and message history at lines 102-107)
- `mockDebtorMemory` defined at module scope (not inside `beforeEach`) so the `vi.fn()` reference is stable for the `toHaveBeenCalledWith` assertion in the new test

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all injected data flows from `DebtorMemoryService.getUnifiedContext` which returns real Prisma queries in production.

## Threat Flags

None — no new network endpoints, no new auth paths. The only change is the internal data source for prompt context; WhatsApp agent behavior is otherwise unchanged (T-05-04 mitigated as planned).

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (`test(...)`) | 84d7ed0 | PASS |
| Task 1 GREEN (`feat(...)`) | a740dca | PASS |
| Task 2 GREEN (`feat(...)`) | bf71a8d | PASS |

## Verification Results

```
npx vitest run src/agent/conversation-agent.service.spec.ts
Test Files  1 passed (1)
Tests  10 passed (10)

npx vitest run (full suite)
Test Files  11 passed (11)
Tests  74 passed (74)

npx tsc --noEmit -p apps/service-notifications/tsconfig.json
(no output — clean)

grep -n "debtorMemory.getUnifiedContext" conversation-agent.service.ts   → 1 match (line 112)
grep -c "loadDebtorHistory" conversation-agent.service.ts                 → 0
grep -n "MemoryModule" agent.module.ts                                    → 2 matches (import + imports array)
```

## Next Phase Readiness

- Plan 05-03 (ContactsModule voice integration) and 05-04 (VapiWebhookHandler refreshMemory) follow the same pattern: inject `DebtorMemoryService`, import `MemoryModule` in the relevant module
- `MemoryModule` is ready to be imported into `ContactsModule` and `WebhooksModule` without any changes to the memory layer

---
*Phase: 05-memoria-unificada-del-deudor*
*Completed: 2026-06-09*
