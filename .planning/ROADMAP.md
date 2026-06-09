# CobraAI — Roadmap: WhatsApp & Voice Agent

> **Estado del proyecto:** Core MVP construido. Stubs de WA y Voz activos.
> **Goal:** Reemplazar stubs con implementaciones reales + agente LLM conversacional.

---

## Phase 1: WhatsApp Real (Twilio WA Business API)
**Goal:** Envíos reales por WhatsApp + recepción de mensajes inbound.
**Entrada:** `whatsapp.adapter.ts` es un stub que publica Kafka pero no envía nada.
**Salida:** Los deudores reciben el mensaje en WhatsApp real; sus respuestas llegan al sistema.

**Scope:**
- `TwilioWhatsAppAdapter` implementa `WhatsAppPort` con SDK `twilio`
- Envío de HSM templates por Twilio WA Sandbox → producción
- Webhook `POST /api/v1/webhooks/twilio-whatsapp` en service-notifications
- Inbound: guardar mensaje en `messages` (direction: 'in'), publicar `cobrai.whatsapp.message_received`
- Opt-out automático al recibir "STOP"
- Variables de entorno: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WA_FROM`
- Tests unitarios + integración

**Duración estimada:** 1 semana

---

## Phase 2: Voice Agent Real (Vapi.ai)
**Goal:** Llamadas outbound reales con agente de IA en español colombiano.
**Entrada:** `voice.adapter.ts` es un stub que publica Kafka pero no llama a nadie.
**Salida:** El sistema hace llamadas reales; se guarda transcript y outcome.

**Scope:**
- `VapiVoiceAdapter` implementa `VoiceAgentPort` con HTTP client → Vapi REST API
- Configurar Vapi Agent: prompt en español CO, ElevenLabs Multilingual v2, end-call function
- Webhook `POST /api/v1/webhooks/vapi` en service-notifications
  - Eventos: `call-started`, `call-ended`, `transcript`
  - Al `call-ended`: actualizar contact record + publicar `cobrai.voice.call_completed`
- `cobrai.voice.call_completed` consumido por service-notifications → actualiza outcome en BD
- Variables de entorno: `VAPI_API_KEY`, `VAPI_AGENT_ID`
- Tests unitarios + integration webhook

**Duración estimada:** 1 semana

---

## Phase 3: LLM Conversational Agent (WhatsApp bidireccional)
**Goal:** Responder automáticamente a mensajes de deudores por WhatsApp con LLM.
**Entrada:** `cobrai.whatsapp.message_received` evento llega al sistema pero nadie responde.
**Salida:** Agente GPT-4o-mini responde en WhatsApp, detecta intents y actualiza estado de deuda.

**Scope:**
- Kafka consumer en service-notifications que consume `cobrai.whatsapp.message_received`
- `ConversationAgentService`:
  - Carga contexto: deuda, historial de mensajes, StrategyContext
  - System prompt de cobranza (español colombiano, empático, legal-safe Ley 1266)
  - Llama OpenAI GPT-4o-mini con historial de conversación
  - Detecta intents: `promise_to_pay` / `dispute` / `plan_request` / `escalate_human` / `unrelated`
  - Genera respuesta y la envía por WhatsApp (via TwilioWhatsAppAdapter)
  - Actualiza `conversation.status` y publica evento según intent
- `AgentMemoryFact` para recordar datos cross-session (nombre preferido, contexto previo)
- Variables de entorno: `OPENAI_API_KEY`
- Límite de longitud de historial: últimos 20 mensajes
- Tests: unit del agent service, integration con OpenAI mockeado

**Duración estimada:** 1-2 semanas

---

## Phase 4: Dashboard Conversaciones y Escalaciones
**Goal:** Visibilidad de conversaciones WA y transcripts de voz en el admin.
**Entrada:** Datos en BD pero sin UI.
**Salida:** Agentes humanos pueden ver, responder y gestionar escalaciones.

**Scope:**
- `/conversations` — lista de conversaciones activas por canal (WA / Voz / Email / SMS)
- `/conversations/[id]` — hilo completo de mensajes con input para respuesta manual humana
- `/calls` — lista de llamadas con estado, duración, transcript (collapsable)
- Bandeja de escalaciones (`escalate_human` intent → badge en sidebar)
- POST `/api/v1/conversations/:id/reply` — agente humano responde manualmente por WA
- KPIs en dashboard: ratio promesa de pago WA, ratio atención llamada, sentimiento promedio
- Tests: componentes React (RTL), E2E Playwright básico

**Duración estimada:** 1 semana

---

## Phase 5: Memoria Unificada del Deudor
**Goal:** Consolidar el histórico del deudor a través de TODOS los canales, con análisis y resumen vivo, para que cualquier agente se comunique con memoria y coherencia.
**Entrada:** Conversaciones fragmentadas en silos por canal; `sentimentScore` nunca se calcula; el único resumen lo genera Vapi por llamada; la voz "ciega" al resto (solo lee conteos), el email sin memoria.
**Salida:** Un `DebtorMemoryService` que recopila histórico cross-canal, lo analiza (sentimiento + intención + comportamiento de pago), mantiene un "resumen vivo" y lo sirve a los agentes de WhatsApp y voz.

**Scope:**
- `DebtorMemoryService` nuevo en service-notifications:
  - **Recopila** cross-canal: contacts (todos los canales), mensajes de TODAS las conversaciones del deudor, promesas (pending/broken), transcripts de voz
  - **Analiza** la última interacción con LLM (OpenAI gpt-4o-mini): sentimiento, intención, comportamiento de pago
  - **Resume** incrementalmente: "resumen vivo" narrativo persistido en `Debtor.emotionalProfile` (Json, hoy sin uso)
  - **Sirve** `getUnifiedContext(tenantId, debtorId)` → contexto consolidado para prompts
  - `refreshMemory(tenantId, debtorId)` invocado tras cada interacción
- Integración:
  - `conversation-agent.service.ts` → reemplaza `loadDebtorHistory` por contexto unificado (WhatsApp)
  - `contacts.service.ts loadVoiceCallHistory` → usa contexto unificado (la voz deja de estar ciega)
  - `vapi-webhook.handler.ts` → `refreshMemory` tras cada llamada
- `sentimentScore` se persiste en `contact` al cerrar cada interacción
- Tests unitarios (vitest) con OpenAI mockeado

**Plans:** 4 plans (2 waves)

Plans:
- [ ] 05-01-PLAN.md — DebtorMemoryService + MemoryModule + extensión del contrato DebtorHistory (Wave 1)
- [ ] 05-02-PLAN.md — Integración WhatsApp: ConversationAgentService usa getUnifiedContext (Wave 2)
- [ ] 05-03-PLAN.md — Integración voz: loadVoiceCallHistory enriquecido con perfil unificado (Wave 2)
- [ ] 05-04-PLAN.md — Hook refreshMemory tras cada llamada en vapi-webhook + persistir sentimentScore (Wave 2)

**Duración estimada:** 1 semana

---

## Phase 6: Email Bidireccional con Agente
**Goal:** Convertir el email en un canal conversacional bidireccional con agente, igual que WhatsApp, usando la memoria unificada de la Phase 5.
**Entrada:** Email solo outbound (SendGrid); las respuestas del deudor no se capturan; el `ConversationAgentService` está cableado a WhatsApp.
**Salida:** El deudor responde un email → el sistema lo captura → el agente responde automáticamente con contexto unificado.

**Scope:**
- **SendGrid Inbound Parse**: registro MX en `reply.fogging.org` (Cloudflare) → webhook
- Webhook `POST /api/v1/webhooks/sendgrid-inbound` + `SendgridInboundHandler`:
  - Parsea remitente + cuerpo, ubica al deudor por email, guarda mensaje inbound
  - Publica `cobrai.email.message_received`
- Generalizar `ConversationAgentService` a multi-canal (canal parametrizable: whatsapp | email) → responde por el adapter correcto
- Kafka consumer: `cobrai.email.message_received` → agente responde por email
- Opt-out por email (instrucción de exclusión, Ley 1266)
- Tests unitarios + integración del webhook

**Duración estimada:** 1 semana

---

## Dependencias entre phases

```
Phase 1 (WA real) ──→ Phase 3 (LLM agent) ──→ Phase 4 (Dashboard)
Phase 2 (Voice real) ─────────────────────────→ Phase 4 (Dashboard)
Phase 3 (LLM agent) ──→ Phase 5 (Memoria) ──→ Phase 6 (Email bidireccional)
```

Phase 1 y 2 pueden ejecutarse en paralelo.
Phase 3 requiere Phase 1 completa.
Phase 4 requiere Phase 1, 2 y 3 completas.
Phase 5 requiere Phase 3 completa (extiende el agente con memoria cross-canal).
Phase 6 requiere Phase 5 completa (el agente de email usa la memoria unificada).

---

## Definition of Done (global)
- [ ] Deudor recibe mensaje real por WhatsApp
- [ ] Deudor responde → sistema detecta intent → agente responde automáticamente
- [ ] Sistema hace llamada outbound real → guarda transcript y outcome
- [ ] Admin ve todas las conversaciones y puede escalar a humano
- [ ] Compliance engine bloquea envíos fuera de horario
- [ ] Tests ≥ 80% cobertura en módulos nuevos
- [ ] Variables de entorno documentadas en `.env.example`
