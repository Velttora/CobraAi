# STATE

## Proyecto
CobraAI — WhatsApp & Voice Agent (fases reales post-MVP-core)

## Estado actual
- **Fase activa:** Phase 6 COMPLETA + verificada (gsd-verifier PASSED 13/13). Pendiente setup manual: registro MX en Cloudflare (reply.fogging.org → mx.sendgrid.net) + SendGrid Inbound Parse host, para prueba e2e real.
- **Completadas:** Phases 1, 2, 3, 5, 6
- **Core MVP:** construido por Cursor (portafolios, auth, workflows, email/SMS, pagos, stubs WA/Voice)
- **Post-roadmap:** WhatsApp + Voz (Vapi) + Email (SendGrid, dominio fogging.org autenticado) operativos en local. SMS deshabilitado por flag (sin proveedor CO). Lazo email bidireccional cerrado.
- **Last session:** 2026-06-09 — ejecutado plan 06-04 (KafkaConsumerService suscrito a cobrai.email.message_received; dispatch case idéntico al whatsapp; 2 tests nuevos, 95 total pasan; lazo email bidireccional completo)

## Fases
| # | Nombre | Estado |
|---|---|---|
| 1 | WhatsApp Real (Twilio WA Business API) | ✅ completa |
| 2 | Voice Agent Real (Vapi.ai) | ✅ completa |
| 3 | LLM Conversational Agent (WA bidireccional) | ✅ completa |
| 4 | Dashboard Conversaciones y Escalaciones | 🔲 pendiente |
| 5 | Memoria Unificada del Deudor | ✅ completa (4/4 planes — sentimentScore + emotionalProfile activos) |
| 6 | Email Bidireccional con Agente | ✅ completa (4/4 planes) |
| 7 | Días Festivos (Colombia) | ✅ completa (2/2 planes) |

## Contexto acumulado
- `packages/ports/src/whatsapp.port.ts` — contrato WhatsAppPort
- `packages/ports/src/voice-agent.port.ts` — contrato VoiceAgentPort
- `apps/service-notifications/src/adapters/whatsapp.adapter.ts` — stub ACTUAL (reemplazar en Phase 1)
- `apps/service-notifications/src/adapters/voice.adapter.ts` — stub ACTUAL (reemplazar en Phase 2)
- `apps/service-notifications/src/contacts/contacts.service.ts` — orquestador que llama los adapters

## Variables de entorno necesarias (aún no configuradas)
### Phase 1 (WA)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WA_FROM` (número ej: whatsapp:+14155238886 para sandbox)

### Phase 2 (Voice)
- `VAPI_API_KEY`
- `VAPI_AGENT_ID`
- `VAPI_WEBHOOK_SECRET` (para verificar firma)

### Phase 3 (LLM)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: gpt-4o-mini)

## Decisiones de arquitectura
- WhatsApp: Twilio WA (ya tienen Twilio para SMS, mismo SDK)
- Voice: Vapi.ai (managed, no OpenAI Realtime — menos complejidad de orquestación)
- LLM: GPT-4o-mini (balance costo/calidad para v1)
- Adapter swap: solo cambiar `useClass` en `adapters.module.ts`, sin tocar `contacts.service.ts`
- Phase 5: DebtorMemoryService en `src/memory/` con MemoryModule. `Debtor.emotionalProfile` (Json?) como living summary. DebtorHistory interface extendida con livingSummary/overallSentiment/paymentBehavior (opcionales, backward-compatible). parseProfile() helper como defensa contra Json malformado.
- Phase 5 (Wave 2): ConversationAgentService inyecta DebtorMemoryService como 5° param; loadDebtorHistory eliminado; AgentModule importa MemoryModule. Patrón a replicar en ContactsModule (05-03) y WebhooksModule (05-04).
- Phase 5 (Wave 3 — 05-03): ContactsService inyecta DebtorMemoryService como 10° param; loadVoiceCallHistory llama getUnifiedContext y agrega perfil_deudor/sentimiento_previo/comportamiento_pago a Vapi strategy_context.variables; ContactsModule importa MemoryModule. La voz ya no está ciega a otros canales.
- Phase 5 (Wave 4 — 05-04): VapiWebhookHandler inyecta DebtorMemoryService como 7° param; saveTranscript devuelve debtorId (Promise<string | null>); contactId resuelto via findFirst tras updateMany; refreshMemory llamado en try/catch tras cada transcript guardado — sentimentScore y emotionalProfile activos. WebhooksModule importa MemoryModule.
- Phase 6 (Wave 1 — 06-01): reply_to ya existía en SendEmailTemplateInput del port; faltaba pasarlo en EmailAdapter. Conditional spread ...(input.reply_to ? { reply_to: { email } } : {}) garantiza que la clave esté completamente ausente del JSON cuando es falsy (SendGrid v3 rechaza reply_to: undefined). global.fetch mock en spec restaurado en afterEach para evitar leak.
- Phase 6 (Wave 1 — 06-02): SendgridInboundHandler replica patrón twilio-wa-webhook.handler.ts para email. NoFilesInterceptor activa multer para multipart/form-data sin dep nueva. Record<string,string> evita forbidNonWhitelisted. Loop prevention: Auto-Submitted, X-Autoreply, from @reply.fogging.org. Opt-out en español con regex. cleanEmailBody corta texto citado con heurística de línea. phone reutilizado para email address en payload Kafka (compatibilidad InboundMessagePayload).
- Phase 6 (Wave 2 — 06-03): ConversationAgentService generalizado a multi-canal. EmailAdapter inyectado como 6 param del constructor. channel?: "whatsapp" | "email" en InboundMessagePayload (default whatsapp). Discriminacion de adapter por canal: email llama email.sendTemplate con reply_to fijo a reply@reply.fogging.org; whatsapp default intacto. Outbound message guardado con channel dinámico. applyIntent recibe ContactChannel como ctx.channel; opt_out y Kafka publishes usan ctx.channel (Ley 1266 compliance). ContactChannel importado de @cobrai/db para tipado fuerte. 13 tests pasan (10 existentes + 3 nuevos: email discrimina, whatsapp default discrimina, opt_out email revoca consent email).
- Phase 6 (Wave 3 — 06-04): KafkaConsumerService suscrito a cobrai.email.message_received. Case email en dispatch() idéntico al case whatsapp — payload pasa as-is (channel: "email" ya viene del SendgridInboundHandler). Spec nuevo (kafka.consumer.spec.ts): test dispatch email + anti-regresión whatsapp. 95/95 tests pasan. Lazo email bidireccional completo.
