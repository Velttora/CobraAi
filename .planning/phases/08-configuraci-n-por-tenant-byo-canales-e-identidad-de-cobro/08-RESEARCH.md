# Phase 8: Configuración por Tenant (BYO): canales e identidad de cobro - Research

**Researched:** 2026-08-04
**Domain:** Multi-tenant credential provisioning (Twilio ISV WhatsApp, SendGrid subusers, Vapi phone import), envelope encryption at rest, payment gateway integrations (Colombia BYO), webhook routing/signing, NestJS/Prisma/Next.js implementation
**Confidence:** MEDIUM-HIGH (protocol sequences and endpoints verified against official docs; exact SDK method names for two Twilio calls come from WebFetch-summarized doc pages, not raw source — flagged below)

## Summary

This phase replaces five hardcoded `.env` credential sets (Twilio, SendGrid, Vapi, and two payment gateways) with a per-tenant `TenantIntegration` model. Three distinct provisioning mechanics are involved, each backed by a different official program: Twilio's **Tech Provider (ISV) program** for WhatsApp (subaccount + Meta Embedded Signup + Senders API), SendGrid's **Subusers API** for email (requires a Pro-tier-or-above parent plan), and Vapi's **phone number import** for voice (a straightforward single-call import that keeps Vapi itself platform-owned). Payments are five independent BYO integrations with no shared plumbing beyond "create a checkout/link, verify a webhook signature" — Stripe and Mercado Pago have official Node SDKs; Wompi, PayU Colombia and ePayco do not, and the existing `gateway.service.ts` already uses raw `fetch()` for this reason, which the new adapters should keep doing.

The single highest-risk, highest-uncertainty area is the Twilio Embedded Signup → Senders API handoff: the browser flow returns `waba_id` and `phone_number_id` via a `postMessage` listener, and the backend then calls `POST /v2/Channels/Senders` (Node SDK: `client.messaging.v2.channelsSenders.create(...)`) with `sender_id` and `configuration.waba_id` using the tenant's **subaccount** credentials, not the parent account's. This exact SDK method name (`channelsSenders`, not `channels(...).senders`) could not be independently confirmed against Twilio's published SDK reference pages in this session (WebFetch tooling returned a docs-page summary, not raw source) — verify it against a live `npm view twilio` install or the TypeScript type definitions before writing code that depends on it. Everything else in this document is corroborated by at least one official Twilio/SendGrid/Vapi/Stripe/PayU/ePayco/Mercado Pago documentation page.

No crypto utility exists anywhere in this monorepo — `AES-256-GCM` envelope encryption with a versioned key is greenfield work, best placed in `packages/utils` alongside the repo's other cross-cutting helpers, using Node's built-in `crypto.createCipheriv`/`createDecipheriv` (no new dependency required) and Prisma's `Bytes` scalar (maps to Postgres `bytea`) for ciphertext columns.

**Primary recommendation:** Build `TenantIntegration` + the encryption helper + per-request credential resolution first (Wave 1, no external calls), then layer in the three provisioning flows (Twilio ISV, SendGrid subusers, Vapi import) as independent Wave-2 tracks that all consume the same encryption/storage primitive, and treat payments as a fourth, fully independent track since it shares no infrastructure with the communications channels beyond the `TenantIntegration` table itself.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Twilio subaccount + WABA provisioning | API / Backend (service-notifications or new integrations module) | Browser (Embedded Signup popup) | Meta's Embedded Signup SDK runs client-side and hands off a WABA/phone_number_id token pair; only the backend holds Twilio credentials to call the Senders API |
| SendGrid subuser + domain auth provisioning | API / Backend | Browser (CNAME instructions display only) | Subuser + API key creation must happen server-side with the parent SendGrid API key; the tenant's DNS action is manual and out-of-band |
| Vapi number import | API / Backend | — | Single server-to-server call; no browser component (D-05: tenant never touches Vapi) |
| Credential storage + encryption | API / Backend + Database | — | AES-256-GCM master key lives in env, never reaches the browser; ciphertext at rest in Postgres |
| Credential resolution per send | API / Backend (adapters in service-notifications) | — | Per-request resolution replaces constructor-cached clients; must stay server-side |
| Payment checkout/link creation | API / Backend (service-payments) | — | All five gateway secrets are server-side only |
| Webhook signature verification | API / Backend | — | Fail-closed verification must happen before any DB write, cannot be delegated to the browser |
| `channel_not_configured` compliance gate | API / Backend (packages/compliance) | — | Single choke point (`ComplianceService`), consistent with existing `holiday`/`opt_out_*` reasons |
| Settings > Integraciones UI (4 screens) | Frontend Server (Next.js `apps/web`) | Browser (Meta SDK for Embedded Signup only) | Standard CRUD + write-only secret display pattern already used by `OrganizationSettingsPanel`/`ContactRetryPolicyPanel`; only the Meta Embedded Signup button needs a client-side SDK load |
| Brand identity injection into templates/prompts | API / Backend | — | `variables.empresa` is rendered server-side in adapters and Vapi payload construction |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Modelo de cuentas por canal:**
- D-01: Modelo híbrido — managed por defecto, BYO opcional. Adaptador resuelve credenciales igual en ambos modos.
- D-02: Twilio (WhatsApp + voz) = del tenant, vía Tech Provider (ISV). Embedded Signup crea el WABA del tenant bajo su Meta Business; la plataforma crea subcuenta Twilio y conecta el WABA vía Senders API. Un solo WABA por cuenta Twilio → una subcuenta por tenant, obligatorio.
- D-03: SendGrid = del tenant, vía subusers creados por API con su propia API key. El tenant publica CNAME de autenticación en su DNS.
- D-04: Vapi = de la plataforma. Sigue con credencial global (`VAPI_API_KEY`, `VAPI_AGENT_ID`). No es BYO, no se guarda credencial de Vapi por tenant.
- D-05: La llamada sale del número del tenant importando su número de Twilio a la cuenta Vapi vía API al guardar/aprovisionar credenciales, persistiendo `vapiPhoneNumberId` por tenant. El tenant nunca toca Vapi.
- D-06: Gateway de pago = BYO obligatorio, sin excepción. No existe modelo managed.
- D-07: Riesgo aceptado — bajo ISV el titular ante Twilio es la plataforma; AUP prohíbe third-party debt collection (cobranza propia del tenant es first-party, no cae ahí), pero el escrutinio apunta a la plataforma. BYO es válvula de escape.

**Almacenamiento y cifrado de credenciales:**
- D-08: Modelo nuevo `TenantIntegration`: `tenantId` + `provider` + config pública + secretos cifrados AES-256-GCM, master key en env, `keyVersion` para rotar. No en `Tenant.settings`.
- D-09: `unique(tenantId, provider)` — un juego de credenciales por canal por tenant.
- D-10: Modelo distingue `mode: managed | byo`. Se guardan y resuelven idénticamente.
- D-11: Verificación síncrona al guardar — health check contra el proveedor y persistir `status: verified | failed` + `verifiedAt`.

**Modelo de gateway de pago:**
- D-12: Separar `provider` de `method`. Nuevo `provider`: `stripe`, `wompi`, `payu`, `epayco`, `mercadopago`, `external_link`, `transfer`; `method` opcional. Requiere migración de datos de `payment_links` existentes.
- D-13: Enlace externo = plantilla con variables (`{monto}`, `{ref}`, `{nombre}`).
- D-14: Sin webhook (enlace externo, transferencia), conciliación manual en dashboard, más `promise_to_pay` automático — queda pendiente de confirmación.
- D-15: `conekta` se deprecia (México, sin uso en Colombia).

**Comportamiento sin credenciales:**
- D-16: Razón nueva `channel_not_configured` en `ComplianceService`. Canal no elegible, workflow intenta siguiente canal configurado, escala a humano si no queda ninguno.
- D-17: Modo simulado sobrevive solo bajo flag explícito; arranque falla si el flag está encendido con `NODE_ENV=production`. Envíos simulados marcados como tales en BD.
- D-18: Corte con migración que siembra las globales — migración de datos idempotente copia credenciales globales actuales como `TenantIntegration` de tenants existentes; tenants nuevos arrancan vacíos.

