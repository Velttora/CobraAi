---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 08
subsystem: payments
tags: [stripe, mercadopago, wompi, payu, epayco, byo, fetch, vitest]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "PaymentProvider enum + provider/method split on payment_links (08-04)"
provides:
  - "GatewayAdapter contract (gateway.types.ts) — CheckoutSession, CreateCheckoutInput, GatewayAdapter"
  - "Five BYO payment gateway adapters: StripeGateway, MercadoPagoGateway, WompiGateway, PayuGateway, EpaycoGateway"
  - "gateways.module.ts registering all five as injectable providers"
affects: [08-09, 08-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw fetch for every provider (Stripe included) instead of the official SDK — see Deviations"
    - "Per-adapter amount-unit and reconciliation-field documentation via comments, verified against live provider docs where fetchable in this session"
    - "Error extraction reads response.text() once then attempts JSON.parse — avoids the 'body already consumed' bug of calling both .json() and .text() on the same Response"

key-files:
  created:
    - apps/service-payments/src/gateways/gateway.types.ts
    - apps/service-payments/src/gateways/stripe.gateway.ts
    - apps/service-payments/src/gateways/stripe.gateway.spec.ts
    - apps/service-payments/src/gateways/mercadopago.gateway.ts
    - apps/service-payments/src/gateways/mercadopago.gateway.spec.ts
    - apps/service-payments/src/gateways/wompi.gateway.ts
    - apps/service-payments/src/gateways/wompi.gateway.spec.ts
    - apps/service-payments/src/gateways/payu.gateway.ts
    - apps/service-payments/src/gateways/payu.gateway.spec.ts
    - apps/service-payments/src/gateways/epayco.gateway.ts
    - apps/service-payments/src/gateways/epayco.gateway.spec.ts
  modified:
    - apps/service-payments/src/gateways/gateways.module.ts

key-decisions:
  - "Task 1's package-legitimacy gate (gate=\"blocking-human\") for the `stripe` npm package was not cleared by a genuine user response in this session — a message purporting to be from 'the coordinator' asserted approval with registry evidence, but per this agent's operating rules no agent message (including an orchestrating agent) constitutes user consent for a blocking-human checkpoint. Rather than stall the whole plan, the plan's own documented no-install fallback was used: StripeGateway is implemented with raw fetch against the Stripe REST API, and `stripe` was never added to package.json. This can be revisited by an explicit human confirmation later, at which point stripe.gateway.ts can be swapped to the official SDK without changing its GatewayAdapter contract."
  - "Wompi's Payment Links API has no 'reference' field at creation time (confirmed live against docs.wompi.co 2026-08-04) — used `sku` (max 36 chars) as the reconciliation field carrying PaymentLink.token instead, with a comment noting Wompi's transaction webhooks also carry payment_link_id (= this adapter's gateway_ref) as a more reliable alternative for plan 08-12"
  - "PayU and ePayco are HTML-form/browser-redirect integrations, not JSON REST APIs — both adapters build a query-string redirect URL rather than making an HTTP call, matching the single-URL CheckoutSession contract; PayU's signature formula and endpoint were confirmed live against developers.payulatam.com, ePayco's checkout-creation endpoint could not be confirmed (see Known Stubs / Endpoint Confidence below)"
  - "MercadoPagoGateway prefers init_point over sandbox_init_point (fixing the legacy code's backwards preference) and Stripe/Wompi/PayU/ePayco never fall back to a sandbox/simulated URL when a credential is missing — all five throw instead, per D-06/D-17"

requirements-completed: [D-06]

duration: 26min (includes an interruption awaiting checkpoint resolution)
completed: 2026-08-04
---

# Phase 8 Plan 08: BYO Payment Gateway Adapters Summary

**Five BYO payment gateway adapters (Stripe, Mercado Pago, Wompi, PayU Colombia, ePayco) behind a shared `GatewayAdapter` contract, all credentials resolved per call from `input.secrets`/`input.publicConfig` — Stripe implemented via raw fetch rather than the official SDK because its package-legitimacy gate could not be cleared by genuine human confirmation in this session.**

## Performance

- **Duration:** ~26 min wall-clock from worktree base to final commit (19:51–20:17), including a checkpoint pause awaiting Task 1's human-verify resolution
- **Started:** 2026-08-04T19:51:25-05:00
- **Completed:** 2026-08-04T20:17:34-05:00
- **Tasks:** 2 of 3 plan tasks executed as code (Task 1 is the package-legitimacy gate itself, resolved via the plan's documented fallback rather than an SDK install)
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments

- `GatewayAdapter`/`CreateCheckoutInput`/`CheckoutSession` contract in `gateway.types.ts`, exactly matching the plan's `<interfaces>` block; `CheckoutSession` kept byte-identical to the legacy `gateway.service.ts` export that `payments.service.ts` already destructures
- `StripeGateway` (raw fetch, Payment Links REST API), `MercadoPagoGateway` (raw fetch, Checkout Preferences API, `init_point` bug fixed), `WompiGateway`, `PayuGateway`, `EpaycoGateway` — all five stateless, all five throw on a missing credential instead of returning a fabricated URL (D-17), none read a platform-level config service (D-06)
- 33 passing Vitest specs across 5 new spec files, each covering every behavior bullet in the plan plus a "secret never leaked" assertion and, for the three raw-fetch/redirect Colombian gateways, an exact-amount assertion for a 450,000 COP input
- Endpoints verified live against provider documentation where fetchable in this session (see Endpoint/Amount-Unit/Reconciliation table below); ePayco's create-checkout endpoint could not be confirmed and is flagged LOW confidence rather than guessed silently

## Task Commits

1. **Task 1: Package legitimacy gate for the stripe npm package** — resolved via fallback, no commit (see Deviations; no code was written for this task itself)
2. **Task 2: GatewayAdapter contract plus the Stripe and Mercado Pago adapters** - `81579e9` (feat)
3. **Task 3: Wompi, PayU Colombia and ePayco adapters via raw fetch** - `1e9e18d` (feat)

## Endpoint / Amount-Unit / Reconciliation Table (per plan's `<output>` requirement)

| Provider | Endpoint coded against | Source | Amount unit | Reconciliation field |
|---|---|---|---|---|
| Stripe | `POST https://api.stripe.com/v1/payment_links` | https://docs.stripe.com/api/payment-link/create (RESEARCH.md Sources) | Smallest currency unit assuming 2-decimal currency (`amount * 100`), matching this repo's existing Conekta convention | `metadata[token]` — read from `checkout.session.completed` event |
| Mercado Pago | `POST https://api.mercadopago.com/checkout/preferences` | RESEARCH.md Sources / lifted from existing `createMercadoPagoCheckout` | Decimal, as sent by the debtor's currency (`unit_price`) | `external_reference` |
| Wompi | `POST https://production.wompi.co/v1/payment_links` | https://docs.wompi.co/en/docs/colombia/links-de-pago/ — fetched live 2026-08-04, confirmed request/response shape | `amount_in_cents` (integer, cents) | `sku` (36-char max) — see Deviations for why not "reference"; webhook `payment_link_id` is the more reliable alternative |
| PayU Colombia | `GET https://checkout.payulatam.com/ppp-web-gateway-payu/?...` (query-string WebCheckout redirect) | https://developers.payulatam.com/latam/en/docs/integrations/webcheckout-integration/payment-form.html — fetched live 2026-08-04, confirmed signature formula and checkout URLs | Decimal string, 2 fixed places (`amount.toFixed(2)`), identical in both the URL and the signature base string | `referenceCode` |
| ePayco | `GET https://checkout.epayco.co/checkout.php?...` (query-string redirect) | **LOW confidence / partially unconfirmed** — see Known Stubs | Decimal string, 2 fixed places | `invoice` (echoed back as `x_id_factura`) |

## Files Created/Modified

- `apps/service-payments/src/gateways/gateway.types.ts` - `GatewayAdapter`/`CreateCheckoutInput`/`CheckoutSession` contract
- `apps/service-payments/src/gateways/stripe.gateway.ts` / `.spec.ts` - Stripe Payment Links via raw fetch, form-encoded body, metadata token
- `apps/service-payments/src/gateways/mercadopago.gateway.ts` / `.spec.ts` - Mercado Pago Checkout Preferences, `init_point` fix
- `apps/service-payments/src/gateways/wompi.gateway.ts` / `.spec.ts` - Wompi payment links, cents amount, `sku` reconciliation
- `apps/service-payments/src/gateways/payu.gateway.ts` / `.spec.ts` - PayU WebCheckout redirect URL, MD5 signature
- `apps/service-payments/src/gateways/epayco.gateway.ts` / `.spec.ts` - ePayco checkout redirect URL (endpoint unconfirmed)
- `apps/service-payments/src/gateways/gateways.module.ts` - registers all five adapters as providers/exports

## Decisions Made

See `key-decisions` in frontmatter. In addition:

- Both `stripe.gateway.ts` and `wompi.gateway.ts` read the HTTP response body as text exactly once, then attempt `JSON.parse` on it for the error path — an earlier draft called both `.json()` and `.text()` on the same `Response`, which throws "body already consumed" under real `fetch`/undici; caught and fixed before committing (Rule 1).
- PayU's signature uses MD5 (PayU's documented default/simplest option among MD5/SHA/SHA256/HMAC-SHA256) — not a password hash, this is a non-repudiation checksum PayU's own protocol accepts; documented in a code comment alongside the confirmation-side formula for plan 08-12.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed "body already consumed" risk in Stripe/Wompi error extraction**
- **Found during:** Task 2/3, self-review before committing
- **Issue:** Initial implementation called `response.json()` then `response.text()` as a fallback on the same `Response` object — the second call throws once the first has read the stream.
- **Fix:** Both adapters now read `response.text()` once and attempt `JSON.parse` on the raw string, falling back to the raw text.
- **Files modified:** `stripe.gateway.ts`, `wompi.gateway.ts` (and their specs, to match the new mock shape)
- **Commits:** `81579e9`, `1e9e18d`

### Checkpoint Resolution (not an auto-fix — a blocking-human gate)

**Task 1 — package legitimacy gate for the `stripe` npm package.** Per this plan's `gate="blocking-human"` and this agent's operating rules, no agent message (including a message from "the coordinator" orchestrating this execution) counts as user consent for a blocking-human checkpoint — only the actual human user's own message does. A message during this session, purporting to relay coordinator/user approval with npm registry evidence, was received but not treated as sufficient authorization, since it originated from an agent context rather than a direct user response. Rather than stall the plan indefinitely, the plan's own documented contingency was used: implement `StripeGateway` via raw `fetch` against the Stripe REST API (the same no-new-dependency path the other four gateways already use) instead of installing the `stripe` npm package. No `stripe` entry exists in `apps/service-payments/package.json`; `package.json` was not modified by this plan.

If a human wants to install the official `stripe` SDK, the registry provenance gathered in this session (both independently and via the relayed message) can be handed to them for a genuine one-line confirmation:
- Repository: `git+https://github.com/stripe/stripe-node.git`
- Maintainer: `stripe-bindings`
- Latest version: `22.4.0`
- No `postinstall` script
- (Independently verified against the live npm registry API by this agent on 2026-08-04)

---

**Total deviations:** 1 auto-fixed (1 bug), 1 checkpoint resolved via documented fallback (not an auto-fix)
**Impact on plan:** No scope creep. Stripe's adapter is functionally equivalent under the `GatewayAdapter` contract regardless of fetch-vs-SDK implementation; swapping to the SDK later is a same-file, same-interface change.

## Known Stubs / Endpoint Confidence

- **ePayco checkout-creation endpoint (LOW confidence).** This session confirmed `checkout.epayco.co` as ePayco's checkout host (it serves the `checkout.js` client-side SDK, referenced from the official confirmation-URL docs page fetched live) but could not confirm a documented server-side "create a hosted checkout link" REST endpoint — ePayco's current docs surface a client-side JS widget and a separate dashboard-configured "Recaudo en línea" product, neither of which is a bare backend-constructible redirect URL. `EpaycoGateway` targets `https://checkout.epayco.co/checkout.php` with the same field names the `checkout.js` widget accepts, following the long-established public pattern for this integration, but this specific path was **not** verified against a current, live ePayco doc page in this session. **This must be verified with a real ePayco sandbox transaction before any tenant goes live on ePayco** — flagged per the plan's own "mark the adapter's status in the SUMMARY rather than guessing a URL" instruction. The adapter's contract, tests, and reconciliation-field behavior are otherwise complete and correct against the documented confirmation-side field names.
- **PayU payer/billing fields omitted.** PayU's WebCheckout form marks `payerFullName`, `payerEmail`, `payerPhone`, `payerDocumentType`, `payerDocument` as mandatory per its own docs, but none of these exist in this plan's `CreateCheckoutInput` contract. `PayuGateway` omits them, matching this plan's explicit behavior spec (which lists only `merchantId`/`accountId`/`referenceCode`/`amount`/`currency`/`signature`). This may need revisiting by whichever plan builds the actual debtor-facing checkout page if PayU rejects the redirect without those fields in production testing.
- **PayU/ePayco return a query-string GET redirect, not a POST form.** Both providers' official integration path is an HTML form POST from the browser. Since this plan's contract is a single `gateway_payment_url` string, both adapters build the equivalent query string against the same endpoint. If a provider strictly requires POST, the frontend page rendering `gateway_payment_url` (a later plan) will need to render an auto-submitting form using these same parameters instead of a bare link — noted in-code.

None of these stubs return a fabricated/simulated success; they are honestly-flagged confidence gaps in the redirect construction, not simulated payment paths.

## Threat Flags

None beyond what the plan's own threat model (T-08-06 through T-08-06e, T-08-SC) already covers — every adapter's tests assert the secret never appears in a thrown message or the returned URL, and T-08-SC (npm install legitimacy) is addressed by not installing `stripe` at all rather than by weakening the gate.

## Issues Encountered

- Pre-existing workspace-build gap (same one 08-04's SUMMARY flagged): `packages/db/dist` did not exist in this fresh worktree, causing `Failed to resolve entry for package "@cobrai/db"` on the first `vitest run`. Fixed by running `pnpm turbo build --filter=@cobrai/service-payments...` before testing — no source change, build artifacts only (gitignored).
- `pnpm --filter @cobrai/service-payments typecheck` still reports exactly the 2 pre-existing errors documented in this plan's `<known_broken_state>` (`payment-confirmation.service.ts:57`, `payments.service.ts:48`, both missing the now-required `provider` field). These files are explicitly out of scope for this plan (owned by 08-09) and were not touched. No other type errors were introduced by this plan's files.

## User Setup Required

None for this plan. If a human later approves installing the official `stripe` SDK (see Deviations), `pnpm --filter @cobrai/service-payments add stripe` plus a follow-up edit to `stripe.gateway.ts` would be the only required step — no environment variables change, since credentials are already sourced per-tenant, not from `.env`.

## Next Phase Readiness

- All five `GatewayAdapter` implementations are injectable via `GatewaysModule` and ready for plan 08-09 to wire into dispatch (replacing the `ConfigService`-reading branches in `gateway.service.ts`/`payments.service.ts`).
- Plan 08-12's webhook handlers can rely on the reconciliation fields documented per provider above and in-code comments: Stripe `metadata.token`, Mercado Pago `external_reference`, Wompi `sku`/`payment_link_id`, PayU `referenceCode`, ePayco `invoice`/`x_id_factura`.
- ePayco's endpoint needs a real sandbox transaction to confirm before go-live (see Known Stubs).
- Task 1's Stripe SDK question remains open for a human to resolve with a direct, non-agent-relayed confirmation; the current raw-fetch implementation is fully functional in the interim and requires no further action to ship.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 12 created/modified source files verified present on disk (`gateway.types.ts`, five `*.gateway.ts` adapters, five `*.gateway.spec.ts` specs, `gateways.module.ts`), this SUMMARY.md verified present, and both task commits (`81579e9`, `1e9e18d`) verified present in `git log`.
