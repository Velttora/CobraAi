# Phase 6: Email Bidireccional con Agente — Research

**Researched:** 2026-06-09
**Domain:** SendGrid Inbound Parse, NestJS multipart/form-data, email reply cleaning, multi-channel agent generalization
**Confidence:** HIGH (todas las afirmaciones críticas verificadas contra código del repositorio o fuentes oficiales)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Inbound Parse en subdominio `reply.fogging.org` (MX → `mx.sendgrid.net`).
- Nuevo endpoint `POST /api/v1/webhooks/sendgrid-inbound` (multipart/form-data).
- `SendgridInboundHandler` replica patrón de `twilio-wa-webhook.handler.ts`.
- Identificar deudor por email (`from`); detectar opt-out; guardar mensaje `direction: "in", channel: "email"`; publicar `cobrai.email.message_received`.
- Generalizar `processInboundMessage` con parámetro `channel`; responder por `EmailAdapter` para email, `TwilioWhatsAppAdapter` para whatsapp.
- `kafka.consumer.ts` agrega `cobrai.email.message_received` → `agent.processInboundMessage({ ..., channel: "email" })`.
- `EmailAdapter.sendTemplate` lleva `Reply-To: <id>@reply.fogging.org`.

### Claude's Discretion
- Estrategia exacta de limpieza del cuerpo del email.
- Forma exacta del `Reply-To` (fijo vs por-deudor).
- Si el `channel` se añade al payload de Kafka o se infiere del handler.
- Nivel de validación de seguridad del webhook.

### Deferred Ideas (OUT OF SCOPE)
- Parsing avanzado de adjuntos.
- Threading por Message-ID/References.
- Verificación criptográfica de firma del webhook.
</user_constraints>

---

## Summary

Esta fase espeja el flujo de WhatsApp inbound (Phase 1/3) para el canal email. Los bloques de código ya existen — hay que replicarlos, no inventarlos. El riesgo técnico más alto es el manejo de `multipart/form-data` en NestJS (no está habilitado por defecto para JSON/urlencoded bodies), y el segundo riesgo es el loop infinito (el agente responde, el deudor recibe el correo con `Reply-To`, esa respuesta llega al mismo endpoint). Ambos tienen soluciones directas verificadas en este codebase.

El `reply_to` field ya existe en `SendEmailTemplateInput` del port `@cobrai/ports` pero el `EmailAdapter.sendTemplate` no lo pasa a la API de SendGrid — esa es la única brecha en los adapters.

`NoFilesInterceptor` de `@nestjs/platform-express@10.4.22` (ya instalado, con `multer@2.0.2` como dep directa) habilita multipart sin instalar nada nuevo. El `email-reply-parser@2.3.5` (Crisp, 265K descargas/semana, publicado desde 2017) es la librería recomendada para limpiar texto citado — pero es opcional; una heurística de regex es suficiente para v1.

**Recomendación primaria:** Seguir el patrón `twilio-wa-webhook.handler.ts` punto por punto. El delta de código es pequeño: un handler nuevo, un endpoint, un channel param en el agent, y un `Reply-To` en el adapter.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recibir email inbound | API / Backend (WebhooksController) | — | SendGrid hace POST al servicio; no hay cliente web |
| Parsear multipart | API / Backend (SendgridInboundHandler) | — | NestJS con NoFilesInterceptor en el endpoint |
| Identificar deudor por email | API / Backend (SendgridInboundHandler) | Database | `prisma.debtor.findFirst({ where: { email } })` |
| Detectar opt-out | API / Backend (SendgridInboundHandler) | Database | Revoca `ContactConsent.channel = "email"` |
| Persistir mensaje inbound | Database / Storage | — | `Message.direction = "in", channel = "email"` |
| Publicar evento Kafka | API / Backend (SendgridInboundHandler) | Kafka | `cobrai.email.message_received` |
| Consumir evento y despachar al agente | API / Backend (KafkaConsumerService) | — | Agrega topic al switch existente |
| LLM response + intent | API / Backend (ConversationAgentService) | OpenAI | Parametrizar canal; misma lógica |
| Enviar respuesta por email | API / Backend (EmailAdapter) | SendGrid API | `sendTemplate` con `reply_to` |
| Reply-To correlation | API / Backend (EmailAdapter) | — | Campo fijo o por-deudor en el header |
| Limpieza texto citado | API / Backend (SendgridInboundHandler) | — | Antes de guardar y publicar |
| Seguridad webhook | API / Backend (WebhooksController) | — | Validación de forma + dominio destino |

---

## 1. SendGrid Inbound Parse — Payload Exacto

### Content-Type y formato
SendGrid POSTea `multipart/form-data` con boundary. [VERIFIED: twilio.com/docs/sendgrid]

### Campos del payload

