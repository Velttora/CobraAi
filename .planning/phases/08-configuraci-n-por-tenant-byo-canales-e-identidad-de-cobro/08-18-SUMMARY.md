---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 18
subsystem: ui
tags: [nextjs, react, tanstack-query, tailwind, a11y, write-only-secrets, byo-payments]

# Dependency graph
requires:
  - phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
    provides: "08-16's SecretField/ConfirmDialog/CopyButton/IntegrationStatusBadge primitives, the use-integrations hook surface, and the payments/page.tsx route shell; 08-14's IntegrationsController REST surface and per-provider publicConfig/secrets field names; 08-09's resolveExternalLinkTemplate/validateExternalLinkTemplate single-brace resolver"
provides:
  - "PaymentProviderSelect — the seven-option, three-optgroup payment provider <select>"
  - "PaymentGatewayPanel — Screen 2's assembled panel: provider selection, per-provider credential form, D-11 verification interaction, D-06 BYO-only framing, webhook URL block, provider-change confirmation"
  - "ExternalLinkTemplateEditor — the D-13 single-brace template editor with insertable chips, a live debounced preview through the shared resolver, and blocking validation"
  - "payment-providers.ts — the per-provider field-descriptor map (the single source of truth for publicConfig/secrets key names on this screen), cross-checked against 08-14-SUMMARY.md and webhook-validator.service.ts"
