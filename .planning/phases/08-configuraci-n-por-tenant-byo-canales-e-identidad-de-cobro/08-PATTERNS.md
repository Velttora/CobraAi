# Phase 8: Configuración por Tenant (BYO): canales e identidad de cobro - Pattern Map

**Mapped:** 2026-08-04
**Files analyzed:** ~40 (backend: model/migration/services/adapters/webhooks/gateways; frontend: 4 screens + ~16 components + 1 hook)
**Analogs found:** 34 / 40 (6 have no direct analog — new provisioning/crypto/UI-primitive territory, called out explicitly below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/db/prisma/schema.prisma` (`model TenantIntegration`) | model | CRUD | `model Holiday` (schema.prisma:757-764) | role-match (reference/lookup model shape, not tenant-scoped — see notes) |
| `packages/db/prisma/migrations/*_add_tenant_integration/migration.sql` | migration | batch | `20260714120000_add_holidays/migration.sql` | exact |
| `packages/db/prisma/migrations/*_seed_tenant_integration_from_globals/migration.sql` | migration | batch | `20260714130000_seed_colombia_holidays/migration.sql` | exact |
| `packages/db/prisma/migrations/*_split_payment_gateway_provider_method/migration.sql` | migration | batch | `20260714120000_add_holidays` (schema change) + manual backfill UPDATE (no exact analog — see notes) | role-match |
| `packages/utils/src/crypto/envelope-encryption.ts` | utility | transform | **none** | no analog (confirmed, see below) |
| `apps/service-notifications/src/integrations/tenant-integration.service.ts` | service | CRUD + cache | `resolveFrom()` in `twilio-whatsapp.adapter.ts:83-98` | exact (the decision context explicitly names this the pattern to generalize) |
| `apps/service-notifications/src/integrations/twilio-provisioning.service.ts` | service | request-response (external HTTP) | `vapi-voice.adapter.ts` (axios + Bearer + response mapping) | role-match |
| `apps/service-notifications/src/integrations/sendgrid-provisioning.service.ts` | service | request-response (external HTTP) | `email.adapter.ts:34-56` (raw `fetch` + SendGrid v3 pattern) | exact |
| `apps/service-notifications/src/integrations/vapi-provisioning.service.ts` | service | request-response (external HTTP) | `vapi-voice.adapter.ts:150-199` (axios + Bearer + VapiCallResponse shape) | exact |
| `apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts` (MODIFIED) | service/adapter | request-response | itself (before/after refactor) | exact |
| `apps/service-notifications/src/adapters/email.adapter.ts` (MODIFIED) | service/adapter | request-response | itself + `twilio-whatsapp.adapter.ts`'s per-tenant resolution | exact |
| `apps/service-notifications/src/adapters/vapi-voice.adapter.ts` (MODIFIED) | service/adapter | request-response | itself (only `phoneNumberId` resolution changes, stays platform-keyed) | exact |
| `apps/service-notifications/src/webhooks/integration-webhook-token.guard.ts` | middleware/guard | request-response | `twilio-signature.validator.ts` (standalone validator function) + `webhooks.controller.ts`'s inline `ForbiddenException` check | role-match |
| `apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.ts` (MODIFIED) | controller/handler | event-driven (webhook) | itself — `resolveTenantByToNumber()` (L130-139) replaced by token-guard resolution | exact |
| `apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts` (MODIFIED) | controller/handler | event-driven (webhook) | itself — `isValidPayload()` domain check (L115-123) replaced by token-based tenant resolution, drop `reply.fogging.org` constant | exact |
| `apps/service-notifications/src/webhooks/webhooks.controller.ts` (MODIFIED) | controller | request-response | itself — `twilioWhatsApp()` handler (L42-58) is the exact shape for the new token-routed endpoints | exact |
| `packages/compliance/src/types.ts` (MODIFIED — add `channel_not_configured` to `ContactCheckReason`) | model/types | transform | itself — `holiday` reason already in the union (types.ts:8) | exact |
| `packages/compliance/src/compliance.service.ts` (MODIFIED — new check branch) | service | CRUD | itself — the `isHoliday()` branch in `checkContact`/`isChannelEligible` (compliance.service.ts:66-76, 187-197) | exact |
| `apps/service-payments/src/gateways/stripe.gateway.ts` | service/adapter | request-response (external HTTP/SDK) | `createMercadoPagoCheckout()` private method (`gateway.service.ts:91-144`) | exact |
| `apps/service-payments/src/gateways/wompi.gateway.ts` | service/adapter | request-response | `createConektaCheckout()` private method (`gateway.service.ts:36-89`, raw `fetch`) | exact |
| `apps/service-payments/src/gateways/payu.gateway.ts` | service/adapter | request-response | `createConektaCheckout()` (raw `fetch` pattern) | exact |
| `apps/service-payments/src/gateways/epayco.gateway.ts` | service/adapter | request-response | `createConektaCheckout()` (raw `fetch` pattern) | exact |
| `apps/service-payments/src/gateways/mercadopago.gateway.ts` (extracted from `gateway.service.ts`) | service/adapter | request-response | `createMercadoPagoCheckout()` (`gateway.service.ts:91-144`) | exact (literal extraction) |
| `apps/service-payments/src/gateways/external-link.gateway.ts` | service/adapter | transform (no external call) | `createTransferCheckout()` (`gateway.service.ts:146-155`) | exact |
| `apps/service-payments/src/gateways/gateway.service.ts` (MODIFIED — dispatch by tenant config) | service | request-response | itself — `createCheckout()` dispatcher (L18-34) | exact |
| `apps/service-payments/src/webhooks/webhook-validator.service.ts` (MODIFIED — fail-closed + per-tenant secret) | service | request-response | itself, but **inverting** the `if (!secret) return;` bug (L11, L32) | exact-but-inverted (explicit anti-pattern flagged) |
| `apps/service-payments/src/webhooks/webhooks.controller.ts` (NEW — service-payments currently has no controller here, routes live in `payments.controller.ts`) | controller | event-driven (webhook) | `apps/service-payments/src/payments/payments.controller.ts:85-102` (`conektaWebhook`/`mpWebhook` handlers) + `service-notifications`'s `webhooks.controller.ts` token-routed shape | role-match |
| `apps/service-payments/src/webhooks/webhooks.service.ts` (MODIFIED — provider dispatch + per-tenant lookup) | service | event-driven | itself — `handleConekta`/`handleMercadoPago`/`confirmFromToken` (L17-73) | exact |
| `apps/api-gateway/src/tenant/tenant.controller.ts` or new `IntegrationsController` | controller | CRUD | `tenant.controller.ts` (Roles guard + successResponse pattern) | exact |
| `apps/api-gateway/src/tenant/tenant.service.ts` or new `IntegrationsService` | service | CRUD | `updateWhatsappSender()` (`tenant.service.ts:130-175`, `assertAdmin` + settings merge) | exact |
| `apps/web/app/(dashboard)/settings/integrations/layout.tsx` | route/layout | request-response | `settings/templates/page.tsx` back-link header pattern | role-match |
| `apps/web/app/(dashboard)/settings/integrations/page.tsx` | route | request-response | `settings/page.tsx` | role-match |
| `apps/web/app/(dashboard)/settings/integrations/payments/page.tsx` | route | request-response | `settings/page.tsx` | role-match |
| `apps/web/app/(dashboard)/settings/integrations/brand/page.tsx` | route | request-response | `settings/page.tsx` | role-match |
| `apps/web/app/(dashboard)/settings/integrations/health/page.tsx` | route | request-response | `settings/page.tsx` | role-match |
| `apps/web/components/settings/integrations/ChannelCard.tsx` | component | CRUD (form) | `OrganizationSettingsPanel.tsx` (shell + admin/read-only fork) | exact |
| `apps/web/components/settings/integrations/PaymentGatewayPanel.tsx` | component | CRUD (form) | `ContactRetryPolicyPanel.tsx` (form + select + dirty-check) | exact |
| `apps/web/components/settings/integrations/BrandIdentityPanel.tsx` | component | CRUD (form) | `ContactRetryPolicyPanel.tsx` (fieldsets + textarea) | exact |
| `apps/web/components/settings/integrations/IntegrationHealthPanel.tsx` | component | request-response (read-only list) | `OrganizationSettingsPanel.tsx` shell, list body modelled on `dashboard/AlertFeed.tsx` | role-match |
| `apps/web/components/settings/integrations/SecretField.tsx` | component | CRUD (write-only) | `ContactRetryPolicyPanel.tsx:87-100` `<label>`+input pattern (state machine is new) | role-match |
| `apps/web/components/settings/integrations/IntegrationsTabs.tsx` | component | request-response (nav) | `conversations/page.tsx:185-203` filter pills | exact |
| `apps/web/components/settings/integrations/EmbeddedSignupButton.tsx` | component | event-driven (browser SDK) | **none** | no analog (confirmed, see below) |
| `apps/web/components/shared/ConfirmDialog.tsx` | component | event-driven (UI) | `components/debts/ContactModal.tsx:59-70` (overlay/card chrome only — a11y is net-new) | role-match |
| `apps/web/components/shared/CopyButton.tsx` | component | event-driven (UI) | **none** | no analog (confirmed) |
| `apps/web/hooks/use-integrations.ts` | hook | CRUD | `apps/web/hooks/use-tenant.ts` | exact |

## Pattern Assignments

### `packages/db/prisma/schema.prisma` — `model TenantIntegration` (model, CRUD)

**Analog:** `model Holiday` (schema.prisma:757-764) for UUID/id/timestamp shape; `model PaymentLink` (schema.prisma:555-569) for the `tenantId` + `@@map` + relation shape actually needed here (Holiday is NOT tenant-scoped, so use it only for the id/column-naming convention, not the relation).

**Column-naming + id pattern** (schema.prisma:757-764):
```prisma
model Holiday {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  date      DateTime @unique @map("date") @db.Date
  name      String   @map("name")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("holidays")
}
```

**Tenant-relation + unique-composite pattern to copy instead** (schema.prisma:531-553, `Payment`):
```prisma
model Payment {
  id             String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String         @map("tenant_id")
  ...
  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  @@index([tenantId, status])
  @@map("payments")
}
```
Apply `@@unique([tenantId, provider])` (D-09) the same way `PaymentLink.token` gets `@unique` — Prisma's composite-unique syntax, not shown elsewhere in this schema, so this is genuinely new syntax on an established id/naming convention. Secrets column: use Prisma's `Bytes` scalar (maps to Postgres `bytea`) — no existing model in this schema uses `Bytes`, confirmed by grep; this is the one truly novel column type in the migration.

---

### `packages/db/prisma/migrations/*_add_tenant_integration/migration.sql` (migration, batch)

**Analog:** `20260714120000_add_holidays/migration.sql` (full contents, 11 lines) — exact `CREATE TABLE` + `CREATE UNIQUE INDEX` shape to copy, adjusted for the `tenantId` FK and `bytea` secrets column.

---

### `packages/db/prisma/migrations/*_seed_tenant_integration_from_globals/migration.sql` (migration, batch — D-18)

**Analog:** `20260714130000_seed_colombia_holidays/migration.sql` (full contents).

**Idempotent-insert pattern to copy exactly:**
```sql
-- Seed Colombian national public holidays for 2026 and 2027 (18 per year).
-- Idempotent: ON CONFLICT on the unique `date` column, so re-applying is a no-op.
INSERT INTO "holidays" ("date", "name") VALUES ('2026-01-01', 'Año Nuevo') ON CONFLICT ("date") DO NOTHING;
```
For D-18, the seed migration needs `INSERT INTO tenant_integration (tenant_id, provider, mode, ...) SELECT id, 'twilio_whatsapp', 'managed', ... FROM tenants WHERE settings->>'whatsappFromNumber' IS NOT NULL ON CONFLICT (tenant_id, provider) DO NOTHING;` — same `ON CONFLICT ... DO NOTHING` idempotency shape, driven by a `SELECT` over existing `tenants` rows instead of a literal values list. The secrets themselves come from `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/etc. env vars, which SQL migrations cannot read — this migration must be a **TypeScript data-migration script run via `prisma db execute` wrapping application code** (per `reference_prod_migrations.md`: `db execute` + `migrate resolve`), not a pure `.sql` file, because it needs the encryption helper to write ciphertext. Flag this divergence explicitly for the planner.

---

### `apps/service-notifications/src/integrations/tenant-integration.service.ts` (service, CRUD + cache)

**Analog:** `resolveFrom(tenantId)` in `twilio-whatsapp.adapter.ts:83-98` — this is the decision-context-designated pattern to generalize.

**Exact pattern to generalize** (`twilio-whatsapp.adapter.ts:83-98`):
```typescript
/**
 * Cada tenant puede tener su propio número de WhatsApp Business aprobado
 * (`settings.whatsappFromNumber`) — necesario cuando el mismo deudor le debe a
 * varios tenants...
 */
private async resolveFrom(tenantId: string): Promise<string | null> {
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const settings = (tenant?.settings ?? {}) as { whatsappFromNumber?: unknown };
  if (typeof settings.whatsappFromNumber === "string" && settings.whatsappFromNumber) {
    return settings.whatsappFromNumber;
  }
  return this.defaultFrom;
}
```
Generalize to: `resolveCredentials(tenantId, provider)` reading from `TenantIntegration` instead of `Tenant.settings`, returning the full decrypted credential set instead of a single string, gated on `status === "verified"`, with a short-TTL `Map`-based cache keyed `${tenantId}:${provider}` (never `provider` alone — see RESEARCH.md's STRIDE note on cache-key tenant isolation).

**Imports pattern** (`twilio-whatsapp.adapter.ts:1-10`):
```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import type { WhatsAppPort, SendWhatsAppTemplateInput, SendWhatsAppTemplateResult } from "@cobrai/ports";
import { PrismaService } from "@cobrai/db";
```

---

### `apps/service-notifications/src/integrations/sendgrid-provisioning.service.ts` (service, request-response)

**Analog:** `email.adapter.ts:34-56` — raw `fetch()` against SendGrid v3, with the exact `Authorization: Bearer` + JSON body + `response.ok` error-branch shape to replicate for `POST /v3/subusers` and `POST /v3/api_keys`.

**Core pattern to copy** (`email.adapter.ts:34-56`):
```typescript
const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ /* ... */ })
});