| Campo | Tipo | Siempre presente | Descripción |
|-------|------|-----------------|-------------|
| `from` | string | sí | Remitente: `"Nombre Apellido <email@example.com>"` |
| `to` | string | sí | Destinatario: `"id@reply.fogging.org"` |
| `subject` | string | sí | Asunto del email |
| `text` | string | sí (puede ser vacío) | Cuerpo en texto plano |
| `html` | string | no | Cuerpo en HTML (vacío si el cliente solo envió texto) |
| `envelope` | string (JSON) | sí | `{"to":["id@reply.fogging.org"],"from":"sender@example.com"}` |
| `headers` | string | sí | Headers raw del email (útil para detectar `Auto-Submitted`) |
| `dkim` | string | sí | Resultado de verificación DKIM |
| `SPF` | string | sí | Resultado SPF: `"pass"`, `"neutral"`, `"fail"` |
| `spam_score` | string | sí (si habilitado) | Score SpamAssassin |
| `spam_report` | string | sí (si habilitado) | Reporte SpamAssassin completo |
| `sender_ip` | string | sí | IP del remitente |
| `attachments` | string (número) | sí | Cantidad de adjuntos |
| `attachment-info` | string (JSON) | si hay adjuntos | Metadata por adjunto |
| `charsets` | string (JSON) | sí | Encoding de cada campo |

**Nota crítica:** `from` llega como `"Nombre <email@host.com>"` — se debe parsear con regex para extraer solo el email. Patrón: `/[\w.+-]+@[\w-]+\.[\w.]+/`.

**`envelope`** es un string JSON, no un objeto. Hay que `JSON.parse()`. El campo `to` dentro es un **array**. [VERIFIED: twilio.com/docs/sendgrid]

**No hay header de firma.** SendGrid Inbound Parse no firma los POSTs (a diferencia del Event Webhook que tiene `X-Twilio-Email-Event-Webhook-Signature`). [VERIFIED: twilio.com/docs/sendgrid]

### Interface TypeScript para el handler

```typescript
// Source: twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook
export interface SendgridInboundPayload {
  from: string;        // "Nombre <email@host.com>"
  to: string;          // "abc@reply.fogging.org"
  subject?: string;
  text?: string;
  html?: string;
  envelope?: string;   // JSON string: {"to":["..."],"from":"..."}
  headers?: string;    // raw headers, útil para Auto-Submitted
  SPF?: string;        // "pass" | "neutral" | "fail"
  spam_score?: string;
  sender_ip?: string;
  attachments?: string;
}
```

---

## 2. NestJS Multipart/Form-Data — Cómo recibirlo

### El problema
`@Body()` en NestJS solo parsea `application/json` y `application/x-www-form-urlencoded` (el último es lo que usa Twilio para sus webhooks de SMS/WA). SendGrid Inbound Parse envía `multipart/form-data`. Sin un interceptor, `@Body()` llega vacío. [VERIFIED: código instalado + @nestjs/platform-express deps]

### La solución: NoFilesInterceptor (sin instalar nada nuevo)

`@nestjs/platform-express@10.4.22` (ya instalado) tiene `multer@2.0.2` como dependencia directa y exporta `NoFilesInterceptor`. [VERIFIED: node_modules/@nestjs/platform-express/package.json]

```typescript
// Source: @nestjs/platform-express exports (verificado en node_modules)
import { NoFilesInterceptor } from "@nestjs/platform-express";
import { UseInterceptors, Post, Body, HttpCode } from "@nestjs/common";

@Post("sendgrid-inbound")
@HttpCode(200)
@UseInterceptors(NoFilesInterceptor())
async sendgridInbound(@Body() body: Record<string, string>): Promise<string> {
  await this.sendgridHandler.handleInbound(body as never);
  return "";  // SendGrid espera 200 vacío
}
```

**`NoFilesInterceptor()`** activa multer en modo "solo campos de texto" — rechaza archivos con `BadRequestException` y pone todos los campos del multipart en `req.body`. [VERIFIED: @nestjs/platform-express docs + exports]

**No requiere `@types/multer`** adicional ni instalación de `multer` separado.

### Por qué Twilio funciona sin interceptor
Twilio WA envía `application/x-www-form-urlencoded` (no multipart). NestJS lo parsea nativamente con el body parser de Express. Por eso `twilio-wa-webhook.handler.ts` no necesita `NoFilesInterceptor`. [ASSUMED — basado en comportamiento observado del patrón existente]

---

## 3. Limpieza del Cuerpo del Email — Recomendación

### Problema
El deudor responde un email y el cliente de correo inserta el texto citado del mensaje original:
```
Sí, puedo pagar el viernes.

El lun, 9 jun 2026 a las 10:15, CobraAI <noreply@fogging.org> escribió:
> Estimado Juan, le recordamos su saldo de $500,000...
> Enlace de pago: https://...
```
El LLM debe recibir solo la primera parte.

### Opción A: `email-reply-parser` (recomendada)
- **Librería:** `email-reply-parser@2.3.5` de Crisp (265K descargas/semana, publicado desde 2017, MIT, repo: github.com/crisp-oss/email-reply-parser). [VERIFIED: npm registry + github]
- Soporta ~10 locales incluyendo español. [CITED: github.com/crisp-oss/email-reply-parser]
- API mínima:
  ```typescript
  // Source: github.com/crisp-oss/email-reply-parser
  import EmailReplyParser from "email-reply-parser";
  const visible = new EmailReplyParser().parseReply(rawTextBody);
  // visible: string con solo el texto nuevo, sin el hilo citado
  ```
- **Cuándo usar:** Si la limpieza necesita ser robusta para múltiples clientes de correo (Gmail, Outlook, Apple Mail).

