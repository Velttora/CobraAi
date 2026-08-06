---
phase: 08-configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
reviewed: 2026-08-06T00:00:00Z
depth: deep
files_reviewed: 44
files_reviewed_list:
  - apps/web/app/(dashboard)/settings/integrations/layout.tsx
  - apps/web/app/(dashboard)/settings/integrations/page.tsx
  - apps/web/app/(dashboard)/settings/integrations/payments/page.tsx
  - apps/web/app/(dashboard)/settings/integrations/brand/page.tsx
  - apps/web/app/(dashboard)/settings/integrations/health/page.tsx
  - apps/web/hooks/use-integrations.ts
  - apps/web/hooks/use-tenant.ts
  - apps/web/hooks/use-payment-focus-highlight.ts
  - apps/web/hooks/use-debounce.ts
  - apps/web/hooks/use-api-client.ts
  - apps/web/lib/types.ts
  - apps/web/components/settings/integrations/ChannelCard.tsx
  - apps/web/components/settings/integrations/ChannelModeToggle.tsx
  - apps/web/components/settings/integrations/ChannelFailureBlock.tsx
  - apps/web/components/settings/integrations/ChannelTextField.tsx
  - apps/web/components/settings/integrations/channel-config.ts
  - apps/web/components/settings/integrations/WhatsAppFields.tsx
  - apps/web/components/settings/integrations/PhoneFields.tsx
  - apps/web/components/settings/integrations/EmailFields.tsx
  - apps/web/components/settings/integrations/TwilioByoFields.tsx
  - apps/web/components/settings/integrations/ReadOnlyChannelSummary.tsx
  - apps/web/components/settings/integrations/SecretField.tsx
  - apps/web/components/settings/integrations/EmbeddedSignupButton.tsx
  - apps/web/components/settings/integrations/use-embedded-signup-polling.ts
  - apps/web/components/settings/integrations/DnsRecordsTable.tsx
  - apps/web/components/settings/integrations/EmailDnsSection.tsx
  - apps/web/components/settings/integrations/IntegrationStatusBadge.tsx
  - apps/web/components/settings/integrations/IntegrationsTabs.tsx
  - apps/web/components/settings/integrations/IntegrationSetupBanner.tsx
  - apps/web/components/settings/integrations/IntegrationHealthPanel.tsx
  - apps/web/components/settings/integrations/UncontactedDebtsTable.tsx
  - apps/web/components/settings/integrations/PaymentGatewayPanel.tsx
  - apps/web/components/settings/integrations/PaymentProviderSelect.tsx
  - apps/web/components/settings/integrations/PaymentCredentialFields.tsx
  - apps/web/components/settings/integrations/PaymentPanelHeader.tsx
  - apps/web/components/settings/integrations/PaymentReadOnlyView.tsx
  - apps/web/components/settings/integrations/PaymentVerificationFailure.tsx
  - apps/web/components/settings/integrations/payment-providers.ts
  - apps/web/components/settings/integrations/ExternalLinkTemplateEditor.tsx
  - apps/web/components/settings/integrations/BrandIdentityPanel.tsx
  - apps/web/components/settings/integrations/BrandMessagePreview.tsx
  - apps/web/components/shared/ConfirmDialog.tsx
  - apps/web/components/shared/CopyButton.tsx
  - apps/web/components/settings/email-builder/SignatureEditor.tsx
  - packages/utils/src/email-layout-brand.ts
  - packages/utils/src/payment-link-template.ts
findings:
  critical: 1
  high: 3
  medium: 3
  low: 2
  total: 9
status: issues_found
---

# Phase 8 Frontend Review: Settings > Integraciones

