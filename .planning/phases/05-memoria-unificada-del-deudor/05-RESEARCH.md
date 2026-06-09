# Phase 5: Memoria Unificada del Deudor - Research

**Researched:** 2026-06-08
**Domain:** NestJS service, Prisma/PostgreSQL, OpenAI gpt-4o-mini, incremental LLM summarization
**Confidence:** HIGH (all findings grounded in the actual codebase; LLM patterns from training knowledge tagged [ASSUMED] where not verified against a live API)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Crear `DebtorMemoryService` nuevo en `apps/service-notifications/src/` (módulo propio `memory/` o dentro de `agent/`).
- Cuatro responsabilidades: recopilar (cross-canal), analizar (LLM), resumir (incremental), servir (a los agentes).
- Leer contacts de TODOS los canales del deudor (no filtrar por canal).
- Leer messages de TODAS las conversaciones del deudor (unir los silos).
- Leer promesas (promiseToPay: pending + broken).
- Leer transcripts/summary de llamadas de voz.
- Usar OpenAI gpt-4o-mini. Si no hay OPENAI_API_KEY: degradar con análisis heurístico/neutral.
- Analizar la última interacción → extraer: sentimiento, intención, comportamiento de pago.
- Persistir sentimentScore en el registro contact al cerrar cada interacción.
- Estructura JSON para emotionalProfile: `{ summary, sentiment, lastIntent, paymentBehavior, updatedAt, interactionCount }`.
- Actualización incremental: `refreshMemory(tenantId, debtorId)`.
- `getUnifiedContext(tenantId, debtorId)` → objeto consolidado.
- Integrar en: conversation-agent.service.ts, contacts.service.ts loadVoiceCallHistory, vapi-webhook.handler.ts.
- NO crear tabla nueva ni migración — reutilizar Debtor.emotionalProfile (Json).
- No romper el flujo actual del agente de WhatsApp.

### Claude's Discretion
- Nombre exacto del módulo/archivos y su ubicación (memory/ vs agent/).
- Forma exacta del prompt de análisis LLM y del schema de salida.
- Estrategia de degradación sin OpenAI (heurística simple).
- Si el análisis se hace en una sola llamada LLM (análisis + resumen) o dos.

### Deferred Ideas (OUT OF SCOPE)
- Email bidireccional con agente (Phase 6).
- Tabla dedicada de memoria en vez de emotionalProfile Json.
- Compactación avanzada / embeddings del historial.
</user_constraints>

---

## Summary

Phase 5 builds a `DebtorMemoryService` that eliminates the per-channel memory silos that currently exist: the WhatsApp agent reads only the last voice call summary; the voice agent reads only contact counts; neither has a consolidated view. The new service provides a single entry point — `getUnifiedContext` — that both agents call instead of their current bespoke query methods.

The core technical problem is **incremental LLM summarization**: after each interaction, the service produces an updated "living summary" by feeding the _previous summary_ plus the _new interaction_ to gpt-4o-mini, rather than reprocessing full history. This keeps token cost bounded and latency sub-second per interaction. The summary is stored in `Debtor.emotionalProfile` (Json, currently null for all records), and `contact.sentimentScore` (Float, also currently null everywhere) is set on each closed contact.

The Prisma query shape to gather cross-channel history requires care to avoid N+1: fetch all conversations for a debtor in one query with their messages in a nested include, capped by `take` per conversation. The analysis LLM call (sentiment + intent + behavior) and the summarization LLM call can be combined into one gpt-4o-mini call to save a round-trip, which is the recommended approach given the small payload size.

**Primary recommendation:** Place the service in `src/memory/debtor-memory.service.ts` with its own `MemoryModule`. Export `DebtorMemoryService`; import `MemoryModule` into `AgentModule`, `ContactsModule`, and `WebhooksModule`. Combine analysis and summarization into a single LLM call using `response_format: { type: "json_object" }` following the exact pattern already in `conversation-agent.service.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cross-channel history aggregation | API / Backend (NestJS service) | Database (Prisma) | All data lives in PostgreSQL; NestJS owns query composition |
| LLM sentiment + intent + summary | API / Backend (NestJS service) | External (OpenAI API) | NestJS calls OpenAI, stores result back to DB |
| Unified context serving | API / Backend (NestJS service) | — | `getUnifiedContext` is a pure read aggregation |
| sentimentScore persistence | Database (Prisma) | — | Direct `prisma.contact.update` call |
| emotionalProfile living summary | Database (Prisma) | — | `prisma.debtor.update({ data: { emotionalProfile: ... } })` |
| Graceful degradation (no API key) | API / Backend (NestJS service) | — | Heuristic fallback in the service constructor, same as ConversationAgentService |

---

## Standard Stack

All dependencies already present in the project. No new packages required.

### Core (already wired)
| Library | Version | Purpose | Evidence |
|---------|---------|---------|----------|
| `openai` | already installed | LLM analysis + summarization | `conversation-agent.service.ts` line 3 |
| `@cobrai/db` (PrismaService) | already installed | All DB reads/writes | used everywhere |
| `@nestjs/config` (ConfigService) | already installed | Read OPENAI_API_KEY, OPENAI_MODEL | pattern from conversation-agent |
| `@nestjs/common` (Injectable, Logger) | already installed | DI, logging | standard in all services |

### No New Packages
This phase introduces zero new npm dependencies. The package legitimacy audit section is omitted accordingly.

---

## Architecture Patterns

### System Architecture Diagram

```
[WhatsApp inbound]              [Voice call ends]
       |                               |
