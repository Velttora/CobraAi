---
phase: 06-email-bidireccional-con-agente
verified: 2026-06-09T11:35:00Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
---

# Phase 6: Email Bidireccional con Agente — Verification Report

**Phase Goal:** Deudor responde un email → SendGrid Inbound Parse → webhook lo captura → el sistema lo guarda → el agente LLM responde automáticamente POR EMAIL usando la memoria unificada (getUnifiedContext de Phase 5). El agente quedó generalizado de WhatsApp-only a multi-canal (whatsapp | email). El loop email→auto-reply→email es seguro (no se reingesta). Un opt-out por email revoca el consentimiento de EMAIL (no whatsapp) — compliance Ley 1266.

**Verified:** 2026-06-09T11:35:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Build and Test Results

| Check | Result |
|-------|--------|
| `npx vitest run` (14 test files, 95 tests) | PASS — 95/95 |
| `npx tsc --noEmit` | PASS — 0 errors |

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | EmailAdapter pasa reply_to al body v3 de SendGrid mediante spread condicional | VERIFIED | `email.adapter.ts:43` — `...(input.reply_to ? { reply_to: { email: input.reply_to } } : {})` |
| 2 | reply_to ausente cuando falsy (no se envía `reply_to: undefined`) | VERIFIED | `email.adapter.ts:43` — spread condicional: la clave se omite cuando `input.reply_to` es falsy |
| 3 | SendgridInboundHandler extrae email de "Name <email>" con regex | VERIFIED | `sendgrid-inbound.handler.ts:31` — `/[\w.+-]+@[\w-]+\.[\w.]+/.exec(payload.from ?? "")` |
| 4 | Loop-prevention ANTES de DB/Kafka: Auto-Submitted, X-Autoreply, @reply.fogging.org | VERIFIED | `sendgrid-inbound.handler.ts:36-44` — guarda retorna en paso 3, antes de `findFirst` (paso 6) y `kafka.publish` (paso 10) |
| 5 | Handler identifica deudor por email (`debtor.findFirst where email`) | VERIFIED | `sendgrid-inbound.handler.ts:57-59` — `prisma.debtor.findFirst({ where: { email, deletedAt: null } })` |
| 6 | Opt-out por email revoca ContactConsent de canal email solamente | VERIFIED | `sendgrid-inbound.handler.ts:126-135` — `updateMany where channel: "email"` |
| 7 | Guarda mensaje inbound con direction=in, channel=email | VERIFIED | `sendgrid-inbound.handler.ts:72-82` — `direction: "in", channel: "email"` |
| 8 | Publica cobrai.email.message_received con channel: "email" y phone=email | VERIFIED | `sendgrid-inbound.handler.ts:92-103` — `kafka.publish("cobrai.email.message_received", ...)` con `phone: email, channel: "email"` |
| 9 | POST /api/v1/webhooks/sendgrid-inbound usa NoFilesInterceptor + @HttpCode(200) + Record<string,string> | VERIFIED | `webhooks.controller.ts:78-87` — `@Post("sendgrid-inbound")`, `@HttpCode(200)`, `@UseInterceptors(NoFilesInterceptor())`, `@Body() body: Record<string, string>` |
| 10 | SendgridInboundHandler registrado en WebhooksModule providers | VERIFIED | `webhooks.module.ts:15` — `providers: [..., SendgridInboundHandler]` |
| 11 | ConversationAgentService: canal en InboundMessagePayload; email→EmailAdapter(reply_to); whatsapp→WhatsApp; outbound guardado con channel dinámico; getUnifiedContext intacto | VERIFIED | `conversation-agent.service.ts:26` (channel? field), `:62` (EmailAdapter inyectado), `:192-207` (discriminación canal), `:179` (`payload.channel ?? "whatsapp"`), `:122` (getUnifiedContext) |
| 12 | applyIntent opt_out usa ctx.channel (no "whatsapp" hardcodeado) — compliance Ley 1266 | VERIFIED | `conversation-agent.service.ts:292` — `channel: ctx.channel` en el `updateMany` del case opt_out; ctx recibe `(payload.channel ?? "whatsapp") as ContactChannel` en línea 216 |
| 13 | kafka.consumer: cobrai.email.message_received en CONSUMED_TOPICS + dispatch a processInboundMessage | VERIFIED | `kafka.consumer.ts:17` (CONSUMED_TOPICS array) y `:87-90` (case que llama `agent.processInboundMessage`) |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `apps/service-notifications/src/adapters/email.adapter.ts` | VERIFIED | Exists, 59 lines, contains `reply_to` spread condicional en línea 43 |
| `apps/service-notifications/src/adapters/email-adapter.spec.ts` | VERIFIED | Exists, tests reply_to con fetch mockeado |
| `apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts` | VERIFIED | Exists, 177 lines, exporta `SendgridInboundHandler` + `SendgridInboundPayload` |
| `apps/service-notifications/src/webhooks/sendgrid-inbound.handler.spec.ts` | VERIFIED | Exists, 8 tests |
| `apps/service-notifications/src/webhooks/webhooks.controller.ts` | VERIFIED | Contiene `@Post("sendgrid-inbound")` con NoFilesInterceptor + HttpCode(200) |
| `apps/service-notifications/src/webhooks/webhooks.module.ts` | VERIFIED | `SendgridInboundHandler` en providers |
| `apps/service-notifications/src/agent/conversation-agent.service.ts` | VERIFIED | `channel?` en InboundMessagePayload; EmailAdapter 6° param; discriminación canal; ctx.channel en opt_out |
| `apps/service-notifications/src/agent/conversation-agent.service.spec.ts` | VERIFIED | 13 tests; mockEmail como 6° arg; tests email→EmailAdapter, whatsapp→WhatsApp, opt_out canal email |
| `apps/service-notifications/src/contacts/kafka.consumer.ts` | VERIFIED | `cobrai.email.message_received` en CONSUMED_TOPICS (línea 17) y en switch (línea 87) |
| `apps/service-notifications/src/contacts/kafka.consumer.spec.ts` | VERIFIED | 2 tests: dispatch email y anti-regresión whatsapp |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `webhooks.controller.ts` | `sendgrid-inbound.handler.ts` | `this.sendgridInboundHandler.handleInbound(body)` — línea 84 | WIRED |
| `sendgrid-inbound.handler.ts` | `cobrai.email.message_received` | `this.kafka.publish(...)` — línea 92 | WIRED |
| `sendgrid-inbound.handler.ts` | `prisma.debtor` | `findFirst({ where: { email } })` — línea 57 | WIRED |
| `kafka.consumer.ts` | `conversation-agent.service.ts` | `case "cobrai.email.message_received" → agent.processInboundMessage(payload)` — línea 87 | WIRED |
| `conversation-agent.service.ts` | `email.adapter.ts` | `this.email.sendTemplate(...)` cuando `channel === "email"` — línea 193 | WIRED |
| `conversation-agent.service.ts` | `debtor-memory.service.ts` | `this.debtorMemory.getUnifiedContext(tenant_id, debtor_id, debt.id)` — línea 122 | WIRED |

