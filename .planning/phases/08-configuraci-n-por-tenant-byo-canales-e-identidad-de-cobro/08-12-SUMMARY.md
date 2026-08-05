---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 12
subsystem: payments
tags: [webhooks, security, stripe, mercadopago, wompi, payu, epayco, fail-closed, hmac, vitest]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "TenantIntegration model, encrypted secrets, resolveByWebhookToken (08-03)"
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "Five BYO payment gateway adapters and their outgoing reconciliation fields (08-08)"
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "PaymentProvider dispatch, PaymentLink.provider/gateway columns, GatewayService.createCheckout (08-09)"
provides:
  - "POST /v1/webhooks/:provider/:token — the single token-routed webhook endpoint for all five API-backed payment providers"
  - "WebhookValidatorService.verify() — fail-closed (D-20), per-tenant signature verification for stripe/mercadopago/wompi/payu/epayco"
  - "Per-provider reconciliation handlers in WebhooksService, gated on each provider's own final-state code"
affects: [08-14, 08-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every webhook rejection (no secret, missing signature, bad signature, unknown token, unknown provider, provider/integration mismatch) throws the exact same UnauthorizedException(WEBHOOK_UNAUTHORIZED_MESSAGE) — no per-reason message variation, so the endpoint cannot be used as a tenant/token-existence oracle (D-19, T-08-07b). Distinguishing detail (which reason) lives only in the AuditLog action name, never in the HTTP response."
    - "Tenant resolved by opaque webhook token BEFORE signature verification (resolveByWebhookToken is deliberately not status-gated), since the signing secret to check against belongs to that specific integration"
    - "PaymentLink lookup in confirmFromToken is scoped to the resolved integration's own tenantId, not just token — closes a cross-tenant token-replay path where a validly-signed webhook for tenant A could otherwise confirm tenant B's payment link"

key-files:
  created:
    - apps/service-payments/src/webhooks/webhooks.controller.ts
    - apps/service-payments/src/webhooks/webhooks.controller.spec.ts
    - apps/service-payments/src/webhooks/webhooks.service.spec.ts
  modified:
    - apps/service-payments/src/webhooks/webhook-validator.service.ts
    - apps/service-payments/src/webhooks/webhook-validator.spec.ts
    - apps/service-payments/src/webhooks/webhooks.module.ts
    - apps/service-payments/src/webhooks/webhooks.service.ts
    - apps/service-payments/src/payments/payments.controller.ts
    - apps/service-payments/src/payments/payments.module.ts
    - apps/service-payments/src/app.module.ts
    - apps/service-payments/package.json

key-decisions:
  - "All webhook rejections share one exception instance/message (WEBHOOK_UNAUTHORIZED_MESSAGE), including WebhookValidatorService's own per-provider rejections (no secret / missing signature / bad signature) — required for the byte-identical-response test in Task 2's behavior block; provider-specific detail is audit-log-only, never surfaced to the caller"
  - "confirmFromToken no longer takes a `provider`/`gateway` parameter — it reads both straight off the found PaymentLink row (link.provider, link.gateway), replacing the previous 'infer gateway from provider string' hack that webhooks.service.ts's pre-08-12 compile fix used. Simpler and matches the pattern payments.service.ts's own simulateSandboxPayment already established."
  - "Wompi's transaction webhook does not carry the `sku` field 08-08's WompiGateway wrote PaymentLink.token into (confirmed live against docs.wompi.co/en/docs/colombia/eventos/ on 2026-08-04) — only the Payment Link resource itself does. handleWompi makes one extra authenticated GET to the tenant's own Payment Links API (using their BYO privateKey) keyed by the event's payment_link_id to recover it. A failed lookup is a safe no-op (200, nothing written), matching the retry-storm mitigation for every other unmatched-token case."
  - "PayU and ePayco handlers gate on the provider's own final-state code (state_pol=4 'Approved' for PayU, x_cod_transaction_state=1 'Aceptada' for ePayco) before calling confirmFromToken — added beyond the plan's literal text because without it, a Declined/Pending/Expired notification would mark a debt as paid (Rule 2: missing critical correctness gate). Both formulas were confirmed live against the providers' own docs, not guessed."
  - "Mercado Pago's dataId for the HMAC manifest is read from the echoed rawBody's data.id field rather than a query-string parameter — MP's own 'Without SDK' docs use req.query['data.id'], but this service's verify() interface (fixed by this plan's <interfaces> block) carries only rawBody/headers, and MP's own example webhook payload carries the identical id value in the body"

requirements-completed: [D-19, D-20, D-14]

duration: 23min
completed: 2026-08-04
---

# Phase 8 Plan 12: Fail-Closed, Token-Routed Payment Webhooks Summary

**Closed the fail-open webhook signature bug (`if (!secret) return;`) by rewriting `WebhookValidatorService` around a fail-closed `verify()` with live-confirmed signature formulas for all five BYO payment providers, and added the token-routed `POST /v1/webhooks/:provider/:token` endpoint (D-19) that resolves the tenant by opaque token before ever checking a signature, making unknown-token/unknown-provider/bad-signature responses byte-identical to the caller.**

## Performance

- **Duration:** ~23 min wall-clock from worktree base correction to final task commit (21:00–21:23)
- **Started:** 2026-08-04T21:00:14-05:00 (worktree base commit `c5a88ca`)
- **Completed:** 2026-08-04T21:22:53-05:00
- **Tasks:** 2 of 2 plan tasks completed
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments

- `WebhookValidatorService.verify()` — one fail-closed entry point replacing the two fail-open per-provider methods. Every rejection (no secret, missing signature, bad signature) writes an `AuditLog` entry (`<provider>.webhook_rejected_no_secret` / `<provider>.webhook_rejected_bad_signature`) before throwing, and the signing secret never appears in a thrown message or an audit `changes` payload (asserted by test)
- Real signature verification for all five providers, each formula confirmed live against the provider's own current documentation on 2026-08-04 (not assumed from training knowledge) — see the Signature Formula table below
- `WebhooksController` (`POST /v1/webhooks/:provider/:token`): resolves the tenant by opaque token via `TenantIntegrationService.resolveByWebhookToken` (deliberately not status-gated) BEFORE any signature check, cross-checks the path provider against the resolved integration's own provider, and passes the raw unparsed body straight to the validator
- Unknown provider, unknown token, and known-token-bad-signature are byte-identical 401 responses — a dedicated test asserts this pairwise across all three failure modes (T-08-07b)
- `WebhooksService` gained one reconciliation handler per provider (Stripe, Mercado Pago, Wompi, PayU, ePayco), reading exactly the field 08-08 documented the outgoing token into, each gated on the provider's own final-state code so a Declined/Pending notification never confirms a payment
- Legacy `POST /v1/payments/webhook/conekta` and `.../webhook/mp` routes removed from `PaymentsController`; `AppModule`'s `TenantContextMiddleware` exclusion list updated from the old hardcoded paths to `v1/webhooks/(.*)`
- Full monorepo `pnpm typecheck` and `pnpm test` both green (25/25 turbo tasks each), matching the plan's baseline

## Task Commits

1. **Task 1: Fail-closed, per-tenant signature verification for the five payment providers** - `5477bc4` (fix)
2. **Task 2: Token-routed WebhooksController and per-provider reconciliation handlers** - `25abf5f` (feat)

## Webhook URL Shape and Signature Formula Table (per plan's `<output>` requirement)

**URL shape:** `POST {PUBLIC_WEBHOOK_BASE_URL}/v1/webhooks/{provider}/{token}` where `{provider}` is one of `stripe|mercadopago|wompi|payu|epayco` and `{token}` is the integration's own `webhookToken` (256-bit random, from 08-03). This is exactly what `TenantIntegrationService.toView()` already builds into `IntegrationView.webhookUrl` for the five webhook-capable providers (08-03's `WEBHOOK_CAPABLE_PROVIDERS`) — 08-18's frontend can display it verbatim, and 08-14 constructs the base from `PUBLIC_WEBHOOK_BASE_URL`.

