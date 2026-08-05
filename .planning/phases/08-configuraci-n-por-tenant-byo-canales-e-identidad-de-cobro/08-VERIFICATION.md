---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
verified: 2026-08-05T04:13:05Z
status: gaps_found
score: 24/26 decisions verified (2 partial)
overrides_applied: 0
gaps:
  - truth: "D-14: sin webhook (enlace externo, transferencia), la conciliación es manual en el dashboard"
    status: partial
    reason: "The 'no silent success' half is implemented (external_link/transfer never auto-confirm; a debtor's payment claim only creates the pre-existing promise_to_pay pending state). But there is no dashboard surface at all — no endpoint, no UI — for an admin to manually mark an external-link/transfer payment as reconciled. GET /v1/payments only lists; PaymentsService has no confirm/update-status method reachable from the UI, and no page in apps/web renders payment status or exposes a confirm action."
    artifacts:
      - path: "apps/service-payments/src/payments/payments.controller.ts"
        issue: "No PATCH/POST endpoint to manually confirm a payment; only checkout, sandbox-confirm and refund exist"
      - path: "apps/service-payments/src/payments/payments.service.ts"
        issue: "PaymentsService.list()/refund() only; no manual-confirm method"
    missing:
      - "An admin-facing 'mark as paid' action (endpoint + UI) for payment_links/payments with provider in (external_link, transfer), gated to admin role like the rest of Settings > Integraciones"
  - truth: "D-19/D-20: no old fail-open or unauthenticated webhook branch is reachable through another route"
    status: partial
    reason: "The new token-routed twilio_whatsapp/:token and sendgrid/:token endpoints are correctly fail-closed (verified in code). But apps/service-notifications/src/webhooks/webhooks.controller.ts still exposes three legacy, unauthenticated routes from before this phase — POST /v1/webhooks/sendgrid, /v1/webhooks/twilio, /v1/webhooks/whatsapp — that were touched by this same phase's 08-13 commit (adding the token routes) without removing them. They require no signature, no token, and act cross-tenant: /twilio can flip any message's delivery status by matching a provider_message_id scanned across the latest 500 messages system-wide, and /sendgrid's bounce handler revokes a debtor's email consent tenant-wide by email match alone, with zero authentication. This is a live, reachable route that bypasses the entire per-tenant/fail-closed webhook model this phase built."
    artifacts:
      - path: "apps/service-notifications/src/webhooks/webhooks.controller.ts"
        issue: "Lines 35-52: @Post(\"sendgrid\"), @Post(\"twilio\"), @Post(\"whatsapp\") — no auth, no per-tenant scoping, registered in the same WebhooksModule as the new token-routed endpoints"
      - path: "apps/service-notifications/src/webhooks/webhooks.service.ts"
        issue: "handleTwilio/handleSendGrid/handleWhatsApp back these routes; handleEmailBounce revokes consent by email match across all tenants"
    missing:
      - "Remove the three legacy unauthenticated routes (or confirm via provider console that nothing still points to them, then delete) now that every real webhook has a token-routed, fail-closed replacement"
deferred: []
human_verification:
  - test: "Run a live BYO WhatsApp send end-to-end: connect a real Twilio subaccount's credentials on Settings > Integraciones > Canales, verify status flips to 'verified', then trigger an actual debt contact and confirm the message body renders the tenant's own commercial name instead of 'su gestor de cobranza'."
    expected: "WhatsApp message arrives from the tenant's own Twilio number, body says the tenant's brand name, D-11 status shows verified with real verifiedAt."
    why_human: "Requires a real Twilio BYO number, cannot be exercised by grep/static analysis; the managed/ISV path additionally cannot be tested at all (Twilio ISV enrolment not started, no Meta app — known, documented gap)."
  - test: "Save a Wompi/PayU/ePayco/Stripe/Mercado Pago credential set with correct keys, generate a payment link for a real debt, complete a sandbox transaction, and confirm the provider's webhook correctly flips PaymentLink status to paid via the new token-routed /v1/webhooks/:provider/:token endpoint."
    expected: "Webhook signature validates, payment status updates, audit log records the transition."
    why_human: "ePayco's create-checkout contract was flagged LOW confidence by the phase's own SUMMARY and needs a real sandbox transaction (known, documented gap); webhook signature schemes for all five providers were verified against docs only, not against a live provider callback."
  - test: "Open Settings > Integraciones > Identidad de marca, set a commercial name/logo/legal signature, and visually confirm the WhatsApp/Correo/Voz live preview (BrandMessagePreview) matches what a debtor actually receives on each of the three channels."
    expected: "Preview accurately reflects production rendering, including the email HTML layout and the voice agent's spoken company name."
    why_human: "Visual/audio fidelity of a preview against real rendering is not something grep or a type-checker can confirm."
