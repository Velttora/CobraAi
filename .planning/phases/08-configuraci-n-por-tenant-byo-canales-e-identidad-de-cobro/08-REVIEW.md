# Phase 8 — Code Review

**Date:** 2026-08-05
**Scope:** `git diff origin/main...HEAD` on `feat/phase-08-tenant-byo` — 254 files, source under `apps/` and `packages/`.
**Method:** manual review of the highest-risk seams, run as round 6 of phase verification. Nineteen plans were executed by separate agents in parallel worktrees, so the review concentrated on where their work meets and on the invariants the phase is built on.

---

## Verdict

**Two HIGH findings, both fixed. One MEDIUM, reported for the repo owner to decide.** No critical findings.

A second pass ran after `main` was merged into the branch, on the theory that main's newer work was written against pre-phase-8 assumptions. That pass produced the `simulated` finding and the `whatsapp-sender` finding below.

The money path, the compliance choke point, the migration backfill and the multi-step provisioning flow all hold up under inspection.

---

## HIGH — Decrypted credentials retained in memory past their TTL (FIXED)

**Where:** `packages/integrations/src/tenant-integration.service.ts` (cache), now extracted to `packages/integrations/src/credential-cache.ts`

**What was wrong:** the credential cache was a plain `Map` with `get`, `set` and a single-key `delete`. The TTL was consulted on read to decide *staleness*, but an expired entry was never removed — it stayed in the map, holding **decrypted** secrets, until something happened to resolve that exact `(tenantId, provider)` key again. Nothing ever swept, and nothing bounded the map's size.

**Concrete failure:** in a multi-tenant service, one entry accumulates per `(tenant, provider)` pair ever resolved and is retained for the process's lifetime. Two consequences:

1. Unbounded memory growth proportional to total tenants seen, not to active ones.
2. A heap dump, core dump or memory-disclosure bug exposes **every credential the process ever resolved**, minutes or days after it was last needed — directly weakening the property this whole package exists to provide.

**Fix:** extracted `CredentialCache`, where expiry means deletion: `get` drops an expired entry instead of returning it, and every write sweeps expired entries. Two tests cover it — a credential is gone once its TTL passes even if its key is never resolved again, and the cache stays bounded across many tenants. Commit `3ef3777`.

**Note on the first attempt:** the initial fix only swept past a 64-entry threshold, which left secrets resident below that size. The test caught it. Worth recording because the threshold looked like a reasonable optimisation and was wrong for exactly the reason the finding is about.

---

## HIGH — `simulated` was written everywhere and read nowhere (FIXED)

**Where:** `packages/compliance/src/compliance.service.ts` (frequency check)

**What was wrong:** D-17 added a `simulated` flag to `Contact` and `Message` so a simulated send would "never inflate delivery metrics nor consume the Ley 1266 quota". The marking half shipped: adapters set it, `ContactsService` propagated it, `record-conversation-message` persisted it. The exclusion half did not exist — **no query anywhere filtered on it.**

**Concrete failure:** the daily per-channel frequency check counted simulated contacts, so a run with simulation enabled spent a debtor's legal contact allowance on sends that never reached them. The debtor is then blocked from a real contact because a fake one "already happened". Worse than the bug itself: anyone reading D-17 would reasonably believe the metrics were already clean.

**Fix:** the frequency check now excludes `simulated: true`, covered by a test asserting the filter is present in the query. Commit `f77f18b`.

**Not changed, reported instead:** `service-portfolios/src/ai-scoring/scoring.service.ts` and `service-workflows/src/workflows/workflows.service.ts` also count contacts without the filter. Changing them shifts scoring and workflow behaviour beyond this phase's scope, so they are left as a deliberate decision for a follow-up.

---

## MEDIUM — `PATCH /api/v1/tenant/whatsapp-sender` succeeds and does nothing

**Where:** `apps/api-gateway/src/tenant/tenant.controller.ts:55`, `tenant.service.ts:139-171`

**What is wrong:** the endpoint validates a WhatsApp number, normalises it, enforces uniqueness across tenants with a raw SQL check, persists it to `settings.whatsappFromNumber` and returns it in the tenant profile. Since this phase, `twilio-whatsapp.adapter.ts:50` reads **only** `integration.publicConfig.fromNumber`. Nothing consults `settings.whatsappFromNumber` on the send path any more — the cutover seed reads it once, historically, and that is all.

**Concrete failure:** an admin changes their WhatsApp sender through this endpoint, gets a `200`, sees the new number reflected in the tenant profile, and every message continues to go out from the number stored in `TenantIntegration`. Configuration and behaviour diverge silently, which is precisely the failure mode this phase existed to remove.

**Not fixed here, deliberately.** The web app never calls it and no test covers it, so removal looks safe — but it is a public API endpoint and deleting one is a contract decision for the repo owner, not a reviewer. Options, in order of preference:

