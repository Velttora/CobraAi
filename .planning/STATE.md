# STATE

## Proyecto
CobraAI — WhatsApp & Voice Agent (fases reales post-MVP-core)

## Estado actual
- **Fase activa:** Phase 5 COMPLETA + verificada (gsd-verifier PASSED 14/14). Siguiente: Phase 6 (Email Bidireccional) — por planificar
- **Completadas:** Phases 1, 2, 3, 5
- **Core MVP:** construido por Cursor (portafolios, auth, workflows, email/SMS, pagos, stubs WA/Voice)
- **Post-roadmap:** WhatsApp + Voz (Vapi) + Email (SendGrid, dominio fogging.org autenticado) operativos en local. SMS deshabilitado por flag (sin proveedor CO).
- **Last session:** 2026-06-09 — ejecutado plan 05-04 (Vapi webhook calls refreshMemory after each call — sentimentScore y emotionalProfile se populan desde ahora)

## Fases
| # | Nombre | Estado |
|---|---|---|
| 1 | WhatsApp Real (Twilio WA Business API) | ✅ completa |
| 2 | Voice Agent Real (Vapi.ai) | ✅ completa |
| 3 | LLM Conversational Agent (WA bidireccional) | ✅ completa |
| 4 | Dashboard Conversaciones y Escalaciones | 🔲 pendiente |
| 5 | Memoria Unificada del Deudor | ✅ completa (4/4 planes — sentimentScore + emotionalProfile activos) |
| 6 | Email Bidireccional con Agente | 🔲 pendiente (requiere Phase 5) |

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