if (!response.ok) {
  const detail = await response.text();
  this.logger.error(`SendGrid error ${response.status}: ${detail}`);
  return { message_id: randomUUID(), status: "failed" };
}
```
For provisioning, the equivalent failure path must surface the provider's raw error text as `failureMessage` for D-11's synchronous verification UI (per UI-SPEC's failure-block contract), not silently degrade like the adapter does.

---

### `apps/service-notifications/src/integrations/vapi-provisioning.service.ts` (service, request-response)

**Analog:** `vapi-voice.adapter.ts:150-199` — axios + Bearer header + typed response interface pattern for the `POST https://api.vapi.ai/phone-number` import call.

**Pattern to copy** (`vapi-voice.adapter.ts:12-15`, `150-199`):
```typescript
interface VapiCallResponse {
  id: string;
  status: string;
}
// ...
const response = await axios.post<VapiCallResponse>(
  `${this.baseUrl}/call`,
  { /* body */ },
  { headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" } },
);
```
Reuse `this.baseUrl = "https://api.vapi.ai"` and the try/catch → `logger.error` → typed-failure-return shape for the import call, keyed on the **platform's** `VAPI_API_KEY` (D-04/D-21 — Vapi itself stays platform-owned; only the imported `vapiPhoneNumberId` is per-tenant).