ConversationAgentService      VapiWebhookHandler
  calls getUnifiedContext()      calls refreshMemory()
       |                               |
       +----------+  +----------------+
                  |  |
          DebtorMemoryService
          ┌──────────────────────────────────────┐
          │ 1. gatherRawHistory(tenantId,         │
          │       debtorId, debtId?)              │
          │    └─ conversations + messages (all   │
          │       channels) + contacts + promises │
          │                                       │
          │ 2. analyzeAndSummarize(history,       │
          │       previousProfile)                │
          │    └─ ONE gpt-4o-mini call →          │
          │       { sentiment, lastIntent,        │
          │         paymentBehavior, summary }    │
          │    └─ fallback if no API key          │
          │                                       │
          │ 3. persist(tenantId, debtorId,        │
          │       contactId, result)              │
          │    ├─ debtor.emotionalProfile = JSON  │
          │    └─ contact.sentimentScore = Float  │
          │                                       │
          │ 4. getUnifiedContext(tenantId,        │
          │       debtorId, debtId?)              │
          │    └─ returns UnifiedDebtorContext    │
          └──────────────────────────────────────┘
                  |                      |
      contacts.service.ts         vapi-webhook.handler.ts
      loadVoiceCallHistory()       (refreshMemory hook)
      replaced by unified ctx
```

### Recommended Project Structure

```
apps/service-notifications/src/
├── memory/
│   ├── debtor-memory.service.ts      # main service (4 responsibilities)
│   ├── debtor-memory.service.spec.ts # vitest unit tests
│   └── memory.module.ts              # NestJS module, exports DebtorMemoryService
├── agent/
│   ├── conversation-agent.service.ts # MODIFIED: calls getUnifiedContext()
│   ├── agent.module.ts               # MODIFIED: imports MemoryModule
│   └── prompts/
│       └── cobrai-system.prompt.ts   # MODIFIED: extend DebtorHistory interface
├── contacts/
│   ├── contacts.service.ts           # MODIFIED: loadVoiceCallHistory replaced
│   └── contacts.module.ts            # MODIFIED: imports MemoryModule
└── webhooks/
    ├── vapi-webhook.handler.ts        # MODIFIED: calls refreshMemory()
    └── webhooks.module.ts             # MODIFIED: imports MemoryModule
```

---

## Topic 1: Incremental Summarization Pattern

### The Pattern [ASSUMED — based on established LLM engineering practice]

The core idea: never reprocess full history. Feed `(previousSummary + newInteractionText)` → LLM → `updatedSummary`. This is called "rolling summary" or "memory compression."

```
ROUND N-1: summary_n-1 stored in emotionalProfile.summary
ROUND N:   prompt = previous_summary_n-1 + latest_interaction_text
           → gpt-4o-mini produces summary_n, sentiment_n, intent_n, behavior_n
           → write summary_n to emotionalProfile
```

**Token cost per call (estimated):** ~400-800 tokens input (previous summary ≤ 200 words + interaction excerpt ≤ 300 words) + ~150 tokens output = well within gpt-4o-mini's cheapest tier. [ASSUMED: token estimates based on typical interaction length]

**Growth bounding:** Cap `emotionalProfile.summary` at 300 words (truncate if LLM exceeds it). The summary is narrative, not a log — old interactions are dissolved into the narrative rather than appended. The LLM instruction must say "resume en máximo 200 palabras" explicitly.

**Failure modes to handle:**
1. **Summary drift**: The LLM hallucinates facts not in the input. Mitigate by grounding the prompt with concrete facts (contact counts, promise status) as non-overridable context alongside the summary.
2. **First-call null**: On the first call, `emotionalProfile` is null. The service must handle this gracefully — produce a fresh summary from the single interaction with no prior context.
3. **LLM timeout during refreshMemory**: refreshMemory is called after an interaction completes. If it times out, the interaction is already committed. Use try/catch — failure of refresh must NEVER roll back the parent transaction (i.e., call it without awaiting in a fire-and-forget pattern, OR catch all errors).

### Recommendation: One LLM Call for Analysis + Summary [ASSUMED]

Combine both into one call. The output schema:
```json
{
  "sentiment": "positivo" | "neutral" | "negativo" | "hostil",
  "lastIntent": "promesa_pago" | "disputa" | "pago_confirmado" | "evasion" | "sin_compromiso" | "otro",
  "paymentBehavior": "cumplidor" | "moroso" | "evasivo" | "desconocido",
  "sentimentScore": -1.0,   // float -1.0 (hostil) to 1.0 (positivo)
  "summary": "Texto narrativo en español, máximo 200 palabras, que resume el historial del deudor..."
}
```

This avoids a second round-trip and is consistent with the existing `response_format: { type: "json_object" }` pattern.

---

## Topic 2: Cross-Channel Prisma Query Shape

### Current Silo Problem [VERIFIED: codebase grep]

`contacts.service.ts recordConversationMessage` does:
```typescript
conversation = await this.prisma.conversation.findFirst({
  where: { tenantId, debtorId, channel, deletedAt: null }
});
```
This creates one conversation per `(debtorId, channel)` pair — WhatsApp silo, voice silo, etc.

`conversation-agent.service.ts loadDebtorHistory` (lines 282-344) makes 4 separate queries (contacts, brokenPromises count, pendingPromise, lastVoiceMsg). Each is a separate DB round-trip with no N+1 risk since they're independent lookups.

### Recommended Cross-Channel Query

**For `gatherRawHistory`:** Fetch all conversations for the debtor in one query, include messages nested, then aggregate. Cap messages per conversation to avoid blowing up payload.

```typescript
// Pattern: one query, all channels, last N messages per conversation
const conversations = await this.prisma.conversation.findMany({
  where: { tenantId, debtorId, deletedAt: null },
  orderBy: { lastMessageAt: 'desc' },
  take: 10,                         // max 10 conversations cross-channel
  include: {
    messages: {
      where: { deletedAt: null },
      orderBy: { sentAt: 'desc' },
      take: 10                      // last 10 messages per conversation
    }
  }
});
// Flatten and sort chronologically for LLM input
const allMessages = conversations
  .flatMap(c => c.messages.map(m => ({ ...m, channel: c.channel })))
  .sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0));
