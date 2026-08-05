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

**Estado: ✅ completa — verificada retroactivamente 2026-07-23.** El código se
construyó (commit `021d34b feat(dashboard): Phase 4 — Dashboard conversaciones y
llamadas de voz` + follow-ups `5507b68`, `a2d323e`, `938a956`, `c3bf61e`, `71f4710`)
pero `STATE.md`/este roadmap nunca se actualizaron — quedó marcada "🔲 pendiente"
mientras el código ya estaba en `main`. Auditoría línea por línea contra el scope
original el 2026-07-23; ver desviaciones abajo.

**Scope:**

- [x] `/conversations` — lista de conversaciones activas por canal (WA / Voz / Email), con filtros de canal/estado/portafolio/resultado de llamada
- [x] `/conversations/[id]` — hilo completo de mensajes con input para respuesta manual humana (`ReplyInput`, deshabilitado en SMS)
- [x] Bandeja de escalaciones (`escalate_human` → badge rojo con conteo en Sidebar, polling 30s) + modal "Resolver escalación" (outcome pending/promised + nota)
- [x] POST `/api/v1/conversations/:id/reply` — agente humano responde manualmente (WA o email, no solo WA como decía el scope original)
- [x] KPIs en dashboard: ratio promesa de pago WA, ratio atención llamada, **sentimiento promedio** (este último faltaba — implementado 2026-07-23: `Contact.sentimentScore` expuesto como `last_sentiment_score` en `GET /v1/conversations`, promediado client-side en `computeAverageSentiment`)
- [x] Tests: componentes React (RTL) — agregada infraestructura `@testing-library/react` + jsdom (no existía en el repo); tests de `MessageBubble`, `ConversationThread`, `ReplyInput`. E2E Playwright básico (`e2e/conversations.spec.ts`)

**Desviaciones del scope original (decisiones de diseño, no gaps):**

- `/calls` como ruta separada **no se construyó**; su función (lista de llamadas + transcript colapsable) quedó integrada al inbox unificado de `/conversations` (tab "Voz" + `VoiceCallBubble` dentro de `MessageBubble.tsx`) — un solo inbox en vez de dos, cobertura funcional equivalente.
- `TranscriptViewer.tsx` como componente separado no se construyó; su lógica vive inline en `VoiceCallBubble` (mismo archivo `MessageBubble.tsx`).
- SMS quedó fuera de los filtros de canal de `/conversations` porque el canal está deshabilitado globalmente por flag (sin proveedor CO) — no hay datos que listar.

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

**Plans:** 4 plans (2 waves) — 4/4 complete

Plans:

- [x] 05-01-PLAN.md — DebtorMemoryService + MemoryModule + extensión del contrato DebtorHistory (Wave 1)
- [x] 05-02-PLAN.md — Integración WhatsApp: ConversationAgentService usa getUnifiedContext (Wave 2)
- [x] 05-03-PLAN.md — Integración voz: loadVoiceCallHistory enriquecido con perfil unificado (Wave 2)
- [x] 05-04-PLAN.md — Hook refreshMemory tras cada llamada en vapi-webhook + persistir sentimentScore (Wave 2)

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

**Plans:** 4 plans (3 waves)

Plans:

- [x] 06-01-PLAN.md — EmailAdapter pasa reply_to al body v3 de SendGrid (emails outbound repliables) (Wave 1)
- [x] 06-02-PLAN.md — SendgridInboundHandler + endpoint POST sendgrid-inbound (captura inbound, opt-out, loop-prevention, publica cobrai.email.message_received) (Wave 1)
- [x] 06-03-PLAN.md — ConversationAgentService multi-canal (responde por EmailAdapter/WhatsApp según channel) (Wave 2)
- [x] 06-04-PLAN.md — Kafka consumer despacha cobrai.email.message_received al agente (cierra el lazo bidireccional) (Wave 3)

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

### Phase 7: Días Festivos (Colombia)

**Goal:** Los festivos nacionales de Colombia bloquean el envío de CUALQUIER notificación (proactiva y transaccional).
**Entrada:** El motor de compliance solo bloquea por horario/consentimiento/opt-out/frecuencia; ignora los festivos, así que en un festivo CO igual salen envíos.
**Salida:** En un día festivo colombiano ningún envío pasa el gate de compliance; `next_allowed_at` apunta al próximo día hábil no festivo.

**Scope:**

- Modelo Prisma `Holiday { id, date @unique, name }` + migración (tabla mínima, Colombia).
- Seed idempotente (upsert) con festivos CO 2026 y 2027; script anual re-corrible siguiendo el patrón `packages/db/src/seed-*.ts`.
- Chequeo `isHoliday(localDate)` en `packages/compliance` (ComplianceService), aplicado tanto en `checkContact` como en `isChannelEligible`; nueva razón `"holiday"` en `ContactCheckResult`, con `next_allowed_at` al próximo día hábil no festivo.
- Tests unitarios (vitest).

**Requirements**: TBD
**Depends on:** Ninguna (independiente de las phases conversacionales; toca `packages/compliance` + `packages/db`)
**Plans:** 2 plans (2 waves) — 2/2 complete

