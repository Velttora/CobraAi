# Phase 6: Email Bidireccional con Agente - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Source:** Diseño acordado en conversación (auditoría de email + patrón WhatsApp inbound + memoria Phase 5)

<domain>
## Phase Boundary

Convertir el email en un canal **conversacional bidireccional con agente**, igual que WhatsApp. Hoy el email es solo de salida (SendGrid outbound): las respuestas del deudor NO se capturan y el `ConversationAgentService` está cableado a WhatsApp.

Al terminar esta fase: el deudor responde un email → SendGrid Inbound Parse lo entrega a un webhook → el sistema lo guarda y el agente LLM responde automáticamente **por email**, usando la memoria unificada de Phase 5 (`getUnifiedContext`).

**Depende de Phase 5** (completa): el agente de email usa `DebtorMemoryService.getUnifiedContext` para contexto coherente cross-canal.

**Infra ya lista:** dominio `fogging.org` autenticado en SendGrid (SPF/DKIM), túnel `cobra.fogging.org` → servicio local `:3003`, `EmailAdapter.sendTemplate` funcional.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Inbound Parse (recepción)
- Usar **SendGrid Inbound Parse**: un subdominio con registro **MX → `mx.sendgrid.net`**. Subdominio elegido: `reply.fogging.org`.
- Configurar en SendGrid: Settings → Inbound Parse → Add Host & URL → host `reply.fogging.org`, URL `https://cobra.fogging.org/api/v1/webhooks/sendgrid-inbound`.
- Los emails outbound (`EmailAdapter`) deben llevar **`Reply-To: <id>@reply.fogging.org`** para que las respuestas del deudor lleguen a Inbound Parse. El `from` sigue siendo `noreply@fogging.org`.

### Webhook entrante
- Nuevo endpoint `POST /api/v1/webhooks/sendgrid-inbound` en `webhooks.controller.ts`. SendGrid envía **`multipart/form-data`** con campos: `from`, `to`, `subject`, `text`, `html`, `envelope`, `headers`.
- Nuevo `SendgridInboundHandler` que **replica el patrón de `twilio-wa-webhook.handler.ts`**:
  - Parsea el `from` (email del deudor), extrae el cuerpo de texto (`text`, limpiar quoted-reply/firma si es viable).
  - Identifica al deudor por email (`prisma.debtor.findFirst({ where: { email } })`).
  - Detecta opt-out ("no contactar", "baja", "unsubscribe") → revoca consent de email.
  - Guarda mensaje inbound (`message.direction = "in"`, `channel = "email"`) en la conversación de email del deudor (crea si no existe).
  - Publica `cobrai.email.message_received` (mismo shape que `cobrai.whatsapp.message_received`).

### Generalizar el agente a multi-canal
- `ConversationAgentService.processInboundMessage` debe aceptar el **canal** como parámetro (`whatsapp | email`) en el payload, en lugar de asumir WhatsApp.
- Responder por el adapter correcto: `whatsapp` → `TwilioWhatsAppAdapter`, `email` → `EmailAdapter`. Inyectar `EmailAdapter` en `AgentModule`.
- Seguir usando `DebtorMemoryService.getUnifiedContext` (Phase 5) para el contexto del prompt — ya integrado en Phase 5.
- Guardar el mensaje outbound con el `channel` correcto.
- El email de respuesta del agente también lleva `Reply-To: reply.fogging.org` (para mantener el hilo bidireccional).

### Kafka
- `kafka.consumer.ts`: agregar `cobrai.email.message_received` a `CONSUMED_TOPICS` y al `dispatch` → `agent.processInboundMessage({ ..., channel: "email" })`.