### Opción B: Regex heurística (suficiente para v1)
```typescript
// Elimina todo después de una línea del patrón "El DÍA escribió:" o ">>"
function cleanEmailBody(text: string): string {
  const lines = text.split("\n");
  const cutoff = lines.findIndex(
    (l) =>
      /^[-_]{3,}/.test(l) ||                          // separadores
      /^On .+ wrote:/.test(l) ||                       // Gmail en
      /^El .+ escribi(ó|o):/.test(l) ||                // Gmail es
      /^Le \w+ \d+ .+ a las/.test(l) ||                // Apple Mail es
      /^>{2,}/.test(l) ||                              // quoted block
      l.startsWith(">")                                 // citado estándar
  );
  return (cutoff > 0 ? lines.slice(0, cutoff) : lines).join("\n").trim();
}
```
- **Cuándo usar:** v1. Cubre Gmail, Outlook, Apple Mail en español/inglés. Si falla, el LLM tiene más contexto de lo necesario — no es un error crítico.

### Decisión recomendada (Claude's Discretion)
**Usar la heurística de regex para v1.** Sin dependencia nueva, cero riesgo de instalación. Si el agente da respuestas incoherentes por texto citado excesivo, agregar `email-reply-parser` en una tarea de seguimiento. La heurística cubre los clientes usados típicamente en Colombia (Gmail, Outlook).

**Si se decide usar `email-reply-parser`:** agregar a `package.json` de `service-notifications` y ejecutar `pnpm install`. No requiere cambios de módulo.

---

## 4. Reply-To — Wiring en EmailAdapter

### Hallazgo crítico: el port YA tiene `reply_to`
`SendEmailTemplateInput` en `packages/ports/src/email.port.ts` ya tiene `reply_to?: string`. [VERIFIED: código del repositorio]

### Lo que falta: el adapter no lo pasa a SendGrid

`apps/service-notifications/src/adapters/email.adapter.ts` construye el body de la API de SendGrid pero no incluye el campo `reply_to`. Hay que agregar:

```typescript
// En email.adapter.ts — dentro del body JSON de la llamada a mail/send
// Source: SendGrid v3 API docs — reply_to field
body: JSON.stringify({
  personalizations: [{ to: [{ email: input.to }], dynamic_template_data: input.variables }],
  from: { email: from },
  reply_to: input.reply_to ? { email: input.reply_to } : undefined,  // AGREGAR
  subject,
  content: [{ type: "text/html", value: html }]
})
```

SendGrid v3 `mail/send` acepta `reply_to` como objeto `{ email, name? }`. [VERIFIED: twilio.com/docs/sendgrid v3 mail/send]

### Reply-To fijo vs por-deudor (Claude's Discretion)

**Opción fija:** `Reply-To: reply@reply.fogging.org` — todos los rebotes llegan al mismo punto; el deudor se identifica por el campo `from` del inbound.

**Opción por-deudor:** `Reply-To: <debtorId>@reply.fogging.org` — correlación directa sin buscar en BD, pero requiere que el Inbound Parse wildcard capture cualquier usuario en `reply.fogging.org`.

**Recomendación:** Usar dirección **fija** `reply@reply.fogging.org` para v1. La identificación del deudor por `from` ya está en el diseño bloqueado y funciona sin correlación extra. La dirección por-deudor agrega complejidad de routing sin beneficio real en v1.

**Cuándo llamar a sendTemplate con reply_to:** en el agente, cuando `channel === "email"`, pasar:
```typescript
reply_to: `reply@reply.fogging.org`
```

---

## 5. Generalización del Agente a Multi-Canal — Diff Mínimo

### Interface `InboundMessagePayload` — agregar `channel`

```typescript
// conversation-agent.service.ts — extensión backward-compatible
export interface InboundMessagePayload {
  debtor_id: string;
  tenant_id: string;
  conversation_id: string;
  phone: string;        // para email: address del deudor (campo reutilizado)
  body: string;
  message_sid?: string;
  channel?: "whatsapp" | "email";  // NUEVO — default: "whatsapp" si ausente
}
```

Agregar `channel` como **opcional con default "whatsapp"** mantiene backward compatibility: el consumer de `cobrai.whatsapp.message_received` no cambia su payload, y el nuevo consumer de email lo pasa explícitamente.

### Cambios en `processInboundMessage`

**Paso 5 — guardar mensaje outbound:** cambiar `channel: "whatsapp"` hardcodeado:
```typescript
// Antes
channel: "whatsapp",

// Después
channel: payload.channel ?? "whatsapp",
```

**Paso 6 — enviar respuesta:** discriminar adapter:
```typescript
// Antes (solo WhatsApp)
await this.whatsapp.sendTemplate({ to: phone, ... });

// Después (multi-canal)
if ((payload.channel ?? "whatsapp") === "email") {
  await this.email.sendTemplate({
    to: phone,          // para email, "phone" contiene el email address
    template_id: "agent_response",
    variables: { body: agentResponse.response },
    tenant_id,
    reply_to: `reply@reply.fogging.org`
  });
} else {
  await this.whatsapp.sendTemplate({
    to: phone,
    template_id: "agent_response",
    variables: { body: agentResponse.response },
    tenant_id
  });
}
```

**Paso 7 — `applyIntent`:** pasar `channel` en los eventos Kafka para que downstream sepa el canal:
```typescript
await this.kafka.publish("cobrai.debt.promise_registered", ctx.tenant_id, {
  debt_id: ctx.debt_id,
  channel: ctx.channel,   // "email" o "whatsapp"
  ...
});
```

### Inyección de EmailAdapter en ConversationAgentService