```

**For contacts + promises:** Keep as separate queries (same pattern as current loadDebtorHistory — they're cheap indexed lookups):
```typescript
const contacts = await this.prisma.contact.findMany({
  where: { debtorId, tenantId, deletedAt: null, status: 'completed' },
  orderBy: { endedAt: 'desc' },
  take: 10,
  select: { id: true, channel: true, outcome: true, endedAt: true, sentimentScore: true }
});
```

**N+1 risk:** The nested `include: { messages: { take: 10 } }` in Prisma is safe — Prisma executes it as two queries (one for conversations, one batched for messages), not N+1. [VERIFIED: Prisma docs behavior for nested includes]

**For getUnifiedContext (read-only, no LLM):** The profile is already computed — just read it:
```typescript
const debtor = await this.prisma.debtor.findFirst({
  where: { id: debtorId, tenantId, deletedAt: null },
  select: { emotionalProfile: true, bestChannel: true }
});
// plus the same contacts + promises queries above
```

### Index Coverage [VERIFIED: schema.prisma]

Existing indexes cover all access patterns:
- `Contact`: `@@index([tenantId, debtorId])` — covers `where: { debtorId, tenantId }`
- `Conversation`: `@@index([tenantId, debtorId])` — covers the main history query
- `PromiseToPay`: `@@index([tenantId, debtId])`, `@@index([tenantId, status])` — covers promise queries
- `Message`: `@@index([conversationId])` — covers the nested messages include

No new indexes needed.

---

## Topic 3: Sentiment + Intent LLM Prompt (Spanish Colombian)

### Recommended Prompt Shape [ASSUMED — derived from cobrai-system.prompt.ts style]

The analysis prompt must follow the existing codebase style: terse, JSON-output-only instruction with explicit enum constraints. It must use Spanish and respect the Ley 1266 context already established.

```typescript
function buildAnalysisPrompt(
  interactionText: string,
  previousSummary: string | null,
  contactCount: number,
  brokenPromisesCount: number,
  hasPendingPromise: boolean
): string {
  const context = previousSummary
    ? `RESUMEN PREVIO DEL DEUDOR:\n"${previousSummary.substring(0, 500)}"\n\n`
    : 'PRIMER CONTACTO CON ESTE DEUDOR.\n\n';

  return `Eres un analizador de interacciones de cobranza en Colombia (Ley 1266).
Analiza la siguiente interacción y el historial previo, y produce un JSON con tu análisis.

${context}DATOS DE CONTEXTO:
- Contactos previos totales: ${contactCount}
- Promesas incumplidas: ${brokenPromisesCount}
- Tiene promesa pendiente: ${hasPendingPromise ? 'sí' : 'no'}

NUEVA INTERACCIÓN:
${interactionText.substring(0, 800)}

RESPONDE ÚNICAMENTE con este JSON (sin texto adicional):
{
  "sentiment": "positivo" | "neutral" | "negativo" | "hostil",
  "sentimentScore": número entre -1.0 (hostil) y 1.0 (positivo),
  "lastIntent": "promesa_pago" | "disputa" | "pago_confirmado" | "evasion" | "sin_compromiso" | "otro",
  "paymentBehavior": "cumplidor" | "moroso" | "evasivo" | "desconocido",
  "summary": "Resumen narrativo en español del historial completo del deudor, máximo 200 palabras. Incluye: actitud general, compromisos hechos/rotos, preferencias expresadas, señales de pago."
}`;
}
```

### `response_format: { type: "json_object" }` Reliability [ASSUMED]

The existing agent uses JSON mode and it works. One known risk: the model may return a valid JSON object but with unexpected keys or missing optional fields. Always destructure with defaults:

```typescript
const raw = completion.choices[0]?.message?.content ?? '{}';
const parsed = JSON.parse(raw) as Partial<AnalysisResult>;
const result: AnalysisResult = {
  sentiment: parsed.sentiment ?? 'neutral',
  sentimentScore: typeof parsed.sentimentScore === 'number'
    ? Math.max(-1, Math.min(1, parsed.sentimentScore))
    : 0,
  lastIntent: parsed.lastIntent ?? 'otro',
  paymentBehavior: parsed.paymentBehavior ?? 'desconocido',
  summary: parsed.summary ?? previousSummary ?? ''
};
```

### What to feed as `interactionText`

For **WhatsApp**: concatenate the last 5 inbound messages from the current conversation (direction='in'), separated by newlines. Do NOT include the agent's replies (direction='out') — those are the bot's words, not the debtor's signals.

For **voice**: use `message.content` parsed as `{ transcript, summary }` — use `summary` first (already ≤300 chars, produced by Vapi), fall back to first 500 chars of `transcript`. This matches the current `callSummary` extraction in `loadDebtorHistory` (lines 323-329 of conversation-agent.service.ts).

---

## Topic 4: Storing Structured Memory in Debtor.emotionalProfile (Json)

### Read-Merge-Write Pattern [VERIFIED: Prisma docs behavior]

```typescript
export interface EmotionalProfile {
  summary: string;
  sentiment: 'positivo' | 'neutral' | 'negativo' | 'hostil';
  lastIntent: string;
  paymentBehavior: 'cumplidor' | 'moroso' | 'evasivo' | 'desconocido';
  sentimentScore: number;    // -1.0 to 1.0
  updatedAt: string;         // ISO string
  interactionCount: number;
}