---

### `apps/service-notifications/src/integrations/twilio-provisioning.service.ts` (service, request-response)

**Analog:** no exact analog exists for Twilio subaccount/Senders-API calls (the existing `twilio-whatsapp.adapter.ts` only ever does `client.messages.create`, never account-management calls). Closest shape is still `vapi-voice.adapter.ts`'s axios-with-Bearer pattern for the parts of the Senders API that might not be covered by the SDK, plus the **Twilio SDK client construction** in `twilio-whatsapp.adapter.ts:36` (`twilio(accountSid, authToken)`) — critically, per RESEARCH.md's Pitfall 1, this must be instantiated with the tenant's **subaccount** SID/token for the Senders API call, never the platform client already built in the constructor of the WhatsApp adapter.

```typescript
// twilio-whatsapp.adapter.ts:35-36 — client construction to replicate,
// but scoped to the tenant's subaccount credentials, not platform ones
if (accountSid && authToken) {
  this.client = twilio(accountSid, authToken);
}
```

---

### `apps/service-notifications/src/webhooks/integration-webhook-token.guard.ts` (middleware, request-response)

**Analog:** `twilio-signature.validator.ts` (full file, standalone exported function) for the "small standalone validator" shape, and `webhooks.controller.ts:42-58` for how it's wired into a controller method.

