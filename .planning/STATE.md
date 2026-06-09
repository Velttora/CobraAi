# STATE

## Proyecto
CobraAI — WhatsApp & Voice Agent (fases reales post-MVP-core)

## Estado actual
- **Fase activa:** Phase 5 (Memoria Unificada del Deudor) — por planificar
- **Completadas:** Phases 1, 2, 3
- **Core MVP:** construido por Cursor (portafolios, auth, workflows, email/SMS, pagos, stubs WA/Voice)
- **Post-roadmap:** WhatsApp + Voz (Vapi) + Email (SendGrid, dominio fogging.org autenticado) operativos en local. SMS deshabilitado por flag (sin proveedor CO).

## Fases
| # | Nombre | Estado |
|---|---|---|
| 1 | WhatsApp Real (Twilio WA Business API) | ✅ completa |
| 2 | Voice Agent Real (Vapi.ai) | ✅ completa |
| 3 | LLM Conversational Agent (WA bidireccional) | ✅ completa |
| 4 | Dashboard Conversaciones y Escalaciones | 🔲 pendiente |
| 5 | Memoria Unificada del Deudor | 🔲 por planificar |
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