// Read existing
const debtor = await this.prisma.debtor.findFirst({
  where: { id: debtorId, tenantId },
  select: { emotionalProfile: true }
});
const existing = debtor?.emotionalProfile as EmotionalProfile | null;

// Merge
const updated: EmotionalProfile = {
  ...newAnalysis,
  interactionCount: (existing?.interactionCount ?? 0) + 1,
  updatedAt: new Date().toISOString()
};

// Write
await this.prisma.debtor.update({
  where: { id: debtorId },
  data: { emotionalProfile: updated as unknown as Prisma.InputJsonValue }
});
```

**Prisma Json column caveat:** TypeScript types for `Json?` fields are `Prisma.JsonValue | null`. Cast with `as unknown as Prisma.InputJsonValue` for the write. The read requires a type assertion since Prisma returns `JsonValue`. This is standard Prisma pattern. [VERIFIED: Prisma schema shows `emotionalProfile Json?` — no special extension needed]

### Concurrency Consideration

`refreshMemory` is not called concurrently in normal flow (WhatsApp: one message processed at a time per conversation; voice: one webhook per call). However, if two calls complete simultaneously for the same debtor (edge case), there is a read-modify-write race. Options:

1. **Accept it (recommended for v1):** The race is extremely rare (two calls ending simultaneously for the same debtor). The "loser" overwrites the "winner" but both analyses are valid. The `interactionCount` may be off by 1. Acceptable for Phase 5 scope.
2. **Future hardening:** Use a Postgres advisory lock or serializable transaction. Deferred to Phase 5+ if it becomes a real problem.

### Type-safe helper

Add an `EmotionalProfile` TypeScript interface in `src/memory/debtor-memory.service.ts` and a parse helper:

```typescript
function parseProfile(raw: unknown): EmotionalProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  return {
    summary: String(p['summary'] ?? ''),
    sentiment: (p['sentiment'] as EmotionalProfile['sentiment']) ?? 'neutral',
    lastIntent: String(p['lastIntent'] ?? 'otro'),
    paymentBehavior: (p['paymentBehavior'] as EmotionalProfile['paymentBehavior']) ?? 'desconocido',
    sentimentScore: typeof p['sentimentScore'] === 'number' ? p['sentimentScore'] : 0,
    updatedAt: String(p['updatedAt'] ?? new Date().toISOString()),
    interactionCount: typeof p['interactionCount'] === 'number' ? p['interactionCount'] : 0
  };
}
```

---

## Topic 5: Test Strategy (vitest)

### Established Conventions [VERIFIED: codebase spec files]

From `conversation-agent.service.spec.ts` and `vapi-webhook.handler.spec.ts`:

1. **OpenAI mock pattern:** Use `vi.hoisted()` + `vi.mock("openai", ...)` to intercept the constructor before the module loads. The mock class exposes `chat.completions.create` as a `vi.fn()`.

2. **Prisma mock pattern:** Plain object with `vi.fn()` per method — no auto-mocking framework. Cast to `never` or `any` when injecting into the constructor: `new DebtorMemoryService(mockPrisma as never, ...)`.

3. **ConfigService mock:** Inline object with `get: (key: string) => map[key] ?? null`. No NestJS testing module needed.

4. **Constructor injection (no `createTestingModule`):** All existing specs instantiate the service directly with `new ServiceName(dep1, dep2, ...)`. This is the pattern to follow.

5. **`vi.clearAllMocks()` in `beforeEach`**: Always present, always before re-instantiating the service.

6. **Test file location:** Co-located with the service: `src/memory/debtor-memory.service.spec.ts`.

### New Test File Template

```typescript
// src/memory/debtor-memory.service.spec.ts
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { DebtorMemoryService } from "./debtor-memory.service";