Plans:

- [x] 07-01-PLAN.md — Modelo Prisma `Holiday` + migración `add_holidays` + seed idempotente CO 2026/2027 + script `db:seed:holidays` (Wave 1)
- [x] 07-02-PLAN.md — Razón `holiday` + `isHoliday`/`nextNonHolidaySendTime` + gate en `checkContact` e `isChannelEligible` + tests (Wave 2)

### Phase 8: Configuración por Tenant (BYO): canales e identidad de cobro

**Goal:** Toda comunicación y todo cobro salen a título de la empresa cliente (tenant), con sus propias credenciales y su propio enlace de pago — la plataforma solo orquesta.
**Entrada:** Twilio, SendGrid, Vapi y los gateways de pago usan credenciales globales de plataforma (`.env`); lo único por tenant hoy es `settings.whatsappFromNumber`. Los adaptadores de cobro existentes son `conekta` (México), `mercadopago` (con `MP_ACCESS_TOKEN` global) y `transfer`, y `GatewayService` lee las llaves desde `ConfigService`.
**Salida:** Cada tenant registra sus credenciales (Twilio, SendGrid, Vapi) y su método de cobro; los mensajes salen desde su número/dominio/voz y el deudor recibe un enlace de pago de la cuenta del tenant. Un tenant sin credenciales para un canal no envía por ese canal, y sin gateway solo puede cobrar por transferencia manual.

**Alcance: backend y frontend.** Incluye la sección `Settings > Integraciones` del dashboard.

**Decisiones tomadas (2026-07-29 / 2026-08-04, con el usuario — detalle completo en `08-CONTEXT.md`):**

- **Comunicaciones: modelo híbrido — managed por defecto, BYO opcional.** Por defecto la plataforma aprovisiona vía API la infraestructura del tenant (subcuenta de Twilio, subuser de SendGrid) para que configure lo mínimo; un tenant que ya tiene proveedor propio puede traer sus credenciales. El adaptador resuelve credenciales igual en ambos modos.
- **WhatsApp + voz: Twilio vía el programa Tech Provider (ISV).** El tenant hace Embedded Signup, lo que crea **su propio WABA bajo su Meta Business**; la plataforma crea su subcuenta de Twilio y conecta el WABA con la Senders API. Twilio permite un solo WABA por cuenta → una subcuenta por tenant.
- **Email: subusers de SendGrid** creados por API. El tenant solo publica los CNAME de autenticación en su DNS — irreducible si el correo ha de salir firmado a su nombre.
- **Voz: Vapi sigue siendo de la plataforma** (credencial global). Lo que cambia por tenant es el número saliente: se importa su número de Twilio a la cuenta Vapi vía API y se persiste el `vapiPhoneNumberId`.
- **Pagos: BYO obligatorio, sin modelo managed.** Stripe lista "debt collection agencies" en negocios prohibidos y Colombia no está soportada para cuentas conectadas de Connect; Mercado Pago prohíbe terceros que procesen pagos de compañías de cobranza. Nunca centralizar dinero bajo la cuenta de la plataforma.
- **Gateways a implementar:** Stripe, Wompi (Bancolombia), PayU Colombia, ePayco, Mercado Pago Colombia, y **enlace externo** como plantilla con `{monto}`/`{ref}`.
- **Riesgo aceptado:** bajo el modelo ISV el titular ante Twilio es la plataforma, y Twilio puede suspender la cuenta entera por tráfico no conforme de un solo cliente. Su AUP prohíbe *third-party* debt collection; el tenant cobrando deuda propia es primera parte. El modo BYO queda como válvula de escape.
- **Fuera de alcance:** SMS (deshabilitado por flag, con Bird), dLocal Go, `conekta` (México, se deprecia), y el wizard de onboarding obligatorio.

**Investigación (2026-07-29 / 2026-08-04):**

- Gateways que exigen entidad colombiana (NIT + RUT + cuenta local): **Wompi** (desembolsa solo a cuenta Bancolombia a nombre del NIT), **ePayco**, **PayU CO**, **Mercado Pago CO**. **Stripe** solo admite entidad de EE. UU. y no procesa PSE ni wallets locales.
- Opciones LLC-friendly con PSE (**dLocal Go**, EBANX, Nuvei, Rapyd) quedaron fuera: con BYO puro en pagos, el tenant colombiano usa su propio gateway con su NIT.

**Scope:**

