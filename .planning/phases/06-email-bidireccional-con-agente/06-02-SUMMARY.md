---
phase: 06-email-bidireccional-con-agente
plan: "02"
subsystem: service-notifications/webhooks
tags: [email, inbound, sendgrid, kafka, webhook, opt-out, loop-prevention]
dependency_graph:
  requires:
    - "06-01-PLAN.md (reply_to en EmailAdapter — outbound repliable)"
    - "apps/service-notifications/src/kafka/kafka.service.ts"
    - "@cobrai/db PrismaService"
  provides:
    - "POST /api/v1/webhooks/sendgrid-inbound (multipart/form-data)"
    - "cobrai.email.message_received Kafka event"
    - "SendgridInboundHandler: from-parse, loop-prevention, opt-out, message in/email"
  affects:
    - "apps/service-notifications/src/webhooks/webhooks.controller.ts"
    - "apps/service-notifications/src/webhooks/webhooks.module.ts"
tech_stack:
  added: []
  patterns:
    - "NoFilesInterceptor() para activar multer en endpoint multipart"
    - "Record<string,string> body para eludir ValidationPipe(forbidNonWhitelisted)"
    - "Regex /[\\w.+-]+@[\\w-]+\\.[\\w.]+/ para parsear 'Nombre <email@host>'"
    - "cleanEmailBody: heurística de corte de línea para eliminar texto citado"
key_files:
  created:
    - apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts
    - apps/service-notifications/src/webhooks/sendgrid-inbound.handler.spec.ts
  modified:
    - apps/service-notifications/src/webhooks/webhooks.controller.ts
    - apps/service-notifications/src/webhooks/webhooks.module.ts
decisions:
  - "Regex heurística para limpiar texto citado (sin email-reply-parser): sin dep nueva, cubre Gmail+Outlook+Apple Mail en es/en para v1"
  - "Record<string,string> en @Body() en lugar de DTO class-validator para evitar forbidNonWhitelisted con campos extra de SendGrid"
  - "phone reutilizado para email address en payload cobrai.email.message_received (compatibilidad con InboundMessagePayload)"
  - "Validación de seguridad v1: isValidPayload verifica presencia de from+body y que to contenga reply.fogging.org"
metrics:
  duration_minutes: 15
  completed_date: "2026-06-09"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 2
  tests_added: 8
  tests_passing: 90
---

# Phase 06 Plan 02: SendgridInboundHandler — Summary

**One-liner:** SendgridInboundHandler con parseo multipart (NoFilesInterceptor), from-regex, loop-prevention (Auto-Submitted/X-Autoreply/@reply.fogging.org), opt-out en español, limpieza de texto citado, y publicación de cobrai.email.message_received.

## What Was Built

Receptor del lado inbound del canal email bidireccional. Replica el patrón de `twilio-wa-webhook.handler.ts` para email:

1. **`SendgridInboundHandler`** (`sendgrid-inbound.handler.ts`, 176 líneas):
   - `isValidPayload`: rechaza si falta `from`+body o si `to` no contiene `reply.fogging.org`
   - Extrae email de `"Nombre <email@host>"` con regex `/[\w.+-]+@[\w-]+\.[\w.]+/`
   - Loop prevention antes de cualquier DB/Kafka: ignora `Auto-Submitted: auto`, `X-Autoreply:`, from que termine en `@reply.fogging.org`
   - Fallback texto vacío → strip HTML → cleanEmailBody (corta en "El X escribió:", ">", "---")
   - Opt-out español: `/no\s+contactar|baja|unsubscribe|cancelar|stop|eliminar/i` → revocar ContactConsent(channel=email)
   - `debtor.findFirst({ where: { email, deletedAt: null } })` — identifica deudor
   - `upsertConversation`: findFirst o create con `channel: "email", status: "open"`
   - `message.create`: `direction: "in", channel: "email"`, content JSON con text+subject
   - `kafka.publish("cobrai.email.message_received", tenantId, { debtor_id, tenant_id, conversation_id, phone: email, body, channel: "email" })`

2. **Endpoint** `POST /api/v1/webhooks/sendgrid-inbound` en `webhooks.controller.ts`:
   - `@UseInterceptors(NoFilesInterceptor())` activa multer para multipart/form-data
   - `@HttpCode(200)` + `@Body() body: Record<string, string>` + `return ""`
   - NoFilesInterceptor ya en @nestjs/platform-express@10.4.22 (multer 2.0.2 bundled) — sin nueva instalación

3. **Módulo**: `SendgridInboundHandler` agregado a `providers` en `webhooks.module.ts`

4. **Spec** (`sendgrid-inbound.handler.spec.ts`, 8 tests):
   - Email normal → message.create + kafka.publish
   - Opt-out 'no contactar' → contactConsent.updateMany(channel=email), sin Kafka
   - Deudor no encontrado → resuelve undefined, sin Kafka
   - Destino fuera de reply.fogging.org → debtor.findFirst no llamado
   - Loop prevention (Auto-Submitted header) → debtor.findFirst no llamado
   - Loop prevention (from @reply.fogging.org) → debtor.findFirst no llamado
   - Texto citado limpiado → body === "Pago el viernes."
   - Conversación nueva → conversation.create(channel=email, status=open)

## Verification

- `pnpm --filter @cobrai/service-notifications typecheck` — PASS (0 errores)
- `pnpm --filter @cobrai/service-notifications test` — 90/90 tests pasan (8 nuevos)
- `grep -c "cobrai.email.message_received" ...handler.ts` → 1
- Loop prevention presente: auto-submitted, x-autoreply, reply.fogging.org
- Opt-out presente: no\s+contactar, unsubscribe
- NoFilesInterceptor en import y @UseInterceptors
- `SendgridInboundHandler` aparece 2 veces en webhooks.module.ts (import + provider)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — handler implementado con flujo completo. Depende de infraestructura DNS (registro MX reply.fogging.org → mx.sendgrid.net + SendGrid Inbound Parse config) para funcionar en e2e real; el código y unit tests están completos sin ella.

## Threat Flags

No new threat surface beyond what was catalogued in the plan's threat model (T-06-03 through T-06-SC). All mitigations implemented as specified:
- T-06-04 (loop): Auto-Submitted, X-Autoreply, @reply.fogging.org all guarded before DB/Kafka
- T-06-05 (multipart tampering): NoFilesInterceptor rejects file uploads; Record<string,string> avoids class-validator rejection

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — SendgridInboundHandler | b5aa053 | feat(06-02): crear SendgridInboundHandler para capturar emails inbound |
| 2 — Endpoint + Module | e3828dd | feat(06-02): registrar endpoint POST sendgrid-inbound y provider en módulo |
| 3 — Spec vitest | bb74e78 | test(06-02): spec vitest de SendgridInboundHandler (8 tests, todos pasan) |

## Self-Check: PASSED

- [x] `apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts` exists
- [x] `apps/service-notifications/src/webhooks/sendgrid-inbound.handler.spec.ts` exists
- [x] Commits b5aa053, e3828dd, bb74e78 exist in git log
- [x] `webhooks.controller.ts` contains `@Post("sendgrid-inbound")` and `NoFilesInterceptor`
- [x] `webhooks.module.ts` contains `SendgridInboundHandler` (import + provider = 2 occurrences)
