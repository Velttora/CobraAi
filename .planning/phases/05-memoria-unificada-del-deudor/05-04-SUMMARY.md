---
phase: 05-memoria-unificada-del-deudor
plan: "04"
subsystem: webhooks
tags: [vapi, webhook, memory, debtor-memory, refreshMemory, nestjs, tdd]

dependency_graph:
  requires:
    - "apps/service-notifications/src/memory/debtor-memory.service.ts (refreshMemory signature — Plan 01)"
    - "apps/service-notifications/src/memory/memory.module.ts (MemoryModule exports DebtorMemoryService — Plan 01)"
    - "apps/service-notifications/src/webhooks/vapi-webhook.handler.ts (existing handleEndOfCall + saveTranscript)"
  provides:
    - "VapiWebhookHandler calls DebtorMemoryService.refreshMemory after each voice call's transcript is saved"
    - "saveTranscript returns debtorId (Promise<string | null>) so handleEndOfCall can thread it into refreshMemory"
    - "Closed voice contact id resolved via findFirst (Landmine 1 fixed)"
    - "refreshMemory failure never breaks the Vapi webhook — try/catch logs and continues (Landmine 2 fixed)"
    - "WebhooksModule imports MemoryModule — DebtorMemoryService is now injectable into VapiWebhookHandler"
  affects:
    - "contact.sentimentScore — now populated after each voice call via refreshMemory"
    - "debtor.emotionalProfile — living summary updated after each call"

tech_stack:
  added: []
  patterns:
    - "try/catch isolation around post-call side effects (refreshMemory wrapped so Vapi never retries on OpenAI failure)"
    - "updateMany → findFirst pattern to resolve just-closed contact id (Prisma updateMany returns no ids)"
    - "saveTranscript return-type promotion: void → Promise<string | null> to thread debtorId upward"

key_files:
  modified:
    - apps/service-notifications/src/webhooks/vapi-webhook.handler.ts
    - apps/service-notifications/src/webhooks/vapi-webhook.handler.spec.ts
    - apps/service-notifications/src/webhooks/webhooks.module.ts

decisions:
  - "refreshMemory is called only when saveTranscript returned a non-null debtorId — calls without transcript (no_answer, voicemail) correctly skip it"
  - "closedContact?.id is passed as undefined (not null) when findFirst returns nothing — matches refreshMemory's optional contactId?: string signature"
  - "Added a 4th new test (no-transcript guard) beyond the 2 required — cost zero, improves coverage"

metrics:
  duration: "420 seconds (~7 minutes)"
  completed: "2026-06-09"
  tasks_completed: 2
  tests_added: 4
  files_modified: 3
---

# Phase 5 Plan 04: Vapi Webhook refreshMemory Integration Summary

**One-liner:** VapiWebhookHandler now calls `DebtorMemoryService.refreshMemory(tenantId, debtorId, contactId)` in a guarded try/catch after each voice call transcript is saved, threading `debtorId` from `saveTranscript`'s new `Promise<string | null>` return and resolving `contactId` via `findFirst` (Landmines 1+2+5 resolved).

## What Was Built

### Task 1 — saveTranscript returns debtorId; resolve closed contactId; call refreshMemory in guarded block

Modified `vapi-webhook.handler.ts`:

- **`DebtorMemoryService` as 7th constructor param** (`private readonly debtorMemory: DebtorMemoryService`) after `config`.
- **`saveTranscript` return type** changed from `Promise<void>` to `Promise<string | null>`. Early exit on missing debt now `return null`. Final line `return debt.debtorId` added.
- **Closed contact id resolution** (Landmine 1): after `contact.updateMany`, a `contact.findFirst({ where: { tenantId, debtId, channel: "voice", status: "completed" }, orderBy: { endedAt: "desc" }, select: { id: true } })` resolves the just-closed contact id into `closedContact`.
- **debtorId threading** (Landmine 5): `let debtorId: string | null = null;` declared before the transcript block; `debtorId = await this.saveTranscript(...)` captures it.
- **refreshMemory in try/catch** (Landmine 2): `if (debtorId) { try { await this.debtorMemory.refreshMemory(tenantId, debtorId, closedContact?.id ?? undefined); } catch (err) { this.logger.error(...); } }`. The Kafka publish and all other logic are completely unaffected.

### Task 2 — Spec updated + MemoryModule wired

Updated `vapi-webhook.handler.spec.ts`:
- `contact.findFirst: vi.fn().mockResolvedValue({ id: "contact-uuid-1" })` added to `makePrisma`.
- `debtorMemory = { refreshMemory: vi.fn().mockResolvedValue(undefined), getUnifiedContext: vi.fn() }` declared and passed as 7th constructor arg.
- **Test: `llama refreshMemory con debtorId y contactId tras guardar transcript`** — asserts `debtorMemory.refreshMemory` called with `("tenant-uuid-1", "debtor-uuid-1", "contact-uuid-1")`.
- **Test: `un error en refreshMemory NO rompe el webhook (sigue publicando Kafka)`** — `mockRejectedValueOnce(new Error("OpenAI down"))`, asserts `handler.handleEndOfCall(makePayload())` resolves, and `kafka.publish("cobrai.voice.call_completed", ...)` still called.
- **Test: `no llama a refreshMemory cuando no hay transcript`** — extra guard test asserting `debtorMemory.refreshMemory` NOT called on transcript-less payload.

Updated `webhooks.module.ts`:
- Added `import { MemoryModule } from "../memory/memory.module"` and `MemoryModule` to the `imports` array.

## Verification Results

```
npx vitest run src/webhooks/vapi-webhook.handler.spec.ts
Test Files  1 passed (1)
Tests  16 passed (16)  (13 pre-existing + 3 new refreshMemory tests + 1 no-transcript guard)

npx vitest run (full suite)
Test Files  12 passed (12)
Tests  80 passed (80)  (was 73; +7 from plans 03+04)

npx tsc --noEmit -p apps/service-notifications/tsconfig.json
(no output — clean)
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. All three landmines (L1, L2, L5) addressed per plan specification.

**Extra test added (Rule 2 — correctness):**
- Added `"no llama a refreshMemory cuando no hay transcript"` test (not required by plan but zero-cost and strengthens the correctness guarantee that no-answer/voicemail calls skip the refresh).

## Known Stubs

None — `refreshMemory` is called with real tenant/debtor/contact ids derived from live Prisma queries. `sentimentScore` and `emotionalProfile` will be populated from this point forward on every call that yields a transcript.

## Threat Flags

None — no new network endpoints or trust boundaries introduced. All surface is internal NestJS DI wiring.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (`test(...)`) | 87d259b | PASS |
| Task 1 GREEN (`feat(...)`) | 45b900d | PASS |
| Task 2 (`feat(...)`) | e56a43c | PASS |

## Self-Check: PASSED

Files exist:
- apps/service-notifications/src/webhooks/vapi-webhook.handler.ts — FOUND
- apps/service-notifications/src/webhooks/vapi-webhook.handler.spec.ts — FOUND
- apps/service-notifications/src/webhooks/webhooks.module.ts — FOUND

Commits in git log:
- 87d259b (RED spec) — FOUND
- 45b900d (GREEN handler) — FOUND
- e56a43c (MemoryModule wiring) — FOUND
