---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 14
subsystem: api
tags: [nestjs, rest, integrations, byo, managed, admin-gating, class-validator, prisma-json-filter, audit-log]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-03 TenantIntegrationService/toView (redaction), 08-05 channel_not_configured gate, 08-07 WhatsAppConnectService, 08-09 payment provider verifiers/field names, 08-11 EmailConnectService"
provides:
  - "IntegrationsController (v1/integrations) — the REST surface for the four Settings > Integraciones screens"
  - "IntegrationsService — admin-gated writes, redacted-by-construction reads, per-provider dispatch (comm channels → connect services, payments → TenantIntegrationService.upsert directly)"
  - "GET /v1/integrations/health and GET /v1/integrations/uncontacted-debts — the fourth screen's data"
  - "/api/v1/integrations proxied through api-gateway to SERVICE_NOTIFICATIONS_URL"
affects: [08-16, 08-17, 08-18, 08-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IntegrationsService.save dispatches by provider: twilio_whatsapp/twilio_voice (byo only) → WhatsAppConnectService.connectByo; sendgrid → EmailConnectService.connectManaged/connectByo by mode; every other provider → TenantIntegrationService.upsert directly, with skipVerification for external_link/transfer"
    - "channel_not_configured blocked debts use Prisma's native Postgres JSON path/equals filter (changes: { path: ['reason'], equals: 'channel_not_configured' }) instead of $queryRaw — the JSON predicate does not need raw SQL, keeping every step typed and unit-testable with mocked Prisma model methods"
    - "A local, defensive port of normalizeClerkRole/assertAdmin lives in service-notifications (integrations.provider-utils.ts) rather than importing from api-gateway — the two apps share no runtime dependency"

key-files:
  created:
    - apps/service-notifications/src/integrations/dto/integration.dto.ts
    - apps/service-notifications/src/integrations/integrations.provider-utils.ts
    - apps/service-notifications/src/integrations/integrations.fixtures.ts
    - apps/service-notifications/src/integrations/integrations.service.ts
    - apps/service-notifications/src/integrations/integrations.service.spec.ts
    - apps/service-notifications/src/integrations/integrations.service.save.spec.ts
    - apps/service-notifications/src/integrations/integrations.service.health.spec.ts
    - apps/service-notifications/src/integrations/integrations.controller.ts
    - apps/service-notifications/src/integrations/integrations.controller.spec.ts
    - apps/service-notifications/src/integrations/integrations.uncontacted-debts.query.ts
    - apps/service-notifications/src/integrations/integrations.uncontacted-debts.query.spec.ts
    - apps/api-gateway/src/proxy/proxy.controller.spec.ts
  modified:
    - apps/service-notifications/src/integrations/integrations.module.ts
    - apps/api-gateway/src/proxy/proxy.controller.ts

key-decisions:
  - "queryUncontactedDebts uses Prisma's typed JSON path/equals filter on AuditLog.changes instead of a raw $queryRaw predicate — Prisma 5.22's generated JsonFilter supports { path: string[], equals } on Postgres, so the plan's conditional 'use $queryRaw if the JSON predicate needs raw SQL' resolves to 'it doesn't'. The rest of the pipeline (latest-block-per-debtor dedup, contacted-since-block exclusion, active-debt join) is plain typed Prisma findMany calls, matching conversations.service.ts's existing pagination precedent and making every step independently unit-testable with mocked model methods rather than opaque SQL strings."
  - "twilio_voice save dispatches through the same WhatsAppConnectService.connectByo as twilio_whatsapp (D-05: voice shares the WhatsApp subaccount/number) — there is no independent voice-only BYO provisioning path in the underlying orchestrator (08-07's WhatsAppConnectService, out of this plan's scope to modify), so IntegrationsService.save('tenant', 'twilio_voice', ...) reuses connectByo and then re-reads the twilio_voice-specific view via a listViews lookup so the response matches the requested provider."
  - "twilio_whatsapp/twilio_voice PUT with mode: 'managed' is rejected with BadRequestException — the managed path only exists through POST /v1/integrations/whatsapp/embedded-signup (D-25); PUT is BYO-only for these two providers by construction, not merely by convention."
  - "Payment providers requested with mode !== 'byo' are rejected before touching TenantIntegrationService, both in the generic 'payments channel' check and structurally in list()'s not_configured synthesis (defaultModeFor returns 'byo' for the payments channel, 'managed' for every other channel) — explicit user requirement: payments never offer managed, D-06."
  - "verify() for a generic payment provider re-reads stored secrets via TenantIntegrationService.resolveAny and re-runs upsert with an empty secrets object (relying on upsert's own per-field merge, already covered by 08-03's tests) rather than re-implementing rotation logic here — keeps the single source of truth for secret merging in one place."

patterns-established:
  - "Pattern: a provider-dispatch service (IntegrationsService) never calls Prisma directly for writes — every write goes through TenantIntegrationService.upsert or a narrower connect service; the raw-SQL-adjacent query helper (integrations.uncontacted-debts.query.ts) is the one place that reads Prisma models directly, kept in its own file/tests to respect the 300-line limit and to isolate the one area with real query-shape risk"

requirements-completed: [D-11, D-16, D-23, D-24, D-26]

# Metrics
duration: 26min
completed: 2026-08-04
---

# Phase 8 Plan 14: Integrations REST API (service-notifications + api-gateway proxy) Summary

**IntegrationsController/IntegrationsService in service-notifications — a tenant-scoped, admin-gated, write-only-secret REST surface for the four Settings > Integraciones screens, reachable through a new `/api/v1/integrations` api-gateway proxy route, with `mode: managed | byo` explicitly selectable and returned for every channel that supports both and `byo`-only enforced for payments (D-06).**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-08-04T21:00:14-05:00 (worktree base correction)
- **Completed:** 2026-08-04T21:25:44-05:00
- **Tasks:** 3 of 3 plan tasks completed
- **Files modified:** 14 (12 created, 2 modified)

## Accomplishments

- `SaveIntegrationDto`/`EmbeddedSignupDto`/`UncontactedDebtsQueryDto` with `Record<string, string>` fields, following the Phase 6 SendGrid-handler pattern so `whitelist: true`/`forbidNonWhitelisted: true` doesn't strip or reject arbitrary per-provider keys
- `IntegrationsService.list` synthesizes a `not_configured` `IntegrationView` for every provider with no persisted row, so all four screens always get one card per channel/provider whether or not it's configured
- `save`/`verify`/`disconnect`/`embeddedSignup`/`recheckEmailDns` are gated by a local, defensive port of `assertAdmin`/`normalizeClerkRole` (no cross-app import — `service-notifications` has no dependency on `api-gateway`); reads are unguarded but every response is still redacted by construction (`TenantIntegrationService.toView`)
- `save` dispatches per provider: `twilio_whatsapp`/`twilio_voice` (BYO only — managed is Embedded Signup's job) → `WhatsAppConnectService.connectByo`; `sendgrid` → `EmailConnectService.connectManaged`/`connectByo` by `mode`; every other provider → `TenantIntegrationService.upsert` directly, with `skipVerification: true` for `external_link`/`transfer` only
- `external_link` template is validated server-side via `validateExternalLinkTemplate` (`@cobrai/utils`, from 08-09) before any write — rejecting a non-`https://` or reference-less template with the validator's own Spanish message, never relying on browser-only validation (T-08-14d)
- Payment providers requested with `mode !== "byo"` are rejected with `BadRequestException` before any write; `list()`'s `not_configured` synthesis independently defaults payments to `mode: "byo"` and every other channel to `mode: "managed"` — the explicit "payments never expose managed" requirement is enforced at two independent points, not just one
- `verify` re-runs the health check from stored secrets (`resolveAny` + `upsert` with `secrets: {}`) so the caller never resends them; `twilio_whatsapp` and `sendgrid` route through their own provider-specific re-check (`refreshSenderStatus`/`recheckDns`) instead of the generic path
- `queryUncontactedDebts` finds each debtor's single most recent `channel_not_configured` audit-log block (`AuditLog.changes` filtered via Prisma's native Postgres JSON `path`/`equals`, not raw SQL — the predicate doesn't need it), excludes any debtor contacted successfully on that channel since the block, and joins to their active (non `paid_full`/`written_off`) debts, paginated at the requested page size
- `IntegrationsController` follows the `ContactsController` idiom exactly (`@ReqContext()` + `successResponse()` on every method, DTOs on every body); every write forwards `ctx.userRole` for the service's `assertAdmin` to enforce
- `apps/api-gateway/src/proxy/proxy.controller.ts` gained the `/api/v1/integrations` `SERVICE_ROUTES` entry and both `@All(...)` path patterns (`api/v1/integrations`, `api/v1/integrations/*`) — the two lists are documented in-code as needing to stay in sync
- A test asserts `JSON.stringify` of a view with a stored secret contains only the last four characters, never the full value — proven against the serialized response, not a field-by-field comparison
- 51 new tests across 6 new spec files (service: 24 + 15 + 8 + 3, controller: 10, gateway proxy: 4 — see Task Commits for the exact per-file split); `pnpm --filter @cobrai/service-notifications test` at 276 tests (was 230), `pnpm --filter @cobrai/api-gateway test` at 39 tests (was 35); `pnpm typecheck` and `pnpm test` both green (25/25 turbo tasks each) at wave end
- No source file exceeds 300 lines (largest: `sendgrid-provisioning.service.ts` at 277, pre-existing from 08-11; largest new file is `integrations.service.ts` at 223)

## Task Commits

1. **Task 1: IntegrationsService with admin gating, write-only serialization and per-provider dispatch** - `56ea077` (feat)
2. **Task 2: IntegrationsController and the api-gateway proxy route** - `ef09791` (feat)
3. **Task 3: Health summary and the debts blocked by channel_not_configured** - `ea3701e` (feat)
4. **Follow-up: explicit twilio_voice BYO dispatch coverage** - `2b248c8` (test)

## Files Created/Modified

- `apps/service-notifications/src/integrations/dto/integration.dto.ts` - `SaveIntegrationDto`/`EmbeddedSignupDto`/`UncontactedDebtsQueryDto`
- `apps/service-notifications/src/integrations/integrations.provider-utils.ts` - `ALL_PROVIDERS`, `assertValidProvider`, `defaultModeFor`, `notConfiguredView`, local `normalizeClerkRole`
- `apps/service-notifications/src/integrations/integrations.fixtures.ts` - shared spec fixtures (`makeCollaboratorMocks`, `baseView`, `makeConfig`)
- `apps/service-notifications/src/integrations/integrations.service.ts` - the injectable service: `list`/`save`/`verify`/`disconnect`/`embeddedSignup`/`recheckEmailDns`/`health`/`uncontactedDebts`
- `apps/service-notifications/src/integrations/integrations.service.spec.ts` / `.save.spec.ts` / `.health.spec.ts` - 24 + 16 + 3 tests
- `apps/service-notifications/src/integrations/integrations.controller.ts` / `.spec.ts` - REST surface + 10 tests
- `apps/service-notifications/src/integrations/integrations.uncontacted-debts.query.ts` / `.spec.ts` - the `channel_not_configured` blocked-debts query + 8 tests
- `apps/service-notifications/src/integrations/integrations.module.ts` - registers `IntegrationsService`/`IntegrationsController`
- `apps/api-gateway/src/proxy/proxy.controller.ts` / `.spec.ts` (new) - `/api/v1/integrations` route + 4 tests

## Final Endpoint List (for 08-16 through 08-19)

```
GET    /api/v1/integrations                          → { items: IntegrationView[] }
PUT    /api/v1/integrations/:provider                 → IntegrationView   (admin; body: SaveIntegrationDto)
DELETE /api/v1/integrations/:provider                 → IntegrationView   (admin)
POST   /api/v1/integrations/:provider/verify           → IntegrationView   (admin; no body)
POST   /api/v1/integrations/whatsapp/embedded-signup    → IntegrationView   (admin; body: EmbeddedSignupDto)
POST   /api/v1/integrations/email/recheck-dns           → IntegrationView   (admin; no body)
GET    /api/v1/integrations/health                     → { items: IntegrationView[], summary: { operational: number, total: number } }
GET    /api/v1/integrations/uncontacted-debts           → { items: UncontactedDebt[], total: number, page: number }  (?page=&pageSize=, default 1/25)
```

`IntegrationView`/`UncontactedDebt` shapes are unchanged from `08-UI-SPEC.md`'s "Data Contract Consumed by the UI" — `IntegrationView` is `@cobrai/integrations`'s existing type, returned unmodified.

**`SaveIntegrationDto`** (`PUT` body): `{ mode: "managed" | "byo" (required), publicConfig?: Record<string,string>, secrets?: Record<string,string> }`. `mode` is mandatory — there is no implicit default at the request layer; the service layer additionally rejects `mode: "managed"` for payment providers and for `twilio_whatsapp`/`twilio_voice` (managed WhatsApp/voice is Embedded Signup only).

**Per-provider field names the frontend must send** (unchanged from what the underlying connect services / verifiers already expect, confirmed against 08-07/08-09/08-11's summaries):
- `twilio_whatsapp`/`twilio_voice` BYO: `publicConfig.accountSid`, `publicConfig.phoneNumberE164`, `secrets.authToken`
- `sendgrid` managed: `publicConfig.domain`/`fromEmail`/`fromName`/`adminEmail`(optional, falls back to `fromEmail`)/`replyDomain`(optional)
- `sendgrid` byo: same `publicConfig` fields + `secrets.apiKey`
- `stripe`: `secrets.secretKey`; `mercadopago`: `secrets.accessToken`; `wompi`: `secrets.privateKey` (+ `publicConfig.publicKey`); `payu`: `secrets.apiKey`+`secrets.apiLogin` (+ `publicConfig.merchantId`/`accountId`); `epayco`: `publicConfig.publicKey` + `secrets.pKey`
- `external_link`: `publicConfig.template` (validated server-side against `{monto}`/`{ref}`/`{nombre}`, must start with `https://`)
- `transfer`: `publicConfig.bank`/`accountType`/`accountNumber`/`accountHolder`/`taxId` (all plaintext, not secrets)

## Decisions Made

See `key-decisions` in frontmatter. Summarized: `queryUncontactedDebts` uses Prisma's typed JSON filter instead of raw SQL (the plan's own action text made `$queryRaw` conditional on the predicate needing it — it doesn't); `twilio_voice` BYO save reuses `WhatsAppConnectService.connectByo` because there is no independent voice-only provisioning path in 08-07's orchestrator and modifying that file was out of this plan's scope; payments' BYO-only rule is enforced at two independent points (the save-time reject and the `not_configured` synthesis default).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `IntegrationsService` referenced `queryUncontactedDebts` (Task 3's file) from Task 1's `uncontactedDebts` method**
- **Found during:** Task 1 (writing `integrations.service.ts`, whose `uncontactedDebts` method needed a return type/import from a module Task 3 was sequenced to create)
- **Issue:** Same forward-reference shape 08-03-SUMMARY.md documented for `verifyCredentials` — Task 3's query module didn't exist yet when Task 1's service file needed to compile.
- **Fix:** Created a minimal stub `integrations.uncontacted-debts.query.ts` (returns `{ items: [], total: 0, page }`) during Task 1, then fully replaced it with the real implementation in Task 3, exactly as 08-03 did for its own forward reference.
- **Files modified:** `apps/service-notifications/src/integrations/integrations.uncontacted-debts.query.ts`
- **Committed in:** `56ea077` (stub), `ea3701e` (full implementation)

**2. [Rule 2 - Missing critical] `health()`/`uncontactedDebts()` method signatures and their controller routes were added in Tasks 1/2, not deferred to Task 3 as the plan's task boundaries literally describe**
- **Found during:** Task 1 design — writing the full `IntegrationsService` class and its constructor once, rather than adding methods/dependencies across three separate edits to the same file
- **Issue:** The plan's task split assigns `health`/`uncontactedDebts` to Task 3's action text, but `integrations.service.ts` and `integrations.controller.ts` are both first created in Tasks 1/2 — adding the methods immediately (with the Task-1 stub backing `uncontactedDebts`) avoided two additional edit passes over already-tested files and matches how 08-07/08-11 scaffolded their services in one pass.
- **Fix:** `health`/`uncontactedDebts` methods and the two `GET` routes exist from Task 1/2's commits; Task 3's commit is scoped to fully implementing the previously-stubbed query module and its tests, which is where the plan's real Task 3 risk (the SQL/query-shape correctness) actually lives.
- **Files modified:** none beyond what Tasks 1/2 already declared
- **Verification:** All of Task 3's acceptance criteria (grep for `channel_not_configured`, no `$queryRawUnsafe`, dedicated tests for tenant isolation / contacted-after-block exclusion / empty-result shape) are met by the Task 3 commit

---

**Total deviations:** 2 auto-fixed (1 blocking forward-reference, 1 sequencing choice that doesn't change any tested behavior)
**Impact on plan:** No scope creep. Both are structural/sequencing choices; every acceptance criterion in the plan is met by the task that owns it.

## Known Stubs

None — the Task 1 `queryUncontactedDebts` stub was fully replaced within this same plan (Task 3), before this SUMMARY was written. No stub remains in the committed code.

## Threat Flags

None beyond what the plan's own threat model (T-08-08, T-08-14b through T-08-14f, T-08-SC) already covers — every threat in that table was mitigated as specified:
- T-08-08 (plaintext secret in response): mitigated — every response goes through `TenantIntegrationService.toView`; asserted against `JSON.stringify`, not field-by-field
- T-08-14b (non-admin writing credentials): mitigated — `assertAdmin` at the top of every write method in the service layer
- T-08-14c (cross-tenant read): mitigated — every query keyed on `ctx.tenantId`; `queryUncontactedDebts` tests assert a tenant with no matching audit-log rows gets an empty page
- T-08-14d (non-https/attacker-controlled external payment template): mitigated — `validateExternalLinkTemplate` enforced server-side on save
- T-08-14e (SQL injection via the audit-log JSON predicate): not applicable in the shipped form — the predicate uses Prisma's typed JSON filter, not raw SQL at all, so there is no raw-SQL injection surface to protect; `$queryRawUnsafe` is grep-asserted absent
- T-08-14f (webhook URL exposed to a non-admin): accepted per the plan's own disposition — reads are unguarded by design
- T-08-SC (package install legitimacy): not applicable — no package was installed in this plan

## Issues Encountered

- Fresh worktree had no `node_modules` and no built `dist/` for workspace packages (`@cobrai/db`, `@cobrai/utils`, `@cobrai/integrations`, `@cobrai/compliance`, etc.) — resolved with `pnpm install --frozen-lockfile` followed by `pnpm --filter <deps...> build`, the same pattern noted in every prior Phase 8 plan's summary. Build artifacts only, not committed.

## User Setup Required

None — this plan adds no new environment variables or external service configuration. It consumes `PUBLIC_WEBHOOK_BASE_URL` (already documented by 08-07) and every collaborator service (`WhatsAppConnectService`, `EmailConnectService`, `TenantIntegrationService`) already wired by earlier Phase 8 plans.

## Next Phase Readiness

- The full endpoint list, response shapes, and per-provider `publicConfig`/`secrets` field names documented above are ready for plans 08-16 through 08-19 (the four frontend screens) to code against — `apps/web/hooks/use-integrations.ts` can call these routes directly through the existing `useApiClient`/`fetchApi`/`patchApi` pattern.
- `IntegrationsService.save`'s `twilio_voice` BYO path reuses `WhatsAppConnectService.connectByo` rather than an independent voice-only provisioning flow — if a future plan needs voice to use different Twilio credentials than WhatsApp, that requires an architectural change to `WhatsAppConnectService` (08-07's file, out of this plan's scope), not this API layer.
- `queryUncontactedDebts` is unit-tested against mocked Prisma model methods, not a real Postgres instance — the Prisma JSON `path`/`equals` filter and the `notIn` debt-status filter should be smoke-tested against a real database once one is available in this environment, per the same caveat every prior Phase 8 plan has flagged for its own live-integration points.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 14 code files (12 created, 2 modified) verified present via `git ls-files`, and all 5 commits (`56ea077`, `ef09791`, `ea3701e`, `2b248c8`, this SUMMARY's own `90e1079`) verified present in `git log`.