affects: [08-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Payments are the one screen in Phase 8 with NO managed/BYO toggle at all (D-06) — PaymentPanelHeader renders only the fixed BYO-only sentence; every other channel screen keeps the toggle"
    - "Per-provider credential forms are driven by a field-descriptor map (payment-providers.ts), not per-provider branching in JSX — adding/changing a provider's fields never touches PaymentGatewayPanel.tsx itself"
    - "Caret-preserving chip insertion into a CONTROLLED input uses a pendingCaretRef + useLayoutEffect keyed on the value prop, not requestAnimationFrame — the effect fires after the parent's re-render actually reaches the DOM, which is deterministic under React's commit phase and trivially testable with a controlled-state test harness"
    - "external_link and transfer never reach the badge label 'Verificado' — PaymentPanelHeader renders a hand-rolled 'Configurado' pill instead of IntegrationStatusBadge's verified state for those two providers, since skipVerification means nothing was actually checked against a provider"

key-files:
  created:
    - apps/web/components/settings/integrations/PaymentProviderSelect.tsx
    - apps/web/components/settings/integrations/PaymentGatewayPanel.tsx
    - apps/web/components/settings/integrations/PaymentGatewayPanel.test.tsx
    - apps/web/components/settings/integrations/ExternalLinkTemplateEditor.tsx
    - apps/web/components/settings/integrations/ExternalLinkTemplateEditor.test.tsx
    - apps/web/components/settings/integrations/payment-providers.ts
    - apps/web/components/settings/integrations/PaymentCredentialFields.tsx
    - apps/web/components/settings/integrations/PaymentPanelHeader.tsx
    - apps/web/components/settings/integrations/PaymentReadOnlyView.tsx
    - apps/web/components/settings/integrations/PaymentVerificationFailure.tsx
    - apps/web/hooks/use-payment-focus-highlight.ts
  modified:
    - apps/web/app/(dashboard)/settings/integrations/payments/page.tsx

key-decisions:
  - "The per-provider field-descriptor map lives in a new payment-providers.ts, not inline in PaymentGatewayPanel.tsx or PaymentProviderSelect.tsx — six providers' worth of fields plus their labels and precedence data would have pushed the panel well past the 300-line hard limit on its own"
  - "PaymentGatewayPanel.tsx is further split into PaymentPanelHeader/PaymentCredentialFields/PaymentReadOnlyView/PaymentVerificationFailure — none of these four is reused by any other screen; they exist purely to keep the panel's own file under 300 lines while staying testable through the panel's public behavior"
  - "wompi's eventsSecret and stripe's/mercadopago's webhookSecret field names are NOT in 08-14-SUMMARY.md's per-provider field list — they were cross-checked instead against apps/service-payments/src/webhooks/webhook-validator.service.ts's SIGNING_SECRET_FIELD map, the actual runtime consumer of those fields, and confirmed accepted by IntegrationsService.savePayment's field-agnostic passthrough to TenantIntegrationService.upsert"
  - "The panel's default/active provider is chosen by walking PAYMENT_PROVIDER_PRECEDENCE (stripe, wompi, payu, epayco, mercadopago, external_link, transfer) — the same order TenantIntegrationService.resolveByChannel uses at checkout time — so the badge and form shown by default always match what checkout would actually resolve to if more than one payment provider row happens to be non-not_configured"
  - "external_link's publicConfig.template is NOT in PAYMENT_PROVIDER_FIELDS (which only covers the six credential-based providers) — it is handled as a special case in PaymentGatewayPanel's isValid/isDirty/handleSubmit, driven by ExternalLinkTemplateEditor and validateExternalLinkTemplate directly, since a template field cannot be described by the {name,label,secret} shape every other provider's fields share"
  - "Chip insertion into ExternalLinkTemplateEditor's controlled input restores the caret via a pendingCaretRef + useLayoutEffect(() => ..., [value]) rather than requestAnimationFrame — deterministic under React's own commit timing and directly testable by clicking a chip with a real controlled-state test harness, no fake timers or waitFor needed"
  - "Changing payment provider via the ConfirmDialog only updates local draft state (which provider's form is shown) — it does NOT call useDisconnectIntegration on the previously active provider. The Destructive Actions copy describes credential deletion as a consequence, but no task behavior bullet or acceptance criterion in this plan requires an actual disconnect call, and TenantIntegrationService.upsert never touches other providers' rows on its own. Flagged under Issues Encountered below since it means two payment provider rows could stay simultaneously 'verified' until the old one is explicitly disconnected — a pre-existing backend precedence question (resolveByChannel picks by PROVIDER_CHANNEL insertion order), not something this UI plan's scope covers."

patterns-established:
  - "Any future screen needing a large, provider/channel-keyed field map should extract it to a sibling *-providers.ts / *-fields.ts data module rather than inlining it in the panel component, and should split large panels into header/fields/failure/read-only subcomponents the same way this plan did — both moves were necessary here purely to satisfy the 300-line file limit with six providers' worth of fields."

requirements-completed: [D-06, D-11, D-13, D-14, D-24, D-26]

# Metrics
duration: ~29min
completed: 2026-08-04
---

# Phase 8 Plan 18: Screen 2 — Configuración de cobro Summary

**Seven-provider payment gateway panel (Wompi, PayU, ePayco, Mercado Pago, Stripe, external link, bank transfer) with BYO-only framing, write-only secret fields, D-11 verification interaction, and a single-brace external-link template editor with a live production-accurate preview.**

## Performance

- **Duration:** ~29 min
- **Started:** 2026-08-04T22:10:00-05:00 (worktree base correction + dependency install)
- **Completed:** 2026-08-04T22:39:00-05:00
- **Tasks:** 2 of 2 plan tasks completed
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments

- `PaymentProviderSelect`: the seven-option `<select>` grouped into `Pasarelas en Colombia` (Wompi, PayU, ePayco, Mercado Pago), `Internacional` (Stripe) and `Sin integración` (enlace externo, transferencia), markup copied verbatim from `ContactRetryPolicyPanel`'s `<select>`
- `PaymentGatewayPanel`: assembles the whole screen — no managed/BYO toggle anywhere (D-06), a per-provider credential form driven entirely by a field-descriptor map, the D-11 save interaction (`Verificando…` → `verified`/`failed`, provider-rejection vs. transport-failure distinction preserved), the mandatory actionable failure block with the provider's own message and a per-provider remedy, a `ConfirmDialog`-gated provider switch, the webhook URL block (only for the five webhook-capable providers), the `Todavía no puedes cobrar` empty state, and a non-admin read-only `<dl>` fork
- `payment-providers.ts`: the per-provider field-descriptor map — every `publicConfig`/`secrets` key name cross-checked against `08-14-SUMMARY.md`'s Final Endpoint List, and, for the two webhook-signing-secret fields that list does not enumerate (`wompi.eventsSecret`, `stripe`/`mercadopago.webhookSecret`), against `apps/service-payments/src/webhooks/webhook-validator.service.ts`'s `SIGNING_SECRET_FIELD` map — confirmed those two extra fields are accepted by `IntegrationsService.savePayment`'s field-agnostic passthrough
- `ExternalLinkTemplateEditor`: single-line template input, three `<button type="button">` chips (`{monto}`/`{ref}`/`{nombre}`) that insert at the caret (never appended), a 300ms-debounced live preview rendered through `resolveExternalLinkTemplate` from `@cobrai/utils` inside an `aria-live="polite"` region, and the three blocking validations from `validateExternalLinkTemplate` rendered verbatim
- `external_link`/`transfer` never show `Verificado` — a hand-rolled `Configurado` pill renders instead, since `skipVerification` means nothing was actually checked against a provider
- `pnpm --filter @cobrai/web test`: 123/123 passing (up from 08-16's 98-test baseline: +14 `PaymentGatewayPanel.test.tsx`, +11 `ExternalLinkTemplateEditor.test.tsx`); `pnpm --filter @cobrai/web typecheck` and `lint` both exit 0; `pnpm --filter @cobrai/web build` compiles cleanly
- No source file exceeds 300 lines (largest: `PaymentGatewayPanel.tsx` at 284 after Task 2's edit; `payment-providers.ts` at 152)
- No `components.json` or `components/ui/` directory was created anywhere in `apps/web`

## Task Commits

1. **Task 1: PaymentProviderSelect and PaymentGatewayPanel with per-provider credential forms** - `20cb827` (feat)
2. **Task 2: ExternalLinkTemplateEditor with insertable chips, live preview and blocking validation** - `3bf1633` (feat)

## Files Created/Modified

- `apps/web/components/settings/integrations/PaymentProviderSelect.tsx` - the seven-option, three-optgroup provider `<select>`
- `apps/web/components/settings/integrations/PaymentGatewayPanel.tsx` - Screen 2's assembled panel (284 lines)
- `apps/web/components/settings/integrations/PaymentGatewayPanel.test.tsx` - 14 tests covering every Task 1 behavior bullet
- `apps/web/components/settings/integrations/payment-providers.ts` - per-provider field-descriptor map, labels, precedence, remedy copy
- `apps/web/components/settings/integrations/PaymentCredentialFields.tsx` - renders one provider's plain/secret fields from the descriptor map
- `apps/web/components/settings/integrations/PaymentPanelHeader.tsx` - icon/title/BYO-note/badge/aria-live status region shared by every fork
- `apps/web/components/settings/integrations/PaymentReadOnlyView.tsx` - the non-admin `<dl>` mirror
- `apps/web/components/settings/integrations/PaymentVerificationFailure.tsx` - the mandatory D-11 failure block
- `apps/web/hooks/use-payment-focus-highlight.ts` - the `?focus=payments` scroll+ring hook
- `apps/web/components/settings/integrations/ExternalLinkTemplateEditor.tsx` - the D-13 template editor
- `apps/web/components/settings/integrations/ExternalLinkTemplateEditor.test.tsx` - 11 tests covering every Task 2 behavior bullet
- `apps/web/app/(dashboard)/settings/integrations/payments/page.tsx` - replaced the 08-16 `Skeleton` shell with `<PaymentGatewayPanel />`

## Decisions Made

See `key-decisions` in frontmatter. The two worth flagging loudly:

1. **The field-descriptor map required cross-referencing beyond 08-14-SUMMARY.md.** That summary's "Final Endpoint List" documents five of the seven providers' credential fields but does not mention wompi's `eventsSecret` or stripe's/mercadopago's `webhookSecret` — those two only surface in `webhook-validator.service.ts`'s `SIGNING_SECRET_FIELD` map, the code that actually reads them back out at webhook-verification time. Both were confirmed accepted end-to-end: `IntegrationsService.savePayment` passes `publicConfig`/`secrets` through to `TenantIntegrationService.upsert` with no field allowlist, so sending these two extra keys stores them exactly like every other field.
2. **Provider-change via `ConfirmDialog` does not call `useDisconnectIntegration` on the old provider.** Only the acceptance-criteria-mandated behavior — the dialog gates the local form switch — was implemented. See Issues Encountered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Split `PaymentGatewayPanel` and extracted a field-descriptor data module beyond the plan's declared `files_modified`**
- **Found during:** Task 1, after a first draft of `PaymentGatewayPanel.tsx` landed at 371 lines
- **Issue:** The plan's `files_modified` for Task 1 lists only `PaymentProviderSelect.tsx`, `PaymentGatewayPanel.tsx`, `PaymentGatewayPanel.test.tsx` and `payments/page.tsx`, but six providers' worth of field descriptors, labels, remedy copy and the panel's own header/credential-form/failure-block/read-only-view markup could not fit under the orchestrator's hard 300-line-per-file rule in a single component file.
- **Fix:** Extracted `payment-providers.ts` (the field-descriptor map + provider labels/precedence/remedy copy) and four presentational subcomponents (`PaymentPanelHeader`, `PaymentCredentialFields`, `PaymentReadOnlyView`, `PaymentVerificationFailure`), plus a small `use-payment-focus-highlight.ts` hook for the `?focus=` contract. None of these five files is a new user-facing surface — they are pure decomposition of Task 1's own declared component.
- **Files modified:** `apps/web/components/settings/integrations/payment-providers.ts`, `PaymentCredentialFields.tsx`, `PaymentPanelHeader.tsx`, `PaymentReadOnlyView.tsx`, `PaymentVerificationFailure.tsx`, `apps/web/hooks/use-payment-focus-highlight.ts`
- **Verification:** All acceptance criteria for Task 1 pass with the split in place (`grep -c "optgroup"` = 7, `grep -ci "gestionado por cobrai|próximamente"` = 0, all 14 tests green); every file is ≤152 lines except `PaymentGatewayPanel.tsx` itself, which stayed at 274 lines after the split (later 284 after Task 2's edit)
- **Committed in:** `20cb827` (Task 1)

**2. [Rule 1 - Bug] Two doc comments tripped their own acceptance-criteria greps**
- **Found during:** Task 1 and Task 2, running the acceptance-criteria grep checks after tests passed
- **Issue:** `PaymentGatewayPanel.tsx`'s own doc comment explaining "no próximamente affordance" contained the literal word "próximamente", tripping `grep -ci "gestionado por cobrai|próximamente"` (expected 0). `ExternalLinkTemplateEditor.tsx`'s doc comment explaining what it deliberately does NOT reuse (`lib/template-preview.ts::renderTemplatePreview`) tripped `grep -c "renderTemplatePreview|template-preview"` (expected 0) — the same self-referential-grep shape 08-16-SUMMARY.md's Deviation 3 already documented for `IntegrationsTabs.tsx`.
- **Fix:** Reworded both comments to describe the same rationale without the literal matched strings.
- **Files modified:** `apps/web/components/settings/integrations/PaymentGatewayPanel.tsx`, `ExternalLinkTemplateEditor.tsx`
- **Committed in:** `20cb827` (Task 1), `3bf1633` (Task 2)

---

**Total deviations:** 2 auto-fixed (1 structural decomposition necessitated by the 300-line file limit, 1 self-referential-grep wording fix repeated across two files)
**Impact on plan:** No scope creep. Deviation 1 is purely internal decomposition of the exact component the plan already asked for — every acceptance criterion still passes against the file the plan named. Deviation 2 is a wording fix with no behavior change.

## Known Stubs

None. Every provider's credential form is wired to real hooks (`useIntegrations`/`useSaveIntegration`/`useVerifyIntegration`); `ExternalLinkTemplateEditor` is fully wired into `PaymentGatewayPanel`'s `external_link` branch with the panel's own submit-button validity driven by `validateExternalLinkTemplate` on the same value.

## Threat Flags

No new surface beyond what the plan's own threat model already covers — every threat in the table was mitigated as specified:

- T-08-08 (payment gateway secret rendered back into the DOM): mitigated — every secret field is `SecretField` verbatim, reused unmodified from 08-16
- T-08-18b (non-TLS/attacker-controlled template saved): mitigated — `validateExternalLinkTemplate` blocks the submit button client-side; 08-14's `savePayment` enforces the same validator server-side (confirmed by reading `integrations.service.ts`)
- T-08-18c (preview showing a different URL than debtors receive): mitigated — `ExternalLinkTemplateEditor`'s preview and `PaymentGatewayPanel`'s save path both resolve through the same `@cobrai/utils` module; `ExternalLinkTemplateEditor.test.tsx` asserts the preview equals `resolveExternalLinkTemplate`'s own output for the same input
- T-08-18d (provider error text rendered as raw HTML): mitigated — `failureMessage` is rendered as a React text child in `PaymentVerificationFailure`, never `dangerouslySetInnerHTML`
- T-08-18e (stray provider change silently orphaning issued payment links): mitigated — provider switching is gated by `ConfirmDialog` with the exact Destructive-Actions copy naming the consequence; see Issues Encountered for the one open question this mitigation does not close (no actual `disconnect` call on the old provider)
- T-08-18f (webhook URL shown for a provider with none): mitigated — the block renders only when `currentView.webhookUrl` is non-null; a dedicated test asserts it is present for `wompi` and absent for `external_link`
- T-08-SC (package install legitimacy): not applicable — no package was installed in this plan

## Issues Encountered

- **Provider switching does not disconnect the previously active provider's row.** UI-SPEC's Destructive Actions copy for "Cambiar de proveedor de cobro" says "Se borran las credenciales de {proveedor anterior}", but neither this plan's behavior bullets nor its acceptance criteria require an actual `useDisconnectIntegration` call on confirm — only that the `ConfirmDialog` gates the local form switch, which is what was implemented and tested. Because `TenantIntegrationService.upsert` (08-08/08-14) never touches other providers' rows, and `resolveByChannel` picks the first `verified` row by a fixed precedence order (`stripe, wompi, payu, epayco, mercadopago, external_link, transfer`), a tenant who "switches" from Wompi to Stripe without ever disconnecting Wompi could end up with both rows `verified` — and if Wompi were ever re-verified after being marked `failed` this way, `resolveByChannel`'s precedence would keep resolving to Stripe (correct, since it's earlier in that fixed order) or to Wompi (if Wompi were earlier), independent of which one the tenant most recently "selected" in this UI. This is a backend precedence/exclusivity question predating this plan (08-08's `TenantIntegrationService`, out of this plan's file scope), not a gap introduced here — flagged so a future plan can decide whether "switching provider" should also disconnect the old row.

## User Setup Required

None — no external service configuration required. This plan is pure frontend UI against the already-merged 08-14 API and the already-built 08-09 template resolver.

## Next Phase Readiness

- Screen 2 is fully implemented and independently testable; 08-19 (Screen 3/4 — Identidad de marca, Estado y salud) does not depend on anything built in this plan beyond the shared 08-16 primitives it already had access to.
- `payment-providers.ts`'s field-descriptor map is the authoritative source for payment credential field names on the frontend — any future payment-provider addition should extend that map rather than adding per-provider branching to `PaymentGatewayPanel.tsx` or `PaymentCredentialFields.tsx`.
- The provider-disconnect-on-switch question under Issues Encountered is worth a product decision before go-live with more than one payment provider actively used across tenants — it does not block this phase, since `resolveByChannel`'s deterministic precedence order means checkout always resolves consistently even with multiple `verified` rows, just not necessarily to the one the tenant most recently picked in this UI.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED

All 12 code files (11 created, 1 modified) verified present via `ls -la`, and both task commits (`20cb827`, `3bf1633`) verified present in `git log --oneline --all`.
