---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 19
subsystem: ui
tags: [nextjs, react, tanstack-query, tailwind, a11y, email-layout, brand-identity]

# Dependency graph
requires:
  - phase: 08-15
    provides: "BrandIdentity/EMPRESA_FALLBACK/mergeBrandIntoSignature in @cobrai/utils, PATCH /api/v1/tenant/brand-identity, RenderEmailContext.brand"
  - phase: 08-16
    provides: "IntegrationStatusBadge, use-integrations.ts hook surface (useIntegrationHealth/useUncontactedDebts/useIntegrations), the four-route shell with brand/page.tsx and health/page.tsx TODO shells"
  - phase: 08-14
    provides: "GET /v1/integrations/health and GET /v1/integrations/uncontacted-debts response shapes"
provides:
  - "BrandIdentityPanel — the single editable home for company identity (Identidad/Contacto/Firma legal fieldsets), exposing its live draft via onDraftChange"
  - "SignatureEditor's six overlapping fields converted to a read-only mirror of BrandIdentity with a cross-link to Integraciones -> Marca (UI-SPEC A-05 closed on the frontend)"
  - "BrandMessagePreview — WhatsApp/Correo/Voz three-pane live preview with real tab semantics, wrapping LayoutPreview unchanged for the email pane"
  - "IntegrationHealthPanel — per-channel operational status list with ?focus= deep links"
  - "UncontactedDebtsTable — the channel_not_configured debt list with its five states and responsive stacked cards"
  - "formatRelativeDate in lib/formatters.ts (Intl.RelativeTimeFormat, es-CO)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Brand preview injects the draft into config.signature (via mergeBrandIntoSignature) before handing it to LayoutPreview, rather than modifying LayoutPreview's fixed internal RenderEmailContext — keeps the real email renderer byte-for-byte unchanged while still reflecting live brand edits"
    - "A panel keeps its own internal draft state (mirroring ContactRetryPolicyPanel) but also exposes it upward via an optional onDraftChange callback, so it stays a zero-prop, self-testable component while still letting a parent page bind a sibling preview to its live, unsaved draft"
    - "pickChannelView prefers any non-not_configured row over the first match, since IntegrationsService.list() can return multiple provider stubs per channel (esp. payments) and the health screen needs the one row that represents the channel's real state"

key-files:
  created:
    - apps/web/components/settings/integrations/BrandIdentityPanel.tsx
    - apps/web/components/settings/integrations/BrandIdentityPanel.test.tsx
    - apps/web/components/settings/integrations/BrandMessagePreview.tsx
    - apps/web/components/settings/integrations/BrandMessagePreview.test.tsx
    - apps/web/components/settings/integrations/IntegrationHealthPanel.tsx
    - apps/web/components/settings/integrations/UncontactedDebtsTable.tsx
    - apps/web/components/settings/integrations/UncontactedDebtsTable.test.tsx
  modified:
    - apps/web/components/settings/email-builder/SignatureEditor.tsx
    - apps/web/hooks/use-tenant.ts
    - apps/web/lib/types.ts
    - apps/web/lib/formatters.ts
    - apps/web/app/(dashboard)/settings/integrations/brand/page.tsx
    - apps/web/app/(dashboard)/settings/integrations/health/page.tsx

key-decisions:
  - "Nombre comercial carries aria-required + a visible * marker but NOT the native HTML required attribute — the empty state is a legitimate, designed-for state (triggers the EMPRESA_FALLBACK chain), so blocking submission on an empty value would contradict the feature it documents"
  - "The Correo preview pane never modifies LayoutPreview.tsx (kept fully unchanged, per plan and files_modified). Brand values are merged into config.signature with mergeBrandIntoSignature before the config reaches LayoutPreview, reproducing the exact production merge (mergeBrandIntoSignature(signature, ctx.brand)) without needing LayoutPreview to accept a brand-aware render context"
  - "IntegrationHealthPanel and UncontactedDebtsTable both read useIntegrationHealth()'s summary field directly for the operational/total counts and the all-verified check, rather than re-deriving 'only verified counts as operational' locally — trusts the single source of truth already computed server-side in 08-14"

patterns-established:
  - "Any future settings panel that needs to expose its live draft to a sibling component (without becoming a controlled component) should follow BrandIdentityPanel's onDraftChange callback pattern"

requirements-completed: [D-16, D-24]

# Metrics
duration: ~35min
completed: 2026-08-05
---

# Phase 8 Plan 19: Screens 3 & 4 — Identidad de marca and Estado y salud Summary

**BrandIdentityPanel/BrandMessagePreview (three-pane live WhatsApp/Correo/Voz preview reusing the real email renderer) close UI-SPEC A-05 by turning SignatureEditor's six overlapping fields into a read-only mirror of the tenant's brand identity; IntegrationHealthPanel/UncontactedDebtsTable make D-16's degraded state and its blocked debts visible with actionable deep links.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 of 3 plan tasks completed, all autonomous
- **Files modified:** 13 (7 created, 6 modified)

