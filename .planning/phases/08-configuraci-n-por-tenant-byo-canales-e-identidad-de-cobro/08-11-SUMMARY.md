---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 11
subsystem: integrations
tags: [sendgrid, subusers, domain-authentication, dns, cname, byo, nestjs]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-02 verified provider contracts (08-PROVIDER-CONTRACTS.md §SendGrid); 08-03 TenantIntegrationService/verifyCredentials (sendgrid verifier already returns pending_dns); 08-07 IntegrationsModule + TenantIntegrationService.resolveAny pattern"
provides:
  - "SendgridProvisioningService: subuser creation, subuser-scoped API key minting, domain authentication (parent-then-associate) and re-validation"
  - "EmailConnectService: connectManaged/connectByo/recheckDns orchestrating a single sendgrid TenantIntegration row through the pending_dns lifecycle"
  - "IntegrationsModule now also exports SendgridProvisioningService and EmailConnectService"
affects: [08-10, 08-13, 08-17, 08-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SendgridProvisioningService mirrors TwilioProvisioningService: @Injectable() caching only the process-global parent API key, raw fetch replicating email.adapter.ts's header/body/error shape, provider failures thrown carrying the provider's own text verbatim"
    - "EmailConnectService mirrors WhatsAppConnectService: injects the narrow provisioning service plus TenantIntegrationService, reuses an existing subuser via the non-status-gated resolveAny, and writes a single overrideStatus-driven upsert per outcome instead of a placeholder+final two-write sequence (no webhook URL dependency to mint first, unlike the WhatsApp Senders API call)"
    - "publicConfig.dnsRecords is stored as a genuine structured array (cast through `as unknown as Record<string, string>`), not a JSON string — matches the existing verifySendGrid precedent in packages/integrations/src/verifiers/index.ts and TenantIntegrationService.toView's direct dnsRecords spread"

key-files:
  created:
    - apps/service-notifications/src/integrations/sendgrid-provisioning.service.ts
    - apps/service-notifications/src/integrations/sendgrid-provisioning.service.spec.ts
    - apps/service-notifications/src/integrations/email-connect.service.ts
    - apps/service-notifications/src/integrations/email-connect.service.spec.ts
  modified:
    - apps/service-notifications/src/integrations/integrations.module.ts

key-decisions:
  - "createSubuser's required `ips` field (per 08-PROVIDER-CONTRACTS.md's call-1 body) has no documented value for a Pro-tier account without dedicated IPs — resolved as `ips: []` (shared-IP pool), flagged here as an operational detail to confirm once this path runs against the live parent account"
  - "validateDomain's response shape for POST /v3/whitelabel/domains/{id}/validate is explicitly out of scope in 08-PROVIDER-CONTRACTS.md ('seen in the same fetched guide but not itself part of this plan's required contract') — resolved by not trusting that response body at all: the POST triggers the re-check, then a GET on the domain resource (the verified dns/valid shape from calls 3/4) supplies the returned records"
  - "Added an optional `replyDomain?: string` field to both connectManaged and connectByo inputs, beyond the plan's literal <interfaces> signature — the behavior block explicitly says replyDomain is derived 'when the tenant does not supply one explicitly', which presupposes an override path the interfaces block didn't declare; additive and backward-compatible"
  - "connectManaged persists exactly once per outcome (no placeholder+final two-write sequence like WhatsAppConnectService) — domain authentication needs no webhook URL, so there is nothing to mint via an earlier write; this makes the 'never a half-written verified row' requirement structurally true rather than requiring careful sequencing"
  - "recheckDns falls back to a plain re-upsert (no overrideStatus) through the shared sendgrid verifier for any row missing a subuserUsername/domainId pair — covers BYO rows and a managed row that failed before reaching domain authentication, not just the literal 'flips pending_dns to verified' case in the behavior block"

requirements-completed: [D-01, D-03, D-11, D-22]

# Metrics
duration: 20min
completed: 2026-08-04
---

# Phase 8 Plan 11: SendGrid Email Provisioning (Managed Subuser + BYO, DNS/CNAME Lifecycle) Summary

**SendgridProvisioningService (subuser + scoped API key + domain authentication via the parent-then-associate call shape) and EmailConnectService (managed/BYO orchestration through the pending_dns → verified lifecycle), both unit-tested against a mocked `global.fetch`.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-04T20:31:25-05:00 (worktree base)
- **Completed:** 2026-08-04T20:48:15-05:00
- **Tasks:** 2 completed
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `SendgridProvisioningService.createSubuser` calls `POST /v3/subusers` (parent key, no `On-Behalf-Of`) then `POST /v3/api_keys` (parent key + `On-Behalf-Of: <subuser>`) to mint a subuser-scoped API key; the generated password is used once in the create-subuser body and never returned, logged, or retained
- `authenticateDomain` implements the parent-then-associate shape resolved in `08-PROVIDER-CONTRACTS.md` Open Question 2 (`POST /v3/whitelabel/domains` then `POST /v3/whitelabel/domains/{id}/subuser`, both parent-authenticated, neither uses `On-Behalf-Of`) and maps the `dns` object into the exact `DnsRecord[]` shape (`type`/`host`/`value`/`verified`) the frontend's `DnsRecordsTable` requires
- `validateDomain` re-checks via `POST .../validate` then re-fetches the domain resource via `GET .../whitelabel/domains/{id}` for the verified per-record shape, since the validate endpoint's own response body is explicitly undocumented in the contract sheet
- `EmailConnectService.connectManaged` reuses an existing subuser (found via the ungated `resolveAny`, since a `pending_dns` row isn't `verified`) instead of provisioning a second one, authenticates the domain, and writes a single `overrideStatus`-driven `upsert`: `valid: true → verified` with `verifiedAt`, `valid: false → pending_dns`, a provisioning throw → `failed` with the provider's message — never a half-written verified row
- `replyDomain` defaults to `reply.{domain}` (D-22) in both `connectManaged` and `connectByo`, persisted as the single value plan 08-10's `EmailAdapter` and plan 08-13's inbound handler must both read
- `connectByo` skips all provisioning and relies entirely on the existing `sendgrid` verifier in `packages/integrations/src/verifiers/index.ts` (already returns `pending_dns` with fetched DNS records) via a plain `upsert` with no `overrideStatus`/`skipVerification`
- `recheckDns` re-validates a managed row's domain directly against SendGrid when a `subuserUsername`/`domainId` pair is stored, falls back to the shared verifier via a plain re-`upsert` for BYO rows or a managed row that never reached domain authentication, and returns a `not_configured` view rather than throwing when no `sendgrid` integration exists
- The subuser API key never appears in any `publicConfig` argument — asserted by a dedicated test in both files
- 26 new tests (15 in `sendgrid-provisioning.service.spec.ts`, 11 in `email-connect.service.spec.ts`); `pnpm --filter @cobrai/service-notifications test` at 205 tests (was 194 before this plan's files existed, though the full suite couldn't run standalone until sibling packages `@cobrai/compliance`/`@cobrai/kafka`/`@cobrai/types`/`@cobrai/workflow-packages` were built in this worktree — pre-existing local build-artifact gap, not this plan's code)
- No source file exceeds 300 lines (max: 280, `email-connect.service.spec.ts`)

## Task Commits

1. **Task 1: SendgridProvisioningService — subuser, scoped API key, domain authentication and validation** - `e603a13` (feat, includes RED+GREEN in one commit since tests were written alongside the implementation)
2. **Task 2: EmailConnectService — managed and BYO connection with the pending_dns lifecycle** - `64fda8f` (feat)

## Files Created/Modified
- `apps/service-notifications/src/integrations/sendgrid-provisioning.service.ts` - subuser + scoped key + domain authentication/validation
- `apps/service-notifications/src/integrations/sendgrid-provisioning.service.spec.ts` - 15 tests, `global.fetch` mocked and restored per test
- `apps/service-notifications/src/integrations/email-connect.service.ts` - managed/BYO orchestration + `recheckDns`
- `apps/service-notifications/src/integrations/email-connect.service.spec.ts` - 11 tests, both collaborators mocked
- `apps/service-notifications/src/integrations/integrations.module.ts` - registers/exports `SendgridProvisioningService` + `EmailConnectService`

## `publicConfig` Keys Written (for 08-10, 08-13, 08-17 to read)

**`sendgrid`** (managed):
- `domain`, `fromEmail`, `fromName`, `replyDomain` (`reply.{domain}` unless explicitly overridden)
- `subuserUsername`, `domainId` (string-encoded SendGrid domain id)
- `dnsRecords` — a structured `DnsRecord[]` (`{ type: "CNAME", host, value, verified }[]`), not a JSON string; consumed directly by `TenantIntegrationService.toView`'s existing `dnsRecords` spread into `IntegrationView`

**`sendgrid`** (BYO): `domain`, `fromEmail`, `fromName`, `replyDomain` — same shape; `dnsRecords` merged in by the existing `verifySendGrid` verifier when the domain is not yet authenticated.

**`secrets`**: `apiKey` only — the subuser-scoped key (managed) or the pasted BYO key. Never written to `publicConfig`.

## Account Tier Finding

Per `08-PROVIDER-CONTRACTS.md` "Account Prerequisites": the parent SendGrid account is confirmed **Pro tier or above**, so subusers are available — the managed path is unblocked, not merely mock-tested. This plan's managed-path code is unit-tested against mocked `fetch` responses only in this session (no live SendGrid account credentials were available to this executor); it has not been exercised end-to-end against the live parent account.

## Decisions Made
See `key-decisions` in frontmatter. Summarized: the `ips: []` choice for subuser creation and the validate-then-GET fallback for `validateDomain` are both resolutions of gaps `08-PROVIDER-CONTRACTS.md` itself flags as undocumented/out of scope, not guesses made in place of reading the contract sheet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `replyDomain` override path added to both connect method inputs**
- **Found during:** Task 2 design
- **Issue:** The plan's `<interfaces>` block declares `connectManaged`/`connectByo` inputs without a `replyDomain` field, but the behavior block requires `replyDomain` to be "derived as `reply.{domain}` when the tenant does not supply one explicitly" — a statement that presupposes an explicit-supply path the interface signature omitted
- **Fix:** Added an optional `replyDomain?: string` to both input types; additive, does not change the required fields either caller (08-10, 08-13, 08-18) already expects
- **Files modified:** `apps/service-notifications/src/integrations/email-connect.service.ts`
- **Verification:** `pnpm --filter @cobrai/service-notifications typecheck` and `test` both pass; a dedicated test asserts the default derivation still applies when the field is omitted
- **Committed in:** `64fda8f`

---

**Total deviations:** 1 auto-fixed (1 missing-critical)
**Impact on plan:** Additive only — no existing caller's behavior changes; the literal interface shape in the plan is a subset of what's implemented.

## Issues Encountered
- This worktree had no `node_modules` and no built `dist/` for workspace packages at start (fresh worktree, matching 08-07-SUMMARY.md's noted pattern) — resolved with `pnpm install --frozen-lockfile` followed by `pnpm --filter <deps...> build` for `@cobrai/db`, `@cobrai/integrations`, `@cobrai/utils`, `@cobrai/ports`, `@cobrai/workflow-packages` (a transitive dependency of `packages/db`'s seed script), `@cobrai/compliance`, `@cobrai/kafka`, and `@cobrai/types`. Build artifacts only, not committed — a fresh worktree will need the same step.

## User Setup Required
None beyond what plan 08-07 already documented: `SENDGRID_PARENT_API_KEY` is already declared (empty placeholder) in `.env.example`; this plan does not modify that file (owned by 08-07). The account owner must fill in the real parent API key before the managed path can be exercised live — it is unit-tested against mocked responses only in this session.

## Next Phase Readiness
- `IntegrationsModule` now exports `SendgridProvisioningService` and `EmailConnectService` for plan 08-10 (further payment providers), 08-13 (inbound webhook handler reading `replyDomain`), 08-17, and 08-18 (frontend `Correo` `ChannelCard`) to build against.
- The managed path (subuser creation, domain authentication, CNAME publication) is code-complete and unit-tested against mocked SendGrid responses but not live-verified — the account owner confirmed Pro tier (subusers available) but no live parent API key was exercised in this session.
- The `ips: []` choice in `createSubuser` and the validate-then-GET fallback in `validateDomain` are both worth confirming against real SendGrid responses once live testing is possible.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 5 code files (4 created, 1 modified) and this SUMMARY verified present on disk, and all 3 commits (`e603a13`, `64fda8f`, `03e499c`) verified present in `git log`.