**Standalone-validator shape to copy** (`twilio-signature.validator.ts`, full file):
```typescript
import twilio from "twilio";

export function validateTwilioSignature(
  authToken: string,
  webhookUrl: string,
  params: Record<string, string>,
  signature: string
): boolean {
  if (!authToken || !webhookUrl || !signature) return false;
  return twilio.validateRequest(authToken, signature, webhookUrl, params);
}
```

**Controller wiring pattern to copy** (`webhooks.controller.ts:42-58`):
```typescript
@Post("twilio-whatsapp")
@HttpCode(200)
async twilioWhatsApp(
  @Body() body: Record<string, string>,
  @Headers("x-twilio-signature") signature: string
) {
  if (process.env["NODE_ENV"] === "production") {
    const valid = validateTwilioSignature(authToken, webhookUrl, body, signature);
    if (!valid) throw new ForbiddenException("Firma Twilio inválida");
  }
  await this.twilioWaHandler.handleInbound(body as never);
  return "";
}
```
Per D-19/D-20, the new guard must (a) resolve tenant/secret by the opaque `{token}` path param **before** validating the signature (not gated behind `NODE_ENV=production` like the existing check — this must run in every environment), and (b) throw `UnauthorizedException` (401), not `ForbiddenException` (403), plus write an audit log entry via `AuditService.logComplianceDecision`-style call — see the anti-pattern note under `webhook-validator.service.ts` below for what NOT to copy.

---

### `apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.ts` (MODIFIED)

**Analog:** itself. `resolveTenantByToNumber()` (L130-139) is the method to replace/retire — the new token-based routing in the guard makes SQL-by-number lookup obsolete, per RESEARCH.md's Pitfall/STRIDE table ("replace the raw SQL with a typed Prisma `findFirst` now that `whatsappFromNumber`-based lookup is being replaced anyway").

**Method being replaced** (`twilio-wa-webhook.handler.ts:130-139`):
```typescript
private async resolveTenantByToNumber(to: string): Promise<string | null> {
  const normalized = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM tenants
    WHERE deleted_at IS NULL
    AND settings->>'whatsappFromNumber' = ${normalized}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}
```
Everything downstream of tenant resolution in this file (opt-out handling, `findDebtorByPhone`, `upsertConversation`, Kafka publish at L83-94) is unchanged — only the tenant-resolution entry point moves from this private method to the new token guard, which then passes `tenantId` in.

---

### `apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts` (MODIFIED)

