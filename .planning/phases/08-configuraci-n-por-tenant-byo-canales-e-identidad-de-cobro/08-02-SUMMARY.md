---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 02
subsystem: infra
tags: [twilio, sendgrid, vapi, whatsapp, provider-contracts, research-verification]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: RESEARCH.md (Open Questions 1-3, Assumptions A1/A2/A3) and CONTEXT.md (D-02, D-03, D-05)
provides:
  - "08-PROVIDER-CONTRACTS.md: verified Twilio SDK call chain (subaccount creation + Senders API) from installed twilio@6.0.2 type definitions"
  - "08-PROVIDER-CONTRACTS.md: cited Vapi phone-number import contract from the live api.vapi.ai OpenAPI spec"
  - "08-PROVIDER-CONTRACTS.md: cited SendGrid subuser/domain-auth call sequence resolving Open Question 2 (no On-Behalf-Of for domain auth)"
  - "08-PROVIDER-CONTRACTS.md: dated Account Prerequisites section (SendGrid tier, Twilio ISV status, Meta app existence) confirmed by the account owner"
affects: [08-08, 08-09, 08-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider contract verification against primary sources (installed package type defs, live OpenAPI specs, official docs) before writing provisioning code that depends on them"

key-files:
  created:
    - .planning/phases/08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro/08-PROVIDER-CONTRACTS.md
  modified: []

key-decisions:
  - "Twilio Senders API accessor confirmed exactly as RESEARCH.md A1 assumed: client.messaging.v2.channelsSenders.create(...) — verified from installed twilio@6.0.2 type definitions, not documentation"
  - "The accountSid Twilio client-construction option does not scope Messaging v2 calls (no accountSid segment in that domain's URI) — a fresh subaccount-authenticated client (twilio(subaccountSid, subaccountAuthToken)) is the only way to call the Senders API as the tenant's subaccount, confirming RESEARCH.md Pitfall 1"
  - "Vapi phone-number import: twilioAuthToken is optional (not required as RESEARCH.md A2 assumed) — an API-key/secret pair is a valid alternative; smsEnabled defaults to true and plan 08-08 must set it false explicitly to avoid silently repointing the tenant's Twilio messaging webhook during a voice-only import"
  - "SendGrid Open Question 2 resolved: domain authentication (POST /v3/whitelabel/domains) and the domain-to-subuser association call are both parent-authenticated with no On-Behalf-Of header; On-Behalf-Of is used only for the subuser-scoped API key call (POST /v3/api_keys)"
  - "SendGrid plan tier is Pro or above (confirmed by account owner 2026-08-05) — managed SendGrid path is unblocked"
  - "Twilio ISV/Tech Provider enrolment not started (confirmed 2026-08-05) — managed WhatsApp path builds and unit-tests against mocks but cannot be exercised live; BYO WhatsApp is the path that must ship functional now"
  - "No Meta app exists for Embedded Signup (confirmed 2026-08-05) — the Embedded Signup button (plan 08-18) must gate behind FACEBOOK_APP_ID/FACEBOOK_CONFIG_ID presence and fall back to the documented sdk_unavailable state; the channel-connection screen must work fully via BYO without it"

patterns-established:
  - "When an SDK method name or third-party request/response shape is uncertain, resolve it by reading the installed package's own type definitions or the provider's live OpenAPI spec (e.g. https://api.vapi.ai/api-json) rather than trusting a documentation-page summary"

requirements-completed: [D-02, D-03, D-05]

# Metrics
duration: 20min (active execution across tasks 1-3, excluding the human checkpoint wait for Task 3)
completed: 2026-08-05
---

# Phase 8 Plan 02: Provider Contracts (Twilio, Vapi, SendGrid) Summary

**Verified Twilio Senders API SDK method chain, Vapi phone-import contract, and SendGrid subuser domain-auth flow against primary sources, plus recorded the account owner's confirmed answers on SendGrid tier, Twilio ISV enrolment, and Meta app existence.**

## Performance

- **Duration:** ~20 min active execution (Tasks 1-2 back-to-back; Task 3 resumed after a human checkpoint)
- **Started:** 2026-08-04T19:06:51-05:00 (first commit on this plan)
- **Completed:** 2026-08-05 (Task 3 checkpoint answered and recorded)
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`08-PROVIDER-CONTRACTS.md`, built incrementally across 3 commits)

