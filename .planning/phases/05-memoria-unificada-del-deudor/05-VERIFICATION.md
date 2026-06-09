---
phase: 05-memoria-unificada-del-deudor
verified: 2026-06-09T00:50:00Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
---

# Phase 5: Memoria Unificada del Deudor — Verification Report

**Phase Goal:** Consolidar el histórico del deudor a través de TODOS los canales, con análisis (sentimiento + intención + comportamiento de pago) y resumen vivo persistido en `Debtor.emotionalProfile`, sirviéndolo a los agentes de WhatsApp y voz para comunicación coherente. `sentimentScore` debe persistirse en `contact`.

**Verified:** 2026-06-09T00:50:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `DebtorMemoryService.getUnifiedContext` returns `UnifiedDebtorContext` with `debtorHistory` + `emotionalProfile`, even when `emotionalProfile` is null | ✓ VERIFIED | `debtor-memory.service.ts:159-180`; Tests F + G pass |
| 2 | `DebtorMemoryService.refreshMemory` writes a living summary into `Debtor.emotionalProfile` (Json) | ✓ VERIFIED | `debtor-memory.service.ts:224-227`; `prisma.debtor.update` with `Prisma.InputJsonValue` cast; Test A pass |
| 3 | `refreshMemory` persists `contact.sentimentScore` on the closed contact when `contactId` is provided | ✓ VERIFIED | `debtor-memory.service.ts:230-234`; Test E pass |
| 4 | No-API-key path: `refreshMemory` degrades to heuristic, still writes `emotionalProfile` | ✓ VERIFIED | `debtor-memory.service.ts:475-477`; `buildHeuristicProfile` invoked; Test B pass (mockChatCreate NOT called, debtor.update IS called) |
| 5 | LLM-error path: `refreshMemory` catches the throw, falls back to heuristic, still updates DB | ✓ VERIFIED | `debtor-memory.service.ts:516-521`; try/catch around `chat.completions.create`; Test D pass (resolves, update called) |
| 6 | `DebtorHistory` interface extended with `livingSummary`, `overallSentiment`, `paymentBehavior`; `buildHistorySection` renders `livingSummary` only for returning debtors | ✓ VERIFIED | `cobrai-system.prompt.ts:23-26` (3 new optional fields); `:98-104` (guarded inside `else` branch for `previousContactsCount > 0`) |
| 7 | Cross-channel gather: `gatherRawHistory` reads conversations across ALL channels (no channel filter) | ✓ VERIFIED | `debtor-memory.service.ts:355-367`; `conversation.findMany` where clause = `{ tenantId, debtorId, deletedAt: null }` — no `channel` field |
| 8 | WhatsApp agent (`processInboundMessage`) builds its prompt from `DebtorMemoryService.getUnifiedContext` instead of the removed `loadDebtorHistory` | ✓ VERIFIED | `conversation-agent.service.ts:112-123`; `loadDebtorHistory` method is entirely absent (grep returns exit 1) |
| 9 | Voice path (`loadVoiceCallHistory`) enriches Vapi `strategy_context.variables` with `perfil_deudor`, `sentimiento_previo`, `comportamiento_pago` from `getUnifiedContext` | ✓ VERIFIED | `contacts.service.ts:384-429`; all 3 keys present; 6 existing keys retained; 3 contacts.service.spec.ts tests pass |
| 10 | `refreshMemory` is called after every voice call's transcript save, wrapped in try/catch so failure never returns non-200 | ✓ VERIFIED | `vapi-webhook.handler.ts:126-138`; try/catch block; Kafka publish still fires on error (vapi-webhook.handler.spec.ts test "un error en refreshMemory NO rompe el webhook" passes) |
| 11 | `saveTranscript` returns `debtorId` (not void); closed contact id resolved via `findFirst` after `updateMany` | ✓ VERIFIED | `vapi-webhook.handler.ts:444-497`: `Promise<string \| null>`, `return debt.debtorId`; `contact.findFirst` at lines 107-111 |
| 12 | `MemoryModule` imported into all three consumers: `AgentModule`, `ContactsModule`, `WebhooksModule` | ✓ VERIFIED | `agent.module.ts:9`; `contacts.module.ts:13`; `webhooks.module.ts:12` |
| 13 | No new Prisma migration — `Debtor.emotionalProfile` (existing `Json?`) reused | ✓ VERIFIED | No migration files in phase. `Prisma.InputJsonValue` cast used at `debtor-memory.service.ts:226` |
| 14 | `MemoryModule` does NOT import `PrismaModule` (global — would cause DI conflict) | ✓ VERIFIED | `memory.module.ts:1-10`; only `ConfigModule` in imports; `PrismaModule` absent |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/service-notifications/src/memory/debtor-memory.service.ts` | `DebtorMemoryService` + `EmotionalProfile` + `UnifiedDebtorContext` + `parseProfile` | ✓ VERIFIED | 524 lines (min 180 satisfied); all 4 exports present |
| `apps/service-notifications/src/memory/memory.module.ts` | `MemoryModule` exporting `DebtorMemoryService` | ✓ VERIFIED | 10 lines; correct imports/providers/exports |
| `apps/service-notifications/src/memory/debtor-memory.service.spec.ts` | vitest unit tests A-I | ✓ VERIFIED | 9 test cases covering all specified behaviors; all pass |
| `apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts` | Extended `DebtorHistory` + `livingSummary` rendering | ✓ VERIFIED | 3 new fields + conditional render in `buildHistorySection` |
| `apps/service-notifications/src/agent/conversation-agent.service.ts` | Uses `getUnifiedContext`; `loadDebtorHistory` removed | ✓ VERIFIED | `debtorMemory.getUnifiedContext` at line 112; `loadDebtorHistory` entirely absent |
| `apps/service-notifications/src/agent/agent.module.ts` | `AgentModule` imports `MemoryModule` | ✓ VERIFIED | Line 9 |
| `apps/service-notifications/src/contacts/contacts.service.ts` | `loadVoiceCallHistory` enriched via `getUnifiedContext` | ✓ VERIFIED | Lines 384, 427-429 |
| `apps/service-notifications/src/contacts/contacts.service.spec.ts` | NEW spec (none existed before) | ✓ VERIFIED | 3 tests; file created this phase |
| `apps/service-notifications/src/contacts/contacts.module.ts` | `ContactsModule` imports `MemoryModule` | ✓ VERIFIED | Line 13 |
| `apps/service-notifications/src/webhooks/vapi-webhook.handler.ts` | `refreshMemory` hook; `saveTranscript` returns `debtorId`; `findFirst` for closed contact | ✓ VERIFIED | Lines 107-138, 444-497 |
| `apps/service-notifications/src/webhooks/vapi-webhook.handler.spec.ts` | Updated spec with `mockDebtorMemory` + 2 new tests | ✓ VERIFIED | Lines 82-106, 423-459 |
| `apps/service-notifications/src/webhooks/webhooks.module.ts` | `WebhooksModule` imports `MemoryModule` | ✓ VERIFIED | Line 12 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `debtor-memory.service.ts` | `prisma.debtor.update` | `emotionalProfile` Json write | ✓ WIRED | Line 224; `Prisma.InputJsonValue` cast confirmed |
| `debtor-memory.service.ts` | `prisma.contact.update` | `sentimentScore` persistence | ✓ WIRED | Lines 231-234; guarded by `if (contactId)` |
| `debtor-memory.service.ts` | `openai.chat.completions.create` | single analysis+summary LLM call with `response_format: json_object` | ✓ WIRED | Lines 488-501; `response_format: { type: "json_object" }` |
| `conversation-agent.service.ts` | `DebtorMemoryService.getUnifiedContext` | constructor-injected call in `processInboundMessage` | ✓ WIRED | Line 112; 5th constructor param |
| `agent.module.ts` | `MemoryModule` | `imports` array | ✓ WIRED | Line 9 |
| `contacts.service.ts` | `DebtorMemoryService.getUnifiedContext` | constructor-injected call in `loadVoiceCallHistory` | ✓ WIRED | Line 384; 10th constructor param |
| `contacts.module.ts` | `MemoryModule` | `imports` array | ✓ WIRED | Line 13 |
| `vapi-webhook.handler.ts` | `DebtorMemoryService.refreshMemory` | try/catch call inside `handleEndOfCall` after `saveTranscript` | ✓ WIRED | Lines 127-137; 7th constructor param |
| `webhooks.module.ts` | `MemoryModule` | `imports` array | ✓ WIRED | Line 12 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `debtor-memory.service.ts` `getUnifiedContext` | `emotionalProfile` | `prisma.debtor.findFirst` → `parseProfile` | Yes — DB read, no static fallback | ✓ FLOWING |
| `debtor-memory.service.ts` `refreshMemory` | `updated: EmotionalProfile` | LLM (OpenAI) or heuristic; written to `prisma.debtor.update` | Yes — LLM analysis or contact-count heuristic | ✓ FLOWING |
| `contacts.service.ts` `loadVoiceCallHistory` | `ctx.emotionalProfile` | `debtorMemory.getUnifiedContext` → DB read | Yes — from stored `emotionalProfile` Json | ✓ FLOWING |
| `conversation-agent.service.ts` `processInboundMessage` | `unifiedContext.debtorHistory` | `debtorMemory.getUnifiedContext` → DB read | Yes — live DB query per inbound message | ✓ FLOWING |

---

### Build and Test Results

**TypeScript:** `npx tsc --noEmit -p apps/service-notifications/tsconfig.json`
Result: **CLEAN** (zero output, exit 0)

**Vitest:**
```
npx vitest run src/memory/ src/agent/prompts/cobrai-system.prompt.spec.ts src/contacts/contacts.service.spec.ts src/webhooks/vapi-webhook.handler.spec.ts

