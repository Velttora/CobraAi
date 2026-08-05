---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 17
subsystem: ui
tags: [nextjs, react, tanstack-query, tailwind, whatsapp-embedded-signup, dns-cname, a11y]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-16's shared primitives (CopyButton, ConfirmDialog, IntegrationStatusBadge, SecretField), the use-integrations hook surface, the ?focus= deep-link contract and the /settings/integrations route shell"
provides:
  - "Screen 1 (Conexión de canales) fully implemented: three ChannelCards (WhatsApp, Teléfono, Correo) with BYO + managed credential forms, the D-11 verification-status state machine, the D-03 DNS/CNAME lifecycle, and the D-25 Embedded Signup flow with its mandatory sdk_unavailable fallback"
  - "ChannelModeToggle — the managed/byo segmented control every channel card uses (D-01)"
  - "DnsRecordsTable — reusable CNAME instructions component (copy-all, per-record status, responsive stacked layout)"
  - "EmbeddedSignupButton + use-embedded-signup-polling — the Meta Embedded Signup client, usable standalone by any future screen needing the same postMessage/polling contract"
affects: [08-18, 08-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChannelCard is a thin orchestrator (state, save/verify/disconnect wiring, the shared shell) that delegates per-channel body markup to WhatsAppFields/PhoneFields/EmailFields, each driven by the same ChannelFormProps contract — this is what kept every file under the 300-line cap despite three quite different channels sharing one card component"
    - "Read NEXT_PUBLIC_* env vars inside the component body, not as module-level consts — the only way vi.stubEnv-based tests can flip the sdk_unavailable gate per-test without a vi.resetModules() dance, while Next.js still statically inlines NEXT_PUBLIC_* regardless of where in the file it's referenced"
    - "Client components call their own TanStack Query hooks directly (EmailDnsSection → useRecheckDns, EmbeddedSignupButton → useTenant/useEmbeddedSignup/useVerifyIntegration) rather than threading mutations down through props — same pattern 08-16 established for IntegrationsTabs/IntegrationSetupBanner, now proven at a third and fourth nesting level"

key-files:
  created:
    - apps/web/components/settings/integrations/ChannelCard.tsx
    - apps/web/components/settings/integrations/ChannelModeToggle.tsx
    - apps/web/components/settings/integrations/ChannelTextField.tsx
    - apps/web/components/settings/integrations/ChannelFailureBlock.tsx
    - apps/web/components/settings/integrations/ReadOnlyChannelSummary.tsx
    - apps/web/components/settings/integrations/TwilioByoFields.tsx
    - apps/web/components/settings/integrations/WhatsAppFields.tsx
    - apps/web/components/settings/integrations/PhoneFields.tsx
    - apps/web/components/settings/integrations/EmailFields.tsx
    - apps/web/components/settings/integrations/EmailDnsSection.tsx
    - apps/web/components/settings/integrations/DnsRecordsTable.tsx
    - apps/web/components/settings/integrations/EmbeddedSignupButton.tsx
    - apps/web/components/settings/integrations/use-embedded-signup-polling.ts
    - apps/web/components/settings/integrations/channel-config.ts
    - apps/web/components/settings/integrations/test-fixtures.ts
    - apps/web/components/settings/integrations/ChannelCard.test.tsx (+ .verification.test.tsx, .disconnect.test.tsx)
    - apps/web/components/settings/integrations/DnsRecordsTable.test.tsx
    - apps/web/components/settings/integrations/EmailDnsSection.test.tsx
    - apps/web/components/settings/integrations/EmbeddedSignupButton.test.tsx (+ .handoff.test.tsx, .polling.test.tsx)
    - apps/web/app/(dashboard)/settings/integrations/page.test.tsx
  modified:
    - apps/web/app/(dashboard)/settings/integrations/page.tsx
    - apps/web/.env.example

key-decisions:
  - "Split ChannelCard's per-channel body into WhatsAppFields/PhoneFields/EmailFields (and further into TwilioByoFields/EmailDnsSection/EmbeddedSignupButton) instead of the plan's literal instruction to make every Task 2/3 edit land inside ChannelCard.tsx itself — the 300-line hard cap makes a single file covering three channels' full state matrices structurally impossible. ChannelCard.tsx stayed the only edit point for Task 1's shell/orchestration; Tasks 2 and 3 instead edited the channel-specific field files they naturally belong to (EmailFields/EmailDnsSection for DNS, WhatsAppFields for Embedded Signup)."
  - "EmbeddedSignupButton's postMessage handler accepts phone_number/business_name as optional fields on the WA_EMBEDDED_SIGNUP FINISH payload, falling back to the tenant's own name (useTenant()) for businessName when absent. UI-SPEC's action text only documents waba_id/phone_number_id arriving via postMessage, but the backend's EmbeddedSignupDto (08-07) requires phoneNumberE164/businessName too, and no Meta app exists to observe the real payload shape live — this is a defensible, non-blocking interpretation, not a verified contract, and should be revisited once ISV/Meta app registration completes."
  - "The top badge does not flip to 'verifying' during an Embedded Signup exchange (it does during BYO saves, via ChannelCard's own isSaving) — EmbeddedSignupButton's 3-step progress list already conveys the same information in the card body, and lifting its mutation's pending state up through ChannelCard→WhatsAppFields→EmbeddedSignupButton would add real wiring complexity for a duplicate signal."
  - "DnsRecordsTable always renders its own 'Ya los publiqué, verificar' button (wired to useRecheckDns) regardless of DNS status, including failed — UI-SPEC's failed-state row separately calls for 'Reintentar verificación', which is already the generic ChannelCard failure block's button (wired to useVerifyIntegration, and for sendgrid the backend's verify() and recheckDns() paths converge on the same emailConnect.recheckDns call). Both buttons coexisting in the failed state is redundant but not incorrect — removing either would cost more complexity than the minor UI overlap it avoids."

patterns-established:
  - "Any new component under components/settings/integrations/ that needs mutation state beyond what ChannelCard already threads through ChannelFormProps should call its own hook directly (EmailDnsSection/EmbeddedSignupButton precedent) rather than growing ChannelCard's prop surface further."

requirements-completed: [D-01, D-03, D-11, D-24, D-25, D-26]

# Metrics
duration: ~26min
completed: 2026-08-04
---

# Phase 8 Plan 17: Screen 1 — Conexión de canales Summary

**Three fully wired ChannelCards (WhatsApp, Teléfono, Correo) with managed/BYO toggles, the D-11 verification state machine, D-03 DNS/CNAME instructions, and D-25 Embedded Signup — all usable today with no Meta app and no Twilio ISV enrolment.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-08-04T22:24:00-05:00
- **Completed:** 2026-08-04T22:50:00-05:00
- **Tasks:** 3 of 3 plan tasks completed
- **Files modified:** 25 (23 created, 2 modified — plus incidental fixes to 08-16's `page.test.tsx`)

## Accomplishments

- `ChannelCard`: the canonical `OrganizationSettingsPanel` shell driven by `useIntegrations()`, with the admin/read-only `<dl>` fork, the mode-change `ConfirmDialog` gate (only fires when the channel is already `verified`), the full D-11 save/verify/disconnect interaction (dirty+valid gating, `Verificando…` submitting state with a locally-overridden `verifying` badge, the distinction between a provider rejection — badge → `failed` — and a transport failure — badge unchanged), the mandatory `ChannelFailureBlock`, and the `?focus=` scroll+ring-highlight contract from 08-16.
- `ChannelModeToggle`: both pills share identical geometry — no "preferred" badge on managed, no warning icon on BYO — matching UI-SPEC's explicit anti-downgrade requirement for BYO.
- WhatsApp and Teléfono BYO forms share `TwilioByoFields` (Account SID + `SecretField` Auth Token + a channel-specific number field); Teléfono's managed mode gates on the WhatsApp `relatedIntegration` being `verified`, with a disabled button, an explanation, and a link back to the WhatsApp card.
- `DnsRecordsTable` + `EmailDnsSection`: a `<table>`/stacked-`<dl>` sibling pair switched purely via Tailwind responsive classes, per-record `CheckCircle2`/`AlertTriangle` status with `sr-only` text, a tab-separated "Copiar todos" action, and the full five-state DNS lifecycle (expanded in `pending_dns`/`failed`, collapsed into a `<details>` plus the "replies arrive at reply@{domain}" line once `verified`).
- `EmbeddedSignupButton`: all nine D-25 states, gated on `NEXT_PUBLIC_FACEBOOK_APP_ID`/`NEXT_PUBLIC_FACEBOOK_CONFIG_ID` — absent (the actual state of this repo today) or an `onError`/8s-timeout script-load failure both reach the mandatory `sdk_unavailable` notice with a link that switches the card to BYO. The Meta SDK loads via `next/script strategy="lazyOnload"` from inside this component only. The `postMessage` handler validates a `facebook.com` origin before acting (T-08-17b) and never persists `wabaId`/`phoneNumberId` to storage or a URL (T-08-17c, asserted with a `Storage.prototype.setItem` spy). `use-embedded-signup-polling.ts` implements the A-10 poll: 15s interval, paused while the tab is hidden, hard stop at 10 minutes with a manual `Actualizar estado`.
- `pnpm --filter @cobrai/web test`: 140/140 passing (up from 98 at the end of 08-16); `typecheck`, `lint` and `build` all exit 0/succeed; root `pnpm typecheck` stays 25/25.
- No source or test file exceeds 300 lines (largest: `ChannelCard.tsx` at 281).

## Task Commits

1. **Task 1: ChannelCard, ChannelModeToggle and the assembled channels page with BYO forms** - `010b483` (feat)
2. **Task 2: DnsRecordsTable and the email card's DNS lifecycle** - `b2d8a8e` (feat)
3. **Task 3: EmbeddedSignupButton with the mandatory sdk_unavailable fallback** - `f2e1b1f` (feat)

## Files Created/Modified

- `apps/web/components/settings/integrations/ChannelCard.tsx` - shell, state, save/verify/disconnect orchestration
- `apps/web/components/settings/integrations/ChannelModeToggle.tsx` - managed/byo segmented control
- `apps/web/components/settings/integrations/ChannelTextField.tsx` - shared plaintext form field
- `apps/web/components/settings/integrations/ChannelFailureBlock.tsx` - mandatory D-11 failure block
- `apps/web/components/settings/integrations/ReadOnlyChannelSummary.tsx` - non-admin `<dl>` fork
- `apps/web/components/settings/integrations/TwilioByoFields.tsx` - shared WhatsApp/Teléfono BYO fieldset
- `apps/web/components/settings/integrations/WhatsAppFields.tsx` - WhatsApp card body (BYO + managed + EmbeddedSignupButton slot)
- `apps/web/components/settings/integrations/PhoneFields.tsx` - Teléfono card body, WhatsApp-first gating
- `apps/web/components/settings/integrations/EmailFields.tsx` - Correo card body (managed + byo + DNS slot)
- `apps/web/components/settings/integrations/EmailDnsSection.tsx` - D-03 DNS lifecycle wiring
- `apps/web/components/settings/integrations/DnsRecordsTable.tsx` / `.test.tsx` - CNAME instructions component, 7 tests
- `apps/web/components/settings/integrations/EmbeddedSignupButton.tsx` - D-25 Embedded Signup client
- `apps/web/components/settings/integrations/use-embedded-signup-polling.ts` - A-10 visibility-gated polling hook
- `apps/web/components/settings/integrations/channel-config.ts` - per-channel copy/required-fields/prop-contract
- `apps/web/components/settings/integrations/test-fixtures.ts` - shared `IntegrationView` test factory
- `apps/web/components/settings/integrations/ChannelCard.test.tsx` / `.verification.test.tsx` / `.disconnect.test.tsx` - 13 tests
- `apps/web/components/settings/integrations/EmailDnsSection.test.tsx` - 4 tests
- `apps/web/components/settings/integrations/EmbeddedSignupButton.test.tsx` / `.handoff.test.tsx` / `.polling.test.tsx` - 15 tests
- `apps/web/app/(dashboard)/settings/integrations/page.tsx` / `.test.tsx` - screen assembly, 3 tests
- `apps/web/.env.example` - `NEXT_PUBLIC_FACEBOOK_APP_ID`/`NEXT_PUBLIC_FACEBOOK_CONFIG_ID` documented

## Decisions Made

See `key-decisions` in frontmatter. The one worth flagging loudest: **EmbeddedSignupButton's `phoneNumberE164`/`businessName` extraction from the postMessage payload is an inferred interpretation, not a verified contract** — UI-SPEC's action text only documents `waba_id`/`phone_number_id` arriving via `postMessage`, but the backend DTO needs all four fields. Since no Meta app exists to observe the real handoff payload (08-02-SUMMARY.md), this can only be confirmed once ISV/Meta app registration completes; the fallback to the tenant's own name for `businessName` is a safe default either way.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `page.test.tsx`'s `use-integrations` mock was missing `useRecheckDns`/`useEmbeddedSignup` after later tasks added those hooks transitively**
- **Found during:** Task 2, then again in Task 3, running `pnpm --filter @cobrai/web test`
- **Issue:** `EmailFields` (Task 2) and `WhatsAppFields` (Task 3) call `useRecheckDns()`/`useEmbeddedSignup()` respectively via new child components. `page.test.tsx`'s hand-rolled `vi.mock("../../../../hooks/use-integrations", ...)` only listed the hooks needed at the time it was written (Task 1), so rendering the full page threw "is not a function".
- **Fix:** Added the missing mocked hooks to `page.test.tsx`'s mock factory each time a new dependency was introduced.
- **Files modified:** `apps/web/app/(dashboard)/settings/integrations/page.test.tsx`
- **Verification:** Full suite green after each fix.
- **Committed in:** `b2d8a8e` (Task 2), `f2e1b1f` (Task 3)

**2. [Rule 3 - Blocking] `ChannelCard.test.tsx`'s two default-mode tests broke once `WhatsAppFields`' managed branch started rendering `EmbeddedSignupButton`**
- **Found during:** Task 3, running the full suite after wiring `EmbeddedSignupButton` into `WhatsAppFields`
- **Issue:** `EmbeddedSignupButton` calls `useTenant()` (a real TanStack Query hook) unconditionally at the top of the component, even in the `sdk_unavailable` branch. Two `ChannelCard.test.tsx` tests render a channel with `integration={undefined}` (default `managed` mode, unverified), which now reaches `EmbeddedSignupButton` and threw "No QueryClient set" since the test never wraps in a `QueryClientProvider`.
- **Fix:** Mocked `../../../hooks/use-tenant` and added `useEmbeddedSignup` to the `use-integrations` mock in `ChannelCard.test.tsx` and `ChannelCard.verification.test.tsx` (and defensively in `page.test.tsx`, which doesn't currently hit the path but could with a future test).
- **Files modified:** `ChannelCard.test.tsx`, `ChannelCard.verification.test.tsx`, `page.test.tsx`
- **Verification:** Full suite green (140/140).
- **Committed in:** `f2e1b1f` (Task 3)

**3. [Rule 1 - Bug] `ChannelModeToggle.tsx`'s own doc comment tripped the plan's `grep -c "recomendado"` acceptance check**
- **Found during:** Task 1, running acceptance-criteria greps after the component and tests both passed
- **Issue:** A doc comment explaining "no 'recomendado' badge on managed" contained the literal banned string, which the grep (expected 0) matched.
- **Fix:** Reworded the comment to describe the same rationale without the literal word.
- **Files modified:** `ChannelModeToggle.tsx`
- **Committed in:** `010b483` (Task 1)

**4. [Rule 1 - Bug] Two ESLint findings after Task 3: an unused `secretDraft` destructure in three field components, and a `react-hooks/exhaustive-deps` disable-comment for a rule this repo's config doesn't register**
- **Found during:** Task 3, running `pnpm --filter @cobrai/web lint` (not part of the plan's stated `<verify>` block, but required by `<verification>`'s "typecheck and lint exit 0")
- **Issue:** `EmailFields`/`PhoneFields`/`WhatsAppFields` destructured `secretDraft` from `ChannelFormProps` without using it (only `setSecretField` is used); `EmbeddedSignupButton.tsx`/`use-embedded-signup-polling.ts` carried `// eslint-disable-next-line react-hooks/exhaustive-deps` comments, but this repo's `eslint.config.mjs` doesn't install the `react-hooks` plugin, so the disable directive itself is flagged as targeting an unknown rule.
- **Fix:** Removed the unused destructure in all three field components; removed both disable comments (the effects' dependency arrays are intentionally narrower than a strict exhaustive-deps check would want, but there's no rule active to silence).
- **Files modified:** `EmailFields.tsx`, `PhoneFields.tsx`, `WhatsAppFields.tsx`, `EmbeddedSignupButton.tsx`, `use-embedded-signup-polling.ts`
- **Verification:** `pnpm --filter @cobrai/web lint` exits 0.
- **Committed in:** `f2e1b1f` (Task 3)

---

**Total deviations:** 4 auto-fixed (2 blocking test-mock gaps introduced by cross-task hook dependencies, 1 self-referential grep false-positive, 1 lint cleanup)
**Impact on plan:** No scope creep — all four are structural/test-infrastructure fixes required to keep the suite and lint green as later tasks' components started depending on hooks earlier tasks' tests didn't yet mock. The one genuinely load-bearing structural deviation is the file-splitting described in `key-decisions` (ChannelCard.tsx's body delegated to WhatsAppFields/PhoneFields/EmailFields and their own sub-files) — required by the plan's own 300-line hard rule, impossible to satisfy with the plan's literal "only edit to ChannelCard in this task" instruction for Tasks 2/3.

## Known Stubs

None. Every field in every state renders from real `useIntegrations()`/`useSaveIntegration()`/`useVerifyIntegration()`/`useDisconnectIntegration()`/`useEmbeddedSignup()`/`useRecheckDns()` data — no hardcoded empty array, no "coming soon" placeholder. The one area worth flagging as *unverified against a live system* rather than *stubbed*: `EmbeddedSignupButton`'s handling of `phoneNumberE164`/`businessName` from the Meta `postMessage` payload (see Decisions Made) — this is real, wired code, just not yet exercised against an actual Meta app (none exists per 08-02-SUMMARY.md).

## Threat Flags

All threats in the plan's own threat model were mitigated as specified and are covered by tests:

- T-08-08 (Meta script present on debtor-data pages): mitigated — `next/script strategy="lazyOnload"` loaded only inside `EmbeddedSignupButton`; `grep -rn "connect.facebook.net" apps/web/app/layout.tsx` returns no match
- T-08-17b (forged `postMessage` provisioning): mitigated — origin check (`event.origin.endsWith("facebook.com")`) before acting; a dedicated test asserts a non-facebook.com origin is ignored
- T-08-17c (Meta token/`phoneNumberId` persisted): mitigated — held in local variables only; `Storage.prototype.setItem` spy asserts zero writes across a full handoff
- T-08-17d (ad-blocker leaving no path to WhatsApp): mitigated — `sdk_unavailable` renders both when env vars are absent and on script `onError`/timeout, always offering the BYO switch
- T-08-17e (BYO credentials rendered back into the DOM): mitigated — every secret field reuses `SecretField` verbatim, per the mandatory instruction from 08-16
- T-08-17f (indefinite polling): mitigated — 15s interval, visibility-gated, hard stop at 10 minutes, covered by three fake-timer tests
- T-08-SC (package install legitimacy): not applicable — no package was installed

No new threat surface beyond the plan's own register was introduced.

## Issues Encountered

- Fresh worktree had no `node_modules`/`packages/utils` build artifacts (same pattern every prior Phase 8 plan noted) — resolved with `pnpm install --frozen-lockfile` + `pnpm --filter @cobrai/utils build`. Build artifacts only, not committed.
- The worktree's HEAD was on an older commit (`34b1fd5`) than the plan's required base (`8c26d13a…`, which already includes wave 6's merged work) — corrected with `git reset --hard` to the required base per the `<worktree_branch_check>` protocol before any file was touched; working tree was clean at that point, so the reset was non-destructive.
- Testing `next/script`'s `onLoad`/`onError` callbacks and a `window.dispatchEvent(new MessageEvent(...))` required wrapping each in `act(...)` — calling them as bare functions/dispatches outside of `fireEvent` left React state updates unflushed before assertions ran.

## User Setup Required

**External Meta app registration is required before the managed WhatsApp path can be exercised live** — this is a pre-existing, owner-tracked blocker from 08-02-SUMMARY.md, not new to this plan. Once a Meta app with WhatsApp Embedded Signup configured exists, set `NEXT_PUBLIC_FACEBOOK_APP_ID`/`NEXT_PUBLIC_FACEBOOK_CONFIG_ID` in `apps/web/.env.local` (see `.env.example`) to unhide the managed path. Until then, Screen 1 is fully usable via BYO for all three channels, exactly as required.

## Next Phase Readiness

- Screen 1 (`Conexión de canales`) is complete and usable end-to-end via BYO with no Meta app and no Twilio ISV enrolment — the acceptance bar this plan was built against.
- `DnsRecordsTable`, `ChannelFailureBlock`, `TwilioByoFields`, and `ChannelTextField` are all reusable, generically-typed primitives 08-18 (payments) can reuse as-is for its own credential forms and failure states if useful — none of them import anything Screen-1-specific.
- `EmbeddedSignupButton`'s `phoneNumberE164`/`businessName` extraction from the Embedded Signup `postMessage` payload should be re-verified against a live Meta app once registration completes (see Decisions Made) — flagged for whoever does that live-testing pass, not blocking for this phase.
- No files outside this plan's declared scope were touched; `08-16`'s shared primitives (`SecretField`, `ConfirmDialog`, `CopyButton`, `IntegrationStatusBadge`, `use-integrations.ts`) were consumed as-is, never modified.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 5 spot-checked key files verified present via `ls -la` (`ChannelCard.tsx`, `DnsRecordsTable.tsx`, `EmbeddedSignupButton.tsx`, `use-embedded-signup-polling.ts`, `page.tsx`), and all 3 task commits (`010b483`, `b2d8a8e`, `f2e1b1f`) verified present in `git log`.