| Provider | Signature location | Formula (confirmed live 2026-08-04) | Source |
|---|---|---|---|
| Stripe | `Stripe-Signature: t=...,v1=...` header | `HMAC-SHA256(secret, "${t}.${rawBody}")` | docs.stripe.com/webhooks/signatures (fetched live) |
| Mercado Pago | `x-signature: ts=...,v1=...` + `x-request-id` header | `HMAC-SHA256(secret, "id:${dataId};request-id:${requestId};ts:${ts};")`, `dataId` lowercased, read from the echoed body's `data.id` | mercadopago.com.br/developers webhook-notifications page (fetched live); manual-manifest template corroborated via RESEARCH.md, since MP's current live docs now steer toward their SDK-only validator |
| Wompi | `signature.checksum`/`signature.properties` + `timestamp` fields embedded in the JSON body | `SHA256(concat(values of signature.properties, in order) + timestamp + secret)`, hex uppercased | docs.wompi.co/en/docs/colombia/eventos/ "Events" page (fetched live) |
| PayU | `sign` field in the `application/x-www-form-urlencoded` confirmation POST | `MD5("${apiKey}~${merchant_id}~${reference_sale}~${new_value}~${currency}~${state_pol}")`, `new_value` rounded to 1 decimal if the 2nd digit is 0, else 2 decimals | developers.payulatam.com "Confirmation URL" page, including its PHP reference implementation (fetched live) |
| ePayco | `x_signature` field in the `application/x-www-form-urlencoded` confirmation POST | `SHA256("${p_cust_id_cliente}^${p_key}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}")`, where `p_cust_id_cliente`/`p_key` are the tenant's own stored credentials (`publicConfig.custIdCliente`/`secrets.privateKey`), not echoed values | docs.epayco.com "URL de confirmación" page (fetched live) |