---

## Full Loop Connectivity

```
deudor responde email
  → POST /api/v1/webhooks/sendgrid-inbound   (controller.ts:78)
  → SendgridInboundHandler.handleInbound()   (sendgrid-inbound.handler.ts:26)
      [loop-prevention ANTES de DB: líneas 36-44]
      → prisma.debtor.findFirst (línea 57)
      → prisma.message.create direction=in channel=email (línea 72)
      → kafka.publish "cobrai.email.message_received" (línea 92)
  → KafkaConsumerService.dispatch case email (kafka.consumer.ts:87)
  → agent.processInboundMessage({ channel: "email" }) (conversation-agent.service.ts:75)
      → debtorMemory.getUnifiedContext (línea 122) — Phase 5 intacta
      → OpenAI / fallback
      → prisma.message.create direction=out channel=email (línea 174)
      → email.sendTemplate(to, reply_to: "reply@reply.fogging.org") (línea 193)
          → fetch SendGrid con reply_to: { email } (email.adapter.ts:43)
```

Loop-safe: el email de respuesta del agente sale con `from: noreply@fogging.org` y `Reply-To: reply@reply.fogging.org`. Si el agente recibiera su propio rebote, el handler lo bloquea en paso 3 por `email.endsWith("@reply.fogging.org")` o por header `Auto-Submitted: auto`.

---

## Compliance Fix Verification (Ley 1266)

**VERIFIED.** El `applyIntent` opt_out usa `ctx.channel` (no el hardcoded `"whatsapp"` de fases anteriores):

- `conversation-agent.service.ts:216` — `channel: (payload.channel ?? "whatsapp") as ContactChannel` pasa el canal al contexto
- `conversation-agent.service.ts:292` — `channel: ctx.channel` en el `contactConsent.updateMany` del case `opt_out`
- Test de regresión: `conversation-agent.service.spec.ts:294-312` — "opt_out por email → revoca consent de email (no whatsapp)" verifica `channel: "email"` en el `where` del updateMany

Un opt-out recibido por email revoca únicamente el consentimiento de email; el consentimiento de WhatsApp permanece intacto.

---

## Anti-Pattern Scan

Scanned all 9 modified files. No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, o `PLACEHOLDER` markers encontrados. No stubs ni implementaciones vacías. Los `return ""` en el controller son el comportamiento correcto esperado por SendGrid (200 vacío).

---

## No New Prisma Migration

**VERIFIED.** La última migración es `20260605093000_workflow_rule_template` (anterior a Phase 6). Phase 6 no añadió ninguna migración — usa modelos y enums existentes (`ContactChannel.email`, `MessageDirection.in`, `ConversationStatus.open`) que ya existían en el schema.

---

## WhatsApp Regression

**VERIFIED.** Tests preexistentes de WhatsApp (11 tests en `conversation-agent.service.spec.ts`, 7 tests en `twilio-wa-webhook.handler.spec.ts`) siguen verdes. El discriminador `(payload.channel ?? "whatsapp")` preserva el comportamiento original cuando `channel` está ausente. `mockWhatsapp.sendTemplate` sigue siendo llamado en el path por defecto — verificado en test "canal default (sin channel) → WhatsApp".

---

## Human Verification Required

None. All checks are fully verifiable programmatically.

---

## VERIFICATION COMPLETE

**VERDICT: PASSED**

Los 13 must-haves están verificados contra código fuente, no contra SUMMARY. El build TypeScript es limpio (0 errores), los 95 tests pasan (95/95). El loop completo email→webhook→Kafka→agent→email reply está cableado y es loop-safe. La corrección de compliance Ley 1266 (opt-out revoca canal correcto via `ctx.channel`) está implementada y cubierta por test de regresión específico.

---

_Verified: 2026-06-09T11:35:00Z_
_Verifier: Claude (gsd-verifier)_
