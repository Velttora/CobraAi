---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
reviewed: 2026-08-06T15:55:00Z
depth: deep
files_reviewed: 10
files_reviewed_list:
  - apps/service-notifications/src/negotiation/negotiation.service.ts
  - apps/service-notifications/src/negotiation/negotiation.controller.ts
  - apps/service-notifications/src/negotiation/negotiation.module.ts
  - apps/service-notifications/src/negotiation/commitment-status.ts
  - apps/service-notifications/src/negotiation/negotiation.service.spec.ts
  - apps/service-notifications/src/negotiation/commitment-status.spec.ts
  - apps/service-notifications/src/agent/payment-plan.service.ts
  - apps/service-notifications/src/agent/payment-plan.module.ts
  - apps/service-notifications/src/agent/conversation-agent.service.ts
  - packages/db/prisma/migrations/20260803120000_negotiation_engine/migration.sql (+ 4 follow-on migrations)
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 8: Code Review Report — Negotiation Module (from `main`)

**Reviewed:** 2026-08-06T15:55:00Z
**Depth:** deep
**Files Reviewed:** 10 (plus cross-referenced `packages/compliance/src/compliance.service.ts`, `apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts`, `apps/api-gateway/src/proxy/proxy.controller.ts`, `apps/service-notifications/src/webhooks/vapi-webhook.handler.ts`, `packages/db/prisma/schema.prisma`)
**Status:** issues_found

## Summary

This module (from `main`, merged into the Phase 8 branch at `6034c6c`) replaces the agent's ability to create payment plans unilaterally with a request/approve flow gated by a human. The core intent — "no agreement closes itself" — is well expressed in comments and enforced structurally: `PaymentPlanService.createPlan` has exactly one call site (`NegotiationService.approve`), and every proposer (chat agent, voice webhook) goes through `NegotiationService.requestApproval`. Money-changing operations (`forgiveRemainder`, plan creation) are not reachable except via `approve()`.

Two things undermine that guarantee, though: (1) `approve()`/`reject()` are not atomic — a check-then-act race lets the same negotiation be approved twice under concurrency, materializing two payment plans or double-writing a forgiveness; and (2) neither the negotiation controller nor service enforces *who* is allowed to approve — any authenticated user of the tenant, regardless of role, can call `POST /v1/negotiations/:id/approve`, in contrast to the sibling `IntegrationsController` (also Phase 8) which explicitly gates writes with `assertAdmin`. Both are money-adjacent and were explicitly in scope.