## Accomplishments
- Confirmed RESEARCH.md Assumption A1 (Twilio's `client.messaging.v2.channelsSenders.create(...)`) is exactly correct by reading the installed `twilio@6.0.2` package's own `.d.ts`/`.js` source — no guessed method names remain for Twilio provisioning.
- Discovered and documented a correction to RESEARCH.md's Pitfall-1 mitigation: the Twilio SDK's `accountSid` client option does not scope Messaging v2 API calls (that domain's URI has no account-SID path segment), so a fresh subaccount-authenticated client is the only mechanism that actually works — not an optional client-config shortcut.
- Resolved Vapi's phone-number import contract directly from the provider's live OpenAPI spec (`https://api.vapi.ai/api-json`), correcting RESEARCH.md A2 on two points: `twilioAuthToken` is optional (an API-key/secret pair works too), and `smsEnabled` defaults to `true` (an undocumented-in-research side effect that plan 08-08 must explicitly disable for a voice-only import).
- Resolved RESEARCH.md Open Question 2 (SendGrid domain-auth scoping) definitively: both domain authentication and the domain-to-subuser association call are parent-authenticated with no `On-Behalf-Of` header; that header applies only to the subuser-scoped API key call.
- Recorded the three account-owner-confirmed facts (SendGrid tier, Twilio ISV status, Meta app existence) with dated, per-plan consequences, establishing that none of them blocks the phase — BYO paths plus env-var gating keep every affected screen shippable now.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve the Twilio SDK call chain for subaccount creation and WhatsApp sender registration** - `8052ddb` (docs)
2. **Task 2: Resolve the Vapi phone-number import contract and the SendGrid subuser domain-auth call shape** - `9bb8a8f` (docs)
3. **Task 3: Confirm external account prerequisites that only the account owner can see** - `9e69260` (docs)

_Plan metadata commit intentionally omitted per this plan's parallel-worktree execution instructions — SUMMARY.md is committed directly below; STATE.md/ROADMAP.md are not touched by this executor._

## Files Created/Modified
- `.planning/phases/08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro/08-PROVIDER-CONTRACTS.md` - Evidence-backed contract sheet: `## Twilio` (subaccount + Senders API, VERIFIED from installed SDK source), `## Vapi` (phone-number import, CITED from live OpenAPI spec), `## SendGrid` (subuser/API-key/domain-auth/association calls, CITED from official docs, Open Question 2 resolved), `## Account Prerequisites` (three dated, owner-confirmed facts with per-plan consequences)

## Decisions Made
See `key-decisions` in frontmatter above — all decisions are evidence-backed corrections or confirmations of RESEARCH.md's assumptions/open questions, plus the three account-fact records from the human checkpoint. No architectural decisions were made in this plan; it is purely a verification/documentation plan.

## Deviations from Plan

None - plan executed exactly as written. The only notable addition beyond the plan's literal instructions was recording two corrections to RESEARCH.md's assumptions (Vapi's `twilioAuthToken` optionality and `smsEnabled` default) that surfaced naturally while fetching the live Vapi OpenAPI spec — this is exactly the kind of finding Task 2's action step asked for ("confirm or correct"), not a deviation from scope.

## Issues Encountered

- No `node_modules` exists inside this execution worktree (dependencies are not installed per-worktree). Resolved by reading the identical `twilio@6.0.2` package version, already installed in the main repo checkout at `node_modules/.pnpm/twilio@6.0.2/node_modules/twilio` (same version pinned in `apps/service-notifications/package.json`), in a strictly read-only manner — no package was installed, and no file outside this worktree's own `.planning/` output was modified.
- The Twilio/SendGrid documentation pages are Next.js apps whose rendered HTML is a hydration shell; the literal request/response examples live in the page's embedded `__NEXT_DATA__` JSON payload (`props.pageProps.source.compiledSource`), which had to be parsed out via `curl` + a small Python extraction step rather than read directly as HTML text.

## User Setup Required

None - no external service configuration required by this plan itself. However, per the recorded Account Prerequisites, two external, owner-only follow-ups remain open for *future* plans: (1) enrolling in Twilio's Tech Provider (ISV) program before plan 08-08's managed WhatsApp path can be tested live, and (2) registering a Meta app with WhatsApp Embedded Signup configured before plan 08-18's Embedded Signup button can be enabled. Neither blocks this phase from proceeding — see `## Account Prerequisites` in `08-PROVIDER-CONTRACTS.md` for the full consequence breakdown.

## Next Phase Readiness

- Plans 08-08 (Twilio ISV + SendGrid provisioning) and 08-09 can now be planned/executed without guessing a single SDK method name, endpoint, or field name — every claim in `08-PROVIDER-CONTRACTS.md` is labelled VERIFIED, CITED, or (for the one narrow case of the Twilio Senders `sid`'s `XE`-prefix claim) explicitly UNVERIFIED with a stated fallback.
- Plan 08-08 must sequence BYO WhatsApp as the near-term shippable path and treat managed-mode Twilio ISV provisioning as code-complete-but-mock-tested-only until ISV enrolment is approved.
- Plan 08-18 must gate the Embedded Signup button behind `FACEBOOK_APP_ID`/`FACEBOOK_CONFIG_ID` presence and implement the `sdk_unavailable` fallback as the default state, keeping the BYO channel-connection flow fully usable without it.
- Plan 08-09 (SendGrid provisioning) has no external blocker — the account is already on a subuser-eligible tier.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-05*

## Self-Check: PASSED

- FOUND: `.planning/phases/08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro/08-PROVIDER-CONTRACTS.md`
- FOUND: commit `8052ddb` (Task 1)
- FOUND: commit `9bb8a8f` (Task 2)
- FOUND: commit `9e69260` (Task 3)