**Ruteo y firma de webhooks:**
- D-19: URL por integración con token opaco aleatorio (`/webhooks/{proveedor}/{token}`).
- D-20: Fail closed — sin secreto de firma configurado, 401 + audit log.
- D-21: Webhook de Vapi sigue compartido (cuenta de plataforma); tenant se resuelve por contact record, sin token por integración.
- D-22: Reply del email bidireccional usa siempre el dominio del tenant. Se elimina `reply@reply.fogging.org` fijo.

**Frontend:**
- D-23: Configuración vive en `Settings > Integraciones`, accesible siempre, no en wizard obligatorio.
- D-24: Cuatro pantallas: (1) Conexión de canales — Embedded Signup, conexión teléfono/correo, estado de verificación, instrucciones CNAME; (2) Configuración de cobro — selector de proveedor, campos write-only, editor de plantilla; (3) Identidad de marca — nombre, logo, firma legal, contacto, vista previa; (4) Estado y salud — canales operativos, fallos de verificación, deudas sin contactar por falta de configuración.
- D-25: Flujo de navegador de Embedded Signup entra en esta fase: SDK de Meta, Facebook Login for Business, entrega de token al backend.
- D-26: Campos de secreto write-only en UI — solo últimos 4 caracteres + estado de verificación.

### Claude's Discretion

- Modelo e inyección de identidad de marca en `variables.empresa`, prompts LLM, `strategy_context.variables` de Vapi.
- API write-only de credenciales restringida a rol admin/owner del tenant.
- Resolución de credenciales por request con caché corta (LRU/TTL) en lugar del constructor.
- Una ruta de webhook por proveedor bajo un controlador común, siguiendo el patrón de `twilio-wa-webhook.handler.ts`.
- Gestión de la master key de cifrado (variable de entorno, `keyVersion` en la fila para rotación sin downtime).

### Deferred Ideas (OUT OF SCOPE)

- Wizard de onboarding obligatorio al crear el tenant.
- SMS a nombre del tenant vía Twilio del tenant, retirando Bird.
- dLocal Go / EBANX como gateway LLC-friendly con PSE.
- Convenio de recaudo bancario (Bancolombia/Davivienda) como recaudo centralizado.

</user_constraints>

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` exists at the project root (`/Users/gustavo.moreno/Documents/personal info/Renova/CLAUDE.md` — file not found). The user's global `~/.claude/CLAUDE.md` applies at the conversation level (English in all code/comments/identifiers, Conventional Commits, branch-per-change, draft PRs) but is not a project-repo file and is out of scope for this section. No project-level `.claude/skills/` directory exists (verified: `ls .claude/skills/` returned nothing beyond the standard `.claude/agents` and `.claude/get-shit-done` tooling dirs).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `twilio` | `6.0.2` (already in `apps/service-notifications/package.json`) `[VERIFIED: npm registry, already installed]` | Subaccount creation (`client.api.v2010.accounts.create`), Senders API (`client.messaging.v2.channelsSenders.create` — name unconfirmed, see Open Questions), existing message send/webhook signature validation | Already the WhatsApp SDK in this repo (Phase 1); no new dependency |
| `stripe` | `22.4.0` `[VERIFIED: npm registry]` `[ASSUMED: package identity — discovered via training knowledge/WebSearch, not Context7]` | Stripe Payment Links API (`stripe.paymentLinks.create`) | Official Node SDK, actively maintained, used by virtually every Stripe integration |
| Node built-in `crypto` | Node 20/22 runtime (repo uses NestJS 10, Node ≥18 required) | `createCipheriv`/`createDecipheriv` with `aes-256-gcm` for envelope encryption | Zero new dependency; already used in repo for HMAC (`webhook-validator.service.ts`, `twilio-signature.validator.ts`) |
| Prisma `Bytes` scalar | Prisma 5 (repo's pinned version) `[CITED: prisma.io/docs]` | Store ciphertext + IV + authTag for `TenantIntegration` secrets | Maps directly to Postgres `bytea`; avoids the `String`→`varchar` portability trap the Prisma docs warn about |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `mercadopago` | `3.2.1` `[VERIFIED: npm registry]` `[ASSUMED: package identity]` | Optional official Node SDK for Mercado Pago preferences | The repo's existing `gateway.service.ts` uses raw `fetch()` for Mercado Pago today and that continues to work — only adopt the SDK if the team wants typed responses; not required |
| raw `fetch()` | Node built-in (repo already targets a fetch-capable Node runtime — used in `email.adapter.ts`, `gateway.service.ts`) | Wompi, PayU Colombia, ePayco calls (no official first-party Node SDK found for any of the three) | Continues the established pattern in this repo rather than introducing three more single-purpose community packages |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node built-in `crypto` for envelope encryption | `@aws-crypto/client-node` / a KMS-backed envelope library | KMS gives auditable key rotation and HSM-backed keys, but the phase's locked decision (D-08) is an env-var master key with in-row `keyVersion` — a KMS integration is a bigger, out-of-scope architectural change |
| Raw `fetch()` for Wompi/PayU/ePayco | Community npm wrappers (e.g. unofficial `wompi-sdk`, `payu-latam` packages found via search) | These are unofficial, low-download, third-party maintained packages — higher slopsquat/abandonment risk for a payments code path; raw `fetch()` against documented REST endpoints is safer and matches existing repo convention |
| `mercadopago` official SDK | Continue raw `fetch()` (current repo pattern) | SDK adds a dependency for marginal typing benefit since the endpoint is a single `POST /checkout/preferences` call already implemented |

**Installation:**
```bash
pnpm --filter @cobrai/service-payments add stripe
```
No other new runtime dependencies are required — Twilio SDK is already present, SendGrid and the three Colombian gateways are called via `fetch()`, and encryption uses Node's built-in `crypto` module.

**Version verification:** Verified live against the npm registry in this session:
```
$ npm view stripe version       → 22.4.0
$ npm view mercadopago version  → 3.2.1
$ npm view twilio version       → 6.0.2 (matches package.json pin already in repo)
```
None of the three showed a `postinstall` script (`npm view <pkg> scripts.postinstall` returned empty for all three).

## Package Legitimacy Audit

`slopcheck` (v0.6.1) was installed via `pip3 install slopcheck --break-system-packages` and run successfully in this session against the three candidate new/confirmed packages.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `stripe` | npm | Years (official Stripe SDK) | Very high | github.com/stripe/stripe-node | [OK] | Approved — new dependency for service-payments |
| `twilio` | npm | Years, already in repo | Very high | github.com/twilio/twilio-node | [OK] | Approved — already installed, no change |
| `mercadopago` | npm | Years, official SDK | High | github.com/mercadopago/sdk-nodejs | [OK] | Approved but optional — repo's existing raw-fetch pattern for Mercado Pago is sufficient; only install if the planner chooses the SDK path |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

No package was added for Wompi, PayU Colombia, ePayco, or SendGrid — all three payment gateways and SendGrid are integrated via raw `fetch()` against documented REST endpoints, matching this repo's existing convention (`email.adapter.ts`, `gateway.service.ts` for `conekta`/`mercadopago`). This avoids introducing unofficial, low-maintenance third-party wrapper packages for payment-critical code paths.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────── Browser (apps/web) ────────────────────────────────┐
│  Settings > Integraciones                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────┐ │
│  │ 1. Canales   │  │ 2. Cobro     │  │ 3. Identidad   │  │ 4. Estado/Salud        │ │
│  │  Meta SDK    │  │  write-only  │  │   de marca     │  │   channel_not_config'd │ │
│  │  Embedded    │  │  secret input│  │   preview      │  │   per-tenant list      │ │
│  │  Signup popup│  └──────┬───────┘  └───────┬────────┘  └───────────┬────────────┘ │
│  └──────┬───────┘         │                  │                       │              │
└─────────┼──────────────────┼──────────────────┼───────────────────────┼──────────────┘
          │ {waba_id,        │ POST secrets     │ POST brand fields     │ GET status
          │  phone_number_id}│                  │                       │
          ▼                  ▼                  ▼                       ▼
┌──────────────────────────── api-gateway (JWT → X-Tenant-Id) ──────────────────────┐
│  new IntegrationsController (or extend TenantController)                          │
└──────────────────────────────────┬─────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼──────────────────────────────┐
        ▼                           ▼                              ▼
┌──────────────────┐   ┌────────────────────────┐    ┌─────────────────────────┐
│ service-notifications│ │ service-payments        │    │ TenantIntegration table │
│ (Twilio ISV +      │◄──┤ (Stripe/Wompi/PayU/     │───►│ tenantId+provider unique│
│  SendGrid subuser +│   │  ePayco/MP/external_link)│    │ AES-256-GCM secrets     │
│  Vapi import)       │   │                          │    │ keyVersion, mode,      │
└──────────┬──────────┘   └────────────┬────────────┘    │ status/verifiedAt      │
           │                            │                 └────────────┬────────────┘
           │ per-request credential     │ per-request credential        │
           │ resolution (short TTL      │ resolution                    │ encrypt/decrypt
           │ cache), replaces           │                                │ via packages/utils
           │ constructor-cached client  │                                │ crypto helper
           ▼                            ▼                                │
┌──────────────────┐        ┌──────────────────────┐                     │
│ Twilio (tenant     │        │ Stripe/Wompi/PayU/    │                     │
│ subaccount) → WA/  │        │ ePayco/MP APIs        │◄────────────────────┘
│ voice; SendGrid    │        └──────────┬────────────┘
│ subuser → email;   │                   │ webhook (signed, per-tenant
│ Vapi (platform,     │                   │  token in URL)
│ tenant's imported   │                   ▼
│ number) → voice     │        /webhooks/{provider}/{token}
└──────────┬──────────┘        fail-closed if no signing secret
           │ inbound webhook
           ▼
/webhooks/twilio-wa/{token}, /webhooks/sendgrid-inbound/{token}
(Vapi webhook stays shared — tenant resolved via contact record, D-21)
           │
           ▼
┌────────────────────────────────────────────────────────────┐
│ ComplianceService.checkContact / isChannelEligible          │
│  new "channel_not_configured" reason → workflow tries next  │
│  channel → escalates to human if none configured (D-16)     │
└────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
packages/
├── utils/src/
│   └── crypto/
│       ├── envelope-encryption.ts     # encrypt()/decrypt() with AES-256-GCM, keyVersion
│       └── envelope-encryption.spec.ts
├── db/prisma/
│   └── schema.prisma                  # new model TenantIntegration
apps/
├── service-notifications/src/
│   ├── integrations/                  # NEW module
│   │   ├── tenant-integration.service.ts   # resolveCredentials(tenantId, provider), short-TTL cache
│   │   ├── twilio-provisioning.service.ts  # subaccount create, Senders API call
│   │   ├── sendgrid-provisioning.service.ts # subuser create, API key, domain auth
│   │   └── vapi-provisioning.service.ts     # import Twilio number into Vapi
│   ├── adapters/                      # MODIFIED: constructor no longer builds client
│   │   ├── twilio-whatsapp.adapter.ts # resolves credentials per sendTemplate() call
│   │   ├── email.adapter.ts           # resolves SendGrid subuser key per sendTemplate() call
│   │   └── vapi-voice.adapter.ts      # resolves vapiPhoneNumberId per initiateCall() call
│   └── webhooks/
│       ├── integration-webhook-token.guard.ts # NEW: resolves TenantIntegration by opaque token
│       ├── twilio-wa-webhook.handler.ts       # MODIFIED: token-based routing replaces SQL-by-number
│       └── sendgrid-inbound.handler.ts        # MODIFIED: token-based routing
apps/
├── service-payments/src/
│   ├── gateways/
│   │   ├── gateway.service.ts         # MODIFIED: dispatch by tenant-configured provider, not ConfigService
│   │   ├── stripe.gateway.ts          # NEW
│   │   ├── wompi.gateway.ts           # NEW
│   │   ├── payu.gateway.ts            # NEW
│   │   ├── epayco.gateway.ts          # NEW
│   │   ├── mercadopago.gateway.ts     # RENAMED from inline method in gateway.service.ts
│   │   └── external-link.gateway.ts   # NEW: template substitution, no API call
│   └── webhooks/
│       ├── webhook-validator.service.ts # MODIFIED: per-tenant secret lookup, fail-closed
│       └── webhooks.controller.ts       # NEW: /webhooks/{provider}/{token} routes
apps/
├── web/
│   ├── app/(dashboard)/settings/integrations/
│   │   ├── page.tsx                   # 4-tab layout
│   └── components/settings/integrations/
│       ├── ChannelsPanel.tsx          # Embedded Signup button, phone/email status
│       ├── EmbeddedSignupButton.tsx   # Meta Facebook Login for Business SDK wrapper
│       ├── PaymentGatewayPanel.tsx    # provider selector + write-only fields
│       ├── BrandIdentityPanel.tsx     # name/logo/signature + message preview
│       └── IntegrationHealthPanel.tsx # verified/failed status + channel_not_configured debts
```