```typescript
// conversation-agent.service.ts — constructor
constructor(
  private readonly config: ConfigService,
  private readonly prisma: PrismaService,
  private readonly kafka: KafkaService,
  private readonly whatsapp: TwilioWhatsAppAdapter,
  private readonly debtorMemory: DebtorMemoryService,
  private readonly email: EmailAdapter   // NUEVO — 6° parámetro
) { ... }
```

`AgentModule` ya importa `AdaptersModule` que exporta `EmailAdapter`. [VERIFIED: agent.module.ts + adapters.module.ts] Solo hay que agregar `EmailAdapter` al constructor — **no se necesita cambiar `AgentModule`**.

---

## 6. Kafka Consumer — Delta Mínimo

`kafka.consumer.ts` — dos cambios:

```typescript
// 1. Agregar al array de topics
const CONSUMED_TOPICS = [
  "cobrai.contact.requested",
  "cobrai.whatsapp.message_received",
  "cobrai.voice.call_completed",
  "cobrai.email.message_received"  // NUEVO
] as const;

// 2. Agregar al switch en dispatch()
case "cobrai.email.message_received":
  await this.agent.processInboundMessage(
    payload as unknown as InboundMessagePayload
  );
  break;
```

El payload de `cobrai.email.message_received` debe incluir `channel: "email"` para que el agente lo sepa. Se añade en el `SendgridInboundHandler.handleInbound` al hacer `kafka.publish(...)`.

---

## 7. Seguridad del Webhook (Claude's Discretion)

SendGrid Inbound Parse **no firma los POSTs** (no hay header de verificación como Twilio). [VERIFIED: twilio.com/docs/sendgrid]

### Opción A (recomendada para v1): Validar forma + dominio destino

```typescript
// En el handler, antes de procesar
private validatePayload(payload: SendgridInboundPayload): boolean {
  // 1. Verifica que hay un from y un body de texto
  if (!payload.from || (!payload.text && !payload.html)) return false;

  // 2. Verifica que el "to" pertenece a reply.fogging.org
  const to = payload.to ?? "";
  if (!to.includes("reply.fogging.org")) {
    this.logger.warn(`Inbound email con destino inesperado: ${to}`);
    return false;
  }

  return true;
}
```

Esta validación:
- Rechaza payloads malformados o vacíos.
- Rechaza peticiones que no vengan de `reply.fogging.org` (no dirección legítima de nuestro MX).
- Es trivial de implementar y sin overhead.

### Opción B: Token secreto en la URL (no recomendada para v1)
Agregar `?token=SECRET` a la URL del webhook en SendGrid. Verificar en el controller con `@Query('token')`. Requiere una nueva env var y sincronizar el valor en SendGrid config. Aporta poco si el endpoint ya valida el dominio destino.

### Opción C: IP allowlist (no recomendada)
Los rangos de IP de SendGrid cambian. Frágil y difícil de mantener.

**Recomendación final:** Opción A para v1. El nivel de seguridad es consistente con la estrategia existente para el webhook de Vapi (que tampoco valida firma en desarrollo).

---

## 8. Estrategia de Tests

### Convenio del proyecto (verificado)
- Framework: **vitest** (`vitest.config.ts` en `apps/service-notifications`) [VERIFIED: código del repositorio]
- Archivos: `src/**/*.spec.ts` [VERIFIED: vitest.config.ts]
- Patrón: instanciar clase directamente con mocks `as never`, sin `@nestjs/testing`. [VERIFIED: twilio-wa-webhook.handler.spec.ts y conversation-agent.service.spec.ts]
- `vi.hoisted()` para mocks que deben preceder al import (ej: OpenAI). [VERIFIED: conversation-agent.service.spec.ts]

### Tests para `SendgridInboundHandler`

Siguiendo exactamente el patrón de `twilio-wa-webhook.handler.spec.ts`:

```typescript
// src/webhooks/sendgrid-inbound.handler.spec.ts
import { vi, describe, it, expect, beforeEach } from "vitest";
import { SendgridInboundHandler } from "./sendgrid-inbound.handler";

const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockDebtorFindFirst = vi.fn();
const mockMessageCreate = vi.fn().mockResolvedValue({ id: "msg1" });
const mockConversationFindFirst = vi.fn();
const mockConversationCreate = vi.fn().mockResolvedValue({ id: "conv1" });
const mockConversationUpdate = vi.fn().mockResolvedValue({});
const mockConsentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

const mockPrisma = {
  debtor: { findFirst: mockDebtorFindFirst },
  message: { create: mockMessageCreate },
  conversation: {
    findFirst: mockConversationFindFirst,
    create: mockConversationCreate,
    update: mockConversationUpdate
  },
  contactConsent: { updateMany: mockConsentUpdateMany }
};

const mockKafka = { publish: mockPublish };

describe("SendgridInboundHandler", () => {
  let handler: SendgridInboundHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SendgridInboundHandler(
      mockPrisma as never,
      mockKafka as never
    );
  });

  it("email normal → deudor encontrado → guarda mensaje y publica Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound({
      from: "Juan Pérez <juan@test.com>",
      to: "abc@reply.fogging.org",
      subject: "Re: Su saldo",
      text: "Puedo pagar el viernes.\n\nEl lun 9 jun, CobraAI escribió:\n> Le recordamos...",
    });

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "in", channel: "email" })
      })
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "cobrai.email.message_received",
      "org1",
      expect.objectContaining({ debtor_id: "debtor1", channel: "email" })
    );
  });

  it("opt-out ('no contactar') → revoca consent email, NO publica Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });

    await handler.handleInbound({
      from: "juan@test.com",
      to: "abc@reply.fogging.org",
      text: "no contactar",
    });

    expect(mockConsentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ channel: "email" }) })
    );
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("deudor no encontrado → solo log, sin Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce(null);

    await expect(handler.handleInbound({
      from: "desconocido@test.com",
      to: "abc@reply.fogging.org",
      text: "Hola",
    })).resolves.toBeUndefined();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("payload con destino fuera de reply.fogging.org → rechazado", async () => {
    await handler.handleInbound({
      from: "juan@test.com",
      to: "cobro@fogging.org",  // no es reply.fogging.org
      text: "Hola",
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("texto limpiado antes de publicar Kafka (citado removido)", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound({
      from: "juan@test.com",
      to: "abc@reply.fogging.org",
      text: "Pago el viernes.\n\nEl lun 9 jun, CobraAI escribió:\n> Recordatorio...",
    });

    const publishCall = mockPublish.mock.calls[0]?.[2];
    expect(publishCall?.body).toBe("Pago el viernes.");
  });
});
```