**Analog:** itself. `isValidPayload()` (L115-123) currently hardcodes `reply.fogging.org` — per D-22 this must become a per-tenant domain check (the tenant's own configured reply domain from `TenantIntegration`), and the loop-prevention check at L38-44 (`email.endsWith("@reply.fogging.org")`) must become dynamic too.

**Pattern to modify** (`sendgrid-inbound.handler.ts:115-123`):
```typescript
private isValidPayload(payload: SendgridInboundPayload): boolean {
  if (!payload.from || (!payload.text && !payload.html)) return false;
  const to = payload.to ?? "";
  if (!to.includes("reply.fogging.org")) {
    this.logger.warn(`Email inbound con destino inesperado: ${to}`);
    return false;
  }
  return true;
}
```
The rest of the file (opt-out detection, `cleanEmailBody()`, conversation upsert, Kafka publish) is a direct pattern to keep unchanged.

---

### `packages/compliance/src/types.ts` + `compliance.service.ts` — `channel_not_configured` (D-16)

**Analog:** the existing `holiday` reason, added in Phase 7, is the exact precedent for adding a new `ContactCheckReason` and a new gate branch.

**Type union to extend** (`types.ts:3-14`):
```typescript
export type ContactCheckReason =
  | "no_consent"
  | "opt_out_global"
  | "opt_out_channel"
  | "outside_hours"
  | "holiday"
  | "frequency_limit"
  | "awaiting_response"
  | "retry_cooldown"
  | "max_attempts_reached"
  | "whatsapp_not_opted_in"
  | "debtor_not_found";
  // ADD: "channel_not_configured"
```

**Gate branch to copy the shape of** (`compliance.service.ts:66-76`, the holiday branch inside `checkContact`):
```typescript
} else if (country === "CO" && (await this.isHoliday(at))) {
  result = {
    allowed: false,
    reason: "holiday",
    next_allowed_at: await this.nextNonHolidaySendTime(at, rules.hours, rules.timezone)
  };
}
```
And the equivalent branch inside `isChannelEligible` (`compliance.service.ts:187-197`) — D-16 requires the new check in **both** methods, exactly where `holiday` already appears in both (checkContact evaluates proactive outreach with hours/frequency; isChannelEligible evaluates debtor-requested transactional sends without hours/frequency — `channel_not_configured` is a hard block that must short-circuit both the same way `opt_out_global`/`opt_out_channel` do near the top of each method, since a channel with no verified `TenantIntegration` can't send regardless of timing). The check itself needs a new private helper analogous to `isHoliday()` (`compliance.service.ts:206-211`) but querying `TenantIntegration` by `tenantId` + channel-mapped `provider`, gated on `status === "verified"`.

---

### `apps/service-payments/src/gateways/{stripe,wompi,payu,epayco}.gateway.ts` (service/adapter, request-response)

**Analog:** `gateway.service.ts`'s two private methods — `createConektaCheckout` (L36-89, raw `fetch`) as the template for Wompi/PayU/ePayco (no official SDK per RESEARCH.md), and `createMercadoPagoCheckout` (L91-144) as the template for Stripe (has an official SDK, but the response-shape/error-branch structure is identical).

**Exact structure to copy per new gateway file** (`gateway.service.ts:36-89`, trimmed):
```typescript
private async createConektaCheckout(
  input: { amount: number; currency: string; token: string },
  ref: string
): Promise<CheckoutSession> {
  const apiKey = this.config.get<string>("CONEKTA_PRIVATE_KEY");
  if (!apiKey) {
    this.logger.warn("Conekta sandbox: checkout simulado");
    return { gateway_payment_url: `.../sandbox/${ref}?token=${input.token}`, gateway_ref: ref };
  }

  const response = await fetch("https://api.conekta.io/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "..." },
    body: JSON.stringify({ /* ... */ metadata: { payment_token: input.token, gateway_ref: ref } })
  });

  if (!response.ok) {
    const detail = await response.text();
    this.logger.error(`Conekta error: ${detail}`);
    throw new Error("No se pudo crear orden Conekta");
  }

  const data = (await response.json()) as { id?: string; checkout?: { url?: string } };
  return { gateway_payment_url: data.checkout?.url ?? `...`, gateway_ref: data.id ?? ref };
}
```
**Important divergence per D-06/D-17:** the `if (!apiKey) { ...sandbox... }` branch (the "simulate on missing credential" pattern) must **not** be ported as-is — D-17 requires this survive only under an explicit flag that fails boot in production. Each new gateway file should accept resolved credentials from `TenantIntegrationService` (never read `ConfigService` directly, since payments are BYO-only per D-06 — there is no platform-level fallback key to read).

**Return type to reuse verbatim** (`gateway.service.ts:6-10`):
```typescript
export type CheckoutSession = {
  gateway_payment_url: string;
  gateway_ref: string;
  instructions?: string;
};
```

**Transfer/template-only pattern** (`gateway.service.ts:146-155`, exact analog for `external-link.gateway.ts`):
```typescript
private createTransferCheckout(
  input: { amount: number; currency: string },
  ref: string
): CheckoutSession {
  return {
    gateway_payment_url: "",
    gateway_ref: ref,
    instructions: `Transferencia bancaria por ${input.currency} ${input.amount}. Referencia: ${ref}`
  };
}
```

---

### `apps/service-payments/src/webhooks/webhook-validator.service.ts` (MODIFIED, fail-closed per D-20)

**Analog:** itself — but this is an explicit **anti-pattern to invert**, not a pattern to copy forward. The current fail-open bug:

```typescript
// webhook-validator.service.ts:9-25 — DO NOT replicate the early-return-on-missing-secret shape
verifyConektaSignature(rawBody: string, signature: string | undefined): void {
  const secret = this.config.get<string>("CONEKTA_WEBHOOK_SECRET");
  if (!secret) return;               // <-- fails OPEN: allows the webhook through unverified
  if (!signature) {
    throw new UnauthorizedException("Firma Conekta requerida");
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid = expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) {
    throw new UnauthorizedException("Firma Conekta inválida");
  }
}
```
Keep the `createHmac` + `timingSafeEqual` HMAC-comparison mechanics (that part is correct and should be reused for Wompi/PayU/ePayco/MP/Stripe, each with their own documented scheme per RESEARCH.md's Don't-Hand-Roll table), but change `if (!secret) return;` to `if (!secret) { await audit.log(...); throw new UnauthorizedException(...); }` — this is D-20's exact, deliberate behavior change.

---

### `apps/service-payments/src/webhooks/webhooks.controller.ts` (NEW file — controller, event-driven)

**Analog:** `payments.controller.ts:85-102` (the `conektaWebhook`/`mpWebhook` handlers currently live inline in `PaymentsController`) for the raw-body + header-extraction mechanics, and `service-notifications`'s `webhooks.controller.ts` for the **file-per-concern, token-in-path** shape this phase moves toward.

**Raw-body pattern to copy** (`payments.controller.ts:85-90`):
```typescript
@Post("webhook/conekta")
async conektaWebhook(@Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
  const raw = req.rawBody?.toString("utf8") ?? JSON.stringify(body);
  await this.webhooks.handleConekta(raw, req.headers["digest"] as string | undefined, body);
  return successResponse({ received: true });
}
```
New routes become `@Post(":provider/:token")` (D-19) in a dedicated `webhooks.controller.ts` (this file doesn't currently exist in `service-payments` — webhook routes are inline in `payments.controller.ts` today), extracting the provider-specific signature header the same way, then delegating to a per-provider `webhooks.service.ts` method exactly as `handleConekta`/`handleMercadoPago` already do (see next entry).

---

### `apps/service-payments/src/webhooks/webhooks.service.ts` (MODIFIED)

**Analog:** itself — `handleConekta`/`handleMercadoPago`/`confirmFromToken` (L17-73) is the exact dispatch-then-confirm shape to replicate per new provider.

```typescript
async handleMercadoPago(body: Record<string, unknown>, signature: string | undefined): Promise<void> {
  this.validator.verifyMercadoPagoSignature(body, signature);
  const gatewayRef = String((body.data as { id?: string } | undefined)?.id ?? "");
  const token = String(body.external_reference ?? "");
  if (!gatewayRef || !token) return;
  await this.confirmFromToken(token, gatewayRef, "mercadopago");
}
```
`confirmFromToken` (L52-73) — looks up `PaymentLink` by `token`, calls `PaymentConfirmationService.confirmPayment` — needs no change; only the per-provider `handleX` methods multiply, one per new gateway, plus the validator call must now resolve the tenant's secret from `TenantIntegration` (via the token-routed lookup) instead of `ConfigService`.

---

### `apps/api-gateway/src/tenant/tenant.controller.ts` / new `IntegrationsController` (controller, CRUD)

**Analog:** `tenant.controller.ts` in full — the `@Roles("admin")` decorator + `successResponse()` wrapper + `CurrentUser()` context-extraction shape.

```typescript
@Roles("admin")
@Patch("whatsapp-sender")
async updateWhatsappSender(
  @CurrentUser() user: CurrentUserContext,
  @Body() dto: UpdateWhatsappSenderDto
) {
  return successResponse(
    await this.tenantService.updateWhatsappSender(user.tenantId, dto, user.role)
  );
}
```
This is the write-only, admin-gated pattern for every credential-save endpoint in this phase (D-26's "API write-only restringida a rol admin/owner"). The `@Get()` handler (`tenant.controller.ts:16-21`, no `@Roles` guard) is the pattern for the read endpoint, which must still redact secrets in its DTO regardless of role.

---

### `apps/api-gateway/src/tenant/tenant.service.ts` / new `IntegrationsService` (service, CRUD)

**Analog:** `updateWhatsappSender()` (`tenant.service.ts:130-175`) — `assertAdmin()` call, `findFirst` current-state read, merge, `prisma.update`, return DTO.

```typescript
async updateWhatsappSender(
  tenantId: string,
  patch: UpdateWhatsappSenderDto,
  role?: string
): Promise<TenantProfile> {
  this.assertAdmin(role);
  const normalized = normalizeWhatsappFromNumber(patch.whatsappFromNumber);
  // ... conflict check via $queryRaw, then
  const current = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!current) { throw new NotFoundException("Organización no encontrada"); }
  const tenant = await this.prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ... } } });
  return toTenantProfile(tenant);
}
```
`assertAdmin()` itself (`tenant.service.ts:40-46`) is the exact guard to reuse for every credential-write path in this phase. The uniqueness-conflict check pattern (`tenant.service.ts:140-153`, raw `$queryRaw` against `settings->>'whatsappFromNumber'`) is a secondary precedent for `unique(tenantId, provider)` enforcement, though Prisma's native `@@unique` + a caught `P2002` error is cleaner than raw SQL here since the new model isn't a JSON blob.

---

### `apps/web/components/settings/integrations/ChannelCard.tsx` / `PaymentGatewayPanel.tsx` / `BrandIdentityPanel.tsx` (component, CRUD form)

**Analog:** `OrganizationSettingsPanel.tsx` (full file, 105 lines) for the shell + admin/read-only fork; `ContactRetryPolicyPanel.tsx` (full file, 209 lines) for the multi-field form + dirty-check + select pattern.

**Panel shell to copy verbatim** (`OrganizationSettingsPanel.tsx:42-54`):
```tsx
<article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
  <div className="flex items-start gap-3">
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <Building2 className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Organización</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">...</p>
      {/* loading / error / admin-form / read-only-dl branches follow */}
    </div>
  </div>
</article>
```

**Admin/read-only fork + role check to copy** (`OrganizationSettingsPanel.tsx:9-11`, `56-100`):
```tsx
const { orgRole } = useAuth();
const isAdmin = (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";
// ...
{tenantQuery.isLoading ? (
  <p className="mt-4 text-sm text-slate-500">Cargando…</p>
) : tenantQuery.isError ? (
  <p className="mt-4 text-sm text-[#A32D2D]">No se pudo cargar la organización.</p>
) : isAdmin ? (
  <form className="mt-4 max-w-md space-y-3" onSubmit={(e) => void handleSubmit(e)}>
    {/* fields */}
  </form>
) : (
  <dl className="mt-4 max-w-md">{/* read-only mirror */}</dl>
)}
```

**Dirty-check + select pattern to copy** (`ContactRetryPolicyPanel.tsx:40-46`, `117-136`):
```tsx
const isDirty =
  !!draft && !!savedPolicy &&
  (draft.windowHours !== savedPolicy.windowHours /* ...other fields */);
// ...
<select
  className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
  disabled={updatePolicy.isPending}
  onChange={(e) => setDraft({ ...policy, escalation: e.target.value as ... })}
  value={policy.escalation}
>
  {ESCALATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
</select>
```

**Submit button pattern (accent, disabled-on-pending) to copy** (`OrganizationSettingsPanel.tsx:79-89`):
```tsx
<button
  className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
  disabled={updateTenant.isPending || displayName.trim() === "" || displayName.trim() === tenantName}
  type="submit"
>
  {updateTenant.isPending ? "Guardando…" : "Guardar"}
</button>
```

---

### `apps/web/hooks/use-integrations.ts` (hook, CRUD)

**Analog:** `apps/web/hooks/use-tenant.ts` (full file, 46 lines) — exact TanStack Query + `useApiClient` + `fetchApi`/`patchApi` shape.

```typescript
export function useTenant() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["tenant"],
    queryFn: () => fetchApi<ApiItemResponse<Tenant>>(client, "/api/v1/tenant")
  });
}

export function useUpdateTenant() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => patchApi<ApiItemResponse<Tenant>>(client, "/api/v1/tenant", body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["tenant"] }); }
  });
}
```
Replicate this exact shape for `queryKey: ["integrations"]`, `["integrations","health"]`, `["integrations","uncontacted-debts", { page }]` per UI-SPEC's Component Inventory section — one `useQuery` per GET, one `useMutation` per PATCH/POST, with `invalidateQueries` on success.

---

## Shared Patterns

### Per-tenant credential resolution (replaces constructor-cached client)
**Source:** `resolveFrom()` in `apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts:83-98`
**Apply to:** `TenantIntegrationService.resolveCredentials()`, and every adapter/gateway that currently reads `ConfigService` in its constructor (`email.adapter.ts:14`, `vapi-voice.adapter.ts:124-134`, `gateway.service.ts:16`).
```typescript
private async resolveFrom(tenantId: string): Promise<string | null> {
  const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as { whatsappFromNumber?: unknown };
  if (typeof settings.whatsappFromNumber === "string" && settings.whatsappFromNumber) {
    return settings.whatsappFromNumber;
  }
  return this.defaultFrom;
}
```

### Admin-only write gate
**Source:** `apps/api-gateway/src/tenant/tenant.service.ts:40-46` (`assertAdmin`) + `apps/api-gateway/src/tenant/tenant.controller.ts:23,38,53` (`@Roles("admin")`)
**Apply to:** every credential-write endpoint (D-26).
```typescript
assertAdmin(role?: string): void {
  if (normalizeClerkRole(role) !== "admin") {
    throw new ForbiddenException("Solo administradores pueden editar la organización");
  }
}
```

### Raw `fetch()` against undocumented-SDK REST APIs
**Source:** `apps/service-notifications/src/adapters/email.adapter.ts:34-56`, `apps/service-payments/src/gateways/gateway.service.ts:36-89` (Conekta branch)
**Apply to:** Wompi/PayU/ePayco gateways, SendGrid provisioning calls — anywhere RESEARCH.md confirmed no official Node SDK exists.

### HMAC signature verification with `timingSafeEqual`
**Source:** `apps/service-payments/src/webhooks/webhook-validator.service.ts:17-20`
**Apply to:** every new per-provider webhook validator (Wompi, PayU, ePayco, Stripe join Mercado Pago) — **but invert the `if (!secret) return;` fail-open branch to fail-closed per D-20** (see explicit anti-pattern note above).
```typescript
const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
const valid = expected.length === signature.length &&
  timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
```

### Idempotent data migration for reference/seed data
**Source:** `packages/db/prisma/migrations/20260714130000_seed_colombia_holidays/migration.sql`
**Apply to:** D-18's global-credential-seeding migration.
```sql
INSERT INTO "holidays" ("date", "name") VALUES ('2026-01-01', 'Año Nuevo') ON CONFLICT ("date") DO NOTHING;
```

### Panel shell + admin/read-only fork (frontend)
**Source:** `apps/web/components/settings/OrganizationSettingsPanel.tsx:9-11,42-54,56-100`
**Apply to:** every panel listed in UI-SPEC's "New — integrations" component table (`ChannelCard`, `PaymentGatewayPanel`, `BrandIdentityPanel`, `IntegrationHealthPanel`).

### TanStack Query hook pair (frontend)
**Source:** `apps/web/hooks/use-tenant.ts` (full file)
**Apply to:** `apps/web/hooks/use-integrations.ts`.

## No Analog Found

Files/patterns with no close match in the codebase — planner should build from RESEARCH.md's documented external APIs and UI-SPEC's stated contracts instead of copying an internal analog:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/utils/src/crypto/envelope-encryption.ts` | utility | transform | **Confirmed by grep**: zero hits for `createCipheriv`/`createDecipheriv`/`encrypt(` in any `.ts` source file under `apps/` or `packages/` (only stale `.next` build artifacts matched, not source). This is genuinely greenfield — build from RESEARCH.md's Pattern 1 (Node's built-in `crypto`, AES-256-GCM, `iv‖ciphertext‖authTag` layout), which is itself flagged there as `[ASSUMED]` and must be unit-tested round-trip. |
| `apps/service-notifications/src/integrations/twilio-provisioning.service.ts` (Senders API call specifically) | service | request-response | No existing code in this repo calls Twilio account-management or Senders API endpoints — only `client.messages.create` for sends. RESEARCH.md's Open Question 1 flags the exact SDK method name as unconfirmed; verify against the installed `twilio@6.0.2` type definitions before implementation, per RESEARCH.md's own recommendation. |
| `apps/web/components/settings/integrations/EmbeddedSignupButton.tsx` | component | event-driven (browser SDK) | UI-SPEC states explicitly: "nothing existing — new client component." No third-party browser SDK (Meta JS SDK, `connect.facebook.net`) is loaded anywhere else in `apps/web` today. Build per UI-SPEC's state-matrix table (Screen 1, WhatsApp card) and RESEARCH.md's Embedded Signup flow description. |
| `apps/web/components/shared/CopyButton.tsx` | component | event-driven (UI) | UI-SPEC states explicitly: "nothing existing (no clipboard usage in repo today)." Confirmed by the UI-SPEC's own Component Inventory. Build per UI-SPEC's stated contract (`{ value, label }`, `Copy`→`Check` icon swap, `aria-live` announcement). |
| `apps/web/components/shared/ConfirmDialog.tsx` (a11y layer specifically) | component | event-driven (UI) | `ContactModal.tsx:59-70` supplies the overlay/card visual chrome only — UI-SPEC is explicit that `ContactModal` "has **no** dialog semantics" and the new component must add `role="dialog"`, focus trap, `Escape`-to-close, and focus restoration that has no existing precedent anywhere in `apps/web`. |
| `packages/db/prisma/migrations/*_split_payment_gateway_provider_method` (data backfill logic) | migration | batch | No prior migration in this repo backfills/reclassifies an existing enum column's live rows (the Holiday migrations are pure inserts, not a column split). RESEARCH.md's Pitfall 4 and Open Question 4 both flag that actual row-count/value distribution in `payment_links.gateway` must be queried against a real DB before writing this migration — do not write it from the enum definition alone. |

## Metadata

**Analog search scope:** `apps/service-notifications/src/{adapters,webhooks,contacts}`, `apps/service-payments/src/{gateways,webhooks,payments}`, `apps/api-gateway/src/tenant`, `packages/{compliance,db,ports,utils}/src`, `apps/web/{app/(dashboard)/settings,components/settings,components/shared,hooks}`.
**Files scanned:** ~35 read in full or targeted excerpt (adapters, webhook handlers, gateway service, webhook validator, compliance service/types, tenant service/controller, two settings panels, use-tenant hook, Prisma schema sections, two Holiday migrations).
**Pattern extraction date:** 2026-08-04