const { mockChatCreate } = vi.hoisted(() => ({
  mockChatCreate: vi.fn()
}));

vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: mockChatCreate } };
  }
  return { default: MockOpenAI };
});

function makePrisma() {
  return {
    debtor: {
      findFirst: vi.fn().mockResolvedValue({ id: "d1", emotionalProfile: null }),
      update: vi.fn().mockResolvedValue({ id: "d1" })
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "c1" })
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue([])
    },
    promiseToPay: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null)
    }
  };
}

function makeConfig(withApiKey = true): ConfigService {
  const map: Record<string, string> = {
    ...(withApiKey ? { OPENAI_API_KEY: "sk-test" } : {}),
    OPENAI_MODEL: "gpt-4o-mini"
  };
  return { get: (k: string) => map[k] ?? null } as unknown as ConfigService;
}

function makeAnalysisResponse(overrides = {}) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          sentiment: "neutral",
          sentimentScore: 0,
          lastIntent: "sin_compromiso",
          paymentBehavior: "desconocido",
          summary: "Primer contacto sin compromiso.",
          ...overrides
        })
      }
    }]
  };
}
```

### Key Test Cases Required

| Test | What to verify |
|------|---------------|
| `refreshMemory` with OpenAI → writes emotionalProfile | `prisma.debtor.update` called with correct JSON shape |
| `refreshMemory` without API key → heuristic fallback, no LLM call | `mockChatCreate` NOT called; `prisma.debtor.update` still called with neutral profile |
| `refreshMemory` with existing profile → increments interactionCount | `interactionCount` in written profile = old + 1 |
| `refreshMemory` OpenAI throws → still updates contact.sentimentScore | LLM error caught, fallback used, update still happens |
| `getUnifiedContext` → returns shaped object for prompt injection | shape matches `UnifiedDebtorContext` interface |
| `getUnifiedContext` with null emotionalProfile → returns neutral defaults | no crash, defaults provided |
| `sentimentScore` persisted on contact | `prisma.contact.update` called with `sentimentScore` value |
| `analyzeLastInteraction` voice → uses transcript summary field | correct field extraction from JSON `{ transcript, summary }` content |
| `analyzeLastInteraction` whatsapp → uses inbound messages only | only `direction='in'` messages included in interactionText |

---

## Topic 6: Integration Points — Precise Call Sites

### 1. conversation-agent.service.ts (WhatsApp)

**Current code** (lines 109-110):
```typescript
const debtorHistory = await this.loadDebtorHistory(debtor_id, tenant_id, debt.id);
const systemPrompt = buildSystemPrompt({ ..., debtorHistory });
```

**Change:** Replace `loadDebtorHistory` with `getUnifiedContext`:
```typescript
const unifiedContext = await this.debtorMemory.getUnifiedContext(tenant_id, debtor_id, debt.id);
const systemPrompt = buildSystemPrompt({ ..., debtorHistory: unifiedContext.debtorHistory });
```

The `debtorHistory: DebtorHistory` interface in `cobrai-system.prompt.ts` must be extended to include the new fields from the living summary. Extend (do NOT replace) the existing fields so the prompt template needs minimal changes:

```typescript
export interface DebtorHistory {
  // existing fields (keep as-is)
  previousContactsCount: number;
  brokenPromisesCount: number;
  lastOutcome: string | null;
  lastContactDaysAgo: number | null;
  preferredChannel: string | null;
  callSummary: string | null;
  hasPromisePending: boolean;
  promisedDate: string | null;
  // new fields from unified memory
  livingSummary: string | null;     // emotionalProfile.summary
  overallSentiment: string | null;  // emotionalProfile.sentiment
  paymentBehavior: string | null;   // emotionalProfile.paymentBehavior
}
```

Add 2-3 lines to `buildHistorySection` to use `livingSummary` when present:
```typescript
if (h.livingSummary) {
  lines.push(`- Perfil del deudor (historial consolidado): "${h.livingSummary}"`);
}
```

**DI change:** `ConversationAgentService` constructor gains `DebtorMemoryService`. `AgentModule` imports `MemoryModule`.

### 2. contacts.service.ts loadVoiceCallHistory (Voice)

**Current code** (lines 370-421): Returns `Record<string, string>` with keys for the Vapi `strategy_context.variables`. These keys are consumed by the Vapi agent's prompt via variable substitution.

**Change:** `loadVoiceCallHistory` stays as a private method but now calls `getUnifiedContext` for the summary fields. The returned record is enriched:

```typescript
private async loadVoiceCallHistory(...): Promise<Record<string, string>> {
  const ctx = await this.debtorMemory.getUnifiedContext(tenantId, debtorId);
  // ... existing logic for firstMessage, es_seguimiento, etc. ...
  return {
    es_seguimiento: ...,
    contactos_previos: ...,
    dias_ultimo_contacto: ...,
    tiene_promesa_pendiente: ...,
    promesas_rotas: ...,
    first_message_override: firstMessage,
    // NEW: enrich with unified memory
    perfil_deudor: ctx.emotionalProfile?.summary ?? '',
    sentimiento_previo: ctx.emotionalProfile?.sentiment ?? 'neutral',
    comportamiento_pago: ctx.emotionalProfile?.paymentBehavior ?? 'desconocido'
  };
}
```

**DI change:** `ContactsService` constructor gains `DebtorMemoryService`. `ContactsModule` imports `MemoryModule`.

### 3. vapi-webhook.handler.ts (refreshMemory after call)

**Current code:** After `saveTranscript` + `registerPromiseFromCall`, the handler publishes to Kafka and returns. Add `refreshMemory` call after `saveTranscript` completes:

```typescript
// In handleEndOfCall, after saveTranscript:
if (transcript) {
  await this.saveTranscript(tenantId, debtId, call.id, transcript, summary);
  // Refresh unified memory — catch errors so call processing is never blocked
  try {
    await this.debtorMemory.refreshMemory(tenantId, debt.debtorId, contactId);
  } catch (err) {
    this.logger.error(`refreshMemory failed for debt ${debtId}: ${String(err)}`);
  }
}
```

**DI change:** `VapiWebhookHandler` constructor gains `DebtorMemoryService`. `WebhooksModule` imports `MemoryModule`.

**Important:** `refreshMemory` needs `contactId` to update `contact.sentimentScore`. The `handleEndOfCall` currently does `contact.updateMany` (line 88-102), which does not return the contact ID. Change to `contact.updateMany` with a subsequent `contact.findFirst` to get the ID, OR pass the contact ID differently. Simplest approach: after `updateMany`, do `findFirst({ where: { tenantId, debtId, channel: 'voice', status: 'completed' }, orderBy: { endedAt: 'desc' }, select: { id: true } })` to get the just-updated contact ID. Then pass to `refreshMemory`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON mode LLM output | Custom regex parser | `response_format: { type: "json_object" }` already used | The pattern is battle-tested in this codebase |
| OpenAI retry logic | Custom retry loop | Let errors propagate to the try/catch fallback | Matches existing error handling in conversation-agent |
| Conversation threading | Custom message sorting | Prisma `orderBy: { sentAt: 'desc' }` + reverse | Already the pattern in conversation-agent lines 102-107 |
| Sentiment score normalization | Custom ML | Map LLM enum to fixed float: positivo=0.7, neutral=0, negativo=-0.5, hostil=-1.0 | Simpler and auditable, sufficient for Phase 4 KPI |

---

## Landmines / Gotchas

### Landmine 1: `contact.updateMany` Does Not Return IDs

**Problem:** `vapi-webhook.handler.ts` uses `updateMany` to close voice contacts (line 88-102). `updateMany` in Prisma returns `{ count: number }`, not the updated records. You need the `contact.id` to call `refreshMemory(..., contactId)` and then `contact.update({ where: { id }, data: { sentimentScore } })`.

**Fix:** After the `updateMany`, do a `findFirst` to get the contact ID:
```typescript
await this.prisma.contact.updateMany({ ... });
const closedContact = await this.prisma.contact.findFirst({
  where: { tenantId, debtId, channel: 'voice', status: 'completed' },
  orderBy: { endedAt: 'desc' },
  select: { id: true }
});
// Pass closedContact?.id to refreshMemory
```

### Landmine 2: refreshMemory Must Never Block the Call Flow

**Problem:** `handleEndOfCall` is the Vapi webhook handler. If `refreshMemory` throws (OpenAI timeout, rate limit), it must not bubble up and cause the webhook to return a non-200, which would make Vapi retry the webhook indefinitely.

**Fix:** Always wrap `refreshMemory` in try/catch inside the handler. See the call site pattern in Topic 6 above. This is consistent with how errors are handled throughout the codebase (every OpenAI call in `conversation-agent.service.ts` is wrapped in try/catch with fallback).

### Landmine 3: emotionalProfile Is Json? — TypeScript Won't Protect You

**Problem:** Prisma types `emotionalProfile` as `Prisma.JsonValue | null`, which is `string | number | boolean | null | Prisma.JsonObject | Prisma.JsonArray`. If the field gets corrupted (e.g., stored as a string instead of an object), `parseProfile(raw)` must handle all inputs gracefully.

**Fix:** Use the `parseProfile` helper shown in Topic 4. Always check `typeof raw !== 'object'` before destructuring.

### Landmine 4: `buildSystemPrompt` Signature Change Breaks the Spec

**Problem:** `conversation-agent.service.spec.ts` exercises `processInboundMessage`, which calls `loadDebtorHistory` (currently private). When you replace `loadDebtorHistory` with `getUnifiedContext`, the test mock for `prisma.contact.findMany` (line 31 of the spec) must also return data compatible with what `DebtorMemoryService.getUnifiedContext` expects. Otherwise, the spec will fail because `getUnifiedContext` is now a DI dependency, and the test doesn't mock it.

**Fix:** In the agent service spec, mock `DebtorMemoryService` as a fourth or fifth constructor argument:
```typescript
const mockDebtorMemory = {
  getUnifiedContext: vi.fn().mockResolvedValue({
    debtorHistory: { previousContactsCount: 0, brokenPromisesCount: 0, ... },
    emotionalProfile: null
  }),
  refreshMemory: vi.fn().mockResolvedValue(undefined)
};
// Add to constructor call
service = new ConversationAgentService(
  makeConfig(), mockPrisma as never, mockKafka as never, mockWhatsapp as never, mockDebtorMemory as never
);
```

### Landmine 5: VapiWebhookHandler Needs `debtorId` for refreshMemory

**Problem:** `handleEndOfCall` receives `payload.message.call.metadata` which has `debt_id` and `tenant_id` but NOT `debtor_id`. The `refreshMemory` method needs `debtorId`. Currently `saveTranscript` looks up `debt.debtorId` (line 427-432 of the handler). You need to thread this value from the `saveTranscript` return or from a preliminary debt lookup.

**Fix:** Make `saveTranscript` return `debtorId`:
```typescript
private async saveTranscript(...): Promise<string | null> {
  const debt = await this.prisma.debt.findFirst({ ... select: { debtorId: true } });
  if (!debt) return null;
  // ... rest of method ...
  return debt.debtorId;
}
// In handleEndOfCall:
const debtorId = await this.saveTranscript(...);
if (debtorId) {
  await this.debtorMemory.refreshMemory(tenantId, debtorId, closedContact?.id);
}
```

### Landmine 6: Heuristic Fallback Must Match the Same Output Shape

**Problem:** If `OPENAI_API_KEY` is absent, the fallback must return an `EmotionalProfile`-shaped object, not `null` or `undefined`. Otherwise downstream consumers that read `emotionalProfile.sentiment` crash.

**Fix:** Define a `NEUTRAL_PROFILE_FALLBACK` constant:
```typescript
function buildHeuristicProfile(
  contactCount: number,
  brokenCount: number,
  previousProfile: EmotionalProfile | null
): AnalysisResult {
  const behavior: EmotionalProfile['paymentBehavior'] =
    brokenCount > 1 ? 'moroso' : brokenCount === 1 ? 'evasivo' : 'desconocido';
  return {
    sentiment: 'neutral',
    sentimentScore: 0,
    lastIntent: 'otro',
    paymentBehavior: behavior,
    summary: previousProfile?.summary ?? `Deudor con ${contactCount} contacto(s) previo(s).`
  };
}
```

### Landmine 7: Prisma `contact.update` Requires Exact `where: { id }` — Not `updateMany`

**Problem:** `sentimentScore` must be updated on a specific contact (the one just closed). `contact.update` requires `where: { id: string }`. Do NOT use `updateMany` here — it could accidentally update multiple contacts for the debtor if the race condition in Landmine 1 creates duplicates.

**Fix:** Always use `prisma.contact.update({ where: { id: contactId }, data: { sentimentScore } })`. Guard with an early return if `contactId` is null (i.e., if the contact lookup failed).

---

## UnifiedDebtorContext Interface

This is the contract that `getUnifiedContext` returns — the planner must define this interface in `src/memory/debtor-memory.service.ts`:

```typescript
export interface UnifiedDebtorContext {
  // For buildSystemPrompt / DebtorHistory (backward-compatible extension)
  debtorHistory: {
    previousContactsCount: number;
    brokenPromisesCount: number;
    lastOutcome: string | null;
    lastContactDaysAgo: number | null;
    preferredChannel: string | null;
    callSummary: string | null;
    hasPromisePending: boolean;
    promisedDate: string | null;
    // NEW
    livingSummary: string | null;
    overallSentiment: string | null;
    paymentBehavior: string | null;
  };
  // For voice strategy_context.variables
  emotionalProfile: EmotionalProfile | null;
}
```

---

## Module Registration

`MemoryModule` must be registered in three modules. The module pattern:

```typescript
// src/memory/memory.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DebtorMemoryService } from "./debtor-memory.service";