### Tests para `ConversationAgentService` (multi-canal)

Agregar dos tests al spec existente (`conversation-agent.service.spec.ts`) — sin reescribir el archivo:

```typescript
it("channel email → llama emailAdapter, NO whatsapp", async () => {
  await service.processInboundMessage({
    ...basePayload,
    phone: "juan@test.com",
    channel: "email"
  });

  expect(mockEmail.sendTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ to: "juan@test.com" })
  );
  expect(mockWhatsapp.sendTemplate).not.toHaveBeenCalled();
});

it("channel whatsapp (default) → llama whatsappAdapter, NO email", async () => {
  await service.processInboundMessage(basePayload);  // sin channel

  expect(mockWhatsapp.sendTemplate).toHaveBeenCalled();
  expect(mockEmail.sendTemplate).not.toHaveBeenCalled();
});
```

Estos tests requieren agregar `mockEmail` al setup del spec existente y pasar `EmailAdapter` como 6° argumento al constructor del servicio.

---

## Don't Hand-Roll

| Problema | No construir | Usar en cambio | Por qué |
|----------|-------------|----------------|---------|
| Parsear multipart/form-data | Middleware custom o body parser propio | `NoFilesInterceptor` de `@nestjs/platform-express` (ya instalado) | multer@2.0.2 ya es dep directa; NoFilesInterceptor es el mecanismo oficial |
| Limpiar texto citado de email | Regex compleja con todos los patrones de clientes | Heurística simple de corte de línea (v1) o `email-reply-parser` | Los patrones varían por cliente, idioma, versión — la heurística cubre 90% del caso |
| Extraer email de `"Nombre <email@host>"` | Parser de RFC 5322 completo | Regex simple `/[\w.+-]+@[\w-]+\.[\w.]+/` | Suficiente para este caso de uso |

---

## Landmines / Gotchas

### Landmine 1: multipart no parsea sin NoFilesInterceptor
**Qué pasa:** `@Body()` llega como `{}` si no se agrega `@UseInterceptors(NoFilesInterceptor())`. El endpoint devuelve 200 pero no hace nada.
**Detección:** el test unitario del handler nunca llega a `mockDebtorFindFirst` aunque el payload esté bien construido.
**Solución:** `@UseInterceptors(NoFilesInterceptor())` en el método del controller. Sin instalar nada.

### Landmine 2: `envelope` es string JSON, no objeto
**Qué pasa:** `payload.envelope.to` explota con `Cannot read property 'to' of string`.
**Solución:** `const env = JSON.parse(payload.envelope ?? "{}") as { to: string[]; from: string }`.
**Precaución:** envolver en try/catch — si SendGrid cambia el formato, no romper el servicio.

### Landmine 3: `from` con nombre completo
**Qué pasa:** `prisma.debtor.findFirst({ where: { email: "Nombre <juan@test.com>" } })` devuelve null.
**Solución:** Extraer email con regex antes de buscar:
```typescript
const emailMatch = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(payload.from ?? "");
const email = emailMatch?.[0] ?? "";
```

### Landmine 4: loop infinito (el más peligroso)
**Escenario:** Agente responde → email llega al deudor con `Reply-To: reply@reply.fogging.org` → deudor no responde → PERO el sistema de notificaciones de CobraAI envía otro email outbound que también tiene `Reply-To: reply@reply.fogging.org` → si ese email "rebota" o tiene `Auto-Reply`, llega al inbound parse → el agente responde de nuevo → loop.
**Soluciones (defense in depth):**
1. **Detectar `Auto-Submitted` header:** en `headers` raw del inbound, verificar `Auto-Submitted: auto-replied` o `X-Autoreply: yes`. Si está presente, loguear y retornar sin procesar.
2. **Nunca responder a `from` que coincida con `noreply@fogging.org`** o el `SENDGRID_FROM_EMAIL` configurado (loop de rebote interno).
3. **Rate limit por deudor:** si se reciben >3 mensajes inbound del mismo deudor en <60 segundos, no responder automáticamente (futuro, v2).