**Reviewed:** 2026-08-06
**Depth:** deep (per-file + cross-file tracing against `08-UI-SPEC.md` state matrices and `08-14-SUMMARY.md`'s endpoint/field contract, plus the live backend services in `apps/service-notifications/src/integrations/` and `packages/integrations/src`)
**Files Reviewed:** 44 components/hooks/pages under scope, cross-referenced against 8 backend files
**Status:** issues_found

## Summary

Ran `pnpm --filter @cobrai/web test` (223/223 passing across 34 files) and `pnpm --filter @cobrai/web build` (compiles, typechecks, and generates all 4 integrations routes cleanly) — both green, confirming this is not a build/typecheck issue hunt.

`SecretField` is indeed sound (uncontrolled input, no plaintext ever re-enters React state, clears on unmount/save). `ConfirmDialog` and `CopyButton` are also solid — real focus trap, `Escape`, focus restoration, overlay-click gated to `tone: "neutral"` only, and a real `execCommand` clipboard fallback. The BYO-only payments requirement holds: `PaymentGatewayPanel` hardcodes `mode: "byo"` and never renders `ChannelModeToggle`. Field-name contracts (`channel-config.ts`, `payment-providers.ts`) were cross-checked line-by-line against `08-14-SUMMARY.md`'s field table and the live `IntegrationsService`/`EmailConnectService`/`WhatsAppConnectService` — no drift found, including the two webhook-secret fields (`eventsSecret`, `webhookSecret`) that aren't in the summary's own table. The "provider change deletes the old gateway's credentials" confirm-dialog copy is accurate — `IntegrationsService.savePayment` really does call `retirePreviousPaymentProviders` once the new one verifies.

That said, this is the first adversarial pass and it surfaced one real security bug (forgeable postMessage origin check on the Meta Embedded Signup handoff) and several state-desync/error-handling gaps that the author's own tests do not exercise — in three cases I confirmed the exact untested branch by reading the corresponding `*.test.tsx` file.

## Critical Issues

### CR-01: Meta Embedded Signup accepts postMessage from any origin ending in "facebook.com" — a forgeable handoff that connects attacker-controlled WhatsApp credentials

**File:** `apps/web/components/settings/integrations/EmbeddedSignupButton.tsx:95`

**Issue:** The handler that accepts the WhatsApp Embedded Signup handoff validates the message origin with:

```ts
if (!event.origin.endsWith("facebook.com")) return;
```

`String.prototype.endsWith` is a suffix match, not a domain match. `"https://evil-facebook.com".endsWith("facebook.com")` is `true`, as is `"https://myfacebook.com"` or any other registrable domain that happens to end in the literal string `facebook.com`. This is the textbook insecure-postMessage-origin-check pattern (should be an exact match against `https://www.facebook.com` or a proper subdomain-boundary regex like `/^https:\/\/([\w-]+\.)*facebook\.com$/`).

The only test that exercises this path (`EmbeddedSignupButton.test.tsx:139`, `origin: "https://evil.example.com"`) happens to *also* fail the real check (it doesn't end in `facebook.com` either), so the suite gives 100% false confidence that origin spoofing is blocked.

**Why it matters:** if `payload.event === "FINISH"` and `payload.data.waba_id`/`phone_number_id` are present, `handleFinish` fires immediately and calls `POST /v1/integrations/whatsapp/embedded-signup` with attacker-supplied `wabaId`/`phoneNumberId`/`phoneNumberE164`/`businessName` (`EmbeddedSignupButton.tsx:117-134`), using the *admin's own authenticated session* (the mutation runs in the admin's browser, through their own `useApiClient()`). An attacker who lures an already-authenticated admin to a page they control — e.g. a domain purchasable today such as `*-facebook.com`/`*facebook*.com` — can `window.open()` the tenant's `/settings/integrations` route (inheriting the existing session) and `postMessage` a forged `WA_EMBEDDED_SIGNUP` `FINISH` event into it, silently repointing the tenant's WhatsApp channel (`connectManaged`, `whatsapp-connect.service.ts:105`) at a WABA/number the attacker controls, while the admin sees only the normal "Creando tu cuenta en Twilio…" progress steps. This is reachable whenever the WhatsApp card is in `managed` mode and not yet `verified` — a common state for a tenant mid-onboarding.

**Fix:**
```ts
const FACEBOOK_ORIGIN_RE = /^https:\/\/([\w-]+\.)*facebook\.com$/;
// ...
if (!FACEBOOK_ORIGIN_RE.test(event.origin)) return;
```
Add a test asserting a domain of the shape `https://evil-facebook.com` (suffix match, not a real Facebook subdomain) is rejected — the current test only proves an unrelated domain is rejected.

## High Issues

### HI-01: Teléfono card shows "Verificado" while simultaneously claiming voice isn't usable, once WhatsApp is disconnected

**File:** `apps/web/components/settings/integrations/PhoneFields.tsx:52-76`, `apps/web/components/settings/integrations/ChannelCard.tsx:54,114,195`

**Issue:** `PhoneFields`'s managed-mode branch gates its *entire* body on `relatedIntegration?.status === "verified"` (WhatsApp's status), regardless of whether the voice integration (`twilio_voice`) is itself already `verified`:

```ts
const whatsappConnected = relatedIntegration?.status === "verified";
if (!whatsappConnected) {
  return ( /* "Conecta WhatsApp primero", disabled "Activar llamadas" */ );
}
```

Voice is provisioned as its own independent `TenantIntegration` row (`whatsapp-connect.service.ts:105`, `provisionVoice`), and `disconnect()` (`tenant-integration.service.ts:211-222`) is scoped to a single provider — disconnecting `twilio_whatsapp` never touches the `twilio_voice` row. So: a tenant with both channels connected who clicks "Desconectar" on the WhatsApp card (e.g. to rotate credentials or switch to BYO) ends up with `twilio_voice.status` still `"verified"` but `relatedIntegration.status` now `"not_configured"`.

The result, on the very next render: `ChannelCard`'s top badge (driven by voice's own `status`, `ChannelCard.tsx:54`) still reads **"Verificado · Verificado el …"**, the "Desconectar" button is still offered (voice's own `status !== "not_configured"`), but the card body — driven entirely by `relatedIntegration` — renders **"Las llamadas usan el mismo número que WhatsApp. Conecta WhatsApp primero."** with a disabled "Activar llamadas" button and never shows the outbound number line at all. Two parts of the same card flatly contradict each other, and the tenant has no way to see the (still working, per the backend) voice number or reach the real "Desconectar" affordance from the confusing view.

Confirmed untested: `ChannelCard.disconnect.test.tsx:42-79` only exercises `integration.status` at its `test-fixtures.ts` default of `"not_configured"` — the `verified voice + not-verified WhatsApp` combination that triggers this is never constructed.

**Fix:** Gate the "connect WhatsApp first" branch on the voice integration's own state, not the related one:
```ts
if (mode === "managed" && integration?.status === "verified") {
  // render the outbound-number summary regardless of WhatsApp's current status
}
if (!whatsappConnected && integration?.status !== "verified") {
  // only then show "Conecta WhatsApp primero"
}
```

### HI-02: "Arreglar"/"Configurar" from the health screen never selects the failing payment provider

**File:** `apps/web/components/settings/integrations/IntegrationHealthPanel.tsx:35-40`, `apps/web/components/settings/integrations/PaymentGatewayPanel.tsx:61-77`, `apps/web/hooks/use-payment-focus-highlight.ts:20`

**Issue:** For the payments row, the health screen builds its deep link as:
```ts
return `/settings/integrations/payments?focus=${item?.provider ?? "payments"}` as Route;
```
— i.e. `?focus=wompi`, `?focus=stripe`, etc. (the *specific* provider that's `failed`/`not_configured`). But `PaymentGatewayPanel` never reads `searchParams.get("focus")` at all: `selectedProvider = draftProvider ?? activeProvider ?? DEFAULT_PROVIDER` (`PaymentGatewayPanel.tsx:72`), where `DEFAULT_PROVIDER = "wompi"`. And the one hook that *does* read the param, `usePaymentFocusHighlight`, only fires when the value is the literal string `"payments"` — a value `deepLinkFor` only ever emits when `item` is `null`, which in practice never happens once data has loaded (`pickChannelView` always falls back to `candidates[0]`).

Net effect: clicking "Arreglar" on the health screen for, say, a failed `stripe` attempt (with nothing yet verified) navigates to `/settings/integrations/payments?focus=stripe`, but the panel renders `wompi` — the *default*, not the provider the admin was trying to fix. The admin has to notice the mismatch and manually reselect the right provider from the dropdown. No test exercises `?focus=` selection in `PaymentGatewayPanel.test.tsx`, and `IntegrationHealthPanel.tsx` has no test file at all.

**Fix:** In `PaymentGatewayPanel`, seed `draftProvider` from `searchParams.get("focus")` on mount when it's a known payment provider slug, and change `usePaymentFocusHighlight` to accept/trigger on any non-null focus value instead of the hardcoded literal `"payments"`.

### HI-03: API load failures are indistinguishable from "nothing configured" on the channels page and the degraded-state banner

**File:** `apps/web/app/(dashboard)/settings/integrations/page.tsx:15-41`, `apps/web/components/settings/integrations/IntegrationSetupBanner.tsx:15-23`

**Issue:** Neither the Screen 1 page nor the degraded-state banner checks `useIntegrations().isError`:
```ts
// page.tsx
if (integrationsQuery.isLoading) { return <Skeleton .../>; }
const items = integrationsQuery.data?.data.items ?? [];   // undefined on error too
// ... renders three ChannelCards with integration={undefined} — identical to "genuinely empty"
```
```ts
// IntegrationSetupBanner.tsx
if (integrationsQuery.isLoading) return null;
const items = integrationsQuery.data?.data.items ?? [];    // same coalescing on error
const hasVerified = items.some((i) => i.status === "verified");
if (hasVerified) return null;
// falls through to the "No estamos contactando a tus deudores" alert
```
A transient 5xx/network failure on `GET /api/v1/integrations` is therefore rendered identically to "tenant has connected nothing": Screen 1 silently shows all three channel cards as `Sin configurar` (an admin could believe their real, working WhatsApp/Voice/Email connections vanished), and the banner fires the maximum-alarm "No estamos contactando a tus deudores" message even though the tenant may in fact have verified channels — the request just failed to load. Every other panel added in this phase (`PaymentGatewayPanel`, `IntegrationHealthPanel`, `UncontactedDebtsTable`, `BrandIdentityPanel`) does have an explicit `isError` branch with the UI-SPEC's "No se pudo cargar…" + retry copy; these two do not. Confirmed untested — `IntegrationSetupBanner.test.tsx` has no `isError` case, and `page.test.tsx` has no `error`/`isError` reference at all.

**Fix:** Add an `isError` branch to both: Screen 1 should show the standard "No se pudo cargar el estado de las integraciones." + `Reintentar` in place of the three cards, and `IntegrationSetupBanner` should render nothing (or a distinct, non-alarming error line) on `isError` rather than falling through to the zero-verified-channels case.

## Medium Issues

### ME-01: Retry-verification never flips the status badge to "Verificando…"

**File:** `apps/web/components/settings/integrations/ChannelCard.tsx:112-114`

**Issue:**
```ts
const isSaving = saveIntegration.isPending;
const isVerifying = verifyIntegration.isPending;
const displayStatus = isSaving ? "verifying" : status;
```
`displayStatus` — the value fed to the top-right `IntegrationStatusBadge` — only reacts to the *save* mutation, never to the *verify* mutation. So clicking "Reintentar verificación" (the failure block) or "Activar llamadas" (voice) puts the button into "Verificando…" locally, but the card's own badge keeps showing the stale `Verificación fallida`/`Sin configurar` state for the whole round trip. `PaymentGatewayPanel.tsx:74` gets this right (`isSaving = saveIntegration.isPending || verifyIntegration.isPending`) — `ChannelCard` is the outlier. Untested: `ChannelCard.verification.test.tsx`'s "Reintentar verificación" test only asserts `verifyMock.mutateAsync` was called, never checks badge/aria-live state during the call.

**Fix:** `const displayStatus = isSaving || isVerifying ? "verifying" : status;`

### ME-02: "Copiar todos" on the DNS table reports success even when nothing was copied

**File:** `apps/web/components/settings/integrations/DnsRecordsTable.tsx:46-53`

**Issue:**
```ts
async function handleCopyAll(): Promise<void> {
  const block = records.map((r) => `${r.type}\t${r.host}\t${r.value}`).join("\n");
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(block).catch(() => undefined);
  }
  setCopiedAll(true);           // always runs, clipboard branch or not
  setTimeout(() => setCopiedAll(false), COPY_ALL_FEEDBACK_MS);
}
```
When `navigator.clipboard` is unavailable (insecure context, older browser — the exact case `CopyButton.tsx` explicitly handles with an `execCommand` fallback), this function does nothing at all, yet still swaps the icon to the "Copied" checkmark. A tenant who needs to hand these CNAME records to someone else (the panel's own copy: "¿Tu dominio lo administra otra persona? Copia estos registros y envíaselos.") gets a false-positive "copied" signal and pastes nothing.

**Fix:** Reuse `CopyButton`'s fallback (extract it to a shared helper) instead of silently no-oping when `navigator.clipboard` is absent.

### ME-03: "Credenciales verificadas" toast fires even when the save only reached `pending_dns`

**File:** `apps/web/components/settings/integrations/ChannelCard.tsx:127-138`

**Issue:**
```ts
const response = await saveIntegration.mutateAsync({ provider, input });
if (response.data.status === "failed") {
  toast.error("No pudimos verificar las credenciales");
} else {
  toast.success("Credenciales verificadas");
  resetDrafts();
  onSaved?.();
}
```
A managed email "Conectar correo" submission that succeeds server-side but still needs DNS propagation returns `status: "pending_dns"` (`email-connect.service.ts:73-76`), which is not `"failed"` — so this branch fires `toast.success("Credenciales verificadas")` even though nothing has actually been verified yet and the tenant still needs to publish 3 CNAME records over up to 48 hours. This directly contradicts the UI-SPEC copy matrix, which distinguishes `Credenciales verificadas` from `Canal conectado` precisely for this reason.

**Fix:** Branch on the actual resulting status, not just `failed` vs. everything else — e.g. `pending_dns`/`pending_meta` → `toast.success("Canal conectado")`, `verified` → `toast.success("Credenciales verificadas")`, `failed` → the existing error toast.

## Low Issues

### LO-01: `useEmbeddedSignupPolling`'s effect omits `onPoll` from its dependency array

**File:** `apps/web/components/settings/integrations/use-embedded-signup-polling.ts:17-59`

**Issue:** The polling `useEffect` depends only on `[active]`, but calls the `onPoll` callback (a fresh closure over `verifyIntegration.mutateAsync` created every render of `EmbeddedSignupButton`) captured once, when `active` last flipped. This is an `exhaustive-deps` violation; it happens not to cause an observable bug today because TanStack Query keeps `mutateAsync` referentially stable, but it's a latent trap if that assumption ever changes or the callback grows additional captured state.

**Fix:** Wrap `onPoll` in a `useRef`/`useEffectEvent`-style pattern inside the hook, or add `onPoll` to the deps and have the caller memoize it with `useCallback`.

### LO-02: No test coverage for `IntegrationHealthPanel.tsx`

**File:** `apps/web/components/settings/integrations/IntegrationHealthPanel.tsx`

**Issue:** Every other component touched in this phase has at least one `*.test.tsx`; this one — which owns `pickChannelView`, `deepLinkFor`, and `rowDetailAndAction`, i.e. exactly the logic behind HI-02 — has none. That's almost certainly why HI-02 shipped unnoticed.

**Fix:** Add a test asserting the health screen's payments row deep-links to (and the payments screen actually pre-selects) the specific failing/unconfigured provider, not just that a link renders.

---

## What I checked and found sound (stated explicitly, per review scope)

- `SecretField.tsx` — write-only by construction, matches D-26 exactly; not re-reviewed for new issues beyond confirming the four-state machine and the unmount/save clearing.
- `ConfirmDialog.tsx` — real `role="dialog"`, `aria-modal`, `aria-labelledby`, initial focus on Cancel, Tab focus trap, `Escape`, focus restoration, overlay-click gated to `tone: "neutral"`.
- `CopyButton.tsx` — has the `execCommand` fallback `DnsRecordsTable`'s own copy-all button lacks (ME-02).
- Payments never implies a managed option: `PaymentGatewayPanel` hardcodes `mode: "byo"` in its save call and never renders `ChannelModeToggle`; `PaymentPanelHeader` renders the D-06 BYO-only note unconditionally.
- Field-name contract: `channel-config.ts` and `payment-providers.ts` cross-checked against `08-14-SUMMARY.md`'s "Per-provider field names" table and the live `IntegrationsService`/`EmailConnectService`/`WhatsAppConnectService`/`whatsapp-connect.service.ts` implementations — no drift, including the two webhook-secret field names (`eventsSecret`, `webhookSecret`) the summary itself doesn't enumerate but the frontend's own comment traces to `webhook-validator.service.ts`.
- Payment-provider-switch confirm dialog ("Se borran las credenciales de {proveedor anterior}…") is accurate, not just reassuring copy — `IntegrationsService.savePayment` really does call `retirePreviousPaymentProviders` once the new provider verifies (`integrations.service.ts:213-245`).
- `pnpm --filter @cobrai/web test`: **223/223 passing**, 34 files.
- `pnpm --filter @cobrai/web build`: succeeds, typechecks clean, all four `settings/integrations/*` routes generated.

---
_Reviewed: 2026-08-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