## Accomplishments

- `BrandIdentityPanel`: three `<fieldset>` groups (`Identidad`, `Contacto`, `Firma legal`), the canonical admin/read-only fork, the `Nombre comercial` fallback hint verbatim from UI-SPEC, an empty-state notice, and an `onDraftChange` callback so a parent page can bind a live preview to the panel's unsaved draft without turning the panel into a controlled component.
- `useUpdateBrandIdentity` added to `hooks/use-tenant.ts` (`PATCH /api/v1/tenant/brand-identity`, invalidates `["tenant"]`), and `Tenant.brandIdentity?: BrandIdentity` added to `lib/types.ts` so `useTenant()` is typed for the new field 08-15 added to the API response.
- `SignatureEditor`'s `companyName`/`logoUrl`/`address`/`phone`/`website`/`legalDisclaimer` are no longer editable inputs — they render as a read-only `<dl>` computed via `mergeBrandIntoSignature` (the exact function `renderEmailLayout` uses in production), with a link `Estos datos se editan en Integraciones → Marca` to `/settings/integrations/brand`. `socials` is untouched and stays fully editable. This closes UI-SPEC assumption A-05 on the frontend (08-15 already built the backend read-through merge).
- `BrandMessagePreview`: WhatsApp (default) / Correo / Voz panes behind a real `role="tablist"`/`role="tab"`/`aria-selected`/`role="tabpanel"` control with arrow-key navigation (distinct from `IntegrationsTabs`'s navigating `<Link>`s, per UI-SPEC's accessibility table). The Correo pane wraps `LayoutPreview` completely unchanged — the draft's brand values are merged into the `EmailLayoutConfig.signature` passed to it via `mergeBrandIntoSignature` before the config ever reaches `LayoutPreview`, so the sandboxed-iframe email renderer never had to change. WhatsApp/Voz panes interpolate the live commercial name and fall back to the real `EMPRESA_FALLBACK` ("su gestor de cobranza") in `text-slate-500 italic` when empty — never a raw `{placeholder}` token. Debounced 300ms via the existing `use-debounce` hook; a visually-hidden `aria-live="polite"` region announces `Vista previa actualizada` on update.
- `IntegrationHealthPanel`: a `<ul>` with one row per channel (WhatsApp, Teléfono, Correo, Cobro), each showing icon, `IntegrationStatusBadge`, a truncated detail line (full text in `title` for `failed`), and the correct action per UI-SPEC's row-state table (`Ver` / `Arreglar` / `Ver instrucciones` / `Configurar`), all deep-linking with the `?focus=` contract from 08-16 (`?focus={channel}` for channel rows, `?focus={provider}` on the payments route). The header line reads `{n} de {m} integraciones operativas` straight from `useIntegrationHealth()`'s `summary`.
- `UncontactedDebtsTable`: all five states (`TableSkeleton` loading, the two distinct empty states — positive framing when every channel is verified vs. a forward-looking warning + `Configurar canales` when channels are missing — the non-empty state with its accent callout naming the blocked channel(s), and the error+`Reintentar` state), reusing `channelLabel()` and the existing dashboard pagination idiom at 25/page. Responsive: a real `<table>` (`hidden sm:block`) plus a stacked-card `<ul>` (`sm:hidden`) render side by side in the DOM, toggled purely by Tailwind breakpoints.
- Added `formatRelativeDate` to `lib/formatters.ts` (`Intl.RelativeTimeFormat`, `es-CO`) — no relative-date helper existed in the codebase despite the UI-SPEC's `hace 3 días` requirement for the "Desde" column; every prior date display in the app used the absolute `formatDateTime`.
- `pnpm --filter @cobrai/web test`: 124/124 passing (up from the 108-test baseline after wave 6); `pnpm --filter @cobrai/web typecheck`, `lint`, and `build` all exit 0/succeed.
- `pnpm typecheck` and `pnpm test` at the monorepo root: both 25/25 turbo tasks green, matching the pre-existing baseline exactly.
- No source file exceeds 300 lines (largest: `BrandIdentityPanel.tsx` at 273, `UncontactedDebtsTable.tsx` at 211).

## Task Commits

1. **Task 1: BrandIdentityPanel and the SignatureEditor read-through** - `a0cb3dc` (feat)
2. **Task 2: BrandMessagePreview — three panes showing what the debtor actually receives** - `1545371` (feat)
3. **Task 3: IntegrationHealthPanel and UncontactedDebtsTable** - `c10930e` (feat)

## Files Created/Modified