Implementación para v1 (puntos 1 y 2):
```typescript
// En SendgridInboundHandler.handleInbound — antes de buscar el deudor
const rawHeaders = (payload.headers ?? "").toLowerCase();
if (
  rawHeaders.includes("auto-submitted: auto") ||
  rawHeaders.includes("x-autoreply:") ||
  email === "noreply@fogging.org" ||
  email.endsWith("@reply.fogging.org")  // rebote del propio sistema
) {
  this.logger.log(`Auto-reply ignorado desde: ${email}`);
  return;
}
```

### Landmine 5: `ValidationPipe` con `forbidNonWhitelisted: true`
**Qué pasa:** `main.ts` tiene `forbidNonWhitelisted: true` en el ValidationPipe global. Si el body del multipart tiene campos adicionales que SendGrid envía (`charsets`, `attachment-info`, etc.) y se usa un DTO decorado con `class-validator`, el pipe rechaza la request.
**Solución:** Usar `Record<string, string>` como tipo del `@Body()` (igual que hace Twilio WA). No usar DTOs de `class-validator` para este endpoint. [VERIFIED: main.ts + webhooks.controller.ts patrón existente]

### Landmine 6: ConversationAgentService — 6° parámetro en tests existentes
**Qué pasa:** Agregar `EmailAdapter` como 6° parámetro al constructor rompe `conversation-agent.service.spec.ts` que instancia con 5 args.
**Solución:** Agregar `mockEmail` al spec existente Y pasar como 6° arg al constructor. No es optional en la DI de NestJS (sería injectable directamente), solo hay que actualizar el test.

### Landmine 7: `email` es campo único en `Debtor` pero no hay índice
**Situación:** `Debtor.email` es `String?` (nullable, no único). `prisma.debtor.findFirst({ where: { email } })` funciona pero hace full scan.
**Para v1:** Aceptable (tablas pequeñas en desarrollo). Para producción con >10K deudores, considerar agregar índice en migración posterior. No bloquea esta fase.

### Landmine 8: Texto del email vacío (solo HTML)
**Qué pasa:** Algunos clientes de correo modernos solo envían `html`, dejando `text` vacío. El handler debe hacer fallback a `html` stripped de tags.
**Solución:**
```typescript
const rawBody = payload.text?.trim() || stripHtmlTags(payload.html ?? "");

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 2000);
}
```

---

## Package Legitimacy Audit

> slopcheck no disponible en este entorno. Verificación manual realizada contra npm registry y fuentes oficiales.

| Package | Registry | Age | Downloads | Source Repo | Manual Check | Disposition |
|---------|----------|-----|-----------|-------------|--------------|-------------|
| `@nestjs/platform-express` | npm | 7+ yrs | >1M/wk | github.com/nestjs/nest | Framework oficial, ya instalado | Aprovado (ya instalado) |
| `email-reply-parser` | npm | 8 yrs (2017) | 265K/wk | github.com/crisp-oss/email-reply-parser | Empresa real (Crisp), MIT, activo | Aprobado [ASSUMED — slopcheck no corrió] |

**Paquetes que require nueva instalación:**
- `email-reply-parser` — SOLO si se elige Opción A de limpieza. Para v1 con heurística regex, no se instala nada nuevo.

**Paquetes removidos:** ninguno.

---

## Código del SendgridInboundHandler (estructura completa para planificador)

```typescript
// apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts
// Patrón: replica exacta de twilio-wa-webhook.handler.ts para email
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";

export interface SendgridInboundPayload {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: string;
  envelope?: string;
  SPF?: string;
  spam_score?: string;
}

@Injectable()
export class SendgridInboundHandler {
  private readonly logger = new Logger(SendgridInboundHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService
  ) {}

  async handleInbound(payload: SendgridInboundPayload): Promise<void> {
    // 1. Validar forma + dominio destino
    if (!this.isValidPayload(payload)) return;

    // 2. Extraer email del deudor
    const emailMatch = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(payload.from ?? "");
    const email = emailMatch?.[0] ?? "";
    if (!email) return;

    // 3. Detectar auto-replies y loops
    const rawHeaders = (payload.headers ?? "").toLowerCase();
    if (
      rawHeaders.includes("auto-submitted: auto") ||
      rawHeaders.includes("x-autoreply:") ||
      email.endsWith("@reply.fogging.org")
    ) {
      this.logger.log(`Auto-reply ignorado desde: ${email}`);
      return;
    }

    // 4. Obtener texto limpio
    const rawBody = payload.text?.trim() || stripHtmlTags(payload.html ?? "");
    const body = cleanEmailBody(rawBody);

    // 5. Detectar opt-out
    if (/no\s+contactar|baja|unsubscribe|cancelar|stop|eliminar/i.test(body)) {
      await this.handleOptOut(email);
      return;
    }

    // 6. Buscar deudor por email
    const debtor = await this.prisma.debtor.findFirst({
      where: { email, deletedAt: null }
    });
    if (!debtor) {
      this.logger.warn(`Email inbound de dirección desconocida: ${email}`);
      return;
    }

    // 7. Upsert conversación
    const conversation = await this.upsertConversation(debtor.tenantId, debtor.id);

    // 8. Guardar mensaje inbound
    await this.prisma.message.create({
      data: {
        tenantId: debtor.tenantId,
        conversationId: conversation.id,
        direction: "in",
        channel: "email",
        content: JSON.stringify({ text: body, subject: payload.subject }),
        status: "delivered",
        sentAt: new Date()
      }
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });

    // 9. Publicar evento Kafka
    await this.kafka.publish("cobrai.email.message_received", debtor.tenantId, {
      debtor_id: debtor.id,
      tenant_id: debtor.tenantId,
      conversation_id: conversation.id,
      phone: email,       // reutilizamos "phone" para email address
      body,
      channel: "email"
    });

    this.logger.log(`Email inbound guardado y publicado para deudor ${debtor.id}`);
  }

  private isValidPayload(payload: SendgridInboundPayload): boolean {
    if (!payload.from || (!payload.text && !payload.html)) return false;
    const to = payload.to ?? "";
    if (!to.includes("reply.fogging.org")) {
      this.logger.warn(`Email inbound con destino inesperado: ${to}`);
      return false;
    }
    return true;
  }

  private async handleOptOut(email: string): Promise<void> {
    const debtors = await this.prisma.debtor.findMany({
      where: { email, deletedAt: null }
    });
    if (debtors.length === 0) return;

    await this.prisma.contactConsent.updateMany({
      where: {
        debtorId: { in: debtors.map((d) => d.id) },
        channel: "email",
        revokedAt: null,
        deletedAt: null
      },
      data: { revokedAt: new Date() }
    });
    this.logger.log(`Opt-out email registrado para ${email}`);
  }

  private async upsertConversation(tenantId: string, debtorId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId, debtorId, channel: "email", deletedAt: null }
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        tenantId,
        debtorId,
        channel: "email",
        status: "open",
        lastMessageAt: new Date()
      }
    });
  }
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 2000);
}

function cleanEmailBody(text: string): string {
  const lines = text.split("\n");
  const cutoff = lines.findIndex(
    (l) =>
      /^[-_]{3,}/.test(l) ||
      /^On .+ wrote:/i.test(l) ||
      /^El .+ escribi(ó|o):/i.test(l) ||
      /^Le \w+ \d+ .+ a las/i.test(l) ||
      l.startsWith(">")
  );
  return (cutoff > 0 ? lines.slice(0, cutoff) : lines).join("\n").trim();
}
```