Test Files  4 passed (4)
      Tests  32 passed (32)
   Duration  713ms
```

Test breakdown:
- `src/memory/debtor-memory.service.spec.ts` — Tests A, B, C, D, E (×2), F, G, H, I — all pass
- `src/agent/prompts/cobrai-system.prompt.spec.ts` — livingSummary rendering tests — pass
- `src/contacts/contacts.service.spec.ts` — voice enrichment (3 tests: perfil_deudor injection, null-profile defaults, existing keys retained) — pass
- `src/webhooks/vapi-webhook.handler.spec.ts` — full handler suite incl. `refreshMemory` called + error isolation — all pass

---

### Anti-Patterns Found

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER` markers found in any Phase 5 modified files. No stub return patterns (`return null`, `return {}`, `return []`) in user-facing code paths.

---

### Requirements Coverage

No REQUIREMENTS.md IDs map to Phase 5 (per PLAN frontmatter). All must-haves derived directly from ROADMAP goal.

---

### Human Verification Required

None. All critical behaviors are verifiable programmatically and confirmed by the test suite.

---

### Gaps Summary

No gaps found. All 14 must-have truths are verified against actual source code, not SUMMARY claims.

Notable implementation detail: `gatherContextData` (used by `getUnifiedContext`) fetches voice conversations with a `channel: "voice"` filter exclusively to extract `callSummary` — this is intentional and correct (the field represents "last voice call summary"). The cross-channel message gather lives in `gatherRawHistory` (used by `refreshMemory`) which has no channel filter. The distinction is architecturally sound.

---

## VERIFICATION COMPLETE

**Verdict: PASSED**

All phase deliverables exist, are substantive, are wired into the three consumer modules (AgentModule, ContactsModule, WebhooksModule), data flows from DB through LLM analysis back to DB, 32 tests pass, and `tsc --noEmit` is clean.

---

_Verified: 2026-06-09T00:50:00Z_
_Verifier: Claude (gsd-verifier)_