Confirmed clean: no send path in this module bypasses `ComplianceService` (it doesn't send anything itself — sends happen upstream in `conversation-agent.service.ts` behind `compliance.isChannelEligible`, and in the voice webhook, neither reviewed file uses platform-global credentials); no hardcoded reply-to/domain; every Prisma query in the negotiation module is `tenantId`-scoped; `20260805180000_add_promise_kept_trigger` does **not** create a database trigger despite its name — it only adds an enum value.

Test suite: `pnpm --filter @cobrai/service-notifications test` → **36 files passed, 353 tests passed**, 10.38s. No failures. (Full log captured; concurrency scenario described below is not covered by any existing test — see BLOCKER CR-01.)

## Critical Issues

### CR-01: `approve()` is not atomic — a negotiation can be approved twice under concurrency, double-materializing money-moving side effects

**File:** `apps/service-notifications/src/negotiation/negotiation.service.ts:289-338` (`approve`), `377-388` (`findPending`), `399-419` (`closeNegotiation`)

**Issue:** `approve()` is a classic check-then-act with no locking or conditional write:

```ts
private async findPending(tenantId: string, id: string) {
  const row = await this.prisma.negotiation.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!row) throw new NotFoundException("Acuerdo no encontrado");
  if (row.status !== "escalated") throw new NotFoundException("Este acuerdo ya fue resuelto");
  return row;
}
```

`approve()` reads the row via `findPending` (a plain `findFirst`, no lock), then — outside any transaction — calls `paymentPlans.createPlan(...)` or `forgiveRemainder(...)`, and only afterwards calls `closeNegotiation`, which does `prisma.negotiation.update({ where: { id }, data: { status: "agreed", ... } })`. That final `update` is keyed only on `id`, not conditioned on the row still being `status: "escalated"`.

If `approve()` is invoked twice concurrently for the same `id` (double-click on the approve button, a client retry after a slow response/timeout, or two operators approving the same item from stale UI state — the projected commitment sits at the top of the inbox for a reason: it's "awaiting_approval" and visible to every operator), both calls pass `findPending` before either call writes anything, so both proceed to execute side effects:

- For `kind: "payment_plan"`: `paymentPlans.createPlan` runs twice, creating **two** `PaymentPlan` rows with **two** full sets of `PromiseToPay` installments for the same debt (the dangling-promise cleanup inside `createPlan` only retires promises with `planId: null`, so it does not deduplicate against the first plan's installments). This is a real double-committed-amount bug, not merely a duplicate audit entry.
- For `kind: "settlement_remainder"`: `forgiveRemainder` runs twice, writing two `auditLog` rows claiming two separate approvals of a balance forgiveness for the same negotiation.
- The negotiation's final `planId`/`status` end up reflecting whichever `closeNegotiation` call's `update` lands last — the other plan is silently orphaned but still live in the debtor's account.

The existing test `"no se puede aprobar dos veces"` (negotiation.service.spec.ts:509) only asserts the *sequential* case (second call sees `status: "agreed"` already persisted by a mock) — it does not exercise the concurrent case, which is exactly the case that matters, since Prisma calls are async and two requests racing through `findPending` before either `update` commits is realistic under normal HTTP concurrency (not a contrived scenario).

**Fix:** Claim the row atomically before doing any side effect, e.g.:

```ts
async approve(tenantId: string, id: string, approvedBy?: string) {
  const claimed = await this.prisma.negotiation.updateMany({
    where: { id, tenantId, status: "escalated", deletedAt: null },
    data: { status: "approving" } // or reuse a transaction + row lock
  });
  if (claimed.count === 0) {
    throw new NotFoundException("Este acuerdo ya fue resuelto");
  }
  // ...proceed to createPlan/forgiveRemainder using the row already fetched...
}
```
or wrap the read + conditional claim in `prisma.$transaction` with `SELECT ... FOR UPDATE` semantics (Prisma raw query) so the second concurrent caller blocks until the first commits and then sees the updated status. Either approach turns the race into a clean "already resolved" error for the loser instead of a double execution. The same pattern should be applied to `reject()` for consistency, even though its blast radius is smaller.

### CR-02: No authorization check on who can approve/reject a negotiation — any authenticated tenant user can forgive debt balance or create a payment plan

**File:** `apps/service-notifications/src/negotiation/negotiation.controller.ts:58-78`

**Issue:**

```ts
@Post(":id/approve")
async approve(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
  return successResponse(await this.negotiations.approve(ctx.tenantId, id, ctx.userId));
}

@Post(":id/reject")
async reject(@ReqContext() ctx: RequestContext, @Param("id") id: string, @Body() body: { reason?: string }) {
  return successResponse(await this.negotiations.reject(ctx.tenantId, id, { reason: body?.reason, rejectedBy: ctx.userId }));
}
```

`ReqContext` exposes `ctx.userRole` (`apps/service-notifications/src/common/decorators/request-context.decorator.ts:4-8`), but neither the controller nor `NegotiationService.approve`/`reject` ever reads it. `ctx.userId` is recorded only for the audit trail (`approved_by`), not checked against any role. `api-gateway`'s `ProxyController` (`apps/api-gateway/src/proxy/proxy.controller.ts:31-140`) is a generic authenticated-tenant proxy for `/api/v1/negotiations/*` with no per-route role gating — it forwards any request from any authenticated user of the tenant straight through.

This is a real gap, not a style nit, because the sibling `IntegrationsController` — added in this same Phase 8 PR — establishes the expected pattern explicitly:

```ts
// apps/service-notifications/src/integrations/integrations.controller.ts:10-14
/**
 * Every write forwards `ctx.userRole` into `IntegrationsService`, whose own
 * `assertAdmin` enforces the gate — no role-guard decorator here: that
 * mechanism lives in api-gateway and is not registered in service-notifications.
 */
```
```ts
// apps/service-notifications/src/integrations/integrations.service.ts:43-47
assertAdmin(role?: string): void {
  if (normalizeClerkRole(role) !== "admin") {
    throw new ForbiddenException("Solo administradores pueden gestionar las integraciones");
  }
}
```

The negotiation endpoints move real money (zero out a debtor's balance, materialize a payment plan) — an operation at least as sensitive as changing a WhatsApp/email integration — yet they carry none of this gating, and the api-gateway comment's claim ("that mechanism lives in api-gateway") is not actually true for `/negotiations`: the gateway is a dumb proxy with no role check for any route, as confirmed by reading `proxy.controller.ts`. Whatever role restriction the product intends for "who can approve a debt forgiveness or payment plan" is currently unenforced end to end.

**Fix:** Decide the intended approver role(s) (e.g., `admin` or a new `negotiator`/`supervisor` role) and gate `approve`/`reject` the same way `IntegrationsService` gates its writes — either `this.negotiations.assertApprover(ctx.userRole)` inside the service (consistent with the existing pattern of defending the service layer even if called directly) or a guard registered specifically for this controller. At minimum, `forgiveRemainder`'s debt-forgiveness path should not be reachable by an arbitrary tenant user.

## Warnings

### WR-01: `forgiveRemainder` ignores the amount that was actually approved and zeroes whatever the *current* balance is at execution time

**File:** `apps/service-notifications/src/negotiation/negotiation.service.ts:314-320, 421-446`

**Issue:** The module's own stated design principle is: *"Se ejecuta con los términos exactos que quedaron guardados, sin recalcular: lo que se aprueba tiene que ser lo mismo que se mostró."* (`approve` docstring, line 286-288). For the `payment_plan` branch this is honored — the stored `installments` array is passed verbatim to `createPlan`. For `settlement_remainder` it is not:

```ts
await this.forgiveRemainder(tenantId, negotiation.debtId, {
  amount: Number(negotiation.offerSettlementAmount ?? 0),   // ← computed but…
  planId: negotiation.planId,
  approvedBy
});
...
private async forgiveRemainder(tenantId, debtId, input) {
  await this.prisma.debt.updateMany({
    where: { id: debtId, tenantId },
    data: { amountOutstanding: 0, status: "paid_full" }      // ← …never used to gate the write
  });
  await this.prisma.auditLog.create({ data: { ..., changes: { forgiven_amount: input.amount, ... } } });
}
```

`input.amount` (the amount a human actually saw and approved, captured at `requestApproval` time) is written only into the audit log's `changes` blob — it never constrains or validates the actual `amountOutstanding: 0` write. If the debtor's outstanding balance moves between the approval request and the human's decision (another payment posts, a fee/interest accrual job runs, a manual adjustment happens), the code silently forgives whatever the *live* balance is, which can be more (or less) than what was shown to the approver. The audit trail then records a `forgiven_amount` that does not match what was actually forgiven — actively misleading for compliance/audit purposes.

**Fix:** Re-validate before writing, e.g. reject/flag if `Number(debt.amountOutstanding) !== negotiation.offerSettlementAmount` at approval time (forcing a human to re-request), or compute the write as `amountOutstanding: Math.max(0, currentOutstanding - approvedAmount)` instead of an unconditional `0`, and make the audit log reflect what was actually written, not what was requested.

### WR-02: `approve()` never re-validates the debt is still active/undeleted before materializing terms

**File:** `apps/service-notifications/src/negotiation/negotiation.service.ts:289-338`

**Issue:** `findPending` only checks the `Negotiation` row's own status; it never re-checks `Debt.deletedAt`/`Debt.status`. If, while a negotiation sits `escalated`, the underlying debt is paid off through another channel (portal self-service payment, manual write-off, etc.), `approve()` will still happily call `paymentPlans.createPlan` (which does `tx.debt.updateMany({ where: { id, tenantId }, data: { status: "plan" } })`, silently overwriting `paid_full`/`written_off` back to `"plan"` — `updateMany` doesn't error on the debt being in an unexpected state) or `forgiveRemainder` (redundant but harmless in that specific sub-case, since it's already `amountOutstanding: 0`). The `payment_plan` case is the concerning one: an already-resolved debt can be silently reopened into `"plan"` status by a stale approval.

**Fix:** Re-fetch and check the debt's current status/`deletedAt` inside `approve()` before calling `createPlan`, and fail closed (throw, requiring the operator to re-review) if the debt is no longer in a state where a new plan makes sense.

### WR-03: `requestApproval` doesn't validate the proposed total against the debt's current outstanding balance, and `offerDiscountPct` silently clamps an over-commitment to 0%

**File:** `apps/service-notifications/src/negotiation/negotiation.service.ts:205-238`

**Issue:**

```ts
const outstanding = Number(debt.amountOutstanding);
const amount = input.kind === "payment_plan" ? installments.reduce((sum, i) => sum + i.amount, 0) : Math.max(0, input.settlementAmount ?? 0);
...
offerDiscountPct: outstanding > 0 && input.kind === "payment_plan"
  ? Math.max(0, Math.round(((outstanding - amount) / outstanding) * 100))
  : null,
```

There's no check that `amount <= outstanding`. If the AI-driven proposal (from `conversation-agent.service.ts` or the voice webhook) ever sums to more than the current balance — plausible given `installments` can come straight from free-form LLM output (`response.installments.map(...)` at `conversation-agent.service.ts:464-469`, not run through `buildInstallmentSchedule`'s controlled rounding) — `Math.max(0, ...)` clamps the resulting `offerDiscountPct` to `0` instead of surfacing the over-commitment. The human approver sees "0% discount," which reads as "full balance, no concession," rather than the true "this plan is worth *more* than the debt," hiding exactly the kind of anomaly a human approval gate exists to catch.

**Fix:** Reject (or at least flag) proposals where `amount > outstanding` rather than silently clamping the discount display to zero; surface the raw delta to the approver instead of laundering it through a floor.

### WR-04: `requestApproval`'s "replace the open proposal" step has the same check-then-act race as `approve()`

**File:** `apps/service-notifications/src/negotiation/negotiation.service.ts:245-274`

**Issue:** Two concurrent `requestApproval` calls for the same debt (e.g., a WhatsApp message and a voice call landing at nearly the same time, or a retried webhook) both run the `findFirst({ status: "escalated" })` lookup before either has written, so both can fall through to `prisma.negotiation.create`, leaving two separate `escalated` rows for the same debt. This doesn't move money by itself, but it does defeat the stated purpose of the "one open proposal per debt" check ("dos solicitudes vivas para lo mismo obligan a adivinar cuál está vigente" — the exact scenario the code's own comment says it wants to avoid) and, combined with CR-01, increases the chance an operator approves the stale one.

**Fix:** Same remediation family as CR-01 — a unique partial index (`negotiations` unique on `(tenant_id, debt_id) WHERE status = 'escalated' AND deleted_at IS NULL`) would make this race fail loudly (constraint violation → retry/merge) instead of silently producing duplicate live proposals.

### WR-05: Stale documentation describes a negotiation engine and policy ceiling that does not exist in the shipped code

**File:** `apps/service-notifications/src/negotiation/negotiation.service.ts:21-33`, `packages/db/prisma/schema.prisma:620-627`

**Issue:** Two places describe machinery that isn't actually there:

1. `negotiation.service.ts`'s header comment ("NOTA DE FUSIÓN") says this file's read-only projector would be *replaced* by a fuller `feat/negotiation-engine` service after merging, keeping only a few detail fields from it. That merge already happened (`6034c6c`) — `main`'s version (the one reviewed here, including the human-approval flow added afterward in `6efae92`) is what survived, nothing replaced it. The comment now describes a hypothetical that didn't occur and will mislead a future reader into thinking this file is provisional.
2. `schema.prisma`'s `NegotiationPolicy` model carries the comment: *"El motor (`@cobrai/utils` negotiation-engine) jamás concede por encima de estos límites: son el techo duro de la autonomía del agente"* and references `NegotiationService.resolvePolicy`. Neither `@cobrai/utils`'s negotiation-engine nor a `resolvePolicy` method exist anywhere in the repository (confirmed via search); `negotiation_policies` is never read or written by any application code. The schema is documenting a hard safety ceiling on agent autonomy that was never implemented — the actual code has no automated cap on discount %, installment count, or NPV; the only backstop today is that a human must click "approve." That's a legitimate compensating control, but it's a different (weaker, purely manual) guarantee than what the schema comment claims exists, and anyone auditing "what stops the agent from proposing a 90% discount" would be told by the schema that a technical ceiling exists when it does not.

**Fix:** Either wire `NegotiationPolicy` into `requestApproval` (reject/flag proposals exceeding `max_discount_pct`/`max_installments`) or remove/rewrite the stale comments so they don't assert a control that isn't there. At minimum, update the `NOTA DE FUSIÓN` comment now that the merge it anticipates has already resolved differently than described.

## Info

### IN-01: Migration name `add_promise_kept_trigger` does not add a database trigger

**File:** `packages/db/prisma/migrations/20260805180000_add_promise_kept_trigger/migration.sql`

**Issue:** The migration only runs `ALTER TYPE "workflow_trigger" ADD VALUE IF NOT EXISTS 'promise_kept';` — an application-level workflow trigger enum value, not a PostgreSQL `CREATE TRIGGER`. Confirmed no `CREATE TRIGGER`/`CREATE OR REPLACE FUNCTION` exists anywhere in `packages/db/prisma/migrations/`. Not a defect — explicitly checked per the review brief — but the name is likely to send a future reader (or another reviewer) hunting for trigger-vs-application-logic conflicts that don't exist.

**Fix:** None required functionally; consider renaming in a future migration description/changelog note if this causes confusion (Prisma migration names themselves are immutable once applied).

### IN-02: `NegotiationPolicy` table and several `Negotiation` columns/enum values are entirely dead

**File:** `packages/db/prisma/schema.prisma:607-618, 627+`; `apps/service-notifications/src/negotiation/negotiation.service.ts`

**Issue:** `negotiation_status` enum values `open`, `expired`, and `defaulted` are never written by any code path (only `escalated`/`agreed`/`rejected` are used); `Negotiation.round` is always `0`; `negotiation_policies` has zero read/write references anywhere in the app. This is consistent with WR-05 — leftover surface area from the abandoned/never-merged LLM negotiation engine. Not harmful by itself, but it's schema and migration debt that increases the odds of the next engineer building against a shape that isn't actually load-bearing.

**Fix:** Track for cleanup (drop unused columns/table in a future migration, or explicitly document them as reserved-for-later) rather than leaving them silently unused.

## Where nothing was found

- **Compliance bypass:** The negotiation module (`negotiation.service.ts`, `.controller.ts`, `.module.ts`) contains no `sendTemplate`/adapter/Kafka-notification call of its own — it only reads/writes DB state. All debtor-facing sends live in `conversation-agent.service.ts` and the voice webhook, both gated by `ComplianceService.isChannelEligible`/`checkContact` before generating or sending anything, consistent with Phase 8's `channel_not_configured` gate.
- **Platform-global credentials:** `TwilioWhatsAppAdapter.sendTemplate` resolves per-tenant Twilio credentials via `TenantIntegrationService` on every call (no caching, no fallback to shared credentials); the negotiation flow doesn't introduce or assume any different credential path.
- **Hardcoded reply-to domain:** No references to a reply-to address/domain in the negotiation module or `payment-plan.service.ts`; the merge commit's own message confirms `EMAIL_REPLY_TO` was intentionally dropped from `conversation-agent.service.ts` because reply-to is now per-tenant (D-22).
- **Tenant isolation:** Every Prisma call in `negotiation.service.ts`, `negotiation.controller.ts`, and `payment-plan.service.ts` is scoped by `tenantId` (verified read-by-read: `debt.findFirst`, `negotiation.findFirst/findMany/create/update`, `paymentPlan.findMany`, `promiseToPay.findMany/updateMany/createMany`, `conversation.findMany`, `auditLog.create`). No unscoped query found.
- **Database trigger fighting application logic:** No `CREATE TRIGGER` exists in any of the five migrations in scope; `add_promise_kept_trigger` is a misnamed enum-only migration (see IN-01).
- **Rounding correctness:** `buildInstallmentSchedule` (`packages/utils/src/promises.ts`) correctly accumulates rounding into the final installment so the schedule always sums exactly to the total; `applyPaymentToPromise` correctly accumulates against `amountPaid` rather than the last payment in isolation (this is what migration `20260805190000_promise_amount_paid` backfills for).

## Test run

```
$ pnpm --filter @cobrai/service-notifications test
Test Files  36 passed (36)
     Tests  353 passed (353)
  Duration  10.38s
```
All green. No test currently exercises the concurrent-approval race in CR-01, nor an approve/reject call from a non-admin role for CR-02 (there is no role check to test).

---

_Reviewed: 2026-08-06T15:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
