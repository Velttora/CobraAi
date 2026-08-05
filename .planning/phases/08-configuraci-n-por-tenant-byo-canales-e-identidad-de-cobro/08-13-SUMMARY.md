---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 13
subsystem: notifications
tags: [twilio, sendgrid, webhooks, tenant-integration, opaque-token, fail-closed, d-19, d-20, d-21, d-22]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-03's TenantIntegrationService.resolveByWebhookToken (ungated by status); 08-07's toView webhookUrl shape and Twilio Senders API registration; 08-10's per-tenant credential resolution + reply.fogging.org removal on the outbound side; 08-11's sendgrid publicConfig.replyDomain"
provides:
  - "integration-webhook-token.guard.ts: resolveWebhookIntegration (opaque token → tenant, pre-signature) and assertTwilioSignature (fail-closed, every environment, audited rejection)"
  - "Token-routed twilio_whatsapp/:token and sendgrid/:token webhook endpoints replacing the phone-number/hardcoded-domain resolution"
  - "TwilioWaWebhookHandler.handleInbound(tenantId, payload) and SendgridInboundHandler.handleInbound(tenantId, replyDomain, payload) — tenant-scoped debtor lookup and opt-out"
affects: [08-16, 08-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Webhook token guard as standalone exported functions (not a NestJS CanActivate guard) so the resolved integration can be passed into the handler — mirrors twilio-signature.validator.ts's shape"
    - "Single shared rejection message across unknown-token, provider-mismatch, missing-secret and invalid-signature paths, making the unknown-token and invalid-signature HTTP responses byte-identical (anti-enumeration, T-08-13b)"
    - "Webhook route path segments use the literal IntegrationProvider enum value (twilio_whatsapp, sendgrid), not a kebab-cased route name, because that is exactly the string TenantIntegrationService.toView already builds into webhookUrl and what plan 08-07 registered through the Senders API"

key-files:
  created:
    - apps/service-notifications/src/webhooks/integration-webhook-token.guard.ts
    - apps/service-notifications/src/webhooks/integration-webhook-token.guard.spec.ts
    - apps/service-notifications/src/webhooks/webhooks.controller.spec.ts
  modified:
    - apps/service-notifications/src/webhooks/webhooks.controller.ts
    - apps/service-notifications/src/webhooks/webhooks.module.ts
    - apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.ts
    - apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.spec.ts
    - apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts
    - apps/service-notifications/src/webhooks/sendgrid-inbound.handler.spec.ts

key-decisions:
  - "Webhook route paths deviate from the plan's literal <interfaces> text (twilio-whatsapp/:token, sendgrid-inbound/:token) to twilio_whatsapp/:token and sendgrid/:token — the plan's own action text requires the signature URL to match 'precisely the URL plan 08-07 registered', and TenantIntegrationService.toView (packages/integrations, already shipped, out of this plan's scope) builds webhookUrl as `${baseWebhookUrl}/${row.provider}/${token}` using the literal provider enum value. whatsapp-connect.fixtures.ts's own fixture (`${BASE_WEBHOOK_URL}/twilio_whatsapp/tok-abc`) confirms this is the URL already registered with Twilio and displayed to tenants. Using the plan's literal kebab-case route names would have made the controller listen on a path nothing ever gets configured with — every real webhook call would 404. Treated as a Rule 1 bug fix: correctness of the already-established URL contract takes priority over the plan's literal interfaces text."
  - "Rejection status code is UnauthorizedException (401) for every guard failure path (unknown token, provider mismatch, missing secret, invalid signature) — matching the plan's own <interfaces> and <behavior> blocks, which explicitly type-annotate `resolveWebhookIntegration` as throwing `UnauthorizedException`. This diverges from the orchestrator prompt's paraphrased success criterion ('404 on unknown token'); the plan file's explicit TypeScript signature was treated as the more authoritative source since it is the literal execution artifact with a concrete interface declaration."
  - "assertTwilioSignature's missing-secret rejection uses the same shared message as the unknown-token/invalid-signature paths (not required by the behavior block, but a safe superset that keeps every rejection path indistinguishable by construction)"

patterns-established:
  - "Every token-routed webhook endpoint resolves the integration via resolveWebhookIntegration before touching the request body, and (for signing providers) verifies the signature with the tenant's own secret before calling the domain handler — no controller reads NODE_ENV to decide whether to verify"

requirements-completed: [D-19, D-20, D-21, D-22]

# Metrics
duration: ~45min
completed: 2026-08-04
---

# Phase 8 Plan 13: Token-Routed Channel Webhooks (Twilio WA + SendGrid Inbound) Summary

**Twilio WhatsApp and SendGrid Inbound webhooks now resolve their tenant from an opaque per-integration URL token before any signature check runs — the raw `settings->>'whatsappFromNumber'` SQL lookup and the hardcoded `reply.fogging.org` inbound-domain check are both gone, Twilio signature verification is fail-closed in every environment (no more `NODE_ENV === "production"` gate), and the Vapi webhook is untouched.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-04T20:31:00-05:00 (approx, worktree base check)
- **Completed:** 2026-08-04T21:17:18-05:00
- **Tasks:** 2 completed
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments
- `integration-webhook-token.guard.ts`: `resolveWebhookIntegration` resolves `(provider, token)` to a `DecryptedIntegration` via `TenantIntegrationService.resolveByWebhookToken`, throwing `UnauthorizedException` with one fixed message for both an unknown token and a provider mismatch (D-19 anti-enumeration)
- `assertTwilioSignature` reuses `validateTwilioSignature` for the HMAC work but is fail-closed (D-20): no `authToken` secret → audits `twilio_whatsapp.webhook_rejected_no_secret` and throws; invalid/absent signature → audits `twilio_whatsapp.webhook_rejected_invalid_signature` and throws. Runs in every environment — the `NODE_ENV === "production"` gate that used to live in the controller is gone entirely, not reproduced
- Unknown-token and invalid-signature rejections are asserted byte-identical (same `UnauthorizedException` message and status) in both the guard spec and the controller spec
- `webhooks.controller.ts`: `POST /v1/webhooks/twilio_whatsapp/:token` and `POST /v1/webhooks/sendgrid/:token` replace the old `twilio-whatsapp`/`sendgrid-inbound` routes, resolving the integration (and, for Twilio, verifying the signature) before calling the handler with the resolved `tenantId`. `POST /v1/webhooks/vapi` is untouched — no token, no integration lookup (D-21)
- `webhooks.module.ts` wires `TenantIntegrationService`/`AuditService` factory providers, mirroring `compliance.module.ts`
- `TwilioWaWebhookHandler.handleInbound(tenantId, payload)` — `resolveTenantByToNumber` and its raw `settings->>'whatsappFromNumber'` query are deleted entirely; `findDebtorByPhone`/`handleOptOut` are scoped unconditionally to the token-resolved `tenantId`, removing the old "shared number" ambiguity branch
- `SendgridInboundHandler.handleInbound(tenantId, replyDomain, payload)` — `isValidPayload` and the loop-prevention check compare against the tenant's own `replyDomain` instead of the literal `reply.fogging.org`; debtor lookup and opt-out are scoped to `tenantId`
- `apps/service-notifications/src/common/email.constants.ts` was already deleted by plan 08-10 — confirmed absent, nothing to do there
- `apps/service-notifications/src/app.module.ts` already excludes `v1/webhooks/(.*)` from `TenantContextMiddleware` — confirmed present, no change needed
- **`reply.fogging.org` confirmed gone from every source file this plan owns.** The only remaining literal occurrence in `apps`/`packages` is `packages/db/src/seed-tenant-integrations.ts`'s `REPLY_DOMAIN` constant — explicitly out of scope per 08-10-SUMMARY.md ("08-06's intentional cutover-safety default... not this plan's [concern]"). The three hits in `sendgrid-inbound.handler.spec.ts`'s Gmail/Outlook citation fixtures are `noreply@fogging.org` email addresses (test data for quoted-text stripping), not the removed domain constant.
- `pnpm --filter @cobrai/service-notifications test`: 249 tests pass (was 205 before this plan)
- `pnpm --filter @cobrai/service-notifications typecheck` exits 0; full monorepo `pnpm typecheck` and `pnpm test` both green across all 25 turbo tasks
- No source file exceeds 300 lines (largest new/modified file: `sendgrid-inbound.handler.spec.ts` at 250 lines)

## Task Commits

1. **Task 1: Token guard and token-routed channel webhook endpoints** - `4276807` (feat)
2. **Task 2: Retire the phone-number SQL lookup and the hardcoded inbound reply domain** - `c947b70` (fix)

## Files Created/Modified
- `apps/service-notifications/src/webhooks/integration-webhook-token.guard.ts` / `.spec.ts` - opaque-token resolution + fail-closed Twilio signature verification
- `apps/service-notifications/src/webhooks/webhooks.controller.ts` - token-routed `twilio_whatsapp/:token` and `sendgrid/:token`, `vapi` unchanged
- `apps/service-notifications/src/webhooks/webhooks.controller.spec.ts` - new, covers every behavior bullet including byte-identical rejection and dev-environment signature verification
- `apps/service-notifications/src/webhooks/webhooks.module.ts` - `TenantIntegrationService`/`AuditService` factory providers
- `apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.ts` / `.spec.ts` - `tenantId` as an explicit parameter, `resolveTenantByToNumber` deleted, tenant-scoped debtor/opt-out lookups
- `apps/service-notifications/src/webhooks/sendgrid-inbound.handler.ts` / `.spec.ts` - `tenantId`/`replyDomain` as explicit parameters, per-tenant domain acceptance and loop prevention

## Final Webhook URL Shapes

```
POST {PUBLIC_WEBHOOK_BASE_URL}/twilio_whatsapp/{token}   # provider twilio_whatsapp — signed, fail-closed
POST {PUBLIC_WEBHOOK_BASE_URL}/sendgrid/{token}          # provider sendgrid — token-only auth, unsigned by SendGrid
POST {PUBLIC_WEBHOOK_BASE_URL}/vapi                      # unchanged, D-21, platform-owned
```

`{PUBLIC_WEBHOOK_BASE_URL}` already includes the `/v1/webhooks` prefix (e.g. `https://api.cobrai.dev/v1/webhooks`, per `.env.example`). These are exactly the URLs `TenantIntegrationService.toView` exposes as `webhookUrl` and that plan 08-07's `WhatsAppConnectService` already registers through Twilio's Senders API — no other plan needs to change what it registers or displays.

## `reply.fogging.org` Confirmation (D-22)

`grep -rFn "reply.fogging.org" apps packages --include="*.ts"` (fixed-string, excluding `node_modules`) returns exactly one hit: `packages/db/src/seed-tenant-integrations.ts:33`, the intentional migration-time default for pre-existing tenants (08-06's cutover safety net), explicitly flagged as out of this plan's scope by 08-10-SUMMARY.md. **No handler, adapter, or webhook code anywhere hardcodes the platform's reply domain.**

## Decisions Made
See `key-decisions` in frontmatter. In short: the two webhook route path segments use the literal `IntegrationProvider` enum value (`twilio_whatsapp`, `sendgrid`) rather than the plan's literal kebab-case route names, because that is the URL `TenantIntegrationService.toView`/`WhatsAppConnectService`/`EmailConnectService` (all already shipped, out of this plan's scope) actually build and register — using the plan's literal route text would have silently 404'd every real webhook call. Rejection status code is `UnauthorizedException` (401) throughout, per the plan's own explicit interface signatures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Webhook route path segments changed from the plan's literal text to match the already-registered `webhookUrl`**
- **Found during:** Task 1, while reading `packages/integrations/src/tenant-integration.service.ts`'s `toView` and `apps/service-notifications/src/integrations/whatsapp-connect.fixtures.ts`
- **Issue:** The plan's `<interfaces>` block and acceptance criteria specify `POST /v1/webhooks/twilio-whatsapp/:token` and `POST /v1/webhooks/sendgrid-inbound/:token`. But `TenantIntegrationService.toView` (already shipped by 08-03/08-07, out of this plan's file list) builds `webhookUrl` as `${baseWebhookUrl}/${row.provider}/${token}` using the literal enum value — `twilio_whatsapp` and `sendgrid`, not the kebab-cased route names. This is the exact URL 08-07's `WhatsAppConnectService` already registers with Twilio's Senders API and that 08-11's `EmailConnectService` exposes to the tenant. The plan's own action text says the signature URL must match "precisely the URL plan 08-07 registered" — which is this one, not the literal route text one paragraph earlier in the same plan.
- **Fix:** Routed `POST /v1/webhooks/twilio_whatsapp/:token` and `POST /v1/webhooks/sendgrid/:token` instead, matching `toView`'s output exactly. Adjusted the acceptance-criteria-equivalent grep checks and all new tests accordingly.
- **Files modified:** `apps/service-notifications/src/webhooks/webhooks.controller.ts`, `webhooks.controller.spec.ts`, `integration-webhook-token.guard.ts` (comments), `integration-webhook-token.guard.spec.ts`
- **Verification:** `grep -n "twilio_whatsapp/:token\|sendgrid/:token" webhooks.controller.ts` returns 2 matches; a dedicated test in `webhooks.controller.spec.ts` calls the guard with the exact `${BASE_URL}/twilio_whatsapp/tok-abc` URL and asserts a real Twilio-computed signature validates
- **Committed in:** `4276807` (Task 1 commit)