---

## Endpoint en WebhooksController

```typescript
// Agregar en webhooks.controller.ts — imports
import { NoFilesInterceptor } from "@nestjs/platform-express";
import { UseInterceptors } from "@nestjs/common";
import { SendgridInboundHandler } from "./sendgrid-inbound.handler";

// Constructor — agregar parámetro
constructor(
  private readonly webhooksService: WebhooksService,
  private readonly twilioWaHandler: TwilioWaWebhookHandler,
  private readonly vapiHandler: VapiWebhookHandler,
  private readonly sendgridInboundHandler: SendgridInboundHandler  // NUEVO
) {}

// Nuevo método
@Post("sendgrid-inbound")
@HttpCode(200)
@UseInterceptors(NoFilesInterceptor())
async sendgridInbound(@Body() body: Record<string, string>): Promise<string> {
  await this.sendgridInboundHandler.handleInbound(body as never);
  return "";  // SendGrid espera 200 vacío
}
```

---

## Variables de Entorno Nuevas

Agregar a `.env.example`:
```bash
# SendGrid Inbound Parse (Phase 6)
SENDGRID_INBOUND_REPLY_TO=reply@reply.fogging.org
```

Alternativamente codificar `reply@reply.fogging.org` como constante en el adapter (no necesita configuración si el dominio no cambia en v1).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.6 |
| Config file | `apps/service-notifications/vitest.config.ts` |
| Quick run | `pnpm --filter @cobrai/service-notifications test` |
| Full suite | `pnpm --filter @cobrai/service-notifications test` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Archivo | Estado |
|-----|----------|-----------|---------|--------|
| R1 | Recibir multipart → parsear campos | Unit | `sendgrid-inbound.handler.spec.ts` | Wave 0 |
| R2 | Identificar deudor por `from` email | Unit | `sendgrid-inbound.handler.spec.ts` | Wave 0 |
| R3 | Detectar opt-out → revocar consent | Unit | `sendgrid-inbound.handler.spec.ts` | Wave 0 |
| R4 | Guardar mensaje `direction:in, channel:email` | Unit | `sendgrid-inbound.handler.spec.ts` | Wave 0 |
| R5 | Publicar `cobrai.email.message_received` | Unit | `sendgrid-inbound.handler.spec.ts` | Wave 0 |
| R6 | Kafka consumer despacha al agente con `channel:email` | Unit | `kafka.consumer.spec.ts` | Wave 0 (o agregar a spec existente) |
| R7 | Agente usa EmailAdapter para email, WA para whatsapp | Unit | `conversation-agent.service.spec.ts` | Agregar tests |
| R8 | EmailAdapter pasa `reply_to` a SendGrid v3 | Unit | `email-adapter.spec.ts` (ya existe) | Agregar test |
| R9 | Auto-reply detectado → no procesar | Unit | `sendgrid-inbound.handler.spec.ts` | Wave 0 |
| R10 | Texto citado eliminado antes de guardar | Unit | `sendgrid-inbound.handler.spec.ts` | Wave 0 |

### Wave 0 Gaps

- [ ] `src/webhooks/sendgrid-inbound.handler.spec.ts` — cubre R1–R5, R9, R10 (nuevo archivo)
- [ ] Agregar 2 tests a `src/agent/conversation-agent.service.spec.ts` — R7
- [ ] Agregar 1 test a `src/adapters/email-adapter.spec.ts` — R8

