---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
plan: 15
subsystem: api
tags: [brand-identity, whatsapp, email, voice, llm-prompt, tenant-settings, nestjs, prisma]

# Dependency graph
requires:
  - phase: 08-10
    provides: per-request tenant credential resolution in the WhatsApp/voice adapters
  - phase: 08-14
    provides: channel_not_configured waterfall and IntegrationsController/health surfacing
provides:
  - "BrandIdentity shape, sanitizer and fallback-aware resolver in @cobrai/utils"
  - "PATCH /api/v1/tenant/brand-identity admin-gated endpoint, brandIdentity on TenantProfile"
  - "variables.empresa (and empresa_telefono/correo/sitio_web/razon_social/nit/aviso_legal) populated from the tenant instead of a hardcoded literal"
  - "Email signature reads through to brand identity (UI-SPEC A-05) instead of keeping a second independent copy"
  - "Voice call and LLM system prompt both carry the tenant's commercial/legal identity"
affects: [08-16, 08-19, email-builder, settings-integrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Small logic modules (resolveTenantBrand, mergeBrandIntoSignature) extracted as sibling files instead of growing already-large orchestrator files"
    - "Fixed-fallback-chain resolvers (commercialName -> tenant.name -> EMPRESA_FALLBACK) centralized in one function shared by every channel"

key-files:
  created:
    - packages/utils/src/brand-identity.ts
    - packages/utils/src/brand-identity.spec.ts
    - packages/utils/src/email-layout-brand.ts
    - apps/service-notifications/src/contacts/resolve-tenant-brand.ts
    - apps/service-notifications/src/contacts/resolve-tenant-brand.spec.ts
  modified:
    - packages/utils/src/email-layout.ts
    - packages/utils/src/email-layout.spec.ts
    - packages/utils/src/index.ts
    - apps/api-gateway/src/tenant/dto/tenant-profile.dto.ts
    - apps/api-gateway/src/tenant/dto/tenant-profile.dto.spec.ts
    - apps/api-gateway/src/tenant/tenant.service.ts
    - apps/api-gateway/src/tenant/tenant.service.spec.ts
    - apps/api-gateway/src/tenant/tenant.controller.ts
    - apps/service-notifications/src/contacts/contacts.service.ts
    - apps/service-notifications/src/contacts/contacts.service.spec.ts
    - apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts
    - apps/service-notifications/src/adapters/twilio-whatsapp.adapter.spec.ts
    - apps/service-notifications/src/adapters/vapi-voice.adapter.ts
    - apps/service-notifications/src/adapters/vapi-voice.adapter.spec.ts
    - apps/service-notifications/src/agent/conversation-agent.service.ts
    - apps/service-notifications/src/agent/conversation-agent.service.spec.ts
    - apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts
    - apps/service-notifications/src/agent/prompts/cobrai-system.prompt.spec.ts

key-decisions:
  - "Brand identity lives in Tenant.settings.brandIdentity, not TenantIntegration's encrypted secrets — it is not a secret (Claude's Discretion item, matches CONTEXT.md's contrast with D-08)"
  - "EmailSignature is now a read-through mirror of BrandIdentity, not a second source of truth (UI-SPEC A-05): renderEmailLayout merges BrandIdentity over the stored EmailSignature field by field (brand wins when set), socials stays untouched and owned by the email builder"
  - "empresa fallback chain is explicit and three-tiered: commercialName -> tenant.name -> EMPRESA_FALLBACK ('su gestor de cobranza') — an organization name is a better fallback than a generic phrase"
  - "resolveTenantBrand and mergeBrandIntoSignature were extracted into sibling modules instead of inlined, to satisfy the hard 300-line file-size constraint on three already-oversized files (contacts.service.ts, conversation-agent.service.ts, email-layout.ts) without shrinking their existing behavior"

patterns-established:
  - "Single fallback-aware resolver (resolveTenantBrand) reused verbatim by contacts.service.ts (WhatsApp/email/voice dispatch) and conversation-agent.service.ts (LLM prompt) — no channel has its own copy of the fallback logic"
  - "URL sanitization allow-lists http(s):// only, applied uniformly at write time (sanitizeBrandIdentity) rather than at every render site"

requirements-completed: [D-24]

# Metrics
duration: ~55min
completed: 2026-08-04
---

# Phase 8 Plan 15: Tenant Brand Identity Across All Channels Summary

**BrandIdentity in @cobrai/utils with an admin-gated tenant endpoint, wired into WhatsApp/email/voice/LLM so `variables.empresa` and the email signature both read from one tenant-owned source instead of the hardcoded "su gestor de cobranza"/"CobraAI" fallbacks.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (all completed, all autonomous)
- **Files modified:** 18 modified, 5 created (23 total)

## Accomplishments

- `BrandIdentity` (commercialName, logoUrl, supportPhone, supportEmail, website, address, legalName, taxId, legalNotice) added to `@cobrai/utils` with `sanitizeBrandIdentity` (never throws, nulls out any `logoUrl`/`website` that isn't `http(s)://`) and `resolveBrandVariables` (the `empresa*` template/prompt variables, `EMPRESA_FALLBACK` when unset).
- `PATCH /api/v1/tenant/brand-identity` (admin-gated, partial merge) added alongside the existing `contact-retry-policy`/`whatsapp-sender` tenant sub-routes; `GET /api/v1/tenant` now returns `brandIdentity`, defaulting to `EMPTY_BRAND_IDENTITY`.
- `variables.empresa` in `contacts.service.ts`'s `buildVariables` is now resolved via the shared `resolveTenantBrand` helper with an explicit three-tier fallback chain (commercial name → tenant name → `EMPRESA_FALLBACK`), replacing the old `debt.tenant?.name ?? "CobraAI"`. The same call also emits `empresa_telefono`, `empresa_correo`, `empresa_sitio_web`, `empresa_razon_social`, `empresa_nit`, `empresa_aviso_legal`.
- `renderEmailLayout`'s signature block now merges the tenant's `BrandIdentity` over the stored `EmailSignature` (brand wins when set, stored value survives otherwise); `socials` is untouched.
- `twilio-whatsapp.adapter.ts` and `vapi-voice.adapter.ts` both reference the shared `EMPRESA_FALLBACK` constant instead of their own `"su gestor de cobranza"`/`"CobraAI"` literals; the voice adapter also threads `empresa_razon_social`/`empresa_nit` into Vapi's `variableValues`.
- `conversation-agent.service.ts` resolves the tenant's brand identity and interpolates commercial name, legal name and NIT into the LLM system prompt, giving `Identificar SIEMPRE la empresa acreedora` actual data to work with.

## Task Commits

1. **Task 1: BrandIdentity in @cobrai/utils and the tenant endpoint that edits it** - `4b122b3` (feat)
2. **Task 2: Inject brand identity into message variables and the email signature** - `6af7b1b` (feat)
3. **Task 3: Inject brand identity into the voice call and the LLM agent** - `532142c` (feat)

_Note: `pnpm typecheck` and `pnpm test` were run repeatedly across all three tasks rather than only at the end, to catch regressions before each commit._

## Files Created/Modified

- `packages/utils/src/brand-identity.ts` - `BrandIdentity`, `sanitizeBrandIdentity`, `resolveBrandVariables`, `EMPRESA_FALLBACK`
- `packages/utils/src/email-layout-brand.ts` - `mergeBrandIntoSignature` (new sibling module, keeps `email-layout.ts` from growing)
- `packages/utils/src/email-layout.ts` - `RenderEmailContext.brand`, signature block now merges brand identity
- `apps/api-gateway/src/tenant/dto/tenant-profile.dto.ts` - `brandIdentity` on `TenantProfile`, `UpdateBrandIdentityDto`
- `apps/api-gateway/src/tenant/tenant.service.ts` - `updateBrandIdentity` (assertAdmin, partial merge, same pattern as `updateWhatsappSender`)
- `apps/api-gateway/src/tenant/tenant.controller.ts` - `PATCH brand-identity` route
- `apps/service-notifications/src/contacts/resolve-tenant-brand.ts` - `resolveTenantBrand` (new sibling module shared by `contacts.service.ts` and `conversation-agent.service.ts`)
- `apps/service-notifications/src/contacts/contacts.service.ts` - `buildVariables`/`dispatchChannel` now thread brand identity through; empresa fallback chain replaces the old tenant-name-or-CobraAI literal
- `apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts` - `renderBody`'s fallback now references `EMPRESA_FALLBACK`
- `apps/service-notifications/src/adapters/vapi-voice.adapter.ts` - `variableValues.empresa` uses `EMPRESA_FALLBACK`; `empresa_razon_social`/`empresa_nit` added
- `apps/service-notifications/src/agent/conversation-agent.service.ts` - resolves brand identity, passes `legalName`/`taxId` into the prompt builder
- `apps/service-notifications/src/agent/prompts/cobrai-system.prompt.ts` - `PromptContext.legalName`/`taxId`, `buildLegalIdentityLine` for the "Identificar SIEMPRE la empresa acreedora" line

## Decisions Made

- **Brand identity storage placement (Claude's Discretion item):** `Tenant.settings.brandIdentity`, mirroring `contactRetryPolicy`/`whatsappFromNumber`. This is deliberately the opposite of `TenantIntegration`'s encrypted secrets — brand identity is not sensitive, and CONTEXT.md explicitly contrasts the two placements.
- **EmailSignature read-through (UI-SPEC A-05, the crux of this plan):** `SignatureEditor`'s `companyName`/`logoUrl`/`address`/`phone`/`website`/`legalDisclaimer` are NOT deleted from the `EmailSignature` type — they remain the stored fallback value a tenant sees rendered when the corresponding brand field is unset. `renderEmailLayout` now merges `BrandIdentity` over the stored `EmailSignature` at render time (brand value wins when set, stored value survives when the brand field is null). **What happens to a tenant who already filled in the signature:** nothing breaks and nothing is silently overwritten — their existing `EmailSignature` values keep rendering exactly as before until they (or plan 08-19's UI) set the corresponding brand identity field, at which point the brand value takes over for that field only. `socials` is explicitly excluded from the merge and stays owned by `SignatureEditor`, per UI-SPEC A-05. The frontend making `SignatureEditor`'s merged fields read-only with a cross-link to "Integraciones → Marca" is plan 08-19's job (out of this plan's scope, which is backend/`@cobrai/utils` only).
- **Fallback chain ordering:** `commercialName → tenant.name → EMPRESA_FALLBACK`. An organization's legal/registered name is a materially better fallback for a debtor to see than a generic phrase, so it sits between the tenant's deliberate choice and the last-resort generic string.
- **Sibling-module extraction over inlining:** `resolveTenantBrand` (used by both `contacts.service.ts` and `conversation-agent.service.ts`) and `mergeBrandIntoSignature` were extracted into new sibling files rather than added as private methods, specifically to keep `contacts.service.ts` (975 lines baseline), `conversation-agent.service.ts` (503 lines baseline) and `email-layout.ts` (437 lines baseline) from growing past their pre-existing size, per the hard 300-line file rule communicated for this execution. Net result: `contacts.service.ts` ended at 974 lines (-1), `conversation-agent.service.ts` at 503 (unchanged), `email-layout.ts` at 437 (unchanged). Both new sibling files are well under 300 lines.

## Deviations from Plan

None — plan executed as written. The sibling-module extraction described above was anticipated by the plan's own file-size constraint framing (not a deviation from the plan's `<action>` blocks, which describe the same logic; only its physical location differs from what a literal reading of "add a private method" would suggest).

## Issues Encountered

- Casting `{ ...currentSettings, brandIdentity: nextIdentity }` directly to `Prisma.InputJsonValue` failed to typecheck ("neither type sufficiently overlaps") for the same structural reason `debtor-memory.service.ts`'s `emotionalProfile` cast does; fixed by routing through `as unknown as Prisma.InputJsonValue`, matching that existing precedent in the codebase.
- `noUncheckedIndexedAccess` made `brand.variables.empresa` (typed as `Record<string, string>`) resolve to `string | undefined`; fixed by typing `ResolvedTenantBrand.variables` as the fixed-shape `BrandVariables` interface instead of a bare `Record<string, string>`, which also improved type safety at every call site.
- The existing test asserting `empresa` fell back to `"CobraAI"` (`contacts.service.spec.ts`, "usa el subject de la regla con variables sustituidas") was intentionally updated to assert `EMPRESA_FALLBACK` instead — this is the exact fallback-chain behavior change the plan's Task 2 specifies (`debt.tenant?.name ?? "CobraAI"` never had the three-tier chain; the mock debt has no `tenant` field at all, so it now correctly falls all the way to `EMPRESA_FALLBACK`).
- All test-file literal usages of `"su gestor de cobranza"` were replaced with the imported `EMPRESA_FALLBACK` constant so the repo-wide verification (`grep -rn "su gestor de cobranza" apps packages --include=*.ts` → exactly one match, in `brand-identity.ts`) holds.

## Known Stubs

None.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-08-15a through T-08-15e), all of which were implemented as specified: URL sanitization (`sanitizeBrandIdentity`), `assertAdmin` gating on the write endpoint, and unknown-key dropping to prevent smuggling data into `settings`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `BrandIdentity`/`resolveBrandVariables`/`EMPRESA_FALLBACK`/`mergeBrandIntoSignature` are all exported from `@cobrai/utils` and ready for plan 08-16 (frontend) to build `BrandIdentityPanel` and `BrandMessagePreview` against `PATCH /api/v1/tenant/brand-identity`.
- `SignatureEditor`'s read-only conversion (rendering the brand-identity-mirrored fields as read-only with a cross-link) is explicitly deferred to the frontend plan — this plan only built the backend read-through merge it depends on.
- Every debtor-facing surface (WhatsApp template, email signature, voice opening line, LLM system prompt) now sources the tenant's name from one place; no further backend wiring is needed for D-24's "one place, every channel reads it" requirement.

---
*Phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro*
*Completed: 2026-08-04*

## Self-Check: PASSED