## Files Created/Modified

- `apps/service-payments/src/webhooks/webhook-validator.service.ts` — rewritten around `verify()`; deletes Conekta support (D-15) and the `void expected;` MP stub
- `apps/service-payments/src/webhooks/webhook-validator.spec.ts` — extended: per-provider no-secret/valid/invalid-signature coverage, header-absent cases, length-guard case, secret-redaction case
- `apps/service-payments/src/webhooks/webhooks.controller.ts` / `.spec.ts` — new token-routed controller
- `apps/service-payments/src/webhooks/webhooks.service.ts` / `.spec.ts` — five new per-provider handlers, `confirmFromToken` rewritten to read `link.provider`/`link.gateway` directly and scope the lookup to `tenantId`
- `apps/service-payments/src/webhooks/webhooks.module.ts` — registers `WebhooksController`, provides `AuditService`/`TenantIntegrationService` via the `compliance.module.ts` factory pattern
- `apps/service-payments/src/payments/payments.controller.ts` — legacy webhook routes and their `WebhooksService` injection removed
- `apps/service-payments/src/payments/payments.module.ts` — drops the now-unused `WebhookValidatorService`/`WebhooksService` duplicate providers
- `apps/service-payments/src/app.module.ts` — imports `WebhooksModule`; middleware exclusion updated to `v1/webhooks/(.*)`
- `apps/service-payments/package.json` (+`pnpm-lock.yaml`) — adds `@cobrai/compliance` for `AuditService`

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] PayU/ePayco handlers gate on the provider's own final-state/status code before confirming a payment**
- **Found during:** Task 2, while designing `handlePayu`/`handleEpayco`
- **Issue:** The plan's behavior bullets describe recovering the token and reconciling through `confirmFromToken`, but don't call out that PayU's confirmation POST fires on every final state (Approved, Declined, Expired) and ePayco's on every state transition — blindly confirming on any POST would mark a debt as paid for a *declined* or still-pending transaction.
- **Fix:** `handlePayu` no-ops unless `state_pol === "4"` (Approved); `handleEpayco` no-ops unless `x_cod_transaction_state === "1"` (Aceptada). Both codes confirmed against each provider's own live docs, not guessed.
- **Files modified:** `apps/service-payments/src/webhooks/webhooks.service.ts`
- **Verification:** `webhooks.service.spec.ts` has an explicit "no-op on Declined/Pending" test per provider
- **Committed in:** `25abf5f`