### Pattern 1: Envelope Encryption with Versioned Key
**What:** AES-256-GCM encryption where the master key comes from an env var selected by `keyVersion`, so rotating the key means adding a new env var and re-encrypting rows lazily or via a backfill job, never breaking old rows.
**When to use:** Any secret stored in `TenantIntegration.secrets` (Twilio auth token, SendGrid API key, all payment gateway keys/webhook secrets).
**Example:**
```typescript
// packages/utils/src/crypto/envelope-encryption.ts
// Pattern based on Node.js crypto docs (createCipheriv/createDecipheriv, GCM mode)
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const IV_LENGTH = 12; // 96-bit IV is the GCM-recommended size
const AUTH_TAG_LENGTH = 16;

export interface EncryptedSecret {
  ciphertext: Buffer; // iv (12) || ciphertext (n) || authTag (16), concatenated
  keyVersion: number;
}

function resolveKey(keyVersion: number): Buffer {
  // ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, ... each a 32-byte key, base64-encoded in env
  const raw = process.env[`ENCRYPTION_KEY_V${keyVersion}`];
  if (!raw) {
    throw new Error(`No encryption key configured for keyVersion=${keyVersion}`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY_V${keyVersion} must decode to 32 bytes for AES-256`);
  }
  return key;
}

export function encryptSecret(plaintext: string, keyVersion: number): EncryptedSecret {
  const key = resolveKey(keyVersion);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, encrypted, authTag]), keyVersion };
}

