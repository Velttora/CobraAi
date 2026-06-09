# Phase 5: Memoria Unificada del Deudor - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Source:** Diseño acordado en conversación (auditoría del estado actual + decisiones de implementación)

<domain>
## Phase Boundary

Esta fase construye un **servicio de memoria unificada del deudor** que recopila, analiza, resume y sirve el histórico cross-canal a los agentes existentes (WhatsApp y voz). NO incluye el canal email bidireccional (eso es Phase 6, que dependerá de esta fase).

**Problema que resuelve (auditoría del estado actual):**
- Las conversaciones viven en **silos por canal**: `conversation.findFirst({ where: { channel } })` crea hilos separados para WhatsApp y voz. No hay vista unificada del deudor.
- **Coherencia asimétrica**: el agente de WhatsApp (`conversation-agent.service.ts loadDebtorHistory`) lee el `summary` de la última llamada, pero la voz (`contacts.service.ts loadVoiceCallHistory`) NO lee los mensajes de WhatsApp — solo usa conteos.
- **Sin análisis**: la columna `contact.sentimentScore` existe pero NUNCA se calcula (queda null). No hay análisis de intención ni de comportamiento de pago sobre el histórico.
- **Resumen incompleto**: el único resumen es el que genera Vapi por llamada. No hay resumen consolidado del deudor ni de las conversaciones de texto.
- **Sin compactación**: el agente solo ve los últimos 20 mensajes; el historial viejo se pierde del contexto.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Servicio central
- Crear `DebtorMemoryService` nuevo en `apps/service-notifications/src/` (módulo propio `memory/` o dentro de `agent/`).
- Cuatro responsabilidades: **recopilar** (cross-canal), **analizar** (LLM), **resumir** (incremental), **servir** (a los agentes).

### Recopilación (cross-canal)
- Leer `contacts` de TODOS los canales del deudor (no filtrar por canal).
- Leer `messages` de TODAS las conversaciones del deudor (unir los silos: buscar todas las `conversation` del deudor, luego sus mensajes, ordenados cronológicamente).
- Leer promesas (`promiseToPay`: pending + broken).
- Leer transcripts/summary de llamadas de voz (ya guardados por `vapi-webhook.handler.ts saveTranscript`).

### Análisis (LLM)
- Usar OpenAI `gpt-4o-mini` (ya configurado: `OPENAI_API_KEY`, `OPENAI_MODEL`).
- Analizar la última interacción → extraer: **sentimiento** (positivo/neutral/negativo/hostil), **intención**, **comportamiento de pago** (cumplidor/moroso/evasivo).
- Persistir `sentimentScore` en el registro `contact` al cerrar cada interacción.
- Si no hay `OPENAI_API_KEY`: degradar con análisis heurístico/neutral (no romper, igual que el patrón fallback existente en `conversation-agent.service.ts`).

### Resumen vivo
- Mantener un "resumen vivo" narrativo del deudor persistido en `Debtor.emotionalProfile` (campo `Json?` HOY SIN USO — confirmado por grep).
- Estructura JSON sugerida: `{ summary, sentiment, lastIntent, paymentBehavior, updatedAt, interactionCount }`.
- Actualización **incremental**: `refreshMemory(tenantId, debtorId)` toma el resumen previo + la nueva interacción y produce el resumen actualizado (evita reprocesar todo el historial cada vez).

### Servir a los agentes
- `getUnifiedContext(tenantId, debtorId)` → objeto consolidado para inyectar en prompts.
- Integrar en:
  - `conversation-agent.service.ts` → reemplaza `loadDebtorHistory` por el contexto unificado (WhatsApp).
  - `contacts.service.ts loadVoiceCallHistory` → usa el contexto unificado (la voz deja de estar ciega al resto de canales).
  - `vapi-webhook.handler.ts` → llama `refreshMemory` tras cada llamada (igual que ya registra promesas).

### Persistencia
- **NO crear tabla nueva ni migración** en esta fase: reutilizar `Debtor.emotionalProfile` (Json) para el resumen vivo. Mantiene el alcance acotado.

### Compatibilidad
- No romper el flujo actual: el agente de WhatsApp debe seguir respondiendo igual; solo cambia la fuente de contexto.
- Mantener el límite de mensajes pero ahora respaldado por el resumen vivo (el resumen cubre el historial viejo que excede la ventana).

### Claude's Discretion
- Nombre exacto del módulo/archivos y su ubicación (memory/ vs agent/).
- Forma exacta del prompt de análisis LLM y del schema de salida.
- Estrategia de degradación sin OpenAI (heurística simple).
- Si el análisis se hace en una sola llamada LLM (análisis + resumen) o dos.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Estado actual de memoria/contexto (a reemplazar/extender)
- `apps/service-notifications/src/agent/conversation-agent.service.ts` — `loadDebtorHistory` (líneas ~282-344): patrón actual de carga de historial WhatsApp + lectura de summary de voz. El nuevo servicio generaliza esto.
- `apps/service-notifications/src/contacts/contacts.service.ts` — `loadVoiceCallHistory` (líneas ~370-421): historial de voz actual (solo conteos). A reemplazar por contexto unificado.
- `apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts` — `buildSystemPrompt`/`buildHistorySection`: cómo se inyecta el historial en el prompt. El `DebtorHistory` interface es el contrato a extender.
- `apps/service-notifications/src/webhooks/vapi-webhook.handler.ts` — `saveTranscript` + `registerPromiseFromCall`: punto donde tras una llamada se debe llamar `refreshMemory`.

### Modelos de datos
- `packages/db/prisma/schema.prisma` — modelos `Debtor` (campo `emotionalProfile Json?`, `bestChannel`), `Conversation` (channel, debtorId), `Message` (conversationId, direction, content), `Contact` (sentimentScore, outcome), `PromiseToPay`.

### Patrón de integración OpenAI (a replicar)
- `apps/service-notifications/src/agent/conversation-agent.service.ts` — constructor con `OpenAI` opcional + fallback cuando no hay API key. El análisis del nuevo servicio debe seguir este patrón de degradación.

### Módulos (DI NestJS)
- `apps/service-notifications/src/agent/agent.module.ts` y `contacts.module.ts` — cómo se inyectan servicios; el nuevo `DebtorMemoryService` debe exportarse e importarse donde se consuma.
</canonical_refs>

<specifics>
## Specific Ideas

- El resumen vivo es la pieza que más impacta la coherencia: una "ficha viva" del deudor que cualquier canal lee antes de comunicarse y actualiza después.
- La voz hoy es el caso más ciego — al integrarla con `getUnifiedContext`, una llamada podrá referirse a lo que el deudor dijo por WhatsApp y viceversa.
- El KPI "sentimiento promedio" de la Phase 4 (Dashboard) depende de que `sentimentScore` se empiece a calcular aquí.
</specifics>

<deferred>
## Deferred Ideas

- **Email bidireccional con agente** → Phase 6 (usará `getUnifiedContext` de esta fase).
- **Tabla dedicada de memoria** (en vez de `emotionalProfile` Json) → si se necesita más estructura/consulta a futuro.
- **Compactación avanzada / embeddings** del historial → futuro; por ahora el resumen vivo narrativo es suficiente.
</deferred>

---

*Phase: 05-memoria-unificada-del-deudor*
*Context gathered: 2026-06-08 (diseño acordado en conversación)*