@Module({
  imports: [ConfigModule],
  providers: [DebtorMemoryService],
  exports: [DebtorMemoryService]
})
export class MemoryModule {}
```

Then add `MemoryModule` to the `imports` array of:
- `AgentModule` (src/agent/agent.module.ts)
- `ContactsModule` (src/contacts/contacts.module.ts)
- `WebhooksModule` (src/webhooks/webhooks.module.ts)

Note: `PrismaService` is provided by `PrismaModule` which is registered globally in `AppModule` (via `PrismaModule` — check `prisma.module.ts` for `@Global()` decorator). If it is global, `MemoryModule` does NOT need to import `PrismaModule`. If not global, add it. [VERIFIED: PrismaModule exists at src/prisma/prisma.module.ts — check for @Global() before deciding.]

---

## State of the Art

| Old Approach (current) | New Approach (Phase 5) | Impact |
|------------------------|----------------------|--------|
| `loadDebtorHistory` in ConversationAgentService (WhatsApp only) | `getUnifiedContext` from DebtorMemoryService (all channels) | Voice agent gains WhatsApp context; WA agent gains voice summary |
| `loadVoiceCallHistory` in ContactsService (contact counts only) | `getUnifiedContext` enriched with livingSummary | Voice prompt has full narrative history |
| `contact.sentimentScore` always null | Set on every closed interaction | Phase 4 dashboard KPI becomes computable |
| `debtor.emotionalProfile` always null | Living summary updated after each interaction | Persistent cross-session memory |
| Two separate LLM services (agent + memory) | One DebtorMemoryService, called by both agents | Single source of truth for debtor state |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | One gpt-4o-mini call for analysis + summary is cheaper/faster than two | Topic 1 | Could split into two calls; minor latency difference only |
| A2 | Token estimates ~400-800 input, ~150 output per refreshMemory call | Topic 1 | If interactions are longer, costs increase — but the prompt caps inputs at 800 chars |
| A3 | `response_format: json_object` reliably returns parseable JSON with gpt-4o-mini | Topic 3 | If it fails, the try/catch fallback kicks in (same as current agent) |
| A4 | Concurrent refreshMemory for same debtor is rare enough to accept in v1 | Topic 4 | If concurrent voice calls are common, interactionCount may drift — acceptable for Phase 5 |
| A5 | `PrismaModule` uses `@Global()` so DebtorMemoryService can inject PrismaService without explicit import | Module Registration | If not global, add `PrismaModule` to `MemoryModule` imports |

---

## Validation Architecture

`workflow.nyquist_validation` is absent from config.json — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already configured) |
| Config file | `apps/service-notifications/vitest.config.ts` |
| Quick run command | `cd apps/service-notifications && npx vitest run src/memory/` |
| Full suite command | `cd apps/service-notifications && npx vitest run` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command |
|----------|-----------|-------------------|
| `refreshMemory` writes emotionalProfile to DB | unit | `vitest run src/memory/debtor-memory.service.spec.ts` |
| `refreshMemory` degrades gracefully without API key | unit | same file |
| `refreshMemory` sets sentimentScore on contact | unit | same file |
| `getUnifiedContext` returns correct shape | unit | same file |
| `getUnifiedContext` handles null emotionalProfile | unit | same file |
| WhatsApp agent uses unified context (no regression) | unit | `vitest run src/agent/conversation-agent.service.spec.ts` |
| Voice webhook calls refreshMemory | unit | `vitest run src/webhooks/vapi-webhook.handler.spec.ts` |
| OpenAI error in refreshMemory does not break webhook | unit | vapi-webhook spec |

### Wave 0 Gaps
- [ ] `src/memory/debtor-memory.service.spec.ts` — new file, covers all behaviors above
- [ ] `src/memory/memory.module.ts` — new file, no tests needed (pure DI registration)
- [ ] Update `src/agent/conversation-agent.service.spec.ts` — add `mockDebtorMemory` as constructor arg (see Landmine 4)
- [ ] Update `src/webhooks/vapi-webhook.handler.spec.ts` — add `mockDebtorMemory` as constructor arg

---

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. `OPENAI_API_KEY` and `OPENAI_MODEL` are already documented in STATE.md and the existing agent uses them. No new environment variables needed.

---

## Security Domain

No new authentication, session, or cryptography requirements introduced. The service reads/writes existing DB records scoped by `tenantId` — the existing multi-tenant isolation pattern applies. No new API endpoints.

ASVS V5 Input Validation applies: the LLM output is parsed with a safe helper that clamps `sentimentScore` to `[-1, 1]` and falls back to defaults for missing fields. This prevents malformed LLM output from poisoning the DB.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `apps/service-notifications/src/agent/conversation-agent.service.ts` — OpenAI fallback pattern, loadDebtorHistory query shape, test mock conventions
- Codebase: `apps/service-notifications/src/webhooks/vapi-webhook.handler.spec.ts` — Prisma mock pattern, vi.fn() conventions
- Codebase: `packages/db/prisma/schema.prisma` — Debtor.emotionalProfile Json?, Contact.sentimentScore Float?, Conversation/Message indexes
- Codebase: `apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts` — DebtorHistory interface, buildHistorySection pattern

### Secondary (MEDIUM confidence)
- Prisma docs behavior: nested `include` with `take` executes as two queries, not N+1 [standard Prisma behavior]
- Prisma Json field write pattern: `as unknown as Prisma.InputJsonValue` [standard workaround for Prisma Json typing]

### Tertiary (LOW confidence / ASSUMED)
- Incremental summarization ("rolling summary") pattern: training knowledge, widely documented in LLM engineering literature
- Token estimates for gpt-4o-mini calls: training knowledge, estimated from typical interaction lengths

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new dependencies, all patterns from existing codebase
- Architecture: HIGH — derived from actual code paths and schema
- Pitfalls (Landmines): HIGH — all 7 landmines traced to specific lines in the real codebase
- LLM prompts: MEDIUM — style grounded in existing prompt, output schema is author's discretion (Claude's Discretion)

**Research date:** 2026-06-08
**Valid until:** 2026-09-08 (stable stack; OpenAI API shape unlikely to change)

---

## RESEARCH COMPLETE