export function decryptSecret(ciphertext: Buffer, keyVersion: number): string {
  const key = resolveKey(keyVersion);
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH, ciphertext.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
```
`[ASSUMED: this exact concatenation layout (iv||ciphertext||authTag) is a standard community pattern for Node GCM, not copied from an official Node.js doc example — Node's own crypto docs demonstrate the primitives (createCipheriv/getAuthTag/setAuthTag) but do not prescribe a storage layout]`. Confirm the Node.js crypto module version/behavior against the actual Node runtime pinned in this repo's Dockerfile before finalizing.

### Pattern 2: Per-Request Credential Resolution Replacing Constructor Caching
**What:** Instead of building the Twilio/SendGrid/Vapi client once in the NestJS constructor (current pattern in all three adapters), resolve the tenant's decrypted credentials on every `sendTemplate()`/`initiateCall()` call via a short-TTL cache (LRU or simple `Map` with timestamp eviction).
**When to use:** All three communication adapters (`twilio-whatsapp.adapter.ts`, `email.adapter.ts`, `vapi-voice.adapter.ts`).
**Why it matters here:** The current constructor pattern (see `twilio-whatsapp.adapter.ts` lines 19-43) reads `ConfigService` once at boot — architecturally incompatible with per-tenant credentials that can change at runtime (rotation, BYO switch). The existing `resolveFrom(tenantId)` method in the same file is the closest existing precedent — it already does a per-call Prisma lookup keyed by `tenantId`; generalize that exact shape to pull the full credential set instead of just the from-number.
**Example (shape, not literal code — adapt to real DI structure):**
```typescript
// apps/service-notifications/src/integrations/tenant-integration.service.ts
@Injectable()
export class TenantIntegrationService {
  private readonly cache = new Map<string, { value: DecryptedCredentials; expiresAt: number }>();
  private readonly TTL_MS = 30_000; // short TTL per Claude's Discretion in CONTEXT.md

  async resolveCredentials(tenantId: string, provider: IntegrationProvider): Promise<DecryptedCredentials | null> {
    const cacheKey = `${tenantId}:${provider}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const row = await this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider } }
    });
    if (!row || row.status !== "verified") return null;

    const value = decryptRow(row); // uses envelope-encryption.ts + row.keyVersion
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + this.TTL_MS });
    return value;
  }
}
```

### Anti-Patterns to Avoid
- **Storing secrets in `Tenant.settings` (Json field):** already used for `whatsappFromNumber`/`contactRetryPolicy` and exposed wholesale via `tenant-profile.dto.ts` and queried with raw SQL in the webhook handler (`settings->>'whatsappFromNumber'`). Secrets must never enter this field — this is the explicit reason D-08 introduces a separate `TenantIntegration` model.
- **Reusing the country-based `pickGateway`/`gatewayOptionsForCountry` heuristic (`apps/service-payments/src/common/utils/api.utils.ts` lines 35-49) after this phase:** that logic picks a gateway by currency/country because gateways were platform-global. Under BYO, the tenant's *configured* `TenantIntegration` for `payments` is the only valid source — country-based auto-selection must be removed or repurposed only as a UI default suggestion, never as the runtime dispatch key.
- **Building the Senders API call with the parent Twilio account's credentials:** the Senders API resource must be called with the tenant's **subaccount** SID/token, not the platform's master credentials — this is what maps the WABA to the correct subaccount (Twilio: "each WABA must be mapped to a single Twilio account or subaccount").
- **Skipping the fail-closed check on webhook signature verification:** the existing `webhook-validator.service.ts` (lines 9-25) has a bug worth *not* replicating — `verifyConektaSignature` returns silently (`if (!secret) return;`) when no secret is configured, i.e. it currently fails OPEN. D-20 explicitly requires the opposite (401 + audit log when no secret is configured) — this is a deliberate behavior change from the current code, not just an extension of it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp sender/WABA provisioning | A custom Meta Graph API integration for WABA creation | Twilio's Tech Provider (ISV) program + Senders API | Twilio is already the tenant's WhatsApp channel provider in this repo; the ISV program is purpose-built so ISVs "won't need to call any Meta APIs" directly — Twilio handles WABA creation as part of Embedded Signup |
| Encryption at rest | A bespoke encryption scheme or a novel key-derivation function | Node's built-in `crypto` module, AES-256-GCM, standard IV/authTag handling | GCM is an authenticated cipher mode (integrity + confidentiality in one primitive) — hand-rolling key derivation or using ECB/CBC without a MAC is a well-documented class of vulnerability |
| Webhook signature verification per provider | Ad-hoc string comparison of raw bytes | `timingSafeEqual` (already used in `webhook-validator.service.ts`) for HMAC comparisons; each provider's documented signature scheme (Twilio: `twilio.validateRequest`; Mercado Pago: `x-signature` header parsing; PayU: HMAC-SHA256 of `merchant_id;reference_sale;value;currency;state_pol`; ePayco: `sha256(cust_id^key^ref_payco^transaction_id^amount^currency)`) | Each provider's scheme is subtly different and officially documented — reinventing any of them risks a timing side-channel or a scheme that silently drifts from the provider's actual behavior |
| Payment link creation for Wompi/PayU/ePayco | A generic "payment gateway abstraction" that tries to normalize wildly different APIs into one shape | Five independent gateway adapter classes (mirroring the existing `createConektaCheckout`/`createMercadoPagoCheckout` private-method split in `gateway.service.ts`, but promoted to their own files given five providers) | The five APIs differ enough (hosted checkout vs. payment-link-as-a-resource vs. redirect-with-signed-form) that a shared abstraction would either leak provider-specific fields everywhere or hide behavior differences that matter for compliance (D-14's manual reconciliation applies only to providers without webhooks) |

**Key insight:** Every provider integration in this phase (Twilio ISV, SendGrid subusers, Vapi import, five payment gateways) already has an official, documented API for exactly the workflow this phase needs — this phase is glue-code and data-model work, not novel protocol design. The one genuinely novel piece is the encryption helper, and even that should stay minimal (Node's built-in primitives, no new dependency).

## Runtime State Inventory

> This phase is a rename/refactor of the *credential source* (global env → per-tenant), not a string rename, so most Runtime State Inventory categories don't apply in the classic sense. Answered explicitly per category per protocol.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `Tenant.settings.whatsappFromNumber` (Json field) is the only existing per-tenant channel config. `PaymentLink.gateway` (Prisma enum `PaymentGateway`) has live rows using `pix`/`spei`/`pse`/`mercadopago`/`conekta`/`card`/`transfer`/`cash` values that mix provider and method. | **Data migration required**: (1) copy `whatsappFromNumber` into the seeded `TenantIntegration` row per D-18; (2) backfill `payment_links.provider`/`method` from the existing `gateway` enum values before dropping/renaming the column — verify actual row counts and value distribution before writing the migration (not done in this research session; the planner should query `SELECT gateway, count(*) FROM payment_links GROUP BY gateway` against a real DB before finalizing the migration SQL). |
| Live service config | Twilio Console has a live WhatsApp Sandbox/production number and webhook URL configured outside git (Twilio project settings). SendGrid has a live authenticated domain (`fogging.org`, per Phase 6) and Inbound Parse host configured in the SendGrid UI. Vapi has a live Agent (`VAPI_AGENT_ID`) and possibly a platform-owned phone number configured in the Vapi dashboard. | None of these live configs need to change for *existing* platform-wide config to keep working (D-18's seed migration preserves current behavior for existing tenants) — new tenant provisioning is additive, not a cutover of the shared config. |
| OS-registered state | None found — this phase touches no cron/task-scheduler/pm2 registrations. | None. |
| Secrets/env vars | Current global secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WA_FROM`/`TWILIO_FROM_NUMBER`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `VAPI_API_KEY`, `VAPI_AGENT_ID`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET`, `CONEKTA_PRIVATE_KEY`, `CONEKTA_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PAYMENT_LINK_BASE_URL`. New env vars needed: `ENCRYPTION_KEY_V1` (and future `ENCRYPTION_KEY_V2`, ...), Twilio **parent/ISV** account credentials distinct from any tenant's, and a Meta App ID/config ID for the Embedded Signup SDK (`FACEBOOK_APP_ID`, `FACEBOOK_CONFIG_ID` or similar — exact names TBD by planner, not found in repo). | Code edit only for existing vars (adapters stop reading them directly per-tenant-agnostic; they become the fallback/managed-mode source or are retired per D-18's migration). New vars are additive. |
| Build artifacts | None found — no compiled/installed artifact carries the old "global credential" assumption baked in (this is a runtime config change, not a rename). | None. |

## Common Pitfalls

### Pitfall 1: Calling the Senders API with the platform's parent Twilio credentials instead of the tenant's subaccount credentials
**What goes wrong:** The WABA gets associated with the wrong Twilio account, violating the "one WABA per Twilio account" constraint and potentially requiring Twilio support intervention to unwind.
**Why it happens:** It's easy to reuse the already-configured platform `client` instance instead of instantiating a fresh `twilio(subaccountSid, subaccountAuthToken)` client for the Senders API call.
**How to avoid:** Every Senders API and messaging call for a tenant must use a Twilio client scoped to that tenant's **subaccount** SID/auth token, obtained from the just-created `TenantIntegration` row — never the platform-level client.
**Warning signs:** Sender registration fails with an ambiguous "WABA already associated" error, or messages appear to send successfully but the `From` number resolves to the platform's shared number instead of the tenant's.

### Pitfall 2: Fail-open webhook signature verification (already present as a bug in this repo)
**What goes wrong:** A forged webhook (e.g., a fake "payment confirmed" POST) marks a debt as paid without ever having been paid.
**Why it happens:** `webhook-validator.service.ts`'s current `verifyConektaSignature`/`verifyMercadoPagoSignature` both `return` (allow) when no secret is configured, rather than rejecting — an easy default to reach for ("don't break things when unconfigured") that is exactly backwards for a payment webhook.
**How to avoid:** D-20 requires fail-closed: no signing secret for a `TenantIntegration` row → reject with 401 and write an audit log entry, full stop. Do not port the existing `if (!secret) return;` pattern into the new per-tenant webhook validators.
**Warning signs:** A webhook test with a `TenantIntegration` row missing `webhookSecret` returns 200 instead of 401.

### Pitfall 3: Simulated/sandbox sends silently masking missing BYO configuration in production
**What goes wrong:** Under the current code, all five adapters (`twilio-whatsapp.adapter.ts` line 50-55, `email.adapter.ts` line 22-27, `vapi-voice.adapter.ts` line 129-134, both `gateway.service.ts` branches) return `status: "sent"`/a fake success when credentials are missing. Under per-tenant BYO, a tenant who never configured a channel would silently get "successful" fake sends in production, inflating delivery metrics and consuming Ley 1266 compliance quota for contacts that never happened.
**Why it happens:** The sandbox branch was originally written for platform-wide local development convenience, not per-tenant configuration gaps.
**How to avoid:** D-17 requires the simulated path survive only under an explicit flag, and that flag must make the app **fail to boot** if set alongside `NODE_ENV=production`. This is a boot-time assertion (e.g., in `main.ts` or a `ConfigModule` validator), not a per-call check.
**Warning signs:** Any adapter method returning `status: "sent"` without having made a real HTTP/SDK call in a production environment.

### Pitfall 4: Treating `payment_links.gateway` enum split as a pure schema change
**What goes wrong:** Existing rows in `payment_links` (and any downstream code reading `link.gateway` as a display value, e.g. `PaymentLinksService.getPublicByToken` at line 97) break if `provider`/`method` are added without a backfill, or if the enum values are renamed out from under live rows.
**Why it happens:** It's tempting to treat this as "just add two columns" when in fact `pickGateway`/`gatewayOptionsForCountry` (`api.utils.ts`) actively write and read the mixed enum today, and `conekta` (D-15) is being fully deprecated, not just renamed.
**How to avoid:** Write an explicit data migration (following the idempotent-migration pattern already used for `holidays`) that maps each existing `gateway` value to a `(provider, method)` pair before any code stops reading the old column, and verify actual row counts/values against the real DB first — not assumed from the enum definition alone.
**Warning signs:** `prisma migrate dev`/`db execute` succeeds but `PaymentLinksService.checkout()` throws on an old row because `provider` is `null`.

### Pitfall 5: SendGrid subuser API calls made without the correct parent-account authorization header
**What goes wrong:** Calls intended to act "as" the subuser (e.g., authenticate a domain scoped to the subuser) actually happen at the parent level, or vice versa — silently producing a domain authentication that's invisible from the subuser's own dashboard/API key.
**Why it happens:** SendGrid's subuser delegation model uses an `On-Behalf-Of: <subuser_username>` header with the **parent's** API key for some operations, while subuser-scoped API keys (generated via `POST /v3/api_keys` with `On-Behalf-Of`) are used for others — the two mechanisms are easy to conflate.
**How to avoid:** Confirm for each SendGrid call in the provisioning flow whether it's (a) a parent-authenticated call using `On-Behalf-Of` to act on the subuser's behalf, or (b) a call made directly with the subuser's own generated API key, before writing the provisioning service. This was not fully disambiguated in this research session for the domain-authentication-scoped-to-subuser flow specifically — see Open Questions.
**Warning signs:** A tenant's domain shows as authenticated in the parent SendGrid dashboard but sends from the subuser's API key still fail domain authentication checks.

## Code Examples

### Twilio subaccount creation (Node SDK)
```typescript
// Source: https://www.twilio.com/docs/iam/api/subaccounts (WebFetch summary, verify against live SDK)
const account = await client.api.v2010.accounts.create({
  friendlyName: `tenant-${tenantId}`
});
// account.sid, account.authToken are the tenant's subaccount credentials — encrypt before storing
```

### Twilio WhatsApp sender registration via Senders API (Node SDK)
```typescript
// Source: https://www.twilio.com/docs/whatsapp/api/senders (WebFetch summary — method name unverified, see Open Questions)
const tenantClient = twilio(subaccountSid, subaccountAuthToken); // NOT the platform client
const sender = await tenantClient.messaging.v2.channelsSenders.create({
  sender_id: `whatsapp:${tenantPhoneNumberE164}`,
  configuration: { waba_id: wabaIdFromEmbeddedSignup }, // only required for the first sender on this subaccount
  profile: { name: tenantBusinessName },
  webhook: { callback_url: perTenantWebhookUrl, callback_method: "POST" }
});
// sender.sid (starts with "XE"); poll status: CREATING → OFFLINE → VERIFYING → ONLINE
```

### Vapi phone number import (REST, no official Node SDK confirmed — use fetch/axios per existing `vapi-voice.adapter.ts` pattern)
```typescript
// Source: https://vapi.ai (community-verified endpoint, cross-checked against docs.vapi.ai/phone-numbers/import-twilio dashboard flow)
const response = await axios.post(
  "https://api.vapi.ai/phone-number",
  {
    provider: "twilio",
    number: tenantTwilioNumberE164,
    twilioAccountSid: tenantSubaccountSid,
    twilioAuthToken: tenantSubaccountAuthToken
  },
  { headers: { Authorization: `Bearer ${VAPI_API_KEY}` } } // platform's Vapi key, per D-04
);
// response.data.id → persist as Tenant's vapiPhoneNumberId (D-05)
```
`[ASSUMED: exact body field names — corroborated by two independent WebSearch results but not fetched from a live, non-404 Vapi docs page in this session; verify against docs.vapi.ai/api-reference or a sandbox call before implementation]`

### SendGrid subuser + scoped API key creation
```typescript
// Source: https://www.twilio.com/docs/sendgrid/for-developers/sending-email/automating-subusers/
// Step 1 — create subuser (parent API key)
const subuser = await fetch("https://api.sendgrid.com/v3/subusers", {
  method: "POST",
  headers: { Authorization: `Bearer ${PARENT_SENDGRID_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ username: `tenant-${tenantId}`, email: tenantAdminEmail, password: randomStrongPassword(), ips: [] })
});
// response includes user_id

// Step 2 — generate an API key scoped to the subuser (parent key + On-Behalf-Of header)
const apiKey = await fetch("https://api.sendgrid.com/v3/api_keys", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${PARENT_SENDGRID_API_KEY}`,
    "On-Behalf-Of": `tenant-${tenantId}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ name: "cobrai-managed" })
});
// response.api_key — this is what gets encrypted and stored in TenantIntegration
```

### Fail-closed webhook signature check (contrast with existing fail-open bug)
```typescript
// Corrected pattern per D-20 — contrast with current webhook-validator.service.ts lines 9-25
async function verifyProviderSignature(tenantId: string, provider: string, rawBody: string, signatureHeader: string | undefined): Promise<void> {
  const integration = await tenantIntegrationService.resolveCredentials(tenantId, provider);
  if (!integration?.webhookSecret) {
    await auditService.log({ tenantId, action: `${provider}.webhook_rejected_no_secret` });
    throw new UnauthorizedException(`No hay secreto de firma configurado para ${provider}`); // fail CLOSED
  }
  if (!signatureHeader) {
    throw new UnauthorizedException("Firma requerida");
  }
  // ... provider-specific HMAC comparison using timingSafeEqual, as in existing webhook-validator.service.ts
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Twilio direct number verification per business (manual, ISV calls Meta APIs directly) | Tech Provider (ISV) program with Embedded Signup + Senders API, GA | Senders API reached General Availability per Twilio's own changelog (`Senders API - WhatsApp is now Generally Available`) — ISVs "won't need to call any Meta APIs" directly anymore | This phase should build against the Senders API path, not a legacy direct-Meta-API integration |
| Static webhook URLs with a single shared secret (`CONEKTA_WEBHOOK_SECRET`, `MP_WEBHOOK_SECRET`) | Per-tenant opaque-token URL + per-tenant signing secret (D-19/D-20) | This phase | All five payment webhook handlers and the two channel webhook handlers (Twilio WA, SendGrid Inbound) need new routing, not just new validation logic |
| `PaymentGateway` enum conflating provider and payment method | Split `provider`/`method` (D-12) | This phase | Every read site of `link.gateway` (`payments.service.ts`, `api.utils.ts`, frontend `/pay/[token]/` page) needs updating, not just the write path |

**Deprecated/outdated:**
- `conekta` gateway: being fully deprecated per D-15 (Mexico-only, unused in Colombia) — do not build a `provider: "conekta"` case in the new adapter set; existing rows need migrating away from it, not new code supporting it.
- Country-based automatic gateway selection (`pickGateway`, `gatewayOptionsForCountry` in `api.utils.ts`): conceptually obsolete once payments are strictly BYO per tenant — the tenant's own `TenantIntegration` configuration is now the source of truth, not the debtor's country.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Twilio Node SDK method for the Senders API is `client.messaging.v2.channelsSenders.create(...)` | Code Examples, Summary | If the actual method name differs (e.g., `client.messaging.v2.channels(...).senders.create(...)`), the planner's task breakdown for the provisioning service would reference a non-existent SDK call — low risk since it surfaces immediately as a TypeScript compile error, but should be verified against the installed `twilio@6.0.2` type definitions before task-writing |
| A2 | Vapi's phone-number-import request body fields are exactly `provider`, `number`, `twilioAccountSid`, `twilioAuthToken` (camelCase) posted to `POST https://api.vapi.ai/phone-number` | Code Examples (Vapi import) | If Vapi's actual schema differs slightly (e.g., a nested `twilio: {...}` object, or `phoneNumberId` vs `id` in the response), the import step fails at implementation time — should be confirmed against a live Vapi sandbox call or their OpenAPI spec before coding |
| A3 | SendGrid subuser creation requires the parent account to be on Pro Email API / Premier Email API / Advanced Marketing Campaigns tier | Standard Stack, Package Legitimacy | If the current SendGrid account (already integrated per Phase 6, domain `fogging.org`) is on a lower tier, subuser creation will fail at the API level with a plan-restriction error — this is an environment/billing fact, not a code fact, and should be confirmed against the actual SendGrid account settings before this phase starts |
| A4 | The IV\|\|ciphertext\|\|authTag concatenation layout for AES-256-GCM storage is a safe, standard pattern | Architecture Patterns (Pattern 1) | Low risk technically (this is a common, sound pattern), but it is not copied from an official Node.js doc example verbatim — any deviation in byte-length assumptions (e.g., a non-96-bit IV) would silently corrupt decryption; must be unit-tested with round-trip encrypt/decrypt tests, not just "code compiles" |
| A5 | Wompi/PayU Colombia/ePayco have no official first-party Node.js SDK worth adopting over raw `fetch()` | Standard Stack, Don't Hand-Roll | If an official SDK exists and was missed in this research pass, the planner might unnecessarily hand-roll HTTP calls that a maintained SDK would have handled (retries, typed responses) — low risk since raw fetch against documented REST endpoints is always a valid fallback, just possibly more code than necessary |
| A6 | `stripe` (22.4.0) and `mercadopago` (3.2.1) are the correct, non-slopsquatted npm package names for their respective official SDKs | Standard Stack, Package Legitimacy | Per the package-name-provenance rule, these were discovered via training knowledge/WebSearch, not Context7, so registry existence alone doesn't confer VERIFIED status — slopcheck rated both [OK] (has real GitHub source, high downloads), which is corroborating but not equivalent to an official-docs confirmation; low risk given `stripe` and `mercadopago` are extremely well-known, high-download packages, but flagged per protocol |

## Open Questions

1. **Exact Twilio Node SDK method name for the Senders API**
   - What we know: The REST endpoint is confirmed as `POST /v2/Channels/Senders` (multiple Twilio doc pages agree), and the resource is called "Senders" or "ChannelsSenders" depending on the page.
   - What's unclear: Whether the installed `twilio@6.0.2` package exposes this as `client.messaging.v2.channelsSenders`, `client.messaging.v2.channels(...).senders`, or another shape — WebFetch tooling returned doc-page summaries, not the SDK's actual TypeScript definitions.
   - Recommendation: Before writing the provisioning service task, have the planner/implementer run `node -e "console.log(Object.keys(require('twilio')(sid,token).messaging.v2))"` or grep the installed package's `.d.ts` files (`node_modules/twilio/lib/rest/messaging/v2/...`) to confirm the exact method chain.

2. **SendGrid domain authentication scoped directly to a subuser via `On-Behalf-Of`**
   - What we know: A parent-authenticated domain can be associated to a subuser after the fact via `POST /v3/whitelabel/domains/{domain_id}/subuser`. A subuser-scoped API key can be generated via `On-Behalf-Of`.
   - What's unclear: Whether the *authentication* step itself (the one that generates the CNAME records the tenant must publish) should be performed with the parent key + `On-Behalf-Of` header (creating the domain directly under the subuser), or with the parent key without the header followed by the association call — the fetched docs page explicitly noted it "does not describe authenticating a domain scoped directly to a subuser using the On-Behalf-Of header."
   - Recommendation: Test both call shapes against a SendGrid sandbox/test subuser before finalizing the provisioning flow; this determines whether the CNAME records shown to the tenant in the UI belong to the parent-then-associated domain or a subuser-native one.

3. **Confirmation of current SendGrid account's plan tier**
   - What we know: Subusers require Pro Email API / Premier Email API / Advanced Marketing Campaigns tier per SendGrid's docs.
   - What's unclear: What tier the project's actual SendGrid account (`fogging.org`, from Phase 6) is currently on — this is an account/billing fact not discoverable via code search.
   - Recommendation: Confirm directly in the SendGrid dashboard before Wave-2 planning for the SendGrid provisioning track; if the account is below Pro tier, this becomes a blocking prerequisite (a billing action, not a code task).

4. **`payment_links` existing row distribution**
   - What we know: The `PaymentGateway` enum has 8 values (`pix`, `spei`, `pse`, `mercadopago`, `conekta`, `card`, `transfer`, `cash`), and `pickGateway`/`gatewayOptionsForCountry` show only `conekta`, `mercadopago`, and `transfer` are actually reachable via the app's own logic (the others may be manually set or unused).
   - What's unclear: The actual row counts per value in the live/dev database — this research session did not have DB access to run `SELECT gateway, count(*) FROM payment_links GROUP BY gateway`.
   - Recommendation: The planner should have the implementer run this query against dev (and note it for prod) before writing the `provider`/`method` backfill migration, so the migration handles every value actually present, not just the values reachable through current app logic.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `twilio` npm package | WhatsApp/voice adapters, subaccount + Senders API provisioning | ✓ (already in `apps/service-notifications/package.json`) | 6.0.2 | — |
| `stripe` npm package | Stripe payment gateway | ✗ (not yet installed) | 22.4.0 available on registry | Install via `pnpm --filter @cobrai/service-payments add stripe` |
| Node built-in `crypto` | Envelope encryption | ✓ (Node runtime built-in) | Matches repo's pinned Node version | — |
| SendGrid parent account, Pro-tier-or-above | Subuser creation | Unknown — not verifiable from code (see Open Question 3) | — | If below Pro tier: blocking, requires a plan upgrade before this phase's SendGrid track can proceed |
| Twilio Tech Provider (ISV) program enrollment | WhatsApp subaccount + Senders API access | Unknown — requires Meta Business Manager verification (weeks-long process per Twilio's own prerequisites) | — | Blocking for the managed WhatsApp path; BYO WhatsApp mode (tenant brings their own already-provisioned Twilio+WABA) has no such prerequisite and could ship first if ISV enrollment isn't complete |
| Meta App ID / Config ID for Embedded Signup JS SDK | Frontend Embedded Signup button (D-25) | Unknown — no `FACEBOOK_APP_ID` or similar found in repo `.env.example` or config | — | Blocking for the frontend Embedded Signup screen specifically; requires a registered Meta app with WhatsApp Embedded Signup configured in Meta's developer console (separate from the Twilio ISV program enrollment) |
| `slopcheck` (Python, for package legitimacy checks) | Package Legitimacy Gate (this research step only, not runtime) | ✓ (installed via `pip3 install slopcheck --break-system-packages`, v0.6.1) | 0.6.1 | — |

**Missing dependencies with no fallback:**
- Twilio Tech Provider (ISV) program enrollment and Meta Business verification — this is an account-level, days-to-weeks approval process outside the codebase; the plan should sequence BYO-WhatsApp-first if managed-mode ISV enrollment isn't already underway.
- Meta App ID/Config ID for the Embedded Signup JS SDK — must be registered in Meta's developer console before the frontend Embedded Signup screen can function even in dev.

**Missing dependencies with fallback:**
- `stripe` npm package — trivial `pnpm add`, no blocker.
- SendGrid plan tier — if below Pro, this blocks only the *managed* SendGrid provisioning path; BYO SendGrid (tenant pastes their own existing API key) has no tier requirement and can be built as a fallback/parallel path.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.6 (confirmed in `apps/service-notifications/package.json`, `apps/service-payments/package.json`, and present in `packages/utils`, `packages/compliance`, `packages/ports`) |
| Config file | `apps/service-notifications/vitest.config.ts`, `apps/service-payments/vitest.config.ts`, `packages/utils/vitest.config.ts` (per-package configs, existing pattern — no phase-level config needed) |
| Quick run command | `pnpm --filter @cobrai/service-notifications test` / `pnpm --filter @cobrai/service-payments test` / `pnpm --filter @cobrai/utils test` (each runs `vitest run`) |
| Full suite command | `pnpm turbo run test` (Turborepo-orchestrated, per repo's monorepo tooling) |

### Phase Requirements → Test Map

> No `.planning/REQUIREMENTS.md` exists in this project (confirmed absent) and no requirement IDs were provided by the orchestrator for this phase. The table below maps CONTEXT.md decisions (D-XX) to concrete tests instead, since those are this phase's closest equivalent to formal requirements.

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-08/D-09/D-11 | `TenantIntegration` unique(tenantId, provider), health check on save persists `status`/`verifiedAt` | unit | `pnpm --filter @cobrai/db test -- tenant-integration` (or wherever the model's helper lives) | ❌ Wave 0 |
| Pattern 1 (encryption) | `encryptSecret`/`decryptSecret` round-trip, wrong `keyVersion` throws, tampered ciphertext fails `authTag` check | unit | `pnpm --filter @cobrai/utils test -- envelope-encryption` | ❌ Wave 0 |
| Pattern 2 (per-request credential resolution) | Cache hit within TTL skips DB call; cache miss/expired re-resolves; `status !== "verified"` returns `null` (not a stale credential) | unit | `pnpm --filter @cobrai/service-notifications test -- tenant-integration.service` | ❌ Wave 0 |
| D-16 (`channel_not_configured`) | `ComplianceService.checkContact`/`isChannelEligible` returns this reason when no verified `TenantIntegration` exists for the channel; workflow escalates to human when no channel is configured | unit + integration | `pnpm --filter @cobrai/compliance test -- compliance.service` | ✅ (extend existing `compliance.service.spec.ts`, which already tests `holiday`/`opt_out_*` reasons) |
| D-17 (simulated mode boot guard) | App fails to boot when simulation flag is on and `NODE_ENV=production` | unit (boot-time assertion test) | `pnpm --filter @cobrai/service-notifications test -- main.boot-guard` (or wherever the assertion lives) | ❌ Wave 0 |
| D-18 (seed migration) | Idempotent migration copies existing global credentials into `TenantIntegration` rows for existing tenants; new tenants get none | integration | `pnpm --filter @cobrai/db exec prisma db execute` against a test DB + assertion query | ❌ Wave 0 (follows the exact pattern of `20260714130000_seed_colombia_holidays`) |
| D-19/D-20 (webhook token routing, fail-closed) | Request to `/webhooks/{provider}/{token}` with valid token + valid signature succeeds; missing/wrong signature → 401 + audit log; unknown token → 404 (not leaking tenant existence) | integration (webhook simulation with supertest/nestjs testing module) | `pnpm --filter @cobrai/service-payments test -- webhooks.controller` and `pnpm --filter @cobrai/service-notifications test -- webhooks.controller` | ❌ Wave 0 (existing `webhook-validator.spec.ts` is the closest precedent — extend, don't replace, since it already tests the HMAC comparison logic) |
| D-12 (provider/method split + migration) | Existing `payment_links` rows readable with new columns after migration; `PaymentLinksService.checkout()` dispatches to the correct new gateway adapter by `provider` | integration | `pnpm --filter @cobrai/service-payments test -- payments.service` (extend existing tests) | ✅ (extend) |
| Twilio ISV provisioning | Subaccount creation + Senders API call — **cannot be fully automated against the real Twilio API in CI** (requires live ISV program access and a real Meta Business Manager flow) | integration with mocked Twilio SDK responses; manual/`checkpoint:human-verify` for the real end-to-end flow | `pnpm --filter @cobrai/service-notifications test -- twilio-provisioning.service` (mocked) | ❌ Wave 0 |
| SendGrid subuser provisioning | Subuser + API key creation — mockable against SendGrid's documented response shapes | integration with mocked `fetch` | `pnpm --filter @cobrai/service-notifications test -- sendgrid-provisioning.service` (mocked) | ❌ Wave 0 |
| Vapi number import | Import call — mockable against Vapi's documented response shape | integration with mocked axios | `pnpm --filter @cobrai/service-notifications test -- vapi-provisioning.service` (mocked) | ❌ Wave 0 |
| Payment gateway adapters (Stripe/Wompi/PayU/ePayco/MP/external_link) | Checkout/link creation success + failure paths, webhook signature verification per provider | unit (mocked HTTP) + one `checkpoint:human-verify` per provider for a real sandbox transaction | `pnpm --filter @cobrai/service-payments test -- gateways` | ❌ Wave 0 |
| Frontend Settings > Integraciones (4 screens) | Write-only secret rendering (last 4 chars only), Embedded Signup button triggers Meta SDK, health/status panel renders `channel_not_configured` debts | component test (RTL, following the Phase 4 precedent that added `@testing-library/react` + jsdom) + manual/E2E for the actual Meta popup flow (cannot be meaningfully automated without a real Meta test app) | `pnpm --filter @cobrai/web test -- settings/integrations` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant package's quick run command (e.g., `pnpm --filter @cobrai/compliance test` after touching `ComplianceService`).
- **Per wave merge:** `pnpm turbo run test` (full monorepo suite).
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus explicit manual verification (`checkpoint:human-verify`) for anything that requires live external accounts: Twilio ISV enrollment/Embedded Signup end-to-end, a real SendGrid subuser creation against the live parent account, a real Vapi import, and at least one real sandbox transaction per payment gateway.

### Wave 0 Gaps
- [ ] `packages/utils/src/crypto/envelope-encryption.spec.ts` — round-trip encrypt/decrypt, wrong keyVersion, tampered ciphertext
- [ ] `apps/service-notifications/src/integrations/tenant-integration.service.spec.ts` — cache hit/miss/expiry, unverified-status returns null
- [ ] `apps/service-notifications/src/integrations/twilio-provisioning.service.spec.ts` — mocked subaccount + Senders API calls
- [ ] `apps/service-notifications/src/integrations/sendgrid-provisioning.service.spec.ts` — mocked subuser + API key + domain auth calls
- [ ] `apps/service-notifications/src/integrations/vapi-provisioning.service.spec.ts` — mocked import call
- [ ] `apps/service-payments/src/gateways/*.gateway.spec.ts` — one per new provider (Stripe/Wompi/PayU/ePayco/external_link; Mercado Pago extends existing coverage)
- [ ] `apps/web/components/settings/integrations/*.spec.tsx` — RTL tests for the 4 new panels, following the Phase 4 precedent
- [ ] Boot-time guard test for D-17's production-fails-if-simulated-and-prod assertion — no existing test infrastructure covers app bootstrap assertions; this may need a small new test harness (e.g., a plain Node test invoking the guard function in isolation rather than booting the full Nest app)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirectly) | Existing Clerk-based JWT auth at api-gateway; this phase adds no new authentication mechanism but the write-only credential API must enforce role (admin/owner) per tenant — reuse the existing `normalizeClerkRole`/`assertAdmin` pattern already in `tenant.service.ts` |
| V3 Session Management | no | Not touched by this phase |
| V4 Access Control | yes | Credential write/read endpoints must be tenant-scoped (via `X-Tenant-Id` from the gateway) and role-restricted (admin/owner only, per Claude's Discretion item in CONTEXT.md) — mirrors existing `assertAdmin()` calls in `tenant.service.ts` |
| V5 Input Validation | yes | `class-validator`/`class-transformer` (already a dependency in both `service-notifications` and `service-payments`) for all new DTOs — webhook token format, provider enum values, credential field shapes |
| V6 Cryptography | yes | AES-256-GCM via Node's built-in `crypto` module (never hand-rolled) — see Architecture Pattern 1; key management via versioned env vars, never a hardcoded/derived key |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged payment webhook marking a debt as paid | Tampering | Fail-closed signature verification (D-20) + `timingSafeEqual` HMAC comparison (already the pattern in `webhook-validator.service.ts`) — reject with 401 and audit-log when no secret is configured, never allow-by-default |
| Webhook URL enumeration to discover tenant IDs | Information Disclosure | Opaque random token in the URL path (D-19) instead of `tenantId`/predictable identifiers — a 404 for unknown tokens should look identical whether the token never existed or belongs to a real tenant, to avoid a timing/existence oracle |
| Credential exfiltration via API response | Information Disclosure | Write-only secret fields (D-26) — API must never return the plaintext secret after creation, only last-4-chars + verification status; this must be enforced at the DTO/serialization layer, not just the frontend UI (a determined API caller could otherwise read the full secret directly) |
| Master encryption key compromise | Elevation of Privilege / Tampering | `keyVersion` column enables rotation without a big-bang re-encryption; the master key itself must never be logged, and access to the env var should be as restricted as any other production secret (Fly.io secrets, matching existing `TWILIO_AUTH_TOKEN` etc. handling) |
| Twilio subaccount credential misuse across tenants | Elevation of Privilege | Per-tenant credential resolution (Pattern 2) must never mix up `tenantId` when reading from the short-TTL cache — cache key must always include `tenantId`, not just `provider`, to prevent tenant A's cached client from serving tenant B's request under any race condition |
| SQL injection via raw query in existing webhook tenant-resolution code | Tampering | `twilio-wa-webhook.handler.ts`'s `resolveTenantByToNumber` already uses Prisma's tagged-template `$queryRaw` (parameterized, not string-concatenated) — the new token-based lookup should follow the same parameterized pattern, and ideally replace the raw SQL with a typed Prisma `findFirst` now that `whatsappFromNumber`-based lookup is being replaced anyway |

## Sources

### Primary (HIGH confidence)
- Twilio — WhatsApp Tech Provider ISV Program Integration Guide: https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide
- Twilio — Register WhatsApp senders using the Senders API: https://www.twilio.com/docs/whatsapp/register-senders-using-api
- Twilio — Senders API - WhatsApp reference: https://www.twilio.com/docs/whatsapp/api/senders
- Twilio — Subaccounts REST API: https://www.twilio.com/docs/iam/api/subaccounts
- Twilio — Senders API GA changelog: https://www.twilio.com/en-us/changelog/senders-api-whatsapp
- Twilio — Acceptable Use Policy: https://www.twilio.com/en-us/legal/aup
- SendGrid (Twilio) — Create Subuser API: https://www.twilio.com/docs/sendgrid/api-reference/subusers-api/create-subuser
- SendGrid (Twilio) — Automating Subusers: https://www.twilio.com/docs/sendgrid/for-developers/sending-email/automating-subusers/
- SendGrid (Twilio) — Associate an authenticated domain with a subuser: https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/associate-an-authenticated-domain-with-a-subuser
- Vapi — Import number from Twilio (dashboard flow): https://docs.vapi.ai/phone-numbers/import-twilio
- Stripe — Prohibited and Restricted Businesses FAQ: https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs
- Stripe — Create a payment link (API reference): https://docs.stripe.com/api/payment-link/create
- PayU Latam — Confirmation URL (signature verification): https://developers.payulatam.com/latam/en/docs/integrations/confirmation-url.html
- ePayco — URL de confirmación: https://docs.epayco.com/docs/url-de-confirmacion
- Mercado Pago — Payment notifications / x-signature webhook: https://www.mercadopago.com.br/developers/en/docs/checkout-pro/payment-notifications
- Wompi — Payment links: https://docs.wompi.co/en/docs/colombia/links-de-pago/
- Prisma — Bytes scalar / bytea mapping (community discussion cross-referencing official schema reference): https://github.com/prisma/prisma/discussions/11976 and https://www.prisma.io/docs/orm/reference/prisma-schema-reference

### Secondary (MEDIUM confidence)
- Wompi merchant onboarding requirements (NIT/RUT/Bancolombia account) — cross-referenced across Wompi's own support center (`soporte.wompi.co`) and third-party integration guides
- Mercado Pago prohibited activities (collections agencies) — Mercado Pago's own "Actividades Prohibidas" help page (`mercadopago.com.mx/ayuda/actividades-prohibidas-politicas_18572`), Mexico locale but policy is stated as platform-wide
- SendGrid subuser plan-tier requirement (Pro/Premier/Advanced Marketing Campaigns) — cross-referenced across SendGrid's official Subusers UI docs and third-party pricing summaries
- Vapi phone-number-import request body field names (`provider`, `number`, `twilioAccountSid`, `twilioAuthToken`) — corroborated by two independent WebSearch summaries but not fetched from a live, current, non-404 API reference page

### Tertiary (LOW confidence)
- Exact Twilio Node SDK method name `client.messaging.v2.channelsSenders.create(...)` — WebFetch tool summary of a docs page, not the SDK's own type definitions; flagged as Open Question 1 and Assumption A1
- Precise AES-256-GCM ciphertext concatenation layout (iv‖ciphertext‖authTag) — standard community pattern, not sourced from an official Node.js doc example verbatim; flagged as Assumption A4

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH — package versions verified live against npm registry and slopcheck; SDK method-name-level detail for two Twilio calls unconfirmed against raw source
- Architecture: MEDIUM-HIGH — patterns grounded directly in this repo's existing code (`resolveFrom`, `webhook-validator.service.ts`, `twilio-signature.validator.ts`) plus official provider docs for the external-facing pieces
- Pitfalls: HIGH — five of five pitfalls are either directly observed in existing repo code (the fail-open bug, the sandbox-masking pattern, the mixed enum) or directly required by a locked CONTEXT.md decision
- Payments: MEDIUM — endpoint shapes and signature schemes confirmed per-provider via official docs; exact SendGrid subuser-scoped domain-auth mechanics and Vapi import body remain open questions

**Research date:** 2026-08-04
**Valid until:** 30 days for the payment gateway integration details (stable, documented REST APIs unlikely to change); 14 days for the Twilio ISV/Senders API and Vapi import specifics given they are newer, actively-evolving programs (Senders API reached GA relatively recently per Twilio's own changelog) — re-verify SDK method names and Vapi request bodies immediately before implementation regardless of elapsed time, per Open Questions 1 and the Vapi assumption (A2).
