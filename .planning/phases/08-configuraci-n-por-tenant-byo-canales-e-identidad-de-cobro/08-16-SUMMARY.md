---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 16
subsystem: ui
tags: [nextjs, react, tanstack-query, tailwind, a11y, write-only-secrets]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-14 IntegrationsController/IntegrationsService REST surface — the exact endpoint list, response envelopes and per-provider publicConfig/secrets field names this plan's hook is built against"
provides:
  - "Four reusable frontend primitives (CopyButton, ConfirmDialog, IntegrationStatusBadge, SecretField) every 08-17/08-18/08-19 screen consumes"
  - "apps/web/hooks/use-integrations.ts — the complete TanStack Query hook surface (8 hooks) for all four Integraciones screens, built once so the screen plans cannot conflict on this file"
  - "The Settings > Integraciones route shell: layout.tsx, four route pages, IntegrationsTabs, IntegrationSetupBanner, and the /settings entry card"
  - "IntegrationStatus/IntegrationChannel/IntegrationSecretMeta/IntegrationView/UncontactedDebt/SaveIntegrationInput types in apps/web/lib/types.ts"
affects: [08-17, 08-18, 08-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SecretField's password input is deliberately UNCONTROLLED (defaultValue, no value prop) — React sets an <input>'s \"value\" content attribute once at mount for a controlled prop's live value, which would leak a typed secret into container.innerHTML on every keystroke (verified empirically: a controlled input serializes value=\"<typed text>\" into innerHTML in this jsdom/React combination, an uncontrolled one does not). Only the character count (a number) is kept in React state; the plaintext only ever exists as the input DOM node's live IDL property."
    - "IntegrationsTabs/IntegrationSetupBanner both read useIntegrations()/useUncontactedDebts(1) directly rather than receiving props from layout.tsx — Next.js App Router hooks (useSearchParams, TanStack Query hooks) work in any client component in the tree without prop drilling, so the ?focus= deep-link param is read independently by each consumer (layout.tsx documents/owns the contract; 08-17/08-18 will call the same useSearchParams().get(\"focus\") directly)"

key-files:
  created:
    - apps/web/components/shared/CopyButton.tsx
    - apps/web/components/shared/CopyButton.test.tsx
    - apps/web/components/shared/ConfirmDialog.tsx
    - apps/web/components/shared/ConfirmDialog.test.tsx
    - apps/web/components/settings/integrations/IntegrationStatusBadge.tsx
    - apps/web/components/settings/integrations/IntegrationStatusBadge.test.tsx
    - apps/web/components/settings/integrations/SecretField.tsx
    - apps/web/components/settings/integrations/SecretField.test.tsx
    - apps/web/hooks/use-integrations.ts
    - apps/web/hooks/use-integrations.test.ts
    - apps/web/components/settings/integrations/IntegrationsTabs.tsx
    - apps/web/components/settings/integrations/IntegrationsTabs.test.tsx
    - apps/web/components/settings/integrations/IntegrationSetupBanner.tsx
    - apps/web/components/settings/integrations/IntegrationSetupBanner.test.tsx
    - apps/web/app/(dashboard)/settings/integrations/layout.tsx
    - apps/web/app/(dashboard)/settings/integrations/page.tsx
    - apps/web/app/(dashboard)/settings/integrations/payments/page.tsx
    - apps/web/app/(dashboard)/settings/integrations/brand/page.tsx
    - apps/web/app/(dashboard)/settings/integrations/health/page.tsx
  modified:
    - apps/web/lib/types.ts
    - apps/web/app/(dashboard)/settings/page.tsx

key-decisions:
  - "SecretField's password input is uncontrolled (no `value` prop) — this is the actual mechanism that satisfies D-26's DOM-leak test, discovered empirically: a controlled React input serializes its live value into `container.innerHTML` in this environment, an uncontrolled one does not."
  - "Types for IntegrationView/IntegrationStatus/etc were added to lib/types.ts during Task 1 (not deferred to Task 2 as the plan's task split literally describes) because IntegrationStatusBadge/SecretField needed them to compile — same forward-reference pattern 08-03/08-14 already used. Task 2's commit only adds the hook file; no further type changes were needed."
  - "IntegrationsTabs and IntegrationSetupBanner call useIntegrations()/useUncontactedDebts(1) directly instead of receiving data via props from layout.tsx, since both are already client components under the same route tree — this keeps layout.tsx a thin composition root and avoids threading query results through prop chains that 08-17/08-18 would also need."
  - "The ?focus= contract is honored by layout.tsx reading (and documenting) the param via useSearchParams(), but the actual card-scroll + ring highlight will be implemented by 08-17/08-18's own useSearchParams().get(\"focus\") call — Next.js scopes search params to the whole route subtree, so no context/prop-drilling mechanism was introduced for this."

patterns-established:
  - "Every new write-only credential field in 08-17/08-18 must reuse SecretField as-is rather than rolling its own controlled password input — the uncontrolled-input technique is the only verified-safe pattern for D-26 in this codebase."

requirements-completed: [D-23, D-24, D-26]

# Metrics
duration: ~25min
completed: 2026-08-04
---

# Phase 8 Plan 16: Settings > Integraciones Frontend Foundation Summary

**Four hand-rolled Tailwind primitives (CopyButton, ConfirmDialog, IntegrationStatusBadge, an uncontrolled-input SecretField that structurally cannot leak a secret into the DOM), the complete 8-hook TanStack Query surface, and the four-route Integraciones shell with its degraded-state banner and settings entry card.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-04T21:33:00-05:00 (worktree base correction + dependency install/build)
- **Completed:** 2026-08-04T21:56:00-05:00
- **Tasks:** 3 of 3 plan tasks completed
- **Files modified:** 21 (19 created, 2 modified)

## Accomplishments

- `CopyButton`: clipboard copy with a `Copy`→`Check` icon swap, an `aria-live="polite"` "Copiado" announcement, and a `document.createRange`/`execCommand("copy")` fallback when `navigator.clipboard` is unavailable
- `ConfirmDialog`: adds the full accessibility contract `ContactModal.tsx` lacks — `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, initial focus on Cancel (never the destructive button), a Tab focus trap, `Escape` to close, focus restoration to the trigger, and overlay-click dismissal disabled for `tone="danger"`
- `IntegrationStatusBadge`: the six-status vocabulary from D-11 (`not_configured`/`verifying`/`verified`/`failed`/`pending_dns`/`pending_meta`), each with both an icon and a Spanish text label so status is never conveyed by color alone
- `SecretField`: the D-26 write-only field's four-state machine (Empty/Filled/Rotating/Verifying implied via `disabled`). The password `<input>` is deliberately **uncontrolled** — this was the actual fix needed after the first test run proved a *controlled* input leaks its live value into `container.innerHTML` in this React/jsdom combination. Uncontrolled, the "value" attribute stays frozen empty at mount while the plaintext only exists as the DOM node's live IDL property, which `innerHTML` never serializes. Only the character count (a number, never the string) is kept in React state.
- `apps/web/hooks/use-integrations.ts`: all 8 hooks from the plan's interface (`useIntegrations`, `useIntegrationHealth`, `useUncontactedDebts`, `useSaveIntegration`, `useDisconnectIntegration`, `useVerifyIntegration`, `useEmbeddedSignup`, `useRecheckDns`), following `use-tenant.ts`'s exact shape, matching every endpoint and response envelope in 08-14-SUMMARY.md's "Final Endpoint List" verbatim (including `EmbeddedSignupInput`'s `wabaId`/`phoneNumberId`/`phoneNumberE164`/`businessName` fields, read directly off the already-merged `EmbeddedSignupDto`)
- The route shell: `layout.tsx` (back link, `<h1>`, description, banner, tabs, children), four thin `page.tsx` shells with `Skeleton` placeholders and `TODO(08-17|08-18|08-19)` comments, `IntegrationsTabs` (link-based nav with `aria-current`, red/amber status dots, a blocked-debts count pill on Estado), `IntegrationSetupBanner` (`role="alert"` only when zero channels are verified, silent on partial degradation), and the `Integraciones` entry card on `/settings` (degraded-state border + inline warning line)
- `pnpm --filter @cobrai/web test`: 98/98 passing (up from the 56-test baseline); `pnpm --filter @cobrai/web typecheck` and `pnpm --filter @cobrai/web lint` both exit 0
- `pnpm typecheck` and `pnpm test` at the monorepo root: both 25/25 turbo tasks green, matching the pre-existing baseline exactly
- No source file exceeds 300 lines (largest: `SecretField.tsx` at 177, `lib/types.ts` at 222)
- No `components.json` or `components/ui/` directory was created anywhere in `apps/web`

## Task Commits

1. **Task 1: Shared primitives — CopyButton, ConfirmDialog, IntegrationStatusBadge, SecretField** - `ccce66d` (feat)
2. **Task 2: use-integrations hook surface and shared frontend types** - `56cacc6` (feat)
3. **Task 3: Route shell — layout, tabs, degraded banner, four routes and the settings entry card** - `1f129db` (feat)

## Files Created/Modified

- `apps/web/components/shared/CopyButton.tsx` / `.test.tsx` - clipboard copy primitive, 5 tests
- `apps/web/components/shared/ConfirmDialog.tsx` / `.test.tsx` - accessible confirmation dialog, 6 tests
- `apps/web/components/settings/integrations/IntegrationStatusBadge.tsx` / `.test.tsx` - six-status badge, 8 tests
- `apps/web/components/settings/integrations/SecretField.tsx` / `.test.tsx` - D-26 write-only secret field, 10 tests
- `apps/web/lib/types.ts` - `IntegrationStatus`/`IntegrationChannel`/`IntegrationSecretMeta`/`IntegrationView`/`UncontactedDebt`/`SaveIntegrationInput`
- `apps/web/hooks/use-integrations.ts` / `.test.ts` - the 8-hook data layer, 2 smoke tests
- `apps/web/components/settings/integrations/IntegrationsTabs.tsx` / `.test.tsx` - link-based tab nav, 6 tests
- `apps/web/components/settings/integrations/IntegrationSetupBanner.tsx` / `.test.tsx` - D-16 degraded-state banner, 5 tests
- `apps/web/app/(dashboard)/settings/integrations/layout.tsx` - shared header/banner/tabs shell
- `apps/web/app/(dashboard)/settings/integrations/page.tsx` - channels route shell (TODO 08-17)
- `apps/web/app/(dashboard)/settings/integrations/payments/page.tsx` - payments route shell (TODO 08-18)
- `apps/web/app/(dashboard)/settings/integrations/brand/page.tsx` - brand route shell (TODO 08-19)
- `apps/web/app/(dashboard)/settings/integrations/health/page.tsx` - health route shell (TODO 08-19)
- `apps/web/app/(dashboard)/settings/page.tsx` - `Integraciones` entry card inserted between `OrganizationSettingsPanel` and `ContactRetryPolicyPanel`

## Primitive Contracts (for 08-17/08-18/08-19)

```typescript
CopyButton({ value: string; label?: string })
ConfirmDialog({ title, body, confirmLabel, tone: "danger" | "neutral", onConfirm, onClose })
IntegrationStatusBadge({ status: IntegrationStatus; verifiedAt?: string | null })
SecretField({ label: string; name: string; meta: IntegrationSecretMeta | null; disabled?: boolean; onChange: (value: string | null) => void })
```

```typescript
// apps/web/hooks/use-integrations.ts
useIntegrations()                          // ["integrations"] → { items: IntegrationView[] }
useIntegrationHealth()                     // ["integrations","health"] → { items, summary: { operational, total } }
useUncontactedDebts(page: number)          // ["integrations","uncontacted-debts", { page }] → { items, total, page }
useSaveIntegration()                       // PUT  /api/v1/integrations/:provider — mutate({ provider, input: SaveIntegrationInput })
useDisconnectIntegration()                 // DELETE /api/v1/integrations/:provider — mutate(provider)
useVerifyIntegration()                     // POST /:provider/verify — mutate(provider)
useEmbeddedSignup()                        // POST /whatsapp/embedded-signup — mutate(EmbeddedSignupInput)
useRecheckDns()                            // POST /email/recheck-dns — mutate()
```

## `?focus=` Deep-Link Contract

`layout.tsx` reads `useSearchParams().get("focus")` to own/document the contract (08-UI-SPEC.md "Routing & Layout"), but does **not** pass it down via props or context. Next.js App Router scopes `useSearchParams()` to the whole route subtree — any client component under `settings/integrations/*` can call the same hook directly with zero prop drilling. Plans 08-17 (channels) and 08-18 (payments) must each call `useSearchParams().get("focus")` in their own `ChannelCard`/`PaymentGatewayPanel` components, compare it against their own provider/channel identifier, and when it matches:

1. Scroll the matching card into view (`scrollIntoView({ behavior: "smooth", block: "center" })`, or `"auto"` under `prefers-reduced-motion`).
2. Apply `ring-2 ring-[#D85A30]/40` for 2 seconds.
3. Gate the ring transition behind Tailwind's `motion-reduce:` variant so the highlight never animates for users who opted out of motion — it may still apply/remove the ring class instantly.

The banner's primary CTA sets `?focus=whatsapp`; the health screen's per-row `Arreglar` button (08-19) will set `?focus={provider-or-channel}` the same way.

## Decisions Made

See `key-decisions` in frontmatter. The one decision worth flagging loudly: **SecretField's uncontrolled input is not a style preference, it is the actual security mechanism.** The plan asked for a test asserting `container.innerHTML` never contains a full secret; the first implementation (a normal controlled `<input value={state}>`) failed that test — typing a secret into a controlled password input serialized the live value into `innerHTML` in this React/jsdom combination. Switching to `defaultValue=""` (uncontrolled, ref-driven) fixed it, because React only sets an `<input>`'s "value" content attribute once at mount for a controlled prop; an uncontrolled input's attribute never reflects subsequent keystrokes. This is now the mandatory pattern for every password/secret input this phase introduces.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Controlled `<input value={state}>` in SecretField leaked the typed secret into `container.innerHTML`**
- **Found during:** Task 1, running `SecretField.test.tsx`'s DOM-leak assertions for the first time
- **Issue:** A first-draft implementation used a normal React-controlled password input (`value={localValue}`, `onChange` setting `localValue`). Typing a secret and asserting `container.innerHTML` did not contain it failed — the controlled input's live `value` prop is reflected by React into the DOM node's "value" content attribute, which `innerHTML` serializes on every render, regardless of `type="password"`.
- **Fix:** Rewrote the input as uncontrolled (`defaultValue=""`, `ref`-driven, `key={rotating ? "rotating" : "empty"}` to force a fresh empty node on state transitions). Only the character count (a `number`) is kept in React state; the actual plaintext is read transiently from `e.target.value` in the change/blur handlers and forwarded to the caller's `onChange`, never stored in component state.
- **Files modified:** `apps/web/components/settings/integrations/SecretField.tsx`
- **Verification:** All three DOM-leak tests (Empty/Rotating/Filled) pass; verified empirically with a standalone jsdom/React experiment before committing the fix (a controlled input's typed value appears in `innerHTML`, an uncontrolled one's does not)
- **Committed in:** `ccce66d` (Task 1 commit — the fix landed before the first commit of this task, so no separate commit was needed)

**2. [Rule 3 - Blocking] Types needed by Task 1's components were not yet defined**
- **Found during:** Task 1 (writing `IntegrationStatusBadge.tsx` and `SecretField.tsx`, both importing `IntegrationStatus`/`IntegrationSecretMeta` from `lib/types.ts`)
- **Issue:** The plan's task split assigns `lib/types.ts` changes to Task 2, but Task 1's components need those types to compile — the same forward-reference shape 08-03/08-14 already documented.
- **Fix:** Added the full type block (`IntegrationStatus`, `IntegrationChannel`, `IntegrationSecretMeta`, `IntegrationView`, `UncontactedDebt`, `SaveIntegrationInput`) to `lib/types.ts` during Task 1. Task 2's commit only adds `use-integrations.ts` — no further type changes were needed, since everything the hook needs was already in place.
- **Files modified:** `apps/web/lib/types.ts`
- **Committed in:** `ccce66d` (Task 1)

**3. [Rule 1 - Bug] `IntegrationsTabs.tsx`'s own doc comment tripped its own acceptance-criteria grep**
- **Found during:** Task 3, running the acceptance-criteria grep checks after the component and tests both passed
- **Issue:** A doc comment explaining "not `role=\"tab\"` on navigating anchors" contained the literal string `role="tab"`, which the plan's `grep -c 'role="tab"' apps/web/components/settings/integrations/IntegrationsTabs.tsx` (expected to equal 0) matched.
- **Fix:** Reworded the comment to describe the same rationale without the literal attribute string.
- **Files modified:** `apps/web/components/settings/integrations/IntegrationsTabs.tsx`
- **Committed in:** `1f129db` (Task 3)

---

**Total deviations:** 3 auto-fixed (1 security-relevant bug fix in the plan's own security-critical component, 1 forward-reference sequencing choice, 1 self-referential grep false-positive)
**Impact on plan:** No scope creep. Deviation 1 is the reason the D-26 acceptance criterion is actually met rather than superficially met — it directly strengthens the threat-model mitigation for T-08-08/T-08-16b. Deviations 2 and 3 are structural/wording fixes with no behavior change.

## Known Stubs

The four route `page.tsx` files (`page.tsx`, `payments/page.tsx`, `brand/page.tsx`, `health/page.tsx`) are intentionally thin `Skeleton`-only shells, exactly as this plan's `<action>` text specifies: "the four page files are thin shells that render the layout's children slot with a `Skeleton` placeholder and a `TODO` comment naming the plan that fills each one." Each carries a `TODO(08-17|08-18|08-19)` comment naming the plan that replaces it. These are not stubs hiding incomplete work in this plan's own scope — they are the explicit, planned handoff surface to the next wave. No data-fetching component in this plan (`IntegrationsTabs`, `IntegrationSetupBanner`, the `/settings` entry card) renders a hardcoded empty/placeholder value; all three call the real hooks built in Task 2.

## Threat Flags

None beyond what the plan's own threat model already covers — every threat in the table was mitigated as specified, and Deviation 1 above is direct, verified evidence that T-08-08/T-08-16b's mitigation actually holds (the first implementation attempt did NOT hold, and the test suite caught it before commit):

- T-08-08 (full secret rendered into the DOM): mitigated — `SecretField`'s uncontrolled input, proven by 3 `container.innerHTML` assertions across Empty/Rotating/Filled states
- T-08-16b (secret in React Query cache/localStorage/URL): mitigated — `SaveIntegrationInput` (request-only) and `IntegrationView` (response-only, `lastFour`/`savedAt` only) are structurally distinct types; no hook in `use-integrations.ts` can receive a secret back from the server
- T-08-16c (password manager/autofill capture): mitigated — `autoComplete="off"`, `data-1p-ignore`, `spellCheck={false}` on the `SecretField` input
- T-08-16d (destructive action fired by a stray click/keystroke): mitigated — `ConfirmDialog`'s initial focus on Cancel and disabled overlay-click for `tone="danger"`, both covered by tests
- T-08-16e (user unable to complete/escape a dialog with the keyboard): mitigated — focus trap, `Escape`-to-close, and focus restoration, each covered by a dedicated test
- T-08-SC (package install legitimacy): not applicable — no package was installed in this plan

## Issues Encountered

- Fresh worktree had no `node_modules` and no built `dist/` for `@cobrai/utils` (the same pattern every prior Phase 8 plan's summary has noted) — resolved with `pnpm install --frozen-lockfile` followed by `pnpm --filter @cobrai/utils build`. Build artifacts only, not committed.
- lucide-react v1.14.0 renames several icons internally (`Loader2`→`loader-circle`, `AlertTriangle`→`triangle-alert`, `CheckCircle2`→`circle-check`) — confirmed by reading the package's compiled `.mjs` icon files directly rather than guessing, since the rendered `svg.lucide-*` class names in `IntegrationStatusBadge.test.tsx` depend on the exact internal name, not the exported alias name.

## User Setup Required

None - no external service configuration required. This plan is pure frontend UI/data-layer scaffolding against the already-merged 08-14 API.

## Next Phase Readiness

- Every primitive, hook, and route file 08-17/08-18/08-19 need is in place and tested. The three screen plans should import `SecretField`/`ConfirmDialog`/`CopyButton`/`IntegrationStatusBadge` as-is rather than rolling their own — in particular, any new password/secret input MUST follow `SecretField`'s uncontrolled-input pattern (see Decisions Made above) or it will silently reintroduce the DOM-leak this plan's Deviation 1 fixed.
- The `?focus=` contract is documented above; 08-17/08-18 need to implement the actual scroll-into-view + ring-highlight behavior in their own card components using `useSearchParams()` directly.
- `use-integrations.ts` is complete for all 8 endpoints in 08-14's Final Endpoint List — the three screen plans should not need to add new hooks to this file, only consume the existing ones, avoiding merge conflicts between parallel/sequential screen work.
- `EmbeddedSignupInput`'s field names (`wabaId`/`phoneNumberId`/`phoneNumberE164`/`businessName`) were read directly from the already-merged `EmbeddedSignupDto` in `apps/service-notifications/src/integrations/dto/integration.dto.ts` rather than from 08-14-SUMMARY.md's endpoint-list prose (which does not enumerate the body shape) — 08-17's `EmbeddedSignupButton` should use this hook's type as the source of truth.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 21 code files (19 created, 2 modified) verified present via `git show --stat`, and all 3 task commits (`ccce66d`, `56cacc6`, `1f129db`) verified present in `git log`.
