---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
review: gateways-live-doc-verification
reviewed: 2026-08-06T20:55:00Z
depth: deep (live fetch of each provider's current official documentation + provider-owned SDK source, cross-referenced against implementation)
files_reviewed: 7
files_reviewed_list:
  - apps/service-payments/src/webhooks/webhook-validator.service.ts
  - apps/service-payments/src/gateways/stripe.gateway.ts
  - apps/service-payments/src/gateways/wompi.gateway.ts
  - apps/service-payments/src/gateways/payu.gateway.ts
  - apps/service-payments/src/gateways/epayco.gateway.ts
  - apps/service-payments/src/gateways/mercadopago.gateway.ts
  - apps/service-payments/src/webhooks/webhooks.service.ts
findings:
  critical: 5
  warning: 3
  info: 0
  total: 8
status: issues_found
---

# Phase 8: Live Gateway/Webhook Verification Report

**Reviewed:** 2026-08-06
**Method:** Fetched each provider's current official documentation live (not from training knowledge), and where docs were ambiguous or paywalled behind a client-side widget, pulled the provider's own currently-served JS/SDK source directly and read the real request/response shapes out of it. Every claim below is followed by the URL or source file that was actually fetched during this review, today.
**Status:** 2 of 5 gateways are production-safe as implemented (Wompi, PayU signature/status logic). 3 of 5 have at least one confirmed BLOCKER that will either silently stop payments from reconciling or stop debtors from paying at all.

## Summary

Both SUMMARY docs (08-08, 08-12) were honest about the one gap they knew about (ePayco's checkout endpoint, flagged LOW confidence) and about the one gap they found and fixed (Wompi's `sku` not being on the transaction webhook). Independently re-verifying against live docs today found that gap analysis was incomplete in two important ways:

1. **The exact same class of bug that was caught for Wompi (reconciliation field not actually present in the real webhook payload) also exists for Mercado Pago, and was not caught.** `handleMercadoPago` reads `external_reference` directly off the raw webhook body. Mercado Pago's real webhook body never carries that field — confirmed against both the official docs' example payload and the official `sdk-nodejs` package's own documented usage, which requires a follow-up `GET /v1/payments/{id}` call to get it. As implemented today, **no Mercado Pago payment will ever reconcile** — the handler silently no-ops and the endpoint still returns HTTP 200, so Mercado Pago will not retry either. Also, unlike PayU/ePayco, `handleMercadoPago` has no final-state gate at all.
2. **ePayco's checkout-creation endpoint isn't merely unconfirmed — it can be shown to be wrong today.** `https://checkout.epayco.co/checkout.php` returns HTTP 403 with an S3 `AccessDenied` body (evidence of a route that doesn't exist as a static object on that origin), while the same CDN currently and actively serves `checkout.js` (last-modified within the last two months). Decompiling that live SDK bundle reveals ePayco's actual current create-checkout flow, which is a two-step POST-then-redirect, not a GET query string against `checkout.php`.

Stripe's signature formula, Wompi's signature formula and payment-link shape, PayU's confirmation signature/rounding rule, and ePayco's confirmation signature/state-code gate all verify byte-for-byte against currently live documentation. Two additional issues were found beyond the explicit brief: Stripe's reconciliation handler doesn't check `payment_status`, and PayU's checkout redirect is missing fields PayU's own docs mark `Mandatory: Yes`.

---

## Stripe

**Signature formula: VERIFIED**
Evidence: `https://docs.stripe.com/webhooks/signatures` (fetched live). The page states the `signed_payload` string is built by concatenating `{timestamp}` + `.` + `{raw request body}`, then HMAC-SHA256'd with the endpoint secret. `webhook-validator.service.ts:93` does exactly this: `createHmac("sha256", secret).update(\`${parts.t}.${rawBody}\`)`. Header parsing of `t=...,v1=...` also matches the documented `Stripe-Signature` shape.

**Checkout creation shape: VERIFIED**
Evidence: `https://docs.stripe.com/api/payment-link/create` (fetched live). `POST /v1/payment_links`, Bearer auth, form-encoded body with `line_items[0][price_data][...]` bracket notation — matches `stripe.gateway.ts:66-78`. The same page's `metadata` field description states: *"Metadata associated with this Payment Link will automatically be copied to checkout sessions created by this payment link"* — confirming `metadata[token]` set at link-creation time (`stripe.gateway.ts:74`) really does land on `session.metadata.token`, which `webhooks.service.ts:56` reads back. This part of the reconciliation chain is sound.

**Reconciliation gating: MISMATCH — BLOCKER (CR-01)**
`webhooks.service.ts:51-61` (`handleStripe`) confirms a payment the moment `event.type === "checkout.session.completed"` fires, without ever inspecting `session.payment_status`.

Evidence: `https://docs.stripe.com/payments/checkout/fulfill-orders` (fetched live) — Stripe's own order-fulfillment guide instructs integrators to listen for **both** `checkout.session.completed` **and** `checkout.session.async_payment_succeeded`, and explicitly says: *"Check the payment_status property to determine if it requires fulfillment... if checkout_session.payment_status != 'unpaid'"*. The reason: for delayed-notification payment methods (bank debits, OXXO, Boleto — all commonly enabled for LatAm merchants, which is this system's target market), `checkout.session.completed` fires immediately with `payment_status: "unpaid"` while the money is still in flight; the real confirmation comes later via `checkout.session.async_payment_succeeded`.

**Concrete failure:** if a tenant's Stripe account has any delayed payment method enabled (very plausible for a Colombia/LatAm debt-collection product), a debtor who merely *starts* an OXXO/bank-transfer payment — without ever completing it — gets their debt marked paid immediately. For a debt-collection product this is the worst possible direction to be wrong in.

**Fix:** in `handleStripe`, only call `confirmFromToken` when `session.payment_status !== "unpaid"`, and additionally subscribe/dispatch on `checkout.session.async_payment_succeeded` (same `session.metadata.token` shape) to catch the delayed-success case that never re-fires `checkout.session.completed`.

---

## Wompi

**Signature formula: VERIFIED**
Evidence: `https://docs.wompi.co/en/docs/colombia/eventos/` (fetched live). The page's own step-by-step example walks through: concatenate the values of `signature.properties` (paths into `data`) in order, then the `timestamp` field, then the Events secret, then SHA256 the result. `webhook-validator.service.ts:127-129` matches exactly, including resolving each `properties` path against `event.data` via dotted-path lookup.

**Checkout creation shape: VERIFIED**
Evidence: `https://docs.wompi.co/en/docs/colombia/links-de-pago/` (fetched live). `POST /v1/payment_links` with Bearer private-key auth and the exact field set `name/description/single_use/collect_shipping/currency/amount_in_cents/redirect_url/sku` (all confirmed present in the docs' request schema) matches `wompi.gateway.ts:38-56`. The resulting checkout URL pattern `https://checkout.wompi.co/l/:payment_link_id` (`wompi.gateway.ts:71`) is stated verbatim in the docs.

**Reconciliation key: VERIFIED (design), WARNING on failure mode (WR-01)**
Confirmed live: the sample `transaction.updated` event body in the docs does **not** include `sku` — it's only present on the Payment Link resource (`GET /v1/payment_links/:id`), which is what 08-12's `handleWompi` correctly falls back to. This matches the deviation both SUMMARYs already documented, and it's correct.

However, that fallback (`webhooks.service.ts:95-108`, `lookupWompiPaymentLinkSku`) wraps the outbound `fetch` in a try/catch that returns `null` on **any** failure — network blip, Wompi 5xx, timeout, or a rate limit — not just "the payment link genuinely doesn't have that transaction." A `null` return causes `handleWompi` to silently return (`webhooks.service.ts:90`), and the outer controller still responds `200` (`webhooks.controller.ts:31,67`) with no exception thrown. Wompi's own retry policy (`docs.wompi.co/.../eventos/`: retries only on non-200) means a transient failure during this lookup call permanently and silently drops that reconciliation — Wompi will never resend the event because, from its point of view, delivery succeeded.

**Fix:** distinguish "lookup succeeded, no `sku` on the link" (safe permanent no-op) from "the lookup call itself failed" (should surface as a 5xx so Wompi retries, or should be queued for retry rather than swallowed).

---

## PayU Colombia

**Confirmation signature formula + rounding rule: VERIFIED**
Evidence: `https://developers.payulatam.com/latam/en/docs/integrations/confirmation-url.html` (fetched live). The page's reference PHP implementation is character-for-character what `webhook-validator.service.ts:141-144` (`formatPayuValue` + `MD5(apiKey~merchant_id~reference_sale~new_value~currency~state_pol)`) does, including the exact rounding rule ("if the second decimal is 0 → one decimal place, else two decimal places").

**Status gating: VERIFIED**
Docs list `state_pol` values `4=Approved, 5=Expired, 6=Declined/Rejected`; the reference implementation explicitly gates fulfillment on `case '4'`. `webhooks.service.ts:118` (`if (body.state_pol !== "4") return;`) matches.

**Checkout creation shape: MISMATCH — BLOCKER (CR-02)**
Evidence: `https://developers.payulatam.com/latam/en/docs/integrations/webcheckout-integration/payment-form.html` (fetched live). The page's own Parameters table has an explicit **"Mandatory"** column. The following fields are marked `Yes` and are **not sent** by `payu.gateway.ts`'s `createCheckout`:

| Field | Mandatory per PayU docs | Sent by `PayuGateway`? |
|---|---|---|
| `payerFullName` | Yes | No |
| `payerEmail` | Yes | No |
| `payerPhone` | Yes | No |
| `payerDocumentType` | Yes | No |
| `payerDocument` | Yes | No |
| `buyerFullName` | Yes | No |
| `buyerEmail` | Yes | No |
| `buyerDocumentType` | Yes | No |
| `buyerDocument` | Yes | No |

**Concrete failure:** `CreateCheckoutInput` (per `gateway.types.ts`, consumed by `payu.gateway.ts:25-68`) doesn't carry the debtor's name/email/phone/document at all, so there is no way for this adapter to populate these fields even if it wanted to. Redirecting a debtor to PayU's WebCheckout with these fields absent is very likely to be rejected by PayU's own form validation before the debtor can enter payment details at all — the exact "checkout link 4xx's and the debtor cannot pay" failure this review was commissioned to catch. 08-08-SUMMARY.md flagged this as a soft "may need revisiting" caveat; live docs today confirm it's not optional.

**Fix:** `CreateCheckoutInput` needs debtor name/email/phone/document fields threaded through from whatever the debt/debtor record already has, and `PayuGateway` needs to add `payerFullName`, `payerEmail`, `payerPhone`, `payerDocumentType`, `payerDocument`, `buyerFullName`, `buyerEmail`, `buyerDocumentType`, `buyerDocument` to the query string it builds.

---

## ePayco

**Confirmation signature formula: VERIFIED**
Evidence: `https://docs.epayco.com/docs/url-de-confirmacion` (fetched live). States: `hash('sha256', $p_cust_id_cliente.'^'.$p_key.'^'.$x_ref_payco.'^'.$x_transaction_id.'^'.$x_amount.'^'.$x_currency_code)`. `webhook-validator.service.ts:157` matches exactly (`custIdCliente^secret(privateKey)^refPayco^transactionId^amount^currencyCode`, SHA256).

**Status gating: VERIFIED**
Same page's state table: `x_cod_transaction_state = 1` is "Aceptada" (the only paid state; 2=Rechazada, 3=Pendiente, 4=Fallida, 6=Reversada). `webhooks.service.ts:134` gates on `=== "1"` only — correct.

**Checkout creation endpoint: MISMATCH — BLOCKER, confirmed broken, not merely unconfirmed (CR-03)**
The 08-08-SUMMARY honestly flagged this as LOW confidence and unconfirmed. Independent live testing today goes further and confirms it's actively broken:

- `curl -I https://checkout.epayco.co/checkout.php` → **HTTP 403**, body `<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>`, served by CloudFront/S3. This is the response S3 gives for an object key that doesn't exist under a bucket policy that denies listing — i.e. `checkout.php` is not a real resource on that host today.
- The same host actively and successfully serves `checkout.epayco.co/checkout.js` (HTTP 200, `last-modified: Thu, 11 Jun 2026`) — proving the host is live and the failure is specific to the `checkout.php` path, not a network/DNS issue.
- Reading the (unminified enough to be legible) source of that live `checkout.js` reveals ePayco's actual current create-checkout flow:
  1. `POST https://secure.epayco.co/create/transaction/{epaycoKey}/{isSession}` with body `fname=<urlencoded JSON of the checkout options>` (Content-Type `application/x-www-form-urlencoded`) → returns `{ data: { id_session: "..." } }`.
  2. Redirect the debtor's browser to `https://secure.epayco.co/v1/transaction/payment.html?transaction={id_session}` (or `.../payment/methods?transaction={id_session}` for the multi-method flow).

  Source: `https://checkout.epayco.co/checkout.js` (fetched live, 2026-08-06), functions `generateTransactionId` / `generateStandardCheckout` / `getEndPoint`.

**Concrete failure:** every ePayco payment link this system generates today points a debtor's browser at a URL that returns a raw AccessDenied XML document instead of a checkout page. No ePayco debtor can currently pay through this integration.

**Fix:** `EpaycoGateway.createCheckout` needs to become a two-step flow: a server-side `POST https://secure.epayco.co/create/transaction/{publicKey}/{isSession}` (this requires an actual HTTP call at creation time, unlike the current zero-HTTP-call redirect-URL-builder design) to obtain `id_session`, then return `https://secure.epayco.co/v1/transaction/payment.html?transaction={id_session}` as `gateway_payment_url`. This is a shape change, not a URL swap — flag for a design revisit, and this **must** be validated against a real ePayco sandbox transaction before any tenant goes live on ePayco (the field names inside the `fname` JSON payload were not independently re-verified in this pass beyond what's visible in the minified bundle, since the current adapter's field names were built for the wrong endpoint entirely).

---

## Mercado Pago

**Signature formula: MISMATCH (edge case) — WARNING (WR-02)**
Evidence: `https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts` (fetched live — the current official Node SDK's own source, since MP's live docs page now points integrators at the SDK rather than publishing the manual manifest formula, which the 08-12-SUMMARY itself already noted). The SDK's `buildManifest`:
```ts
function buildManifest(dataId, requestId, ts) {
  const parts = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return parts.join(';') + ';';
}
```
— it **omits** the `id:` or `request-id:` segment entirely when that value is absent. `webhook-validator.service.ts:112` instead always includes both segments, falling back to an empty string:
```ts
const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
```
If a real notification ever arrives without an `x-request-id` header or without a `data.id` in the body, this implementation computes a different HMAC than Mercado Pago did, and a legitimate webhook gets rejected as an invalid signature. This is fail-closed (no security exposure), but it's a correctness gap that would manifest as unexplained payment-reconciliation failures for whatever fraction of MP's real traffic omits one of those fields — most `payment` topic traffic does carry both per the docs example, so this is scoped as a WARNING rather than a BLOCKER, but it should be brought in line with the vendor's own formula.

**Fix:** only append `id:${id};` when `id` is non-empty, and only append `request-id:${requestId};` when `requestId` is non-empty, matching the SDK's `buildManifest` exactly.

**Checkout creation shape: VERIFIED**
Evidence: live probe of `https://api.mercadopago.com/checkout/preferences` — unauthenticated `POST` returns `403 {"code":"PA_UNAUTHORIZED_RESULT_FROM_POLICIES", ...}` (not 404), confirming the endpoint is live and simply requires the tenant's Bearer token, which is what `mercadopago.gateway.ts:32-37` sends. `unit_price` as a plain decimal (not cents) matches MP's documented amount unit.

**Reconciliation: MISMATCH — BLOCKER, most severe finding in this review (CR-04, CR-05)**

*CR-04 — the reconciliation field the code reads does not exist in the real webhook payload.*
`webhooks.service.ts:64-71` (`handleMercadoPago`) reads `body.external_reference` directly off the raw notification body. Evidence that this field is never present there: `https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks` (fetched live) shows MP's actual webhook body shape as:
```json
{
  "id": 12345, "live_mode": true, "type": "payment",
  "date_created": "...", "user_id": 44444, "api_version": "v1",
  "action": "payment.created",
  "data": { "id": "999999999" }
}
```
There is no `external_reference` field anywhere in this object — corroborated independently by the official SDK's own documented usage pattern on the same page, which reads `dataId` from `data.id` and explicitly tells integrators to make a **separate authenticated follow-up call**, `GET https://api.mercadopago.com/v1/payments/{id}`, to retrieve the full payment resource (which is where `external_reference` actually lives).

**Concrete failure:** `token` in `handleMercadoPago` is always `""` for every real Mercado Pago notification. `confirmFromToken` is never reached. `webhooks.controller.ts` still returns HTTP 200 (`@HttpCode(200)`, no exception thrown anywhere in this path), so Mercado Pago considers the notification delivered and will not retry. **No Mercado Pago payment can reconcile via this webhook path as currently implemented** — this is the same class of bug 08-12 found and fixed for Wompi's `sku`, but it exists here too and was not caught.

*CR-05 — no final-state gate, unlike every other provider's handler.*
Even after CR-04 is fixed by adding the required `GET /v1/payments/{id}` lookup, that same fix must also read `status` off the response and gate on it — `handleMercadoPago` currently has no status check at all. MP fires notifications on `payment.created` and `payment.updated`, i.e. on every status transition (`pending`, `in_process`, `rejected`, `approved`, `refunded`, `charged_back`, etc.), not only on final success. This is exactly the "Declined/Pending marks a debt as paid" bug class that 08-12's own SUMMARY explicitly called out and fixed for PayU and ePayco — it was missed for Mercado Pago.

**Fix:** after signature verification, `handleMercadoPago` must call `GET https://api.mercadopago.com/v1/payments/{data.id}` (Bearer: tenant's `accessToken`, same BYO-credential pattern `handleWompi` already uses for its lookup), read `external_reference` and `status` off that response, gate on `status === "approved"`, and only then call `confirmFromToken`. This mirrors the `handleWompi` pattern already present in the same file and should follow the same "failed lookup is a safe no-op, but a real HTTP failure shouldn't be conflated with a real 'no such payment' case" caution raised in the Wompi section above.

---

## Cross-Gateway Notes

- All five signature-verification formulas that could be checked against a byte-level documented spec (Stripe, Wompi, PayU, ePayco) matched exactly; only Mercado Pago's manual-manifest edge case deviates, and only because MP's own current docs no longer publish the manual formula and point to an SDK whose exact null-handling behavior had to be pulled from source.
- The reconciliation-key problem is the dominant risk class in this review, not the signature formulas — 3 of 5 providers (Stripe's payment_status gate, ePayco's wrong endpoint, Mercado Pago's nonexistent field + missing status gate) have a confirmed break somewhere between "webhook verifies" and "debt correctly marked paid," even though every signature check itself is sound.
- Recommend re-running a real sandbox transaction end-to-end for Stripe (delayed payment method), ePayco (once the endpoint is corrected), PayU (once payer/buyer fields are added) and Mercado Pago (once the payment-resource lookup and status gate are added) before any tenant goes live on any of the four.

---
_Reviewed: 2026-08-06_
_Reviewer: Claude (gsd-code-reviewer) — live documentation cross-verification pass_
_Depth: deep_
