---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 07
subsystem: integrations
tags: [twilio, vapi, whatsapp, embedded-signup, byo, subaccount, senders-api, nestjs]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-02 verified provider contracts (08-PROVIDER-CONTRACTS.md); 08-03 TenantIntegrationService/verifyCredentials"
provides:
  - "IntegrationsModule (apps/service-notifications) with TwilioProvisioningService, VapiProvisioningService, WhatsAppConnectService, and the TenantIntegrationService factory provider"
  - "TwilioProvisioningService: subaccount creation (platform ISV client) + subaccount-scoped WhatsApp Channels Sender registration/status read (never the platform client)"
  - "VapiProvisioningService: imports a tenant's Twilio number into the platform Vapi account, smsEnabled explicitly false, duplicate-import id recovery"
  - "WhatsAppConnectService: connectManaged/connectByo/refreshSenderStatus orchestrating twilio_whatsapp + twilio_voice TenantIntegration rows with per-channel failure isolation"
  - "packages/integrations: TenantIntegrationService.overrideStatus (upsert) and resolveAny (ungated read) — additive extensions needed by the orchestrator above"
affects: [08-09, 08-13, 08-16, 08-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provisioning services stay Injectable() plain NestJS services reading only process-global config in the constructor (platform ISV creds, VAPI_API_KEY); every tenant credential is a per-call argument, never cached on the instance"
    - "Provider failures are returned as typed { error } results, not thrown, wherever a caller needs to persist a failed integration row instead of crashing"
    - "TenantIntegrationService.upsert()'s overrideStatus lets an orchestrator write a status computed from a provider-specific state machine, bypassing the generic account-level verifyCredentials check"

key-files:
  created:
    - apps/service-notifications/src/integrations/integrations.module.ts
    - apps/service-notifications/src/integrations/twilio-provisioning.service.ts
    - apps/service-notifications/src/integrations/twilio-provisioning.service.spec.ts
    - apps/service-notifications/src/integrations/vapi-provisioning.service.ts
    - apps/service-notifications/src/integrations/vapi-provisioning.service.spec.ts
    - apps/service-notifications/src/integrations/whatsapp-connect.service.ts
    - apps/service-notifications/src/integrations/whatsapp-connect.service.spec.ts
    - apps/service-notifications/src/integrations/whatsapp-connect.byo-refresh.spec.ts
    - apps/service-notifications/src/integrations/whatsapp-connect.fixtures.ts
    - packages/integrations/src/secrets-codec.ts
  modified:
    - apps/service-notifications/src/app.module.ts
    - .env.example
    - packages/integrations/src/tenant-integration.service.ts
    - packages/integrations/src/tenant-integration.upsert.spec.ts
    - packages/integrations/src/tenant-integration.resolve.spec.ts

key-decisions:
  - "TenantIntegrationService gained overrideStatus (UpsertIntegrationInput) and resolveAny() — 08-03's actual method list had neither, even though this plan's action text assumed both existed. Additive/backward-compatible; documented as a Rule 3 deviation touching packages/integrations outside the plan's declared files_modified list."
  - "registerWhatsAppSender's return type widened to RegisteredSender | { error: string } (the plan's <interfaces> block declared a bare RegisteredSender), because the behavior block explicitly requires failures surface as data, not a throw"
  - "VapiProvisioningService never logs a provider's raw error message (only returns it to the caller) since Vapi's error body could echo back part of the request, including the tenant's Twilio auth token"
  - "importTwilioNumber treats a duplicate-import conflict response that echoes an existing resource id as success (reuses that id) — no such case was documented in 08-PROVIDER-CONTRACTS.md; this is an inferred, defensively-scoped interpretation of the behavior block's 'importing a number Vapi already holds' requirement"
  - "connectManaged persists twilio_whatsapp twice: once with skipVerification to mint the webhookToken/URL the Senders API call needs, then again with the real mapped status via overrideStatus — an intermediate 'verified' row exists for milliseconds between the two calls, acceptable since nothing reads it in between within the same request"

patterns-established:
  - "Pattern: a provisioning orchestrator (WhatsAppConnectService) injects the narrow provisioning services plus TenantIntegrationService and ConfigService, never Prisma directly"
  - "Pattern: voice-channel provisioning (provisionVoice) is a private helper shared by both connectManaged and connectByo, parameterized by IntegrationMode, so the two flows converge to the same persisted twilio_voice shape"

requirements-completed: [D-01, D-02, D-04, D-05, D-07, D-11]

# Metrics
duration: 22min
completed: 2026-08-04
---

# Phase 8 Plan 07: WhatsApp/Voice Provisioning (Twilio subaccounts, Senders API, Vapi import) Summary

**TwilioProvisioningService (subaccount creation + subaccount-scoped WABA sender registration), VapiProvisioningService (tenant-number import into the platform Vapi account), and WhatsAppConnectService orchestrating both into managed and BYO WhatsApp+voice `TenantIntegration` rows with per-channel failure isolation — all unit-tested against mocked provider responses.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-04T20:05:15-05:00
- **Completed:** 2026-08-04T20:27:00-05:00
- **Tasks:** 3 completed (all three followed TDD RED/GREEN)
- **Files modified:** 15 (10 created, 5 modified)

## Accomplishments
- `TwilioProvisioningService.createSubaccount` calls `client.api.v2010.accounts.create` on the platform ISV client and throws `ServiceUnavailableException` carrying Twilio's own message on rejection
- `registerWhatsAppSender`/`getSenderStatus` always build a fresh `twilio(subaccountSid, subaccountAuthToken)` client — a test asserts the SDK factory is never invoked with the platform SID during sender registration (RESEARCH.md Pitfall 1 / 08-PROVIDER-CONTRACTS.md §4)
- `VapiProvisioningService.importTwilioNumber` posts to `POST /phone-number` with the platform `VAPI_API_KEY` bearer and the tenant's Twilio SID/token in the body, explicitly setting `smsEnabled: false` (08-PROVIDER-CONTRACTS.md's correction to RESEARCH.md A2 — the field defaults to `true` and would otherwise silently repoint the number's Twilio SMS webhook to Vapi)
- `WhatsAppConnectService.connectManaged` sequences subaccount creation → placeholder persist (mints the webhookToken/URL) → sender registration → final persist with the mapped status (`ONLINE → verified`; `CREATING`/`OFFLINE`/`VERIFYING → pending_meta`; anything else → `failed`) → independent Vapi import + `twilio_voice` persistence, isolating a voice-side failure from a working WhatsApp connection and vice versa
- `connectByo` skips subaccount creation entirely, verifies pasted credentials through the standard `TenantIntegrationService.upsert()`/`verifyCredentials` path, and only proceeds to Vapi import on a verified result
- `refreshSenderStatus` re-reads a `pending_meta` row via the new `TenantIntegrationService.resolveAny` (ungated by status), re-checks the sender status with the tenant's own subaccount credentials, and re-persists the mapped status
- 36 new tests across the three provisioning files (14 + 10 + 12) plus 5 new tests added to `packages/integrations` (2 for `overrideStatus`, 3 for `resolveAny`) — `pnpm --filter @cobrai/service-notifications test` at 174 tests (was 138), `pnpm --filter @cobrai/integrations test` at 39 tests (was 34), `pnpm test` green across all 25 turbo tasks at wave end
- No source file exceeds 300 lines; the `WhatsAppConnectService` spec was split into `whatsapp-connect.service.spec.ts` (connectManaged) + `whatsapp-connect.byo-refresh.spec.ts` (connectByo/refreshSenderStatus) + a shared `whatsapp-connect.fixtures.ts`, mirroring 08-03's precedent for `tenant-integration.service.spec.ts`

## Task Commits

Each task followed TDD RED/GREEN:

1. **Task 1a: Failing tests for TwilioProvisioningService (RED)** - `0b01f46` (test)
2. **Task 1b: Implement IntegrationsModule + TwilioProvisioningService (GREEN)** - `c548575` (feat)
3. **Task 2a: Failing tests for VapiProvisioningService (RED)** - `40638d2` (test)
4. **Task 2b: Implement VapiProvisioningService (GREEN)** - `7821da3` (feat)
5. **Deviation: overrideStatus + resolveAny on TenantIntegrationService** - `2396a27` (feat)
6. **Task 3a: Failing tests for WhatsAppConnectService (RED)** - `391ffa6` (test)
7. **Task 3a-cont: split spec to respect 300-line limit** - `42168a0` (test)
8. **Task 3b: Implement WhatsAppConnectService (GREEN)** - `5bdd2d8` (feat)

## Files Created/Modified
- `apps/service-notifications/src/integrations/twilio-provisioning.service.ts` / `.spec.ts` - subaccount creation + subaccount-scoped Senders API
- `apps/service-notifications/src/integrations/vapi-provisioning.service.ts` / `.spec.ts` - Twilio-number-into-Vapi import/release
- `apps/service-notifications/src/integrations/whatsapp-connect.service.ts` / `.service.spec.ts` / `.byo-refresh.spec.ts` / `.fixtures.ts` - managed + BYO orchestration
- `apps/service-notifications/src/integrations/integrations.module.ts` - wires all three services + `TenantIntegrationService` factory
- `apps/service-notifications/src/app.module.ts` - registers `IntegrationsModule`
- `.env.example` - `TWILIO_ISV_ACCOUNT_SID`/`TWILIO_ISV_AUTH_TOKEN`/`SENDGRID_PARENT_API_KEY`/`PUBLIC_WEBHOOK_BASE_URL`
- `packages/integrations/src/tenant-integration.service.ts` - `overrideStatus` on `upsert()`, new `resolveAny()`
- `packages/integrations/src/secrets-codec.ts` - `safeDecryptSecrets`/`buildSecretsMeta` extracted to keep the service file under 300 lines
- `packages/integrations/src/tenant-integration.upsert.spec.ts` / `.resolve.spec.ts` - tests for the two additions above

## Final IntegrationsModule Provider List

For plans 08-10 (further payment providers) and 08-14 (webhook token guard) to extend:

```typescript
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    TwilioProvisioningService,
    VapiProvisioningService,
    WhatsAppConnectService,
    { provide: TenantIntegrationService, useFactory: (prisma) => new TenantIntegrationService(prisma), inject: [PrismaService] }
  ],
  exports: [TwilioProvisioningService, VapiProvisioningService, WhatsAppConnectService, TenantIntegrationService]
})
export class IntegrationsModule {}
```

## `publicConfig` Keys Written (for 08-09, 08-13, 08-16 to read)

**`twilio_whatsapp`** (both managed and BYO):
- `fromNumber` — E.164 with `whatsapp:` prefix
- `subaccountSid` (managed only) / `accountSid` (BYO only — read by `verifyTwilioAccount`)
- `wabaId`, `businessName` (managed only)
- `senderSid` (managed only, present once sender registration succeeds)

**`twilio_voice`** (both managed and BYO, written by the shared `provisionVoice` helper):
- `outboundNumber` — the tenant's E.164 number
- `vapiPhoneNumberId` — present only when the Vapi import succeeded; absent (with `status: "failed"` + `failureMessage`) when it did not

**`secrets`** for both providers: `accountSid` + `authToken` of the subaccount (managed) or the pasted BYO credentials — never the Meta `phoneNumberId`, never logged.

## Decisions Made
- Widened `TwilioProvisioningService.registerWhatsAppSender`'s return type to `RegisteredSender | { error: string }` — the plan's `<interfaces>` block declared a bare `RegisteredSender`, but the behavior block explicitly requires failures to surface as data ("not as an unhandled throw"), so the interface as literally declared was internally inconsistent with its own behavior requirements.
- `VapiProvisioningService` deliberately never logs a provider's raw error `message` — only returns it to the caller — because Vapi's error response body could echo back request content (discovered via an adversarial test asserting the tenant's auth token never appears in a logger call, even when the mocked provider response embeds it in its own message).
- Treated a Vapi duplicate-import conflict response carrying an `id` field as success (reuse that id) per the behavior block's explicit requirement; 08-PROVIDER-CONTRACTS.md did not document this specific response shape (only the happy-path `TwilioPhoneNumber` schema), so this is an inferred, narrowly-scoped interpretation — a real conflict response's exact shape should be confirmed once ISV/ live testing is available (08-09 or later).
- `refreshSenderStatus` falls back to re-persisting the row's current status unchanged when there is no `senderSid` to poll (e.g. a BYO-mode row, which has no Twilio Channels Sender at all) rather than throwing — the plan's action text didn't specify this edge case explicitly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `TenantIntegrationService` had neither a caller-supplied-status upsert path nor an ungated re-read method**
- **Found during:** Task 3 design (writing `whatsapp-connect.service.ts`, which the plan's action text requires to "persist the integration first with skipVerification: true and status: 'verifying'" then "update the integration with the resolved status" for a status computed from Twilio's sender state machine, and to read back a `pending_meta` row via "the resolution path that returns rows in non-verified states — per 08-03's SUMMARY")
- **Issue:** `TenantIntegrationService.upsert()` could only produce `status: "verified"` (via `skipVerification`) or a status derived from the generic `verifyCredentials` account-level check — no path let a caller write an arbitrary computed status (`pending_meta`, or `failed` with a specific provider message unrelated to the generic check). Similarly, 08-03's actual method list (confirmed by reading the real file, not just its SUMMARY prose) has no method that reads a row regardless of status other than `resolveByWebhookToken`, which is keyed by token, not `(tenantId, provider)`.
- **Fix:** Added `overrideStatus` to `UpsertIntegrationInput` (bypasses `verifyCredentials` and the `skipVerification` shortcut, writing an exact status/failureMessage/verifiedAt) and a new `resolveAny(tenantId, provider)` method (mirrors `resolveByWebhookToken`'s ungated decrypt, keyed by tenant+provider instead of token). Both are additive and optional — no existing caller's behavior changed.
- **Files modified:** `packages/integrations/src/tenant-integration.service.ts`, `tenant-integration.upsert.spec.ts`, `tenant-integration.resolve.spec.ts`, plus a new `packages/integrations/src/secrets-codec.ts` (extracted two private methods that used no `this` to keep the service file under 300 lines after the additions)
- **Verification:** `pnpm --filter @cobrai/integrations test` (39 tests, was 34) and `pnpm --filter @cobrai/integrations typecheck` both pass; `pnpm --filter @cobrai/service-notifications typecheck` confirms the rebuilt package's types are consumed correctly
- **Committed in:** `2396a27`

**2. [Rule 2 - Missing critical / correctness] `WhatsAppConnectService`'s initial RED spec exceeded the 300-line hard limit**
- **Found during:** Task 3, immediately after writing the first-pass RED spec (312 lines)
- **Issue:** The user's hard file-size rule ("no source file may exceed 300 lines") applies to spec files too, per 08-03's own precedent (`tenant-integration.service.spec.ts` was split into `.resolve.spec.ts`/`.upsert.spec.ts` for the same reason)
- **Fix:** Split into `whatsapp-connect.service.spec.ts` (connectManaged, 193 lines), `whatsapp-connect.byo-refresh.spec.ts` (connectByo + refreshSenderStatus, 123 lines) and a shared `whatsapp-connect.fixtures.ts` (41 lines)
- **Files modified:** `whatsapp-connect.service.spec.ts`, `whatsapp-connect.byo-refresh.spec.ts` (new), `whatsapp-connect.fixtures.ts` (new)
- **Committed in:** `42168a0`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical/file-size)
**Impact on plan:** Both were necessary to satisfy the plan's own explicit behavior requirements and the project's hard file-size rule. No scope creep — `packages/integrations` changes are additive/backward-compatible and covered by their own tests.

## Issues Encountered
- The worktree had no `node_modules` at start (a fresh worktree, not yet `pnpm install`ed) and no `dist/` for the workspace packages `TwilioProvisioningService`/`VapiProvisioningService`/`WhatsAppConnectService` depend on transitively (`@cobrai/db`, `@cobrai/integrations`, etc.) — resolved with `pnpm install --frozen-lockfile` followed by `pnpm --filter <deps...> build`, per the same pattern noted in 08-03-SUMMARY.md. Build artifacts only, not committed.
- One initial test-writing mistake: an adversarial "no credential in logs" test for `VapiProvisioningService` initially failed because the provider's own error `message` (echoing the tenant's auth token in the adversarial fixture) was included in a `logger.error` call. Fixed by redacting the provider message from the log line entirely (Rule 1 bug, folded into the Task 2 GREEN commit `7821da3` since it was caught during the same RED→GREEN cycle before any commit).

## User Setup Required
None — this plan adds no new required env vars beyond what 08-01 already documented; `TWILIO_ISV_ACCOUNT_SID`/`TWILIO_ISV_AUTH_TOKEN`/`PUBLIC_WEBHOOK_BASE_URL` are added to `.env.example` as placeholders (empty values) for the account owner to fill in before the managed path can be exercised live — consistent with `08-PROVIDER-CONTRACTS.md`'s note that ISV enrolment is not yet complete, so this plan's managed-path code is unit-tested against mocked responses only, not live-verified.

## Next Phase Readiness
- `IntegrationsModule` now exports `TwilioProvisioningService`, `VapiProvisioningService`, `WhatsAppConnectService` and `TenantIntegrationService` for 08-10 (payment gateway BYO), 08-13 (webhook routing), 08-14 (webhook token guard) and 08-18 (frontend Embedded Signup / BYO forms) to build against.
- `WhatsAppConnectService.connectManaged`/`connectByo` are code-complete and unit-tested against mocked Twilio/Vapi responses but **not** live-verified: Twilio ISV enrolment is not started (per `08-PROVIDER-CONTRACTS.md` "Account Prerequisites") and no Meta app exists, so the managed path (subaccount creation, Senders API registration) cannot be exercised end-to-end yet. The BYO path (`connectByo`) has no such external dependency and is the shippable path today.
- The duplicate-import-id-recovery branch in `VapiProvisioningService.importTwilioNumber` is inferred from the behavior block, not from a documented Vapi response shape — worth confirming against a real conflict response once ISV/live testing is possible.
- `packages/db`/`packages/integrations`/etc. now have built `dist/` output in this worktree (not committed) — a fresh worktree will need the same `pnpm install && pnpm --filter <deps> build` step.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 16 files (10 created, 5 modified, this SUMMARY) verified present on disk, and all 8 task/deviation commits (`0b01f46`, `c548575`, `40638d2`, `7821da3`, `2396a27`, `391ffa6`, `42168a0`, `5bdd2d8`) verified present in `git log`.