1. Remove the endpoint and drop `whatsappFromNumber` from the tenant-profile DTO. Keep the stored settings value untouched so the cutover seed can still read it.
2. Make it write through to `TenantIntegration`, which duplicates `PUT /api/v1/integrations/:provider`.
3. Leave it and accept the divergence — not recommended; a 200 that changes nothing is worse than a 4xx.

---

## Areas reviewed with no findings

### Cache tenant isolation
`credential-cache.ts` keys on `${tenantId}:${provider}`. Cross-tenant serving is structurally impossible, and the existing test asserting tenant A's cached credential is never served to tenant B is meaningful rather than vacuous — verified against the implementation, not just the test name.

### Amount units across the six gateways
Each provider's convention is respected:

| Gateway | Unit | Code |
|---|---|---|
| Stripe | smallest currency unit | `unit_amount = Math.round(amount * 100)` |
| Wompi | cents | `amount_in_cents = Math.round(amount * 100)` |
| PayU | decimal string | `amount.toFixed(2)` |
| ePayco | decimal string | `amount.toFixed(2)` |
| Mercado Pago | currency units | `unit_price = amount` |

PayU additionally gets the subtle part right: the **same string** feeds the signature and the form field. Deriving them separately is the classic way PayU integrations fail signature validation intermittently.

COP is a two-decimal currency for both Stripe and Wompi, so `× 100` is correct. Realistic COP amounts (millions of pesos → hundreds of millions of cents) stay far inside safe-integer range.

### Payment confirmation idempotency
`payment-confirmation.service.ts` looks up an existing payment by `gatewayRef` or `idempotencyKey` and returns `{ duplicate: true }` without re-confirming when one is already `confirmed`. `Payment.idempotencyKey` is `@unique` in the schema, so a concurrent double-delivery fails at the database rather than double-inserting. Check-then-act plus a constraint backstop — correct.

### Partial failure in multi-step provisioning
`whatsapp-connect.service.ts` chains Twilio subaccount creation → Senders API → Vapi import. It writes a placeholder row carrying the subaccount credentials **before** attempting sender registration, so a failure downstream can never orphan a Twilio subaccount with no record of it. A sender failure lands the row in `failed` with the provider's own error message, leaving it retryable. Voice provisioning proceeds independently so a WhatsApp failure cannot take down a working voice channel.

### Compliance choke point
`channel_not_configured` lives in both `ComplianceService` lanes (`checkContact` and `isChannelEligible`) and in neither adapter. No send path reaches an adapter without passing a lane. Confirmed independently by `gsd-verifier`.

### Frontend secret handling
`SecretField` is uncontrolled (`defaultValue` + ref, only the character count in React state) because a controlled input serialises the typed value into `container.innerHTML`. Write paths are admin-gated in the service layer, not only at the gateway.

---

## Found and fixed in earlier verification rounds

Recorded here so the phase has one place to read the full picture:

| Round | Finding | Commit |
|---|---|---|
| 2 | Payments routed to the wrong gateway — `resolveByChannel` returns the first verified provider in a fixed order, and saving a gateway left the previous one verified. A tenant moving Stripe → Wompi kept charging through Stripe. | `ae326b0` |
| 5 | `POST /v1/webhooks/whatsapp` accepted any unauthenticated body and only logged it — zero functionality, pure attack surface, sitting next to the new fail-closed endpoints. | `af58a07` |
| 6 (pre-work) | Envelope encryption reachable from the browser bundle via the `@cobrai/utils` barrel. | `2f0b2ff` |
| 1 | Lint did not honour the `_` prefix for intentionally-unused bindings, which the codebase uses for test doubles mirroring a real API's arity. | `af58a07` |

---

## Open, deliberately not closed

These are decisions rather than oversights. Each is recorded in `08-VERIFICATION.md` with the same reasoning.

1. **Legacy `/v1/webhooks/sendgrid` and `/twilio` remain unauthenticated.** A forged bounce revokes any address's email consent; a forged `STOP` opts out any phone number. `updateMessageByProviderId` also scans messages with no tenant filter. They carry real behaviour and **cannot be authenticated without a tenant in the URL** — closing them properly means moving delivery-status callbacks onto token-routed endpoints and reconfiguring Twilio and SendGrid. That is an operational decision, not a code change.

2. **D-14 has no reconciliation surface.** External link and transfer correctly never auto-confirm, but no endpoint or UI exists for an admin to confirm a payment manually, so the manual half of the decision has nowhere to happen.

3. **ePayco's create-checkout endpoint is LOW confidence.** It could not be confirmed against reachable documentation. Its tests use mocked HTTP, so they prove the adapter's shape, not the endpoint's existence. Needs one real sandbox transaction before go-live.

4. **11 pre-existing files exceed the 300-line limit.** Every file newly created by this phase respects it, and `contacts.service.ts` shrank from 1021 to 974 along the way. The remainder is pre-existing debt worth its own refactor phase.