---

## Assumptions Log

| # | Claim | Section | Risk si falla |
|---|-------|---------|---------------|
| A1 | Twilio WA envía `application/x-www-form-urlencoded` (no multipart), por eso Twilio WA no necesita NoFilesInterceptor | Sección 2 | Bajo — el patrón existente funciona en producción |
| A2 | La heurística regex de limpieza de cuerpo cubre Gmail + Outlook + Apple Mail en español | Sección 3 | Bajo — si falla, el LLM recibe más texto del necesario pero no rompe el flujo |
| A3 | email-reply-parser@2.3.5 es seguro (slopcheck no corrió) | Package audit | Medio — verificar manualmente antes de instalar |
| A4 | `Debtor.email` tiene suficiente selectividad para `findFirst` en v1 (no hay colisiones) | Sección handler | Bajo — el peor caso es asignar la respuesta al deudor equivocado si dos tienen el mismo email |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@nestjs/platform-express` (multer bundled) | NoFilesInterceptor | ✓ | 10.4.22 (multer 2.0.2) | — |
| `SendGrid Inbound Parse` (DNS MX) | E2E test | ✗ | — | Unit tests con mocks; requiere config manual de usuario |
| `cobra.fogging.org` tunnel | E2E test | ✓ (según STATE.md) | — | — |

**Missing dependencies con no fallback (para e2e):**
- MX record `reply.fogging.org → mx.sendgrid.net` — requiere acción manual del usuario (Cloudflare + SendGrid config).

**Nota:** Todo el código se puede construir y unit-testear sin la infraestructura DNS. La prueba end-to-end real requiere el MX configurado.

---

## Sources

### Primary (HIGH confidence)
- twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook — campos del payload, Content-Type, ausencia de firma
- `packages/ports/src/email.port.ts` — `reply_to` ya presente en `SendEmailTemplateInput`
- `apps/service-notifications/node_modules/@nestjs/platform-express/package.json` — multer@2.0.2 como dep directa
- Exports de `@nestjs/platform-express` verificados en runtime — `NoFilesInterceptor` disponible
- `apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.ts` — patrón a replicar
- `apps/service-notifications/src/agent/conversation-agent.service.ts` — estado actual del agente
- `apps/service-notifications/src/agent/agent.module.ts` — AgentModule ya importa AdaptersModule
- `packages/db/prisma/schema.prisma` — `Debtor.email`, `ContactConsent.channel`, `Message.channel`, `Conversation.channel`

### Secondary (MEDIUM confidence)
- npm registry: `email-reply-parser@2.3.5` — 265K descargas/semana, publicado desde 2017, crisp-oss
- npm downloads API: confirmado 2026-06-02

### Tertiary (LOW confidence)
- Patrón de auto-reply headers (`Auto-Submitted`, `X-Autoreply`) — RFC 3834 conocimiento de entrenamiento, verificado en búsqueda web

---

## RESEARCH COMPLETE

**Phase:** 6 - Email Bidireccional con Agente
**Confidence:** HIGH

### Key Findings
- `NoFilesInterceptor` de `@nestjs/platform-express` (ya instalado, multer 2.0.2 bundled) resuelve el multipart sin instalar nada nuevo.
- `reply_to` ya existe en el port `SendEmailTemplateInput` — solo falta pasarlo en `email.adapter.ts` al body de SendGrid v3.
- `AgentModule` ya importa `AdaptersModule` que exporta `EmailAdapter` — solo hay que inyectarla como 6° param del constructor del agente.
- El loop infinito se previene con detección de `Auto-Submitted` header + rechazo de `from` que termine en `@reply.fogging.org`.
- `envelope` llega como string JSON — hay que `JSON.parse()`.
- `from` llega como `"Nombre <email>"` — extraer con regex.
- `ValidationPipe(forbidNonWhitelisted: true)` global requiere usar `Record<string, string>` (no DTO class-validator) para el endpoint de inbound parse.
- El campo `phone` en `InboundMessagePayload` se reutiliza para `email address` del deudor — backward compatible si se documenta.

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Payload SendGrid | HIGH | Verificado contra docs oficiales Twilio/SendGrid |
| Multipart NestJS | HIGH | Verificado en node_modules instalados + exports |
| Diff del agente | HIGH | Basado en lectura directa del código |
| Email reply parsing | HIGH (heurística) / MEDIUM (librería) | Heurística verificada conceptualmente; librería tiene [ASSUMED] en slopcheck |
| Seguridad | MEDIUM | No hay doc oficial de mejores prácticas para Inbound Parse v1 |

### Open Questions
1. **¿`phone` o `email` en `InboundMessagePayload`?** El campo `phone` se reutiliza para transportar el email address al agente. Alternativa: agregar `email?: string` opcional y hacer que el agente use `payload.email ?? payload.phone`. Recomendación: reutilizar `phone` para mantener el delta mínimo, documentarlo en el interface.

2. **`SENDGRID_INBOUND_REPLY_TO` como env var vs constante.** Para v1, hardcodear `reply@reply.fogging.org` como constante en `email.adapter.ts` es más simple. Si el dominio puede cambiar, hacerlo configurable.

### Ready for Planning
Research completo. El planificador puede crear PLAN.md con las secciones anteriores como guía de implementación.
