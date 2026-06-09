---
phase: 06-email-bidireccional-con-agente
plan: "03"
subsystem: api
tags: [nestjs, openai, email, whatsapp, sendgrid, multi-channel, kafka, prisma]

# Dependency graph
requires:
  - phase: 06-01
    provides: EmailAdapter.sendTemplate acepta reply_to y lo pasa a SendGrid v3
  - phase: 05-02
    provides: ConversationAgentService usa getUnifiedContext de DebtorMemoryService
provides:
  - ConversationAgentService multi-canal con discriminacion por channel (email | whatsapp)
  - InboundMessagePayload con channel opcional y documentacion de reutilizacion del campo phone
  - EMAIL_REPLY_TO fijo a reply@reply.fogging.org para respuestas del agente por email
  - applyIntent propaga channel a Kafka y a opt_out de ContactConsent (Ley 1266 compliance)
  - Spec actualizado con mockEmail como 6 arg y 3 tests de discriminacion de canal
affects: [06-04, kafka-consumer, conversacion-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canal discriminado en runtime con payload.channel ?? 'whatsapp' — backward compatible"
    - "ContactChannel enum importado de @cobrai/db para tipado fuerte en applyIntent"
    - "Constante EMAIL_REPLY_TO como modulo-level const (no configurable para v1)"

key-files:
  created: []
  modified:
    - apps/service-notifications/src/agent/conversation-agent.service.ts
    - apps/service-notifications/src/agent/conversation-agent.service.spec.ts

key-decisions:
  - "ContactChannel importado de @cobrai/db para tipar ctx.channel en applyIntent (evita string vs enum type error)"
  - "channel propagado a applyIntent como ContactChannel (no string) para satisfacer Prisma where clause"
  - "EMAIL_REPLY_TO hardcodeado como constante de modulo para v1 (no env var — dominio estable)"
  - "Campo phone reutilizado para email address (backward compatible, documentado en interface)"

patterns-established:
  - "Discriminacion de canal con (payload.channel ?? 'whatsapp') === 'email' antes de llamar adapter"
  - "ctx.channel pasado por toda la cadena intent para evitar hardcodeo de canal en efectos secundarios"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-06-09
---

# Phase 06 Plan 03: ConversationAgentService Multi-Canal Summary

**ConversationAgentService generalizado a multi-canal: email usa EmailAdapter con reply_to fijo, whatsapp default preservado; opt_out revoca consent del canal correcto (Ley 1266)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-09T16:20:16Z
- **Completed:** 2026-06-09T16:24:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- InboundMessagePayload gana `channel?: "whatsapp" | "email"` con documentacion del reuso del campo phone para email address
- EmailAdapter inyectado como 6 parametro del constructor; EMAIL_REPLY_TO = "reply@reply.fogging.org" como constante de modulo
- processInboundMessage discrimina adapter de salida por canal: email llama email.sendTemplate con reply_to, whatsapp default llama whatsapp.sendTemplate
- Mensaje outbound persistido con `channel: payload.channel ?? "whatsapp"` (no hardcodeado)
- applyIntent recibe channel como ContactChannel; opt_out revoca ContactConsent del canal correcto; publishes de Kafka llevan canal dinamico
- Spec actualizado: mockEmail como 6 arg en beforeEach; 3 tests nuevos (email discrimina, whatsapp default discrimina, opt_out por email revoca consent email); 13 tests pasan

## Task Commits

Cada tarea fue commiteada atomicamente:

1. **Task 1: Generalizar processInboundMessage a multi-canal + inyectar EmailAdapter** - `52bf715` (feat)
2. **Task 2: Tests multi-canal en conversation-agent.service.spec.ts** - `57d7008` (test)

## Files Created/Modified
- `apps/service-notifications/src/agent/conversation-agent.service.ts` - InboundMessagePayload con channel; EmailAdapter inyectado; discriminacion de adapter; outbound con channel dinamico; applyIntent con ContactChannel
- `apps/service-notifications/src/agent/conversation-agent.service.spec.ts` - mockEmail declarado; 6 arg en beforeEach; 3 tests de discriminacion multi-canal

## Decisions Made
- **ContactChannel enum para applyIntent ctx.channel:** `ctx.channel` tipado como `ContactChannel` (de `@cobrai/db`) en lugar de `string` para satisfacer el tipo de `contactConsent.updateMany where.channel`. Requirio importar `ContactChannel` y hacer cast en el callsite con `as ContactChannel`.
- **EMAIL_REPLY_TO como constante de modulo:** La direccion `reply@reply.fogging.org` es estable en v1 — no requiere env var. Si el dominio cambia, se mueve a configuracion en una tarea de seguimiento.
- **Reutilizar campo `phone` para email address:** Backward compatible con todos los consumers existentes. Documentado con comentario JSDoc en la interface. No renombrado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ContactChannel type mismatch en applyIntent**
- **Found during:** Task 1 (verificacion typecheck)
- **Issue:** `ctx.channel` definido como `string` pero `contactConsent.updateMany where.channel` espera `ContactChannel` enum de Prisma — error TS2322
- **Fix:** Importado `ContactChannel` de `@cobrai/db` (consolidado en un solo import con `PrismaService` y `ConversationStatus`); ctx.channel tipado como `ContactChannel`; callsite usa `as ContactChannel` cast
- **Files modified:** apps/service-notifications/src/agent/conversation-agent.service.ts
- **Verification:** `pnpm --filter @cobrai/service-notifications typecheck` pasa sin errores
- **Committed in:** 52bf715 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type correctness)
**Impact on plan:** Fix necesario para que el typecheck pase. Sin cambio de comportamiento; el canal se propaga identicamente.

## Issues Encountered
- Landmine L6 activado: la spec instanciaba ConversationAgentService con 5 args; agregar EmailAdapter como 6 param rompio el typecheck del spec. Resuelto en Task 2 (mockEmail + 6 arg en beforeEach) exactamente como anticipaba el research.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ConversationAgentService listo para consumir eventos `cobrai.email.message_received` del Kafka consumer (Plan 06-04)
- AgentModule no requiere cambios (ya importa AdaptersModule que exporta EmailAdapter)
- Todos los tests existentes de WhatsApp siguen verdes — sin regresion

## Self-Check: PASSED

- `apps/service-notifications/src/agent/conversation-agent.service.ts` — FOUND
- `apps/service-notifications/src/agent/conversation-agent.service.spec.ts` — FOUND
- `.planning/phases/06-email-bidireccional-con-agente/06-03-SUMMARY.md` — FOUND
- Commit `52bf715` — FOUND
- Commit `57d7008` — FOUND

---
*Phase: 06-email-bidireccional-con-agente*
*Completed: 2026-06-09*