**2. [Rule 1 - Bug] Wompi reconciliation would have been permanently broken as literally specified**
- **Found during:** Task 2, while implementing `handleWompi` and fetching Wompi's live "Events" documentation to confirm the checksum formula for Task 1
- **Issue:** 08-08-SUMMARY.md's reconciliation-field table names `sku` for Wompi, but Wompi's actual `transaction.updated` event body (confirmed live) does not include `sku` at all — that field lives only on the Payment Link resource, not the Transaction resource. Reading `sku` off the webhook event would make every Wompi webhook silently no-op forever (the exact retry-storm/never-reconciles failure this plan's own `<context>` note warns about: "if the two drift, payments stop reconciling").
- **Fix:** `handleWompi` reads `payment_link_id` from the transaction event (which the event *does* carry) and makes one authenticated `GET https://production.wompi.co/v1/payment_links/{id}` call with the tenant's own BYO `privateKey` to fetch the Payment Link resource and read its `sku` there. This is exactly the fallback 08-08-SUMMARY.md's own deviation note flagged for this plan ("webhook `payment_link_id` is the more reliable alternative"). A failed lookup is a safe 200 no-op, consistent with every other unmatched-token path.
- **Files modified:** `apps/service-payments/src/webhooks/webhooks.service.ts`
- **Verification:** `webhooks.service.spec.ts` covers both the successful lookup-then-confirm path and the lookup-failure no-op path with a mocked `fetch`
- **Committed in:** `25abf5f`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug fix, 1 Rule 2 missing-critical-correctness-gate). Both are payment-correctness issues directly inside this plan's own two tasks — no scope creep beyond `apps/service-payments/`.
**Impact on plan:** Without either fix, this plan would have shipped a Wompi integration that can never reconcile and a PayU/ePayco path that marks declined payments as paid — both worse outcomes than the fail-open bug this plan exists to close.

## Known Stubs

None. Every handler either genuinely confirms a payment against a live-confirmed signature/state check, or safely no-ops (200, nothing written) — no fabricated success path exists anywhere in this plan's code.

## Threat Flags

None beyond what the plan's own threat model (T-08-07 through T-08-07f, T-08-SC) already covers — all six threats are mitigated exactly as the plan's threat register specifies:
- T-08-07 (forged webhook): fail-closed verification, `if (!secret) return` grep-asserted absent
- T-08-07b (tenant enumeration): byte-identical responses, asserted by test
- T-08-07c (silent rejection): every rejection audited before throwing
- T-08-07d (secret in audit/logs): asserted by test that it never appears
- T-08-07e (retry storm): unmatched token is a 200 no-op
- T-08-07f (cross-tenant token replay): `confirmFromToken` scopes the `PaymentLink` lookup to the resolved integration's own `tenantId`, asserted by test
- T-08-SC (package legitimacy): not applicable — the only new dependency is the workspace-internal `@cobrai/compliance`

## Issues Encountered

None beyond the two deviations documented above. The worktree required a `git reset --hard` to the orchestrator-provided base commit at start (per the `<worktree_branch_check>` protocol — the initial HEAD predated wave 4's merged tracking-doc commit); the working tree was clean before the reset, so no work was lost.

## User Setup Required

None for this plan. No new environment variables or platform-level secrets were introduced — every credential used (webhook signing secrets, `custIdCliente`, `privateKey`) is already sourced per-tenant via `TenantIntegrationService`, established by 08-03/08-08.

## Next Phase Readiness

- The webhook URL shape (`{PUBLIC_WEBHOOK_BASE_URL}/v1/webhooks/{provider}/{token}`) is exactly what `TenantIntegrationService.toView()` already exposes as `IntegrationView.webhookUrl` — 08-18's payments settings screen can display it directly with no new backend work.
- Plan 08-14 (owning `PUBLIC_WEBHOOK_BASE_URL` and `apps/api-gateway`) can build the base URL independently; this plan's controller only consumes the path portion (`:provider/:token`) and does not read that env var itself.
- ePayco's signature formula is now live-confirmed (unlike 08-08/08-09's LOW-confidence flags on ePayco's *checkout-creation* endpoint) — the confirmation-side formula came from a different, more stable ePayco docs page than the checkout-creation endpoint both prior plans flagged as unconfirmed. The checkout-creation LOW-confidence flag from 08-08/08-09 still stands and is unrelated to this plan's work.
- Monorepo-wide `pnpm typecheck` and `pnpm test` are both fully green (25/25 turbo tasks each) as of this plan's final commit — matching the baseline this plan was handed.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 3 created files verified present on disk (`webhooks.controller.ts`, `webhooks.controller.spec.ts`, `webhooks.service.spec.ts`), this SUMMARY.md verified present, and both task commits (`5477bc4`, `25abf5f`) verified present in `git log`.