### Verificación de firma (seguridad)
- SendGrid Inbound Parse no firma como Twilio. Opcional: validar con un secreto en la URL del webhook o restringir por IP. Para v1, validar que el payload tiene la forma esperada y que el `to` pertenece a `reply.fogging.org`. (Claude's discretion sobre el nivel.)

### Claude's Discretion
- Estrategia exacta de limpieza del cuerpo del email (quitar texto citado del hilo, firmas).
- Forma exacta del `Reply-To` (`reply@reply.fogging.org` fijo vs `<debtorId>@reply.fogging.org` para correlación directa).
- Si el `channel` se añade al payload de Kafka o se infiere del handler.
- Nivel de validación de seguridad del webhook (secreto en URL vs verificación de forma).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Patrón de inbound a replicar
- `apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.ts` — patrón completo de webhook inbound: parsear remitente, buscar deudor por contacto, detectar opt-out, guardar mensaje `direction: "in"`, upsert conversación, publicar evento Kafka. **El SendgridInboundHandler lo replica para email.**
- `apps/service-notifications/src/webhooks/webhooks.controller.ts` — dónde se registra el endpoint; ver `twilioWhatsApp` (multipart/form-data, @HttpCode(200)).

### Agente a generalizar
- `apps/service-notifications/src/agent/conversation-agent.service.ts` — `processInboundMessage` (cableado a WhatsApp hoy: todos los `channel: "whatsapp"`, responde por `this.whatsapp.sendTemplate`). Generalizar a multi-canal. Ya usa `getUnifiedContext` (Phase 5).
- `apps/service-notifications/src/agent/conversation-agent.service.ts` — `InboundMessagePayload` interface: agregar `channel`.
- `apps/service-notifications/src/agent/agent.module.ts` — inyectar `EmailAdapter` (ya importa AdaptersModule que lo exporta).

### Adapters y memoria
- `apps/service-notifications/src/adapters/email.adapter.ts` — `sendTemplate` (agregar `Reply-To`). Patrón SendGrid v3 mail/send.
- `apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts` — referencia del otro adapter.
- `apps/service-notifications/src/memory/debtor-memory.service.ts` — `getUnifiedContext` (Phase 5), ya consumido por el agente.

### Kafka
- `apps/service-notifications/src/contacts/kafka.consumer.ts` — `CONSUMED_TOPICS` + `dispatch`. Agregar el topic de email.

### Modelos
- `packages/db/prisma/schema.prisma` — `Debtor.email`, `Conversation` (channel email), `Message` (direction in/out, channel email), `ContactConsent` (channel email para opt-out).
</canonical_refs>

<specifics>
## Specific Ideas

- El patrón de WhatsApp inbound (Phase 1/3) ya resolvió todo el flujo: webhook → guardar → Kafka → agente responde. Esta fase lo **espeja para email** y generaliza el agente para no duplicar la lógica de respuesta.
- La memoria de Phase 5 hace que el agente de email sea coherente con lo hablado por WhatsApp/voz desde el día uno.
- `reply.fogging.org` con MX a SendGrid es la pieza de infra nueva; el resto es código que sigue patrones existentes.
</specifics>

<deferred>
## Deferred Ideas

- **Parsing avanzado de adjuntos** del email entrante → futuro.
- **Threading por Message-ID/References** (hilos de email nativos) → v1 usa la conversación del deudor por canal; threading fino es futuro.
- **Verificación criptográfica de firma** del webhook (SendGrid no la ofrece nativa como Twilio) → v1 valida forma + dominio destino.
</deferred>

<user_setup>
## Manual Setup Required (usuario)

- **Cloudflare DNS:** agregar registro **MX** en `reply.fogging.org` → `mx.sendgrid.net` (prioridad 10), **DNS only**.
- **SendGrid:** Settings → Inbound Parse → Add Host & URL → host `reply.fogging.org`, destination URL `https://cobra.fogging.org/api/v1/webhooks/sendgrid-inbound`.
- El código se puede construir y testear (unit, mocked) sin esto; la prueba end-to-end real requiere el MX + host configurados.
</user_setup>

---

*Phase: 06-email-bidireccional-con-agente*
*Context gathered: 2026-06-09 (diseño acordado en conversación)*