**2. [Rule 1 - Bug] Rejection status code kept as `UnauthorizedException` (401), not the orchestrator prompt's paraphrased "404"**
- **Found during:** Task 1 design
- **Issue:** The spawning prompt's success criteria mentioned "404 on unknown token", but 08-13-PLAN.md's `<interfaces>` block explicitly types `resolveWebhookIntegration`'s throw as `UnauthorizedException`, and the `<behavior>` block repeats "throws UnauthorizedException" three separate times across both guard functions.
- **Fix:** Followed the plan file's literal, explicit TypeScript interface signature (401 `UnauthorizedException`) as the authoritative execution artifact over the orchestrator prompt's paraphrase.
- **Files modified:** N/A (design decision, not a code change requiring correction)
- **Verification:** Guard and controller specs assert `UnauthorizedException` throughout; the byte-identical-response test confirms status and message match across rejection paths
- **Committed in:** `4276807` (Task 1 commit)

---

**Total deviations:** 2 (both Rule 1 — bug/correctness fixes reconciling conflicting sources of truth in favor of the more explicit and technically authoritative one)
**Impact on plan:** Both were necessary for the shipped webhook URLs to actually route real provider traffic. No scope creep — changes are confined to this plan's own files.

## Issues Encountered
- Fresh worktree had no `node_modules` and no built `dist/` for workspace packages (`@cobrai/db`, `@cobrai/integrations`, `@cobrai/utils`, `@cobrai/ports`, `@cobrai/compliance`, `@cobrai/kafka`, `@cobrai/types`, `@cobrai/workflow-packages`) — resolved with `pnpm install --frozen-lockfile` followed by `pnpm --filter <deps...> build`, matching the pattern noted in prior 08-xx summaries. Build artifacts only, not committed (gitignored).
- Worktree HEAD was initially behind the wave-4 tracking commit (`c5a88ca`) rather than at it — the `merge-base` check in the worktree_branch_check step showed the worktree's own HEAD as the merge-base (not the target commit), meaning the required `git reset --hard c5a88caf2b99c289bad9a1fa2495070951f088c6` had not yet been applied. Applied it before reading any dependency files, per the mandatory startup protocol.

