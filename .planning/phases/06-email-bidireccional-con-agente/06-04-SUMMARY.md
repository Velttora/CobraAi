---
phase: 06-email-bidireccional-con-agente
plan: "04"
subsystem: service-notifications/contacts
tags: [kafka, consumer, email, whatsapp, bidireccional, agente, dispatch]
dependency_graph:
  requires:
    - "06-02-PLAN.md (SendgridInboundHandler publica cobrai.email.message_received con channel: email)"
    - "06-03-PLAN.md (ConversationAgentService.processInboundMessage acepta InboundMessagePayload con channel?)"
  provides:
    - "KafkaConsumerService suscrito a cobrai.email.message_received"
    - "Dispatch de cobrai.email.message_received → agent.processInboundMessage(payload)"
    - "Lazo email bidireccional completo: deudor responde → handler captura → consumer despacha → agente responde"
  affects:
    - "apps/service-notifications/src/contacts/kafka.consumer.ts"
    - "apps/service-notifications/src/contacts/kafka.consumer.spec.ts"
tech_stack:
  added: []
  patterns:
    - "case cobrai.email.message_received idéntico al case cobrai.whatsapp.message_received — el payload ya trae channel del publisher"
    - "Test de dispatch privado via cast (consumer as unknown as { dispatch(...) }).dispatch(...)"
    - "vi.clearAllMocks() en beforeEach + mockConfig.get retorna undefined para que onModuleInit no conecte Kafka"
key_files:
  created:
    - apps/service-notifications/src/contacts/kafka.consumer.spec.ts
  modified:
    - apps/service-notifications/src/contacts/kafka.consumer.ts
decisions:
  - "No inyectar channel manualmente en el case email: el SendgridInboundHandler ya lo pone en el payload — el consumer solo pasa el payload as-is"
  - "Case email idéntico al case whatsapp: misma llamada, misma conversión de tipos — consistencia sobre minimización de cambios"
metrics:
  duration_minutes: 2
  completed_date: "2026-06-09"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
  tests_added: 2
  tests_passing: 95
---

# Phase 06 Plan 04: KafkaConsumer Email Wiring Summary

**One-liner:** KafkaConsumerService suscrito a cobrai.email.message_received y despachando al agente con payload as-is (channel: "email" ya viene del SendgridInboundHandler), cerrando el lazo bidireccional de email.

## What Was Built

Wiring final del canal email bidireccional. Dos cambios mínimos en `kafka.consumer.ts` + spec nuevo:

1. **`CONSUMED_TOPICS`** — agregado `"cobrai.email.message_received"` como cuarto topic. El consumer se suscribe automáticamente en `onModuleInit` al iterar el array.

2. **`dispatch()` switch** — nuevo `case "cobrai.email.message_received":` que llama `await this.agent.processInboundMessage(payload as unknown as InboundMessagePayload); break;`. Idéntico al case de `cobrai.whatsapp.message_received`. El payload ya incluye `channel: "email"` publicado por `SendgridInboundHandler` (Plan 02) — no se inyecta nada extra.

3. **`kafka.consumer.spec.ts`** (nuevo, 72 líneas):
   - Test principal: `dispatch("cobrai.email.message_received", envelope)` → `mockAgent.processInboundMessage` llamado con `expect.objectContaining({ debtor_id: "debtor1", channel: "email" })`
   - Test anti-regresión: `dispatch("cobrai.whatsapp.message_received", envelope)` → agente llamado con `{ channel: "whatsapp" }`
   - `mockConfig.get` retorna `undefined` → `onModuleInit` retorna temprano sin conectar a Kafka real
   - Acceso a `dispatch` privado via `(consumer as unknown as { dispatch(...) }).dispatch(...)`

## Verification

- `pnpm --filter @cobrai/service-notifications typecheck` — PASS (0 errores)
- `pnpm --filter @cobrai/service-notifications test -- src/contacts/kafka.consumer.spec.ts` — 2/2 tests PASS
- `pnpm --filter @cobrai/service-notifications test` — 95/95 tests PASS (14 archivos)
- `grep -c "cobrai.email.message_received" apps/service-notifications/src/contacts/kafka.consumer.ts` → 2 (CONSUMED_TOPICS + case)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — wiring completo. El lazo email bidireccional depende de infraestructura DNS (MX reply.fogging.org → SendGrid) para e2e real; el código y tests están completos sin ella.

## Threat Flags

No new threat surface. T-06-09 y T-06-10 aceptados en el plan:
- T-06-09 (Tampering): payload confiado como bus interno; consistente con el case whatsapp
- T-06-10 (DoS): loop-prevention vive aguas arriba en SendgridInboundHandler (Plan 02)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — CONSUMED_TOPICS + dispatch case | 3cc5273 | feat(06-04): suscribir cobrai.email.message_received al agente en KafkaConsumerService |
| 2 — spec vitest | 732a4f5 | test(06-04): spec vitest de KafkaConsumerService — dispatch email + anti-regresión whatsapp |

## Self-Check: PASSED

- [x] `apps/service-notifications/src/contacts/kafka.consumer.ts` — FOUND (modificado)
- [x] `apps/service-notifications/src/contacts/kafka.consumer.spec.ts` — FOUND (creado)
- [x] Commit 3cc5273 — FOUND
- [x] Commit 732a4f5 — FOUND
- [x] `grep -c cobrai.email.message_received kafka.consumer.ts` → 2 ≥ 2
- [x] 95/95 tests pasan (sin regresión)
