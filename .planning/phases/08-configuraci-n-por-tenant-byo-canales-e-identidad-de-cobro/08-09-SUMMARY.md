---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 09
subsystem: payments
tags: [byo, stripe, mercadopago, wompi, payu, epayco, external-link, transfer, vitest, tenant-integration]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "PaymentProvider/PaymentMethod split on payment_links and payments (08-04)"
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "GatewayAdapter contract and five BYO adapters (08-08)"
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "TenantIntegrationService.resolveByChannel + verifyCredentials dispatcher (08-03)"
provides:
  - "resolveExternalLinkTemplate/validateExternalLinkTemplate in @cobrai/utils"
  - "ExternalLinkGateway and TransferGateway adapters"
  - "GatewayService.createCheckout({ tenantId, amount, currency, token, debtorName, returnUrl }) — dispatches by the tenant's configured PaymentProvider, no fallback"
  - "PaymentLinksService.create/getPublicByToken/checkout driven by TenantIntegrationService instead of country-based pickGateway"
  - "Live verifyCredentials cases for stripe/mercadopago/wompi/payu/epayco; no-network verification for external_link/transfer"
affects: [08-12, 08-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-brace {monto}/{ref}/{nombre} template resolver kept structurally separate from the repo's existing double-brace template system (regex negative lookbehind/lookahead so {{doble}} never matches)"
    - "GatewayService.createCheckout takes only tenantId (not provider) and re-resolves the tenant's current payments integration per call — the same short-TTL-cached path every other channel uses"
    - "verifiers/ package split into communication-verifiers.ts (Twilio/SendGrid, unchanged) and payment-verifiers.ts (new) to stay under the 300-line file limit"

key-files:
  created:
    - packages/utils/src/payment-link-template.ts
    - packages/utils/src/payment-link-template.spec.ts
    - apps/service-payments/src/gateways/external-link.gateway.ts
    - apps/service-payments/src/gateways/external-link.gateway.spec.ts
    - apps/service-payments/src/gateways/transfer.gateway.ts
    - apps/service-payments/src/gateways/transfer.gateway.spec.ts
    - apps/service-payments/src/gateways/gateway.service.spec.ts
    - packages/integrations/src/verifiers/communication-verifiers.ts
    - packages/integrations/src/verifiers/payment-verifiers.ts
    - packages/integrations/src/verifiers/payment-verifiers.spec.ts
  modified:
    - packages/utils/src/index.ts
    - apps/service-payments/src/gateways/gateway.service.ts
    - apps/service-payments/src/gateways/gateways.module.ts
    - apps/service-payments/src/payments/payments.service.ts
    - apps/service-payments/src/payments/payments.module.ts
    - apps/service-payments/src/payments/payment-confirmation.service.ts
    - apps/service-payments/src/payments/payment-link.service.spec.ts
    - apps/service-payments/src/payments/payment-confirmation.spec.ts
    - apps/service-payments/src/common/utils/api.utils.ts
    - apps/service-payments/src/webhooks/webhooks.service.ts
    - packages/integrations/src/verifiers/index.ts
    - packages/integrations/src/verifiers/verifiers.spec.ts
    - packages/db/tsconfig.json

key-decisions:
  - "checkout() ignores the debtor-supplied `gateway` request-body field entirely (T-08-09a) and calls GatewayService.createCheckout({ tenantId, ... }), which re-resolves the tenant's *current* verified payments integration via TenantIntegrationService rather than trusting the PaymentLink row's provider column frozen at creation time — this means a tenant who fixes/rotates credentials between link creation and checkout gets the up-to-date integration, matching every other channel's resolution pattern; link.provider is still used to decide the response shape (instructions vs. plain URL)"
  - "checkout()'s response uses `session.gateway_payment_url || null` for both transfer and external_link, not a hardcoded null for both — transfer's adapter always returns an empty string (falls to null) while external_link's adapter always returns the tenant's resolved URL (stays non-null); a literal reading of one plan behavior bullet ('returns the instructions shape with a null payment URL' for both) would defeat external_link's entire purpose of giving the debtor a payable link"
  - "The stripe/mercadopago/wompi/payu verifier endpoints are live-confirmed read-only authenticated calls (fetched/tested against real hosts in this session, 2026-08-04); epayco's REST login endpoint is flagged LOW confidence — the sandboxed environment's response to apify.epayco.co/login did not vary with the request payload (cache-control: max-age=31536000 suggests an edge-cached response), consistent with 08-08's own LOW-confidence flag on ePayco's checkout endpoint"

requirements-completed: [D-06, D-11, D-12, D-13, D-14]

duration: 62min
completed: 2026-08-04
---

# Phase 8 Plan 09: Tenant-Driven Payment Dispatch, External Link/Transfer, Live Verification Summary

**Deleted the country/currency-based `pickGateway` heuristic and replaced it with tenant-configured dispatch end to end: `GatewayService` now routes by `TenantIntegrationService.resolveByChannel`, `external_link`/`transfer` are real no-integration payment options built on a new single-brace template resolver, and five payment providers get live credential verification against real provider endpoints.**

## Performance

- **Duration:** ~62 min (20:34–20:56 wall-clock in-session, plus setup/investigation time)
- **Started:** 2026-08-04T20:34:00-05:00 (approx., after worktree base correction)
- **Completed:** 2026-08-04T20:55:51-05:00
- **Tasks:** 3 of 3 plan tasks completed
- **Files modified:** 26 (10 created, 16 modified)

## Accomplishments

- `resolveExternalLinkTemplate`/`validateExternalLinkTemplate` in `@cobrai/utils`, exported and tested against every UI-SPEC "ExternalLinkTemplateEditor" bullet — single-brace substitution, URL-encoding, double-brace pass-through, and the three verbatim Spanish validation messages
- `ExternalLinkGateway` (resolves the tenant's template per debt, no HTTP call) and `TransferGateway` (Spanish bank-transfer instructions from `publicConfig`, skipping absent fields) implementing the same `GatewayAdapter` contract as the five API-backed providers from 08-08
- `GatewayService` rewritten: no `ConfigService` reads, no `conekta` branch, dispatches through a `Map<PaymentProvider, GatewayAdapter>` keyed by the tenant's own configured provider; throws `BadRequestException` with zero fallback when nothing is configured
- `PaymentLinksService.create`/`getPublicByToken`/`checkout` all rewired off the deleted country/currency heuristic onto `TenantIntegrationService`; `payment-confirmation.service.ts` and its one remaining webhook caller persist `provider`/`method` on the `Payment` row
- `verifyCredentials` gained five real payment-provider cases (stripe, mercadopago, wompi, payu, epayco) plus no-network verification for `external_link`/`transfer`; the `verifiers/` module was split into `communication-verifiers.ts` and `payment-verifiers.ts` to respect the 300-line file limit
- Full monorepo `pnpm typecheck` and `pnpm test` are both green (25/25 turbo tasks each) — the two pre-existing known-broken typecheck errors this plan owned are fixed, and a pre-existing, unrelated `packages/db` build-artifact bug was fixed because it blocked a clean `pnpm test`

## Task Commits

1. **Task 1: Single-brace external-link template resolver in @cobrai/utils** - `1488a20` (feat)
2. **Task 2: external_link and transfer adapters, and GatewayService dispatch by tenant configuration** - `66e113c` (feat)
3. **Task 3: Rewrite the PaymentLinks read/write sites and add the five payment verifiers** - `bff881b` (feat)

## Endpoint / Source Table (per plan's `<output>` requirement)

| Provider | Endpoint verified against | Confidence | Notes |
|---|---|---|---|
| Stripe | `GET https://api.stripe.com/v1/balance` (Bearer secret key) | Live-confirmed 2026-08-04 (401 on no/invalid key) | Standard "retrieve balance" health-check pattern |
| Mercado Pago | `GET https://api.mercadopago.com/users/me` (Bearer access token) | Live-confirmed 2026-08-04 (403 without auth) | Authenticated "who am I" endpoint |
| Wompi | `GET https://production.wompi.co/v1/payment_links?page[size]=1` (Bearer private key) | Live-confirmed 2026-08-04 (401 INVALID_ACCESS_TOKEN on malformed key) | Creation is POST-only; this is the closest authenticated read-only list call |
| PayU Colombia | `POST https://api.payulatam.com/payments-api/4.0/service.cgi`, `command: "PING"`, `Accept: application/json` | Live-confirmed 2026-08-04 (`{"code":"ERROR","error":"Credenciales inválidas"}` on bad apiLogin/apiKey) | PayU's own documented connectivity/credential test command |
| ePayco | `POST https://apify.epayco.co/login` with `{public_key, private_key}` | **LOW confidence** | Response did not vary with payload in this sandboxed session (edge-cached `max-age=31536000`); same posture as 08-08's ePayco checkout-endpoint flag — must be confirmed with real ePayco sandbox credentials before go-live |
| external_link / transfer | none — `verifyNoIntegrationProvider()` returns `{ ok: true }` with no fetch | N/A (by design, D-13/D-14, UI-SPEC A-15) | Caller passes `skipVerification`; UI badge label is "Configurado", never "Verificado" |

## `GatewayService.createCheckout` Final Signature (for 08-12 and 08-18)

```typescript
export interface CreateCheckoutRequest {
  tenantId: string;
  amount: number;
  currency: string;
  token: string;
  debtorName: string;
  returnUrl: string;
}

createCheckout(input: CreateCheckoutRequest): Promise<CheckoutSession>
```

No `provider`/`gateway` parameter — the tenant's currently verified payments integration is resolved internally via `TenantIntegrationService.resolveByChannel(tenantId, "payments")` on every call. `PaymentLinksService.checkout()` builds `returnUrl` from `PAYMENT_LINK_BASE_URL`/`token`, same base URL used for link creation.

## Files Created/Modified

- `packages/utils/src/payment-link-template.ts` / `.spec.ts` - single-brace `{monto}`/`{ref}`/`{nombre}` resolver + validator
- `apps/service-payments/src/gateways/external-link.gateway.ts` / `.spec.ts` - resolves tenant template per debt, no HTTP call
- `apps/service-payments/src/gateways/transfer.gateway.ts` / `.spec.ts` - Spanish bank-transfer instructions from `publicConfig`
- `apps/service-payments/src/gateways/gateway.service.ts` / `.spec.ts` - rewritten dispatcher, `Map<PaymentProvider, GatewayAdapter>`
- `apps/service-payments/src/gateways/gateways.module.ts` - registers both new adapters + `TenantIntegrationService` factory provider
- `apps/service-payments/src/payments/payments.service.ts` - `create`/`getPublicByToken`/`checkout` rewired off `TenantIntegrationService`
- `apps/service-payments/src/payments/payments.module.ts` - clarifying comment (no new provider needed; reused from `GatewaysModule`'s export)
- `apps/service-payments/src/payments/payment-confirmation.service.ts` - persists `provider`/`method` on `Payment`
- `apps/service-payments/src/webhooks/webhooks.service.ts` - minimal compile fix for the new required `provider` field (see Deviations)
- `apps/service-payments/src/common/utils/api.utils.ts` - deleted `pickGateway`; `gatewayOptionsForCountry` kept as UI-default-only with a warning comment
- `packages/integrations/src/verifiers/communication-verifiers.ts` - Twilio/SendGrid verifiers, moved unchanged from `index.ts`
- `packages/integrations/src/verifiers/payment-verifiers.ts` / `.spec.ts` - stripe/mercadopago/wompi/payu/epayco/no-integration verifiers
- `packages/integrations/src/verifiers/index.ts` - thin dispatcher over both verifier modules
- `packages/db/tsconfig.json` - added the `**/*.spec.ts` exclude every sibling package already has (see Deviations)

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `packages/db/tsconfig.json` was missing the `**/*.spec.ts` exclude every sibling package (`@cobrai/utils`, `@cobrai/integrations`) already has**
- **Found during:** Task 3, running `pnpm turbo test` for the monorepo-wide verification this plan's acceptance criteria requires
- **Issue:** `tsc -p tsconfig.json` (the package's `build` script) compiled `src/seed-tenant-integrations.spec.ts` into `dist/seed-tenant-integrations.spec.js` as CommonJS. `@cobrai/db`'s own `vitest run` then picked up that compiled file alongside the real `src/*.spec.ts` and failed with "Vitest cannot be imported in a CommonJS module using require()" — Vitest is ESM-only.
- **Fix:** Added `"**/*.spec.ts"` to `packages/db/tsconfig.json`'s `exclude` array, matching the exact convention already used in `packages/utils/tsconfig.json` and `packages/integrations/tsconfig.json`. Removed the stale compiled `dist/seed-tenant-integrations.spec.*` artifacts (gitignored, not committed) and rebuilt.
- **Files modified:** `packages/db/tsconfig.json`
- **Verification:** `pnpm turbo test` — 25/25 tasks pass; `pnpm turbo typecheck` — 25/25 tasks pass
- **Committed in:** `bff881b`
- **Scope note:** `packages/db` is not in this plan's `files_modified` list and I did not touch any of its source files. This is a pre-existing repo-config gap unrelated to this plan's own changes, fixed only because the plan's own hard acceptance criterion ("pnpm test green across all turbo tasks") required a fully green monorepo test run.

**2. [Rule 3 - Blocking] `webhooks.service.ts`'s two `confirmPayment` calls needed a `provider` value after `ConfirmPaymentInput.provider` became required**
- **Found during:** Task 3, after making `provider` a required field on `ConfirmPaymentInput` per the plan's own behavior bullet ("a confirmed payment persists provider on the Payment row")
- **Issue:** `apps/service-payments/src/webhooks/webhooks.service.ts` (not in this plan's `files_modified`, owned by 08-12's per-tenant webhook routing per D-19) calls `confirmPayment` twice with a hardcoded literal `gateway` ("conekta"/"mercadopago") and no `provider`, which no longer compiled.
- **Fix:** Derived `provider` with the same legacy-compatible mapping already used in `payments.service.ts` (`mercadopago` stays `mercadopago`; anything else — i.e. the deprecated `conekta` webhook path — maps to `transfer`, since D-15 gives `conekta` no BYO equivalent), with a comment noting this shared/hardcoded webhook path is superseded by 08-12.
- **Files modified:** `apps/service-payments/src/webhooks/webhooks.service.ts`
- **Verification:** `pnpm --filter @cobrai/service-payments typecheck` exits 0; no test file exists for `webhooks.service.ts` in this repo, so no test coverage was affected
- **Committed in:** `bff881b`

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues, one pre-existing/out-of-scope compile bug and one direct consequence of this plan's own required-field change)
**Impact on plan:** No scope creep beyond what was needed to satisfy this plan's own hard acceptance criteria (clean monorepo `pnpm typecheck`/`pnpm test`) and to keep an out-of-plan caller compiling after a deliberate interface change.

## Known Stubs / Endpoint Confidence

- **ePayco verifier (LOW confidence)** — see Endpoint/Source table above and `payment-verifiers.ts`'s doc comment. Must be confirmed with real ePayco sandbox credentials before any tenant goes live on ePayco; this mirrors 08-08's own LOW-confidence flag on the ePayco checkout-creation endpoint (the same provider, a different documentation gap).
- **PayU's PING command signature was tested unsigned** (no `signature` field sent in the verification request) since PayU's own PING documentation does not require one — only `merchant.apiLogin`/`merchant.apiKey`. This differs from `PayuGateway.createCheckout`'s signed WebCheckout redirect, which is a different, signed flow. Not a stub — this is the documented shape of the PING command specifically.

None of these return a fabricated/simulated success; both are honestly-flagged confidence notes, not simulated verification.

## Threat Flags

None beyond what the plan's own threat model (T-08-09a through T-08-09f, T-08-SC) already covers:
- T-08-09a (debtor-supplied provider on public checkout): mitigated — `checkout()` never reads the request-body `gateway` field for dispatch, asserted by test
- T-08-09b (unencoded values breaking the external-link query string): mitigated — `resolveExternalLinkTemplate` runs every value through `encodeURIComponent`, asserted by test
- T-08-09e (credential leaking into a verifier error message): mitigated for all five new payment-provider verifiers — each returns only the provider's own response body/error field, asserted by a "secret redaction" test
- T-08-SC (npm/pip/cargo install legitimacy): not applicable — no package was installed in this plan

## Issues Encountered

- The worktree's initial HEAD (`34b1fd5`) predated wave 3's merged work, so `08-03`/`08-04`/`08-08`'s summaries and code (this plan's direct dependencies) were absent at start. Resolved per the `<worktree_branch_check>` protocol: verified the working tree was clean, then `git reset --hard` to the orchestrator-provided base commit (`ff27c7e`, which is a descendant of the stale HEAD per `git merge-base`), confirming afterward that all dependency summaries and source files existed. No work was lost — the worktree had no prior commits of its own.
- `pnpm --filter @cobrai/service-payments test` failed on the first run in this fresh worktree with "Failed to resolve entry for package @cobrai/utils/@cobrai/integrations/@cobrai/db" — the same pre-existing "packages need building before their `dist/` exists" gap 08-04 and 08-08 both flagged. Resolved by running `pnpm turbo build --filter=@cobrai/service-payments...` before testing; no source change, build artifacts only (gitignored).

## User Setup Required

None for this plan. All five payment-provider verifier endpoints use standard REST/HTTP(S) calls with tenant-supplied credentials at runtime; no new environment variables or platform-level secrets were introduced (BYO-only, per D-06).

## Next Phase Readiness

- `GatewayService.createCheckout`'s final signature (documented above) is ready for 08-12's webhook handlers and 08-18's frontend payments screen to build against.
- Every payment provider's reconciliation field, documented in 08-08's SUMMARY (Stripe `metadata.token`, Mercado Pago `external_reference`, Wompi `sku`/`payment_link_id`, PayU `referenceCode`, ePayco `invoice`/`x_id_factura`), is unchanged by this plan — 08-12 can proceed directly.
- `external_link`/`transfer` are fully wired end to end: template resolution, checkout dispatch, and no-network verification. 08-18's `ExternalLinkTemplateEditor` can call `resolveExternalLinkTemplate`/`validateExternalLinkTemplate` directly from `@cobrai/utils` for its live preview, using the exact same helper this plan's `ExternalLinkGateway` uses at checkout time.
- ePayco's live verification endpoint needs confirmation with real sandbox credentials before go-live (see Known Stubs) — same caveat 08-08 already raised for ePayco's checkout endpoint; both should likely be resolved together in one sandbox-testing pass.
- Monorepo-wide `pnpm typecheck` and `pnpm test` are both fully green (25/25 turbo tasks each) as of this plan's final commit.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 10 created files verified present on disk (`payment-link-template.ts`/`.spec.ts`, `external-link.gateway.ts`/`.spec.ts`, `transfer.gateway.ts`/`.spec.ts`, `gateway.service.spec.ts`, `communication-verifiers.ts`, `payment-verifiers.ts`/`.spec.ts`), this SUMMARY.md verified present, and all three task commits (`1488a20`, `66e113c`, `bff881b`) verified present in `git log`.