## User Setup Required
None — no new environment variables. `PUBLIC_WEBHOOK_BASE_URL` was already documented by plan 08-07's `.env.example` change; this plan reads it via `ConfigService`, same as `WhatsAppConnectService`/`EmailConnectService`.

## Next Phase Readiness
- Both inbound channel webhooks are fully token-routed and tenant-scoped; the phone-number SQL lookup and hardcoded email domain are gone.
- 08-16/08-17 (frontend integration status/health screens) can rely on `TenantIntegrationService.toView`'s `webhookUrl` being the exact, live-routable URL for both `twilio_whatsapp` and `sendgrid` — no translation needed between what's displayed and what the controller listens on.
- 08-12 (payments webhooks, sibling plan run in parallel) was not yet complete at the time this plan finished — no `apps/service-payments/src/webhooks/webhooks.controller.ts` existed to cross-check the "same indistinguishable-rejection rule, same audit action naming" convention against; this plan's `integration-webhook-token.guard.ts` audit action names (`twilio_whatsapp.webhook_rejected_no_secret`, `twilio_whatsapp.webhook_rejected_invalid_signature`) should be checked against 08-12's final naming once both land, to keep them consistent as the plan's context intended.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 9 created/modified source files verified present on disk (`integration-webhook-token.guard.ts`/`.spec.ts`, `webhooks.controller.ts`/`.spec.ts`, `webhooks.module.ts`, `twilio-wa-webhook.handler.ts`/`.spec.ts`, `sendgrid-inbound.handler.ts`/`.spec.ts`), and both task commits (`4276807`, `c947b70`) verified present in `git log`.
