---
phase: 05-memoria-unificada-del-deudor
plan: "01"
subsystem: memory
tags: [debtor-memory, llm, openai, prisma, nestjs, tdd]

dependency_graph:
  requires:
    - "apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts (DebtorHistory interface)"
    - "apps/service-notifications/src/prisma/prisma.module.ts (@Global PrismaService)"
    - "@cobrai/db (Prisma, PrismaService)"
    - "openai (already installed)"
  provides:
    - "DebtorMemoryService — getUnifiedContext + refreshMemory"
    - "EmotionalProfile interface"
    - "UnifiedDebtorContext interface"
    - "MemoryModule — exports DebtorMemoryService for AgentModule, ContactsModule, WebhooksModule"
    - "Extended DebtorHistory — livingSummary, overallSentiment, paymentBehavior (optional, backward-compatible)"
  affects:
    - "plans 05-02, 05-03, 05-04 — all depend on MemoryModule being available"

tech_stack:
  added: []
  patterns:
    - "Incremental LLM summarization: previous summary + new interaction -> updated EmotionalProfile"
    - "Safe Json? parse helper (parseProfile) tolerating any Prisma.JsonValue shape"
    - "Heuristic fallback matching LLM output shape (buildHeuristicProfile)"
    - "Cross-channel conversation+message gather via nested Prisma include (N+1 safe)"
    - "OpenAI optional-client pattern: apiKey ? new OpenAI : null"

key_files:
  created:
    - apps/service-notifications/src/memory/debtor-memory.service.ts
    - apps/service-notifications/src/memory/memory.module.ts
    - apps/service-notifications/src/memory/debtor-memory.service.spec.ts
    - apps/service-notifications/src/agent/prompts/cobrai-system.prompt.spec.ts
  modified:
    - apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts

decisions:
  - "Fields livingSummary/overallSentiment/paymentBehavior are optional (?) in DebtorHistory to keep all existing callers compiling without changes"
  - "parseProfile exported from service module to allow direct testing"
  - "buildInteractionText iterates from end of chronological array; `if (!m) continue` guard satisfies noUncheckedIndexedAccess tsconfig"
  - "Non-null assertion `mock.calls[0]![0]!` in spec (strict TS array access); safe because assertions follow `toHaveBeenCalledOnce()`"
  - "gatherContextData fetches debtor.emotionalProfile in a separate findFirst to keep getUnifiedContext read-only without gatherRawHistory's full conversation scan"

metrics:
  duration: "405 seconds (~7 minutes)"
  completed: "2026-06-09"
  tasks_completed: 2
  tests_added: 13
  files_created: 4
  files_modified: 1
---

# Phase 5 Plan 01: DebtorMemoryService Foundation Summary

**One-liner:** Cross-channel DebtorMemoryService with incremental LLM summarization into `Debtor.emotionalProfile` (Json), heuristic fallback when no API key, and extended `DebtorHistory` interface carrying `livingSummary/overallSentiment/paymentBehavior`.

## What Was Built

### Task 1 — Extend DebtorHistory + buildHistorySection
Extended `DebtorHistory` interface in `cobrai-system.prompt.ts` with three optional nullable fields (`livingSummary`, `overallSentiment`, `paymentBehavior`). Updated `buildHistorySection` to render `"Perfil del deudor (historial consolidado)"` and a sentiment line in the returning-debtor branch only. All 8 original fields left intact. Created co-located spec with 3 tests.

### Task 2 — DebtorMemoryService + MemoryModule + full spec
Created `src/memory/debtor-memory.service.ts` (523 lines) with:
- **`getUnifiedContext(tenantId, debtorId, debtId?)`**: reads contacts, promises, latest voice summary, and stored `emotionalProfile` → returns `UnifiedDebtorContext` with all 11 `DebtorHistory` fields + `EmotionalProfile | null`.
- **`refreshMemory(tenantId, debtorId, contactId?)`**: cross-channel gather via `conversation.findMany` with nested `include: { messages }` (N+1 safe, capped at 10 conversations × 10 messages) → `buildInteractionText` (voice prefers `summary`, WA inbound only) → single `chat.completions.create` with `response_format: json_object` → safe destructure + `sentimentScore` clamp [-1,1] → `prisma.debtor.update` with `as unknown as Prisma.InputJsonValue` cast → optional `prisma.contact.update` for `sentimentScore` (exact `where: { id }`, not `updateMany`).
- **`parseProfile(raw)`**: safe helper returns `null` for any non-object input (Landmine 3 mitigation).
- **`buildHeuristicProfile()`**: returns same `AnalysisResult` shape as LLM path (Landmine 6); behavior 'moroso' if broken>1, 'evasivo' if ==1, else 'desconocido'.
- LLM block wrapped in try/catch → fallback on any error; `refreshMemory` never throws.

`MemoryModule`: imports `[ConfigModule]`, does NOT import `PrismaModule` (confirmed `@Global()`).

Spec covers 10 test cases (Tests A-I + E without-contactId). Full suite: 73 tests passing, tsc clean.

## Verification Results

```
npx vitest run src/memory/ src/agent/prompts/cobrai-system.prompt.spec.ts
Test Files  2 passed (2)
Tests  13 passed (13)

npx vitest run (full suite)
Test Files  11 passed (11)
Tests  73 passed (73)

npx tsc --noEmit -p apps/service-notifications/tsconfig.json
(no output — clean)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript noUncheckedIndexedAccess on loop variable `m`**
- **Found during:** Task 2 GREEN phase typecheck
- **Issue:** `for (let i = ...) { const m = messages[i]; }` — TypeScript flagged `m` as possibly `undefined` under strict array indexing rules
- **Fix:** Added `if (!m) continue;` guard before accessing `m`'s properties
- **Files modified:** `apps/service-notifications/src/memory/debtor-memory.service.ts`
- **Commit:** 387c63e

**2. [Rule 1 - Bug] TypeScript strict array access on `mock.calls[0][0]` in spec**
- **Found during:** Task 2 GREEN phase typecheck
- **Issue:** Three occurrences of `mock.calls[0][0]` flagged as possibly `undefined`
- **Fix:** Changed to `mock.calls[0]![0]!` (non-null assertions safe because they follow `toHaveBeenCalledOnce()` assertions)
- **Files modified:** `apps/service-notifications/src/memory/debtor-memory.service.spec.ts`
- **Commit:** 387c63e

## Known Stubs

None — all methods return real data from Prisma queries or deterministic heuristic logic. No placeholder values flow to any consumer.

## Threat Flags

None — all surface introduced is covered by the plan's threat model (T-05-01 through T-05-03). No new network endpoints, no new auth paths.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (`test(...)`) | 03b433a | PASS |
| Task 1 GREEN (`feat(...)`) | 1782165 | PASS |
| Task 2 RED (`test(...)`) | eda9ec9 | PASS |
| Task 2 GREEN (`feat(...)`) | 387c63e | PASS |

## Self-Check: PASSED

All 6 files exist. All 4 task commits found in git log.