---

# Phase 8: Configuración por Tenant (BYO): canales e identidad de cobro — Verification Report

**Phase Goal:** Toda comunicación y todo cobro salen a título de la empresa cliente (tenant), no de la plataforma. La plataforma solo orquesta.
**Verified:** 2026-08-05T04:13:05Z
**Status:** gaps_found (2 partial gaps, both narrow and non-blocking to the phase's central goal — see verdict below)
**Re-verification:** No — initial verification

## Verdict

**PASS-WITH-CONCERNS.**

The phase's central claim — that communications and payments now leave under the tenant's own identity and credentials, with the platform reduced to an orchestrator — is genuinely true in the code, not just in the SUMMARY narrative. I read the actual adapters, the compliance gate, the webhook controllers, the encryption code, the Prisma schema, and the four frontend screens, and independently ran `pnpm turbo typecheck test lint build` (all green, evidence below). Nineteen plans, executed across separate worktrees, integrate cleanly: the webhook URL contract minted in plan 08-07 is the exact URL plan 08-13 routes on; `ComplianceService`'s `channel_not_configured` gate (08-05) is genuinely the only choke point that D-16 waterfall/escalation and the D-24 health screen both read from; the money-routing defect (first-verified-provider-wins) was caught and fixed (`ae326b0`) before this verification even started.

Two gaps keep this from being an unqualified PASS, both narrower than the phase's core goal:

1. **D-14's "manual reconciliation in the dashboard" has no dashboard.** The "never silently mark paid" half is real; the "admin can reconcile" half was never built — no endpoint, no UI.
2. **Three legacy, unauthenticated webhook routes remain live** alongside the new fail-closed token-routed ones, in the exact file (`webhooks.controller.ts`) this phase's 08-13 plan modified to build the fail-closed replacement. They do not touch tenant credentials, but they are a real, reachable, cross-tenant-write surface that undermines the "fail closed" claim this phase makes elsewhere.

Neither gap involves comms or payments going out under the wrong identity — the phase's stated goal — so I classify this PASS-WITH-CONCERNS rather than FAIL. Both should be closed before the next phase builds further on top of the webhook/payments surface.

## Goal Achievement

### Observable Truths (Decisions D-01…D-26)

| # | Decision | Status | Evidence |
|---|---|---|---|
| D-01 | Hybrid model: managed by default, BYO optional, same resolution path either way | ✓ VERIFIED | `TenantIntegration.mode: managed\|byo` (`packages/db/prisma/schema.prisma:211-216`); `WhatsAppConnectService.connectManaged`/`connectByo` (`apps/service-notifications/src/integrations/whatsapp-connect.service.ts:45,111`); both reachable from `IntegrationsService.save`/`embeddedSignup` (`apps/service-notifications/src/integrations/integrations.service.ts:57-76,113-123`) and from the UI's `ChannelModeToggle` (`apps/web/components/settings/integrations/ChannelModeToggle.tsx`) |
| D-02 | Twilio WhatsApp+voz = tenant's, via ISV Tech Provider (own subaccount, own WABA) | ✓ VERIFIED | `TwilioProvisioningService.createSubaccount`/`registerWhatsAppSender` builds a fresh subaccount-scoped client per call, never the platform client, for the Senders API call (`apps/service-notifications/src/integrations/twilio-provisioning.service.ts:36-80`) |
| D-03 | SendGrid = tenant's, via subusers + tenant-published CNAME | ✓ VERIFIED | `SendgridProvisioningService` (subuser creation, subuser-scoped key, domain auth) + `EmailConnectService`'s `pending_dns` lifecycle (`apps/service-notifications/src/integrations/sendgrid-provisioning.service.ts`, `email-connect.service.ts`); `DnsRecordsTable.tsx` renders the CNAME instructions in the UI |
| D-04 | Vapi = platform's, global credential, never per-tenant | ✓ VERIFIED | `VapiProvisioningService` reads only `VAPI_API_KEY` from `ConfigService` in the constructor, holds no tenant Vapi credential (`apps/service-notifications/src/integrations/vapi-provisioning.service.ts:33-36`) |
| D-05 | Call goes out from tenant's number via Twilio→Vapi import, `vapiPhoneNumberId` persisted per tenant | ✓ VERIFIED | `VapiProvisioningService.importTwilioNumber` sets `smsEnabled: false` explicitly (correcting the SDK default) and returns the id persisted into `twilio_voice.publicConfig.vapiPhoneNumberId`; `vapi-voice.adapter.ts:151-158` resolves it per call, refuses to call if absent and simulation is off |
| D-06 | Payment gateway = BYO obligatory, no managed model, ever | ✓ VERIFIED | `IntegrationsService.save` throws `BadRequestException` if `PROVIDER_CHANNEL[provider] === "payments" && dto.mode !== "byo"` (`integrations.service.ts:63-65`); `savePayment` always writes `mode: "byo"` (`integrations.service.ts:211`); UI's `PaymentPanelHeader` renders a fixed BYO-only sentence with no toggle (08-18-SUMMARY.md, confirmed no `ChannelModeToggle` import in `PaymentGatewayPanel.tsx`) |
| D-07 | Documented, accepted platform-account risk under ISV | ✓ VERIFIED (documentation decision, not code) | Recorded in `08-CONTEXT.md` D-07 and ROADMAP.md §Phase 8 "Riesgo aceptado" — no code artifact required |
| D-08 | `TenantIntegration` model, AES-256-GCM encrypted secrets, `keyVersion` for rotation, not in `Tenant.settings` | ✓ VERIFIED | Schema (`schema.prisma:649-671`); real `createCipheriv("aes-256-gcm", ...)`/`createDecipheriv` with `iv\|\|ciphertext\|\|authTag` layout and versioned key lookup, throws (never returns garbage) on tampered ciphertext (`packages/utils/src/crypto/envelope-encryption.ts`) |
| D-09 | `unique(tenantId, provider)` | ✓ VERIFIED | `@@unique([tenantId, provider])` (`schema.prisma:668`) |
| D-10 | `mode: managed\|byo`, identical resolution regardless of mode | ✓ VERIFIED | `TenantIntegrationService.resolve`/`resolveByChannel` never branch on `mode` (`packages/integrations/src/tenant-integration.service.ts:66-89`) — mode only affects provisioning, exactly as D-01 specifies |
| D-11 | Synchronous verification on save, real provider health check, `status: verified\|failed` + `verifiedAt` | ✓ VERIFIED | `TenantIntegrationService.upsert` calls `verifyCredentials` and persists the result before returning (`tenant-integration.service.ts:169-180`); `verifyTwilioAccount` makes a real `fetch` to `api.twilio.com` with the submitted credentials, surfaces the provider's own error body verbatim (`packages/integrations/src/verifiers/communication-verifiers.ts:6-33`) |
| D-12 | Split `provider` from `method` | ✓ VERIFIED | `enum PaymentProvider`/`enum PaymentMethod` are separate Postgres enums (`schema.prisma:171-194`); migration + measured backfill documented in `08-PAYMENT-GATEWAY-DISTRIBUTION.md` |
| D-13 | External link = template with `{monto}`/`{ref}`/`{nombre}` | ✓ VERIFIED | `ExternalLinkGateway.createCheckout` calls `resolveExternalLinkTemplate` (`apps/service-payments/src/gateways/external-link.gateway.ts:20-33`); editor with insertable chips + live preview in `ExternalLinkTemplateEditor.tsx` |
| D-14 | No webhook ⇒ manual reconciliation in dashboard + automatic `promise_to_pay` on debtor claim, never silent success | **PARTIAL** — see gap | `promise_to_pay` intent flow pre-exists and is correctly left untouched (comment in `external-link.gateway.ts:12-14`); **but no dashboard endpoint or UI exists for an admin to manually confirm a payment** — see Gaps |
| D-15 | `conekta` deprecated | ✓ VERIFIED | Absent from `enum PaymentProvider` (`schema.prisma:171-181`); the only remaining `conekta` references are code comments and the legacy display-only `gatewayOptionsForCountry` MX suggestion (documented known gap, not new) |
| D-16 | `channel_not_configured` in `ComplianceService`, waterfall to next channel, escalate to human if none | ✓ VERIFIED | Gated in both `checkContact` (`packages/compliance/src/compliance.service.ts:61-65`) and `isChannelEligible` (`compliance.service.ts:192-197`); `ContactsService.handleContactRequested` distinguishes `no_channel_configured` from `no_available_channel` and publishes `cobrai.debt.escalated` with `target: "human"` only for the former (`apps/service-notifications/src/contacts/contacts.service.ts:126-141`) |
| D-17 | Simulated mode behind explicit flag, boot fails if flag on in `NODE_ENV=production` | ✓ VERIFIED | `assertSimulationNotInProduction` called from `main.ts` before `NestFactory.create` (`apps/service-notifications/src/main.ts:11`); all four live adapters (WhatsApp, email, voice, SMS) gate their "no credential" branch on `isSimulationEnabled()`, otherwise return `status: "failed"` (verified in each adapter file) |
| D-18 | Idempotent migration seeding globals into `TenantIntegration` for existing tenants only | ✓ VERIFIED (code); **NOT RUN in prod — documented known gap** | `packages/db/src/seed-tenant-integrations.ts` uses `findUnique`+`create` (never upsert) to skip-if-exists; prod runner exists (`infra/fly/run-prod-seed-tenant-integrations.sh`) but has not been executed — matches the known-gaps list exactly |
| D-19 | Webhook URL per integration with opaque random token, loads secret before verifying signature | ✓ VERIFIED | `TenantIntegrationService.resolveByWebhookToken` resolves the tenant BEFORE any signature check, ungated by status (`tenant-integration.service.ts:111-117`); consumed identically by payments (`webhooks.controller.ts:53` in service-payments) and channel webhooks (`integration-webhook-token.guard.ts:27-37`) |
| D-20 | Fail closed: missing signing secret → 401, audited | ✓ VERIFIED | `WebhookValidatorService.verify` rejects with the exact same message on missing secret, missing signature or bad signature, audits every rejection before throwing (`apps/service-payments/src/webhooks/webhook-validator.service.ts:54-66`); the equivalent dev-only exemption for Twilio signature checking was deliberately removed, not reproduced (`integration-webhook-token.guard.ts:39-47`) — **but see the Gap below: three legacy, unauthenticated webhook routes from before this phase remain reachable in the same controller family** |
| D-21 | Vapi webhook stays shared (platform account), tenant resolved via contact record | ✓ VERIFIED | `POST vapi` in `apps/service-notifications/src/webhooks/webhooks.controller.ts:83-90` carries no token, unchanged from before this phase |
| D-22 | Email reply always uses tenant's own domain; fixed `reply@reply.fogging.org` removed | ✓ VERIFIED | `EmailAdapter.sendTemplate` builds `reply@{integration.publicConfig.replyDomain}` per tenant, omits the key entirely when absent (SendGrid v3 rejects `reply_to: undefined`) (`apps/service-notifications/src/adapters/email.adapter.ts:42-49`); repo-wide grep for `reply.fogging.org`/`EMAIL_REPLY_TO` finds only the D-18 seed migration's literal copy of the pre-cutover global value, never a live fallback |
| D-23 | Lives in `Settings > Integraciones`, always accessible, not a mandatory onboarding wizard | ✓ VERIFIED | `apps/web/app/(dashboard)/settings/integrations/{layout,page}.tsx` + three sibling route folders, alongside pre-existing `templates`/`automation` settings sections |
| D-24 | Four screens: channel connection, payment config, brand identity, health/uncontacted-debts | ✓ VERIFIED | All four routes exist and render real, wired components (not stubs): `settings/integrations/page.tsx` (channels), `.../payments/page.tsx`, `.../brand/page.tsx`, `.../health/page.tsx` (uses `IntegrationHealthPanel` + `UncontactedDebtsTable`, both reading `GET /v1/integrations/health` and `/uncontacted-debts`) |
| D-25 | Embedded Signup browser flow, gated behind Meta app presence with `sdk_unavailable` fallback | ✓ VERIFIED | `EmbeddedSignupButton.tsx:67-70,165` gates on `NEXT_PUBLIC_FACEBOOK_APP_ID`/`NEXT_PUBLIC_FACEBOOK_CONFIG_ID`, defaults to `sdk_unavailable` state when either is absent — matches the documented "no Meta app exists yet" constraint from 08-02-SUMMARY.md |
| D-26 | Secrets write-only in UI, last-4 + verification status only | ✓ VERIFIED | `TenantIntegrationService.toView` derives `secrets: SecretMeta[]` from `secretsMeta` only — structurally cannot emit plaintext (`tenant-integration.service.ts:241-247`); `SecretField.tsx` uses an uncontrolled `<input type="password" defaultValue="">` specifically to avoid leaking a typed secret into `innerHTML` |

**Score:** 24/26 fully verified, 2 partial (D-14, and D-20's "no other route" clause) — both documented as gaps above, neither undermines the phase's stated central goal.

### Data-Flow Trace — "generic fallback" symptom (explicit ask #1)

| Chain | Evidence |
|---|---|
| Tenant brand → WhatsApp | `resolveTenantBrand(debt.tenant)` in `contacts.service.ts:168` → `buildVariables(debt, debtor, brand.variables)` → `twilio-whatsapp.adapter.ts:94` uses `variables.empresa ?? EMPRESA_FALLBACK` |
| Tenant brand → LLM agent prompt | `conversation-agent.service.ts:190-194`: `resolveTenantBrand(debtor.tenant)` → `companyName: brand.variables.empresa` fed into the system prompt |
| Tenant brand → Vapi `strategy_context.variables` | `contacts.service.ts:580-587`: `strategy_context.variables: { ...variables, ...callHistory }` where `variables` already carries `brand.variables.empresa`; `vapi-voice.adapter.ts:207`: `ctx.variables["empresa"] ?? EMPRESA_FALLBACK` |
| Fallback only fires when genuinely unset | `resolveTenantBrand`: `empresa = identity.commercialName \|\| tenant?.name?.trim() \|\| resolved.empresa` (`resolve-tenant-brand.ts:19`) — falls back to the literal `"su gestor de cobranza"` only when both the brand's commercial name AND the tenant's own name are empty |

**Status: FLOWING.** This is genuinely fixed, not name-dropped.

### No Silent Platform Fallback (explicit ask #2)

- WhatsApp, email, voice and SMS adapters all resolve per-tenant credentials via `TenantIntegrationService`/`ConfigService` (SMS intentionally still platform-global, correctly documented as out of scope) — none read a global Twilio/SendGrid credential as a silent fallback when a tenant's own is missing.
- `channel_not_configured` (D-16) is the only path when a tenant genuinely has none configured — confirmed above.
- D-17's simulated-send path is flag-gated and boot-blocked in production — confirmed above.
- **Gap:** `resolveByChannel`'s original fixed-provider-order pick (a different kind of silent-fallback risk, on the payments side) was found and fixed during this same verification window (commit `ae326b0`) — `retirePreviousPaymentProviders` now retires every other payment provider once a new one verifies, so an old Stripe credential can no longer keep winning after the tenant switches to Wompi.

### Compliance as the Only Choke Point (explicit ask #3)

Searched every adapter and dispatcher for a WhatsApp/voice/email send that does not pass through `checkContact`/`checkBeforeSend`/`isChannelEligible` first. `contacts.service.ts:executeContact` is the single call site that invokes the adapters, and it always calls `compliance.checkBeforeSend` before dispatch (`contacts.service.ts:174-182`). No new code path found that bypasses this.

### Fail-Closed Webhooks (explicit ask #4)

The new token-routed endpoints (`twilio_whatsapp/:token`, `sendgrid/:token`, and all five `/v1/webhooks/:provider/:token` payment routes) are genuinely fail-closed — confirmed above (D-19/D-20). **However**, three pre-existing, unauthenticated routes in the same controller (`POST /v1/webhooks/sendgrid`, `/twilio`, `/whatsapp`) were left in place — see Gaps. This is exactly the failure mode this explicit ask instructs the verifier to look for, and it is present.

### Both Modes Reachable (explicit ask #5)

- WhatsApp/voice: `ChannelModeToggle` renders both pills with equal visual weight (no "preferred" badge on managed, no warning icon on BYO — explicit UI-SPEC requirement, confirmed in code comment); `connectManaged` (Embedded Signup) and `connectByo` (`TwilioByoFields.tsx`) both call real backend endpoints.
- Email: `EmailConnectService.connectManaged`/`connectByo`, same pattern.
- Payments: correctly offers **BYO only** — `PaymentPanelHeader` has no toggle, backend throws on any non-`byo` mode for a payments provider (confirmed above, D-06).

### Cross-Plan Integration Seams (explicit ask #6)

- Webhook URL contract: `TenantIntegrationService.toView` builds `${baseWebhookUrl}/${provider}/${token}` (plan 08-03/08-07); plan 08-13's controller listens on the literal `twilio_whatsapp/:token` and `sendgrid/:token` paths, matching exactly — the 08-13 SUMMARY documents this was caught as a near-miss (the plan's literal route text would have 404'd every real webhook) and fixed during execution.
- `ComplianceModule` wired identically in both `service-notifications` and `service-workflows` (STATE.md's "two lanes" note) — confirmed both factory-provider blocks inject the same `TenantIntegrationService`.
- Money-routing defect (`resolveByChannel` picking the first verified provider in a fixed order rather than the tenant's actual choice) — found and fixed (commit `ae326b0`), documented in known-gaps, independently re-confirmed present in the current `retirePreviousPaymentProviders` code.
- File-size discipline: zero newly-created files in this phase exceed the 300-line limit (checked all 143 created files); 11 pre-existing files exceed it, matching the documented known gap exactly, none newly introduced.

### Known Gaps (confirmed present, not re-litigated)

| Gap | Confirmed |
|---|---|
| Prod seed (`db:seed:tenant-integrations:prod`) not yet run | ✓ script exists and is idempotent/correct; not executed |
| Twilio ISV enrolment / Meta app do not exist | ✓ `EmbeddedSignupButton` correctly falls back to `sdk_unavailable`; managed WhatsApp path cannot be exercised live |
| ePayco create-checkout LOW confidence | ✓ noted in webhook-validator.service.ts / 08-08-SUMMARY.md, needs live sandbox test |
| `gatewayOptionsForCountry` still suggests `conekta` for MX | ✓ confirmed, display-only, not in the actual dispatch path (`GatewayService.createCheckout` never calls it) |
| 11 pre-existing files >300 lines | ✓ confirmed, 0 new violations |
| Money-routing defect found+fixed during verification | ✓ confirmed fixed in `integrations.service.ts:retirePreviousPaymentProviders` |

### New Gaps Found (not in known-gaps list)

1. **D-14 dashboard reconciliation missing** — see frontmatter `gaps[0]`.
2. **Legacy unauthenticated webhook routes still reachable** — see frontmatter `gaps[1]`.

### Requirements Coverage

All 26 decisions (D-01…D-26) are claimed across the 19 plans' `requirements-completed` frontmatter; cross-referenced against `08-CONTEXT.md` — no orphaned decision found (every D-NN maps to at least one plan, and this verification independently traced each to code).

### Anti-Patterns Found

None blocking. `grep` for `TBD`/`FIXME`/`XXX` across all files created/modified in this phase found no unresolved debt markers. `TODO` shells mentioned in 08-16-SUMMARY.md (`brand/page.tsx`, `health/page.tsx`) were confirmed replaced by real implementations in plans 08-19/08-15 — not leftover stubs.

### Gate Output (run independently by this verifier, not taken from SUMMARY claims)

```
$ pnpm turbo typecheck --force
Tasks:    25 successful, 25 total   Time: 17.5s

$ pnpm turbo lint --force
Tasks:    15 successful, 15 total   (0 errors, 8 warnings — all "unused eslint-disable directive")   Time: 13.2s

$ pnpm turbo test --force
@cobrai/web:test              30 files / 191 tests passed
@cobrai/service-notifications  34 files / 315 tests passed
Tasks:    25 successful, 25 total   Time: 36.7s

$ pnpm turbo build --force
@cobrai/web:build  ✓ Compiled successfully, 16/16 pages generated
Tasks:    16 successful, 16 total   Time: 24.7s
(1 pre-existing warning: outputFileTracingRoot unrecognized key in next.config.mjs — unrelated to this phase)
```

All four gates green.

### Human Verification Required

See frontmatter `human_verification`. Summary: (1) a real BYO WhatsApp end-to-end send with brand-name rendering, (2) a real sandbox payment + webhook confirmation for at least one gateway (ePayco especially, per its documented LOW-confidence flag), (3) visual/audio fidelity check of the brand preview against actual channel rendering.

### Gaps Summary

The phase substantively achieves its goal: every adapter that sends to a debtor resolves tenant-owned credentials per request, the platform-wide `.env` fallback is gone from every live send path (SMS excepted, correctly out of scope), `variables.empresa` genuinely flows from tenant brand identity into WhatsApp/email/voice/LLM, payments are BYO-only with no managed shortcut, and webhook security is fail-closed and token-routed for every provider this phase touched. Independent gate runs (typecheck/lint/test/build) all pass, matching zero newly-created oversized files.

Two things should be closed before further work builds on the payments/webhooks surface: build (or explicitly descope) a manual payment-reconciliation action in the dashboard for D-14, and remove (or justify keeping) the three legacy unauthenticated webhook routes in `webhooks.controller.ts` that sit alongside the new fail-closed ones.

---

*Verified: 2026-08-05T04:13:05Z*
*Verifier: Claude (gsd-verifier)*