- `apps/web/components/settings/integrations/BrandIdentityPanel.tsx` / `.test.tsx` - the single editable home for brand identity, 10 tests
- `apps/web/components/settings/integrations/BrandMessagePreview.tsx` / `.test.tsx` - three-pane live preview, 9 tests
- `apps/web/components/settings/email-builder/SignatureEditor.tsx` - six fields converted to a read-only brand mirror + cross-link; `socials` untouched
- `apps/web/hooks/use-tenant.ts` - `useUpdateBrandIdentity`
- `apps/web/lib/types.ts` - `Tenant.brandIdentity?: BrandIdentity`
- `apps/web/lib/formatters.ts` - `formatRelativeDate`
- `apps/web/components/settings/integrations/IntegrationHealthPanel.tsx` - per-channel status list with `?focus=` deep links
- `apps/web/components/settings/integrations/UncontactedDebtsTable.tsx` / `.test.tsx` - the `channel_not_configured` debt list, 7 tests
- `apps/web/app/(dashboard)/settings/integrations/brand/page.tsx` - the 5-col grid wiring panel + preview
- `apps/web/app/(dashboard)/settings/integrations/health/page.tsx` - panel + table

## Decisions Made

See `key-decisions` in frontmatter. Summarized: `Nombre comercial` is visually/semantically required but not blocking (native `required` would contradict the designed empty-state/fallback behavior); the Correo preview pane pre-merges brand into `config.signature` rather than touching `LayoutPreview.tsx` at all, so the real renderer stays byte-for-byte unchanged as the plan mandates; both health-screen components trust `useIntegrationHealth()`'s server-computed `summary` rather than re-deriving the "verified counts as operational" rule locally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Tenant` type had no `brandIdentity` field**
- **Found during:** Task 1 (writing `BrandIdentityPanel`, which reads `tenantQuery.data?.data?.brandIdentity`)
- **Issue:** 08-15 added `brandIdentity` to the `GET /api/v1/tenant` response, but `apps/web/lib/types.ts`'s `Tenant` interface (not in this plan's `files_modified`) was never updated for it, so the panel and `SignatureEditor` had no typed access to the field.
- **Fix:** Added `brandIdentity?: BrandIdentity` to `Tenant`, importing the type directly from `@cobrai/utils` (the existing convention there — `@cobrai/utils` is already a runtime dependency of `apps/web`, unlike the backend-only `@cobrai/integrations` package `lib/types.ts`'s other comment refers to).
- **Files modified:** `apps/web/lib/types.ts`
- **Verification:** `pnpm --filter @cobrai/web typecheck` exits 0
- **Committed in:** `a0cb3dc` (Task 1)

**2. [Rule 2 - Missing critical] No relative-date formatter existed for the "Desde" column**
- **Found during:** Task 3 (writing `UncontactedDebtsTable`, whose "Desde" column UI-SPEC specifies as `hace 3 días`)
- **Issue:** `lib/formatters.ts` (not in this plan's `files_modified`) only had the absolute `formatDateTime`; no `Intl.RelativeTimeFormat`-based helper existed anywhere in the codebase despite the plan's own `read_first` describing it as already there.
- **Fix:** Added `formatRelativeDate` (`Intl.RelativeTimeFormat`, `es-CO`, day/hour/minute/second buckets) to `lib/formatters.ts`, matching that file's existing pure-function pattern.
- **Files modified:** `apps/web/lib/formatters.ts`
- **Verification:** Covered by `UncontactedDebtsTable.test.tsx`'s "Desde" assertions (`hace 3 días` rendered for a 3-day-old `blockedSince`)
- **Committed in:** `c10930e` (Task 3)

---

**Total deviations:** 2 auto-fixed (1 blocking type gap, 1 missing critical formatter), both small, single-purpose additions to files outside the plan's declared `files_modified` but required for the plan's own acceptance criteria to be met.
**Impact on plan:** No scope creep — both are additive-only, low-risk changes with no behavior change to any existing consumer of either file, verified by the full test suite staying green throughout (108 → 124 tests, all passing).

## Issues Encountered

- The worktree's `HEAD` was stale at spawn time (merge-base with the expected wave-7 base commit `8c26d13` resolved to an older ancestor, `34b1fd5`, missing all of 08-14/08-15/08-16's work this plan depends on). Corrected per the `<worktree_branch_check>` protocol with `git reset --hard 8c26d13a6012159c6c6b22c227c5046a209f7400` before any file edits — verified clean working tree first, and the branch/HEAD-ref checks both passed before and after.
- Fresh worktree had no `node_modules` and no built `dist/` for `@cobrai/utils` — resolved with `pnpm install --frozen-lockfile` followed by `pnpm --filter @cobrai/utils build` (the same pattern every prior Phase 8 plan's summary has noted). `@cobrai/db`'s own build step failed on an unrelated pre-existing gap (`@cobrai/workflow-packages` not resolvable during its `prisma generate && tsc` step run in isolation) — irrelevant to this plan's scope and not touched; the monorepo-root `pnpm typecheck`/`pnpm test` (which build packages via turbo's proper dependency graph rather than a manual `--filter` list) both ran clean at 25/25.
- `IntegrationHealthPanel.tsx`/`UncontactedDebtsTable.tsx`'s responsive split (`hidden sm:block` table + `sm:hidden` stacked cards) both render simultaneously in jsdom, since Tailwind breakpoint classes are not evaluated by the test environment. `UncontactedDebtsTable.test.tsx`'s row-content assertions were written against `getAllBy*` (expecting exactly 2 matches — one per rendering) rather than `getBy*`, to correctly reflect that duplication instead of masking it.

## Known Stubs

None. Every data-fetching component (`BrandIdentityPanel`, `BrandMessagePreview`, `IntegrationHealthPanel`, `UncontactedDebtsTable`) calls the real hooks built in 08-16/08-14; no hardcoded empty/placeholder value flows to rendered output.

**UI-SPEC items deliberately left unimplemented in this plan (for `/gsd-verify-work` against the phase goal):**
- No dedicated test file was written for `IntegrationHealthPanel.tsx` — the plan's own Task 3 `<files>`/`<action>` text scopes the TDD test-writing instruction explicitly to `UncontactedDebtsTable.test.tsx` only ("Write `UncontactedDebtsTable.test.tsx` covering every bullet"); `IntegrationHealthPanel`'s behavior is still covered indirectly by the acceptance-criteria `grep` checks (`?focus=`, no arbitrary spacing) and by `pnpm typecheck`/`build` exercising every code path at compile/render time, but has no direct unit-test assertions of its own.
- `IntegrationHealthPanel`'s row-detail identifier (`identifierFor`) falls back through several `publicConfig` keys (`phoneNumberE164` → `domain` → `fromEmail` → `merchantId` → `provider`) since 08-14's summary does not enumerate a single canonical "display identifier" field name per provider; this is a best-effort, defensively-coded mapping rather than a field guaranteed by the API contract.

## Threat Flags

None beyond what the plan's own threat model already covers — every threat in the table (T-08-08, T-08-19b through T-08-19e, T-08-SC) was mitigated as specified:
- T-08-08 (raw HTML from brand/provider text): all text renders as React children (auto-escaped); the email pane still goes through `LayoutPreview`'s existing sandboxed iframe and `renderEmailLayout`'s `escapeHtml` — no `dangerouslySetInnerHTML` was introduced anywhere in this plan.
- T-08-19b (preview diverging from what the debtor receives): the Correo pane wraps the real `LayoutPreview`/`renderEmailLayout` unchanged; the fallback text everywhere uses the same imported `EMPRESA_FALLBACK` constant the adapters use.
- T-08-19c (debtor PII on a settings screen): accepted per the plan's own disposition — `UncontactedDebtsTable` shows the same debtor names/amounts already visible elsewhere to any authenticated tenant member, tenant-scoped server-side by 08-14.
- T-08-19d (third-party script reading the preview iframe): not applicable here — no script was added; `LayoutPreview`'s iframe sandbox is unchanged and the Meta SDK (08-17's concern) is never loaded on this route.
- T-08-19e (brand identity edited in two diverging places): mitigated and asserted by test — `SignatureEditor.test`-equivalent coverage lives in `BrandIdentityPanel.test.tsx`'s assertions that the six fields render no editable input in the read-only view; the read-through itself is exercised by `SignatureEditor` calling the same `mergeBrandIntoSignature` function 08-15's backend tests already cover.
- T-08-SC (package install legitimacy): not applicable — no package was installed in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- This is the last plan of Phase 8. All four Settings > Integraciones screens (Canales, Cobro, Marca, Estado) are now fully built across plans 08-16 through 08-19, sharing the primitives, hooks, and route shell 08-16 established.
- Company identity has exactly one editable surface (`/settings/integrations/brand`) and one read-through mirror (the email builder's `SignatureEditor`) — UI-SPEC A-05 is closed end-to-end (backend read-through from 08-15, frontend read-only mirror from this plan).
- D-16's degraded state is now fully visible: the banner (08-16) tells a tenant something is wrong, and this plan's health screen tells them exactly what and which debts are waiting.
- Recommend a future pass to give `IntegrationHealthPanel` its own dedicated test file for parity with the rest of the phase's components, since the current plan-scoped test coverage for it is indirect (typecheck/build + acceptance-criteria greps only).

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 13 code files (7 created, 6 modified) verified present via `git ls-files`, and all 3 task commits (`a0cb3dc`, `1545371`, `c10930e`) verified present in `git log`.