- Modelo `TenantIntegration` (`unique(tenantId, provider)`, `mode: managed | byo`) con secretos **cifrados AES-256-GCM** y `keyVersion` rotable — no en `Tenant.settings`, que se expone vía `tenant-profile.dto.ts`. No existe ninguna utilidad de cifrado en el repo todavía.
- Aprovisionamiento vía API: creación de subcuenta de Twilio y subuser de SendGrid, registro del sender de WhatsApp con la Senders API, e importación del número a Vapi. Verificación síncrona contra el proveedor al guardar (`verified | failed` + `verifiedAt`).
- Resolución de credenciales **por request** en cada adapter (`TwilioWhatsAppAdapter`, `EmailAdapter`, `VapiVoiceAdapter`), que hoy las cachean en el constructor, sin romper la firma de `contacts.service.ts`.
- `GatewayService` deja de leer `ConfigService`; `PaymentLink` separa `provider` de `method` (el enum actual mezcla ambos) con migración de datos; adaptadores Stripe/Wompi/PayU/ePayco/MP + enlace externo con plantilla.
- **Ruteo de webhooks por URL con token opaco** (`/webhooks/{proveedor}/{token}`) para Twilio WA, SendGrid Inbound Parse y cada gateway, **fail closed** si falta el secreto de firma. El webhook de Vapi sigue compartido, porque la cuenta es de la plataforma.
- Razón nueva `channel_not_configured` en `ComplianceService`: el canal se marca no elegible, el workflow salta al siguiente configurado y escala a humano si no queda ninguno. El **modo simulado** (hoy los cinco adaptadores devuelven `sent` sin enviar nada) queda tras flag explícito y bloqueado en `NODE_ENV=production`.
- Migración de datos idempotente que siembra las credenciales globales actuales como `TenantIntegration` de los tenants existentes, para que el corte no tumbe a nadie.
- Identidad de marca del tenant inyectada en `variables.empresa` de las plantillas, en los prompts del agente LLM y en `strategy_context.variables` de Vapi. El reply del email pasa a usar siempre el dominio del tenant.
- **Frontend:** `Settings > Integraciones` con cuatro pantallas — conexión de canales (incluido el flujo de navegador de Embedded Signup con el SDK de Meta), configuración de cobro con campos write-only, identidad de marca con vista previa del mensaje, y estado/salud de integraciones con las deudas no contactadas por falta de configuración.
- Tests unitarios + integración de webhooks + tests de la UI de settings.

**Requirements**: D-01 … D-26 (decisiones de `08-CONTEXT.md`; este proyecto no tiene `REQUIREMENTS.md`)
**Depends on:** Phases 1, 2, 3, 6 (reemplaza la configuración global que esas fases introdujeron)
**Plans:** 4/19 plans executed

Plans:

- [x] 08-01-PLAN.md — Cifrado AES-256-GCM + modelo `TenantIntegration` + migración [ola 1]
- [x] 08-02-PLAN.md — Verificación de contratos de proveedor (Twilio Senders, Vapi import, SendGrid subusers) [ola 1]
- [x] 08-03-PLAN.md — Paquete `@cobrai/integrations`: resolución de credenciales por request + verificadores [ola 2]
- [x] 08-04-PLAN.md — Separación `provider`/`method` en pagos + migración con backfill medido [ola 2]
- [ ] 08-05-PLAN.md — `channel_not_configured` en compliance + escalamiento a humano sin canal [ola 3]
- [ ] 08-06-PLAN.md — Migración de datos idempotente que siembra las credenciales globales (D-18) [ola 3]
- [ ] 08-07-PLAN.md — Aprovisionamiento Twilio ISV (subcuenta + Senders API) e importación del número a Vapi [ola 3]
- [ ] 08-08-PLAN.md — Adaptadores de pasarela: Stripe, Mercado Pago, Wompi, PayU, ePayco [ola 3]
- [ ] 08-09-PLAN.md — Despacho por configuración del tenant + enlace externo con plantilla + transferencia [ola 4]
- [ ] 08-10-PLAN.md — Refactor de adaptadores a credenciales por request + flag de simulación + dominio de respuesta [ola 4]
- [ ] 08-11-PLAN.md — Aprovisionamiento SendGrid: subuser, llave propia, autenticación de dominio y CNAME [ola 4]
- [ ] 08-12-PLAN.md — Webhooks de pago con token opaco y verificación fail-closed [ola 5]
- [ ] 08-13-PLAN.md — Webhooks de canal con token opaco + dominio de respuesta por tenant [ola 5]
- [ ] 08-14-PLAN.md — API de integraciones (write-only, admin) + salud + deudas sin contactar [ola 5]
- [ ] 08-15-PLAN.md — Identidad de marca e inyección en WhatsApp, correo, voz y el agente LLM [ola 6]
- [ ] 08-16-PLAN.md — Primitivas de UI, hook de datos y esqueleto de `Settings > Integraciones` [ola 6]
- [ ] 08-17-PLAN.md — Pantalla 1: conexión de canales (BYO primero, Embedded Signup con fallback) [ola 7]
- [ ] 08-18-PLAN.md — Pantalla 2: configuración de cobro y editor de plantilla de enlace [ola 7]
- [ ] 08-19-PLAN.md — Pantallas 3 y 4: identidad de marca con vista previa, y estado/salud [ola 7]

---

## Definition of Done (global)

- [ ] Deudor recibe mensaje real por WhatsApp
- [ ] Deudor responde → sistema detecta intent → agente responde automáticamente
- [ ] Sistema hace llamada outbound real → guarda transcript y outcome
- [ ] Admin ve todas las conversaciones y puede escalar a humano
- [ ] Compliance engine bloquea envíos fuera de horario
- [ ] Tests ≥ 80% cobertura en módulos nuevos
- [ ] Variables de entorno documentadas en `.env.example`
