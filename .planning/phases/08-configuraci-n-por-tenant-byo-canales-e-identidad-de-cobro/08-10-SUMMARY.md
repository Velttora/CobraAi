---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 10
subsystem: notifications
tags: [twilio, sendgrid, vapi, tenant-integration, simulation-guard, ley-1266, d-17, d-22]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-03's TenantIntegrationService.resolveByChannel/hasVerifiedChannel; 08-05's channel_not_configured compliance gate; 08-06's tenant credential seed; 08-07's publicConfig key shapes (fromNumber, vapiPhoneNumberId)"
provides:
  - "Three channel adapters (WhatsApp, voice, email) resolving tenant credentials per request via TenantIntegrationService instead of a constructor-cached ConfigService client"
  - "simulation.guard.ts: isSimulationEnabled/assertSimulationNotInProduction — the single SIMULATE_OUTBOUND_SENDS predicate and the boot-time refusal-to-start assertion, called from main.ts before NestFactory.create"
  - "simulated?: boolean on all four @cobrai/ports send-result interfaces, threaded onto Contact.simulated and Message.simulated"
  - "Per-tenant email Reply-To (reply@{tenant replyDomain}) replacing the fixed EMAIL_REPLY_TO constant, which is now deleted repo-wide"
affects: [08-13, 08-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gated-simulation branch shape: on missing/unverified tenant credential, return { status: 'failed' } unless isSimulationEnabled(), in which case return a fake-but-marked-simulated success and log a warning — applied identically across WhatsApp, voice, SMS and email adapters"
    - "Extract-instead-of-append for files already over the file-size limit: new behavior for contacts.service.ts/.spec.ts was pulled into sibling modules (record-conversation-message.ts, contacts.service.fixtures.ts, contacts.service.dispatch.spec.ts) rather than appended, shrinking both files instead of growing them"

key-files:
  created:
    - apps/service-notifications/src/adapters/simulation.guard.ts
    - apps/service-notifications/src/adapters/simulation.guard.spec.ts
    - apps/service-notifications/src/adapters/sms.adapter.spec.ts
    - apps/service-notifications/src/contacts/record-conversation-message.ts
    - apps/service-notifications/src/contacts/contacts.service.fixtures.ts
    - apps/service-notifications/src/contacts/contacts.service.dispatch.spec.ts
  modified:
    - packages/ports/src/whatsapp.port.ts
    - packages/ports/src/email.port.ts
    - packages/ports/src/voice-agent.port.ts
    - packages/ports/src/sms.port.ts
    - apps/service-notifications/src/main.ts
    - apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts
    - apps/service-notifications/src/adapters/twilio-whatsapp.adapter.spec.ts
    - apps/service-notifications/src/adapters/vapi-voice.adapter.ts
    - apps/service-notifications/src/adapters/vapi-voice.adapter.spec.ts
    - apps/service-notifications/src/adapters/sms.adapter.ts
    - apps/service-notifications/src/adapters/email.adapter.ts
    - apps/service-notifications/src/adapters/email-adapter.spec.ts
    - apps/service-notifications/src/adapters/adapters.module.ts
    - apps/service-notifications/src/contacts/contacts.service.ts
    - apps/service-notifications/src/contacts/contacts.service.spec.ts
    - apps/service-notifications/src/agent/conversation-agent.service.ts
    - apps/service-notifications/src/agent/conversation-agent.service.spec.ts
    - apps/service-notifications/src/conversations/conversations.service.ts
    - apps/service-notifications/src/conversations/conversations.service.spec.ts
    - apps/service-notifications/src/webhooks/vapi-webhook.handler.ts
    - .env.example
  deleted:
    - apps/service-notifications/src/common/email.constants.ts

key-decisions:
  - "recordConversationMessage extracted from ContactsService into contacts/record-conversation-message.ts (standalone function taking PrismaService as an explicit param), and contacts.service.spec.ts's fixture factories extracted into contacts.service.fixtures.ts — both files were already over the 300-line hard limit before this plan and could not grow; the extraction let contacts.service.ts shrink 1021→975 lines and contacts.service.spec.ts shrink 614→475 lines while still adding the simulated-flag threading"
  - "New D-17 persistence tests and the D-22 reply_to-removal test for ContactsService live in a new sibling spec, contacts.service.dispatch.spec.ts, for the same file-size reason"
  - "No sms.adapter.spec.ts existed before this plan despite the acceptance criteria requiring failed-without-simulation coverage for 'all three adapters' — created it (Rule 2, missing critical test coverage the plan's own acceptance criteria requires)"
  - "The apiKey/agentId-missing branch in VapiVoiceAdapter (platform-level Vapi misconfiguration, D-04) was left completely untouched/ungated, per the plan's explicit instruction to leave that branch alone; only the newly-added tenant phoneNumberId resolution is gated behind isSimulationEnabled()"
  - "EMAIL_REPLY_TO had three importers beyond contacts.service.ts not listed in the plan's files_modified: conversation-agent.service.ts, conversations/conversations.service.ts, webhooks/vapi-webhook.handler.ts. Since the plan deletes the constant, all three would fail to compile if left untouched (Rule 3, blocking) — each now omits reply_to entirely, letting EmailAdapter derive it from the tenant's own replyDomain. Their spec files' reply_to assertions were updated to match."
  - "webhooks/sendgrid-inbound.handler.ts still does literal string matching against 'reply.fogging.org' for inbound routing — left untouched per the plan's explicit carve-out (08-13 owns the inbound side); flagged below as input to 08-13"

patterns-established:
  - "Every channel adapter's identity-derivation flows entirely from TenantIntegrationService.resolveByChannel(tenant_id, channel) at send time — no adapter caches a client in its constructor anymore except VapiVoiceAdapter's platform-owned apiKey/agentId (D-04, explicitly exempted)"

requirements-completed: [D-01, D-04, D-17, D-22]

# Metrics
duration: ~50min
completed: 2026-08-05
---

# Phase 8 Plan 10: Tenant Credential Resolution in Channel Adapters + Simulation Guard Summary

**WhatsApp, voice and email adapters now resolve Twilio/SendGrid/Vapi credentials per tenant per request via `TenantIntegrationService` instead of a constructor-cached global client; the phantom "simulate and report success" pattern survives only behind `SIMULATE_OUTBOUND_SENDS`, which the service refuses to boot with in production, and every simulated send is marked on `Contact.simulated`/`Message.simulated`; email Reply-To is now the tenant's own domain, with the fixed `reply@reply.fogging.org` constant deleted from all four outbound call sites that used it.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-08-04T20:35:00-05:00 (approx, first file read)
- **Completed:** 2026-08-04T20:55:28-05:00
- **Tasks:** 3 completed
- **Files modified:** 28 (6 created, 21 modified, 1 deleted)

## Accomplishments
- All four `@cobrai/ports` send-result interfaces gained an optional `simulated?: boolean` field
- `simulation.guard.ts`: `isSimulationEnabled`/`assertSimulationNotInProduction`, the single `SIMULATE_OUTBOUND_SENDS === "true"` predicate and the boot-time refusal-to-start assertion, called as the first statement of `bootstrap()` in `main.ts` before `NestFactory.create`
- `ContactsService` threads the adapter result's `simulated` flag onto both `Contact.simulated` (on the completion `contact.update`) and `Message.simulated` (via the extracted `recordConversationMessage`)
- `TwilioWhatsAppAdapter` builds its Twilio client per call from the tenant's resolved `twilio_whatsapp` integration (`secrets.accountSid`/`authToken`, `publicConfig.fromNumber`) — no more constructor-cached client, no more `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_WA_FROM` reads
- `VapiVoiceAdapter` keeps `apiKey`/`agentId` platform-global in the constructor (D-04, explicitly commented so a later reader doesn't "fix" it) but resolves `phoneNumberId` per call from the tenant's `twilio_voice` integration, falling back to the global `VAPI_PHONE_NUMBER_ID` only when simulation is enabled (and marking the result `simulated` in that case)
- `SmsAdapter`'s simulate-on-missing-key branch is now gated behind `isSimulationEnabled()`; SMS stays on the platform-global Bird key since it remains disabled by feature flag and out of BYO scope this phase
- `EmailAdapter` resolves the tenant's `sendgrid` integration per call; From/sender-name come from `publicConfig.fromEmail`/`fromName`, Reply-To is `reply@{publicConfig.replyDomain}` with the key entirely omitted (not `undefined`) when the tenant has no domain — the documented outbound-only degraded state (D-22)
- Deleted `EMAIL_REPLY_TO`/`email.constants.ts` and removed it from all four outbound call sites that imported it: `contacts.service.ts` (in the plan's file list) plus three not listed there — `conversation-agent.service.ts`, `conversations/conversations.service.ts`, `webhooks/vapi-webhook.handler.ts` — all of which would otherwise fail to compile once the constant was deleted
- 204 service-notifications tests pass (was 190 before this plan), `pnpm --filter @cobrai/ports typecheck` and `pnpm --filter @cobrai/service-notifications typecheck` both exit 0, full `pnpm test` green across all 25 turbo tasks in the monorepo
- `contacts.service.ts` shrank 1021→975 lines and `contacts.service.spec.ts` shrank 614→475 lines (both were already over the 300-line hard limit and could not grow) by extracting `recordConversationMessage` and the spec's fixture factories into sibling modules instead of appending new logic in place

## Task Commits

1. **Task 1: Simulation flag, boot guard, and the simulated marker through ports and persistence** - `d3226e3` (feat)
2. **Task 2: Per-request credential resolution in the WhatsApp, voice and SMS adapters** - `0c19765` (feat)
3. **Task 3: Per-tenant SendGrid credentials, sender identity and reply domain** - `970790d` (feat)

## Files Created/Modified
- `apps/service-notifications/src/adapters/simulation.guard.ts` / `.spec.ts` - the single simulation-enabled predicate + boot-time assertion
- `apps/service-notifications/src/contacts/record-conversation-message.ts` - Message/Conversation persistence extracted out of `ContactsService`, now carrying `simulated`
- `apps/service-notifications/src/contacts/contacts.service.fixtures.ts` - shared test fixtures, extracted from `contacts.service.spec.ts`
- `apps/service-notifications/src/contacts/contacts.service.dispatch.spec.ts` - new D-17 persistence tests + D-22 reply_to-removal test
- `apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts` - per-request Twilio client from `resolveByChannel(tenant_id, "whatsapp")`
- `apps/service-notifications/src/adapters/vapi-voice.adapter.ts` - per-call `phoneNumberId` from `resolveByChannel(tenant_id, "voice")`, platform apiKey/agentId untouched
- `apps/service-notifications/src/adapters/sms.adapter.ts` - gated simulate branch, platform-global Bird key retained
- `apps/service-notifications/src/adapters/sms.adapter.spec.ts` - new, previously did not exist
- `apps/service-notifications/src/adapters/email.adapter.ts` - per-request SendGrid credentials + tenant Reply-To
- `apps/service-notifications/src/adapters/adapters.module.ts` - `TenantIntegrationService` factory provider (mirrors `compliance.module.ts`)
- `apps/service-notifications/src/contacts/contacts.service.ts` - `simulated` threaded through `dispatchChannel`/`contact.update`; `EMAIL_REPLY_TO` import and usage removed
- `apps/service-notifications/src/agent/conversation-agent.service.ts`, `conversations/conversations.service.ts`, `webhooks/vapi-webhook.handler.ts` - `EMAIL_REPLY_TO` import and `reply_to:` argument removed (not in plan's file list, required by the constant's deletion)
- `.env.example` - documents `SIMULATE_OUTBOUND_SENDS`
- `apps/service-notifications/src/common/email.constants.ts` - deleted (left empty by removing `EMAIL_REPLY_TO`, per the plan's own instruction)

## Decisions Made
See `key-decisions` in frontmatter for the full list. In short: extracted rather than appended to the two files already over the file-size limit; added the missing `sms.adapter.spec.ts`; left `VapiVoiceAdapter`'s platform-credential branch untouched per the plan's explicit instruction; updated three additional `EMAIL_REPLY_TO` importers not in the plan's declared file list because deleting the constant would otherwise break their compilation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Three more `EMAIL_REPLY_TO` importers outside the plan's file list**
- **Found during:** Task 3, after deleting `email.constants.ts`
- **Issue:** `grep -rn "EMAIL_REPLY_TO"` found `apps/service-notifications/src/agent/conversation-agent.service.ts`, `apps/service-notifications/src/conversations/conversations.service.ts`, and `apps/service-notifications/src/webhooks/vapi-webhook.handler.ts` all importing the constant being deleted — none were in the plan's `files_modified` list, but the plan's own Task 3 action text explicitly says to "search the whole repo for other EMAIL_REPLY_TO importers and update them."
- **Fix:** Removed the import and the `reply_to: EMAIL_REPLY_TO` argument from all three send calls, letting `EmailAdapter` derive Reply-To from the tenant's own integration. Updated the two spec files (`conversation-agent.service.spec.ts`, `conversations.service.spec.ts`) that asserted the old hardcoded value.
- **Files modified:** `apps/service-notifications/src/agent/conversation-agent.service.ts`, `.spec.ts`, `apps/service-notifications/src/conversations/conversations.service.ts`, `.spec.ts`, `apps/service-notifications/src/webhooks/vapi-webhook.handler.ts`
- **Verification:** `grep -rn "EMAIL_REPLY_TO" apps/service-notifications/src` returns zero matches; `pnpm --filter @cobrai/service-notifications typecheck` exits 0; all 204 tests pass
- **Committed in:** `970790d` (Task 3 commit)

**2. [Rule 2 - Missing critical functionality] No `sms.adapter.spec.ts` existed, but the plan's acceptance criteria requires failed-without-simulation coverage for all three adapters**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 `<files>` list does not include an SMS spec file, but its acceptance criteria explicitly says "A test asserts `status: 'failed'` ... when credentials are missing and simulation is off, for all three adapters" and `SmsAdapter.sendSMS` is one of the three named in the behavior block.
- **Fix:** Created `apps/service-notifications/src/adapters/sms.adapter.spec.ts` (3 tests: failed-without-simulation, simulated-with-simulation, real send).
- **Files modified:** `apps/service-notifications/src/adapters/sms.adapter.spec.ts` (new)
- **Verification:** Included in the 204 passing tests
- **Committed in:** `0c19765` (Task 2 commit)

**3. [Rule 1 - Bug/file-size compliance] `contacts.service.ts`/`contacts.service.spec.ts` could not grow (hard rule, already over 300-line limit before this plan)**
- **Found during:** Task 1, while designing where to thread the `simulated` flag through `ContactsService`
- **Issue:** Both files were already well over the repo's 300-line hard limit (1021 and 614 lines respectively) before this plan, and the environment's explicit instruction forbids adding lines to them.
- **Fix:** Extracted `recordConversationMessage` (a ~54-line private method) into a sibling module `contacts/record-conversation-message.ts` as a standalone function taking `PrismaService` as an explicit parameter (mirroring the `holiday-rules.ts`/`retry-state.ts` precedent from 08-05). Extracted `contacts.service.spec.ts`'s fixture factories into `contacts.service.fixtures.ts`. New D-17/D-22 tests went into a new sibling spec, `contacts.service.dispatch.spec.ts`, rather than appending to either existing spec.
- **Files modified:** `contacts.service.ts` (1021→975 lines), `contacts.service.spec.ts` (614→475 lines), plus the three new sibling files above
- **Verification:** `wc -l` confirms both flagged files shrank rather than grew; all 204 tests pass
- **Committed in:** `d3226e3` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 missing-critical test coverage, 1 file-size compliance)
**Impact on plan:** All three were necessary to satisfy the plan's own acceptance criteria and stated constraints (the plan's own action text asked for the repo-wide `EMAIL_REPLY_TO` search; the acceptance criteria required SMS coverage; the environment's file-size rule is a hard constraint). No scope creep beyond what those requirements demanded.

## Issues Encountered
- The worktree had no built `dist/` for `@cobrai/db`/`@cobrai/utils`/`@cobrai/ports`/`@cobrai/compliance`/`@cobrai/integrations`/etc. (same one-time setup issue documented in 08-03-SUMMARY.md and others) — resolved by running `pnpm --filter <deps...> build` once before the first typecheck. Build artifacts only, not committed (`dist/` is gitignored).
- One TypeScript error in the rewritten `twilio-whatsapp.adapter.spec.ts`'s `vi.mock("twilio", ...)` factory (a bare `(...args: unknown[])` spread against a non-tuple type) — fixed by typing the mock factory's parameters explicitly instead of spreading `unknown[]`.

## User Setup Required

**Production seed still pending — the cutover is unsafe until it runs.** 08-06-SUMMARY.md explicitly flagged: "The production run itself is still pending... the production seed (`pnpm db:seed:tenant-integrations:prod`) still needs to be executed by an operator against the real Fly app, after `pnpm db:migrate:prod` and after `ENCRYPTION_KEY_V1` is confirmed set as a Fly secret, before 08-09's [now 08-10's] adapter cutover ships." This plan's code is correct and fully tested against mocks, but **deploying it to production before that seed runs means every existing tenant loses WhatsApp/voice/email delivery** (their `TenantIntegration` rows don't exist yet, so every send fails closed unless `SIMULATE_OUTBOUND_SENDS` is on — which the boot guard also refuses in production). This is an operational precondition, not a code gap.

No new environment variables beyond `SIMULATE_OUTBOUND_SENDS` (documented in `.env.example`, optional, defaults to disabled).

## Next Phase Readiness
- All three BYO channel adapters (WhatsApp, voice, email) are cut over to per-tenant credential resolution; SMS remains platform-global by design (deferred, out of BYO scope this phase).
- `webhooks/sendgrid-inbound.handler.ts` still literally matches `to.includes("reply.fogging.org")` for inbound routing and `sendgrid-inbound.handler.spec.ts` still asserts against that fixed domain — this is explicitly plan 08-13's territory (per this plan's own scope carve-out) and was left untouched. 08-13 will need to make inbound routing tenant-aware (resolve the tenant by `replyDomain` or a webhook token) to match the outbound side this plan just made per-tenant.
- `packages/db/src/seed-tenant-integrations.ts` and `packages/db/scripts/prod-seed-tenant-integrations.cjs` still hardcode `REPLY_DOMAIN = "reply.fogging.org"` as the seeded value for pre-existing tenants (08-06's intentional cutover-safety default) — not a gap, just noting it's the seed's own concern, not this plan's.
- The production tenant-integration seed (08-06) has not yet been run against Fly — see "User Setup Required" above. This blocks safely deploying this plan's adapter changes to production.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 6 created source files verified present on disk (`simulation.guard.ts`, `simulation.guard.spec.ts`, `sms.adapter.spec.ts`, `record-conversation-message.ts`, `contacts.service.fixtures.ts`, `contacts.service.dispatch.spec.ts`), the deleted `email.constants.ts` verified absent, and all 3 task commits (`d3226e3`, `0c19765`, `970790d`) verified present in `git log`.
