---
phase: 05-memoria-unificada-del-deudor
plan: "03"
subsystem: contacts/voice
tags: [voice-agent, debtor-memory, nestjs, vapi, tdd, vitest]

dependency_graph:
  requires:
    - "apps/service-notifications/src/memory/debtor-memory.service.ts (DebtorMemoryService, getUnifiedContext, EmotionalProfile — from Plan 01)"
    - "apps/service-notifications/src/memory/memory.module.ts (MemoryModule — from Plan 01)"
  provides:
    - "ContactsService.loadVoiceCallHistory enriched with unified debtor profile (perfil_deudor, sentimiento_previo, comportamiento_pago)"
    - "ContactsModule importing MemoryModule — DebtorMemoryService now injectable into ContactsService"
    - "NEW contacts.service.spec.ts — 3 tests covering voice enrichment path"
  affects:
    - "Vapi strategy_context.variables — now includes cross-channel profile keys"
    - "plans 05-04 — completes the wave-2 integration (voice + WA both enriched)"

tech_stack:
  added: []
  patterns:
    - "10th constructor param injection pattern (ContactsService) — DebtorMemoryService appended after ConfigService"
    - "Optional chaining with string defaults for nullable EmotionalProfile fields"
    - "TDD RED/GREEN cycle using plain vi.fn() mocks, new Service(...args) direct instantiation"

key_files:
  created:
    - apps/service-notifications/src/contacts/contacts.service.spec.ts
  modified:
    - apps/service-notifications/src/contacts/contacts.service.ts
    - apps/service-notifications/src/contacts/contacts.module.ts

decisions:
  - "debtorMemory.getUnifiedContext called at debtor-level (no debtId) — voice history is per-debtor, not per-debt"
  - "spec exercises loadVoiceCallHistory via the public executeContact path (private method, tested indirectly through voice.initiateCall mock assertions)"
  - "MemoryModule added as final import in ContactsModule array to minimize diff footprint"

metrics:
  duration: "~5 minutes"
  completed: "2026-06-09"
  tasks_completed: 2
  tests_added: 3
  files_created: 1
  files_modified: 2
---

# Phase 5 Plan 03: Voice Agent Unified Memory Integration Summary

**One-liner:** ContactsService.loadVoiceCallHistory now calls DebtorMemoryService.getUnifiedContext, injecting perfil_deudor/sentimiento_previo/comportamiento_pago into Vapi strategy_context.variables alongside all 6 pre-existing keys.

## What Was Built

### Task 1 — DebtorMemoryService injection + loadVoiceCallHistory enrichment (TDD)

**RED (commit 687beb7):** Created `contacts.service.spec.ts` with 3 failing tests exercising the voice path through `executeContact`. Confirmed all 3 failed because `DebtorMemoryService` was not yet in the constructor and the enrichment keys were absent from `voice.initiateCall` arguments.

**GREEN (commit 57651c4):** Modified `contacts.service.ts`:
- Added import for `DebtorMemoryService` from `"../memory/debtor-memory.service"`.
- Added `private readonly debtorMemory: DebtorMemoryService` as the 10th constructor parameter (after `config`), preserving exact order of the previous 9 parameters.
- In `loadVoiceCallHistory`, added `const ctx = await this.debtorMemory.getUnifiedContext(tenantId, debtorId);` near the top (before the Prisma queries — debtor-level context, no `debtId`).
- Extended the returned `Record<string, string>` with three new keys:
  - `perfil_deudor: ctx.emotionalProfile?.summary ?? ""`
  - `sentimiento_previo: ctx.emotionalProfile?.sentiment ?? "neutral"`
  - `comportamiento_pago: ctx.emotionalProfile?.paymentBehavior ?? "desconocido"`
- All 6 original keys (`es_seguimiento`, `contactos_previos`, `dias_ultimo_contacto`, `tiene_promesa_pendiente`, `promesas_rotas`, `first_message_override`) retained without modification.

### Task 2 — ContactsModule wires MemoryModule (commit 155002c)

Modified `contacts.module.ts`:
- Added `import { MemoryModule } from "../memory/memory.module"`.
- Added `MemoryModule` to the `imports` array so NestJS DI can provide `DebtorMemoryService` into `ContactsService` at runtime.

## Verification Results

```
npx vitest run src/contacts/contacts.service.spec.ts
  Test Files  1 passed (1)
  Tests  3 passed (3)

npx vitest run (full suite)
  Test Files  12 passed (12)
  Tests  77 passed (77)

npx tsc --noEmit -p apps/service-notifications/tsconfig.json
(no output — clean)

grep -n "MemoryModule" apps/service-notifications/src/contacts/contacts.module.ts
7: import { MemoryModule } from "../memory/memory.module";
13: imports: [..., MemoryModule],
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `perfil_deudor`, `sentimiento_previo`, `comportamiento_pago` are sourced from live `DebtorMemoryService.getUnifiedContext` which reads `Debtor.emotionalProfile` from the database. When the profile is null (no interactions yet), the defaults ("", "neutral", "desconocido") are intentional and match the EmotionalProfile contract from Plan 01.

## Threat Flags

None — all surface is covered by the plan's threat model (T-05-06, T-05-07, T-05-SC). `getUnifiedContext` is tenant-scoped (Plan 01 T-05-02); the living summary originates from LLM output already sanitized in Plan 01. No new network endpoints, auth paths, or schema changes introduced.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (`test(...)`) | 687beb7 | PASS |
| Task 1 GREEN (`feat(...)`) | 57651c4 | PASS |
| Task 2 GREEN (`feat(...)`) | 155002c | PASS |

## Self-Check

Files exist:
- `apps/service-notifications/src/contacts/contacts.service.spec.ts` — FOUND
- `apps/service-notifications/src/contacts/contacts.service.ts` — FOUND (modified)
- `apps/service-notifications/src/contacts/contacts.module.ts` — FOUND (modified)

Commits:
- 687beb7 — test(05-03): RED spec
- 57651c4 — feat(05-03): contacts.service enrichment
- 155002c — feat(05-03): ContactsModule wiring

## Self-Check: PASSED
