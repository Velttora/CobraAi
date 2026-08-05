---
phase: 8
slug: configuraci-n-por-tenant-byo-canales-e-identidad-de-cobro
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-04
---

> **Corrección 2026-08-04 (gsd-plan-checker):** el glob de tests del frontend era
> `*.spec.tsx`, que nunca se habría ejecutado — `apps/web/vitest.config.ts` solo incluye
> `**/*.test.ts` y `**/*.test.tsx`. Corregido a `*.test.tsx`. Los planes 08-16..08-19 ya
> usaban el nombre correcto.
>
> `nyquist_compliant` pasa a `true`: los 19 planes tienen comando `<automated>` en cada
> tarea no-checkpoint, sin flags de watch y sin referencias MISSING.

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.6 (per-package configs, existing pattern) + RTL/jsdom for `@cobrai/web` (Phase 4 precedent) |
| **Config file** | `apps/service-notifications/vitest.config.ts`, `apps/service-payments/vitest.config.ts`, `packages/utils/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cobrai/<package> test` |
| **Full suite command** | `pnpm test` (runs `db:generate` then `turbo test`) |
| **Estimated runtime** | ~60-120 seconds full suite |

Note: `pnpm test` runs `pnpm db:generate` first — required after any `schema.prisma` change or the whole suite fails on stale Prisma types.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cobrai/<touched-package> test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Requirement column maps to CONTEXT.md decisions (D-XX) — this project has no `.planning/REQUIREMENTS.md` and no requirement IDs were assigned to this phase.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | D-08 crypto | T-08-01 | Tampered ciphertext fails authTag; wrong keyVersion throws | unit | `pnpm --filter @cobrai/utils test` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | D-08/D-09 model | T-08-02 | Secrets never returned in plaintext by any query helper | unit | `pnpm --filter @cobrai/db test` | ❌ W0 | ⬜ pending |
| TBD | 02 | 2 | D-10/D-11 resolution | T-08-03 | `status !== "verified"` returns null, never a stale credential | unit | `pnpm --filter @cobrai/service-notifications test` | ❌ W0 | ⬜ pending |
| TBD | 02 | 2 | D-16 compliance | — | No verified integration → `channel_not_configured`, never a silent send | unit | `pnpm --filter @cobrai/compliance test` | ✅ extend | ⬜ pending |
| TBD | 02 | 2 | D-17 boot guard | T-08-04 | App refuses to boot with simulation flag + `NODE_ENV=production` | unit | `pnpm --filter @cobrai/service-notifications test` | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | D-02/D-25 Twilio ISV | T-08-05 | Meta token never logged; subaccount scoped per tenant | integration (mocked SDK) | `pnpm --filter @cobrai/service-notifications test` | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | D-03 SendGrid subuser | T-08-05 | Subuser API key stored encrypted on creation, never logged | integration (mocked fetch) | `pnpm --filter @cobrai/service-notifications test` | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | D-05 Vapi import | — | Tenant Twilio token sent only to Vapi over TLS, not persisted twice | integration (mocked) | `pnpm --filter @cobrai/service-notifications test` | ❌ W0 | ⬜ pending |
| TBD | 04 | 3 | D-12 provider/method | — | Existing rows readable post-migration; dispatch by `provider` | integration | `pnpm --filter @cobrai/service-payments test` | ✅ extend | ⬜ pending |
| TBD | 04 | 3 | D-06/D-13 gateways | T-08-06 | Per-provider signature verification; no gateway key in logs | unit (mocked HTTP) | `pnpm --filter @cobrai/service-payments test` | ❌ W0 | ⬜ pending |
| TBD | 05 | 3 | D-19/D-20 webhooks | T-08-07 | Missing secret → 401 (fail closed); unknown token → 404, no tenant leak | integration | `pnpm --filter @cobrai/service-payments test` | ❌ W0 | ⬜ pending |
| TBD | 05 | 3 | D-18 seed migration | — | Idempotent: re-running produces no duplicate rows | integration | `pnpm --filter @cobrai/db test` | ❌ W0 | ⬜ pending |
| TBD | 06 | 4 | D-23/D-24/D-26 UI | T-08-08 | Secret fields render last-4 only; never echo full value to the DOM | component (RTL) | `pnpm --filter @cobrai/web test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Task IDs are filled in by the planner once PLAN.md files exist; wave assignments above are the expected shape, not a contract.

---

## Wave 0 Requirements

- [ ] `packages/utils/src/crypto/envelope-encryption.spec.ts` — round-trip, wrong `keyVersion`, tampered ciphertext
- [ ] `apps/service-notifications/src/integrations/tenant-integration.service.spec.ts` — cache hit/miss/expiry, unverified status returns null
- [ ] `apps/service-notifications/src/integrations/twilio-provisioning.service.spec.ts` — mocked subaccount + Senders API
- [ ] `apps/service-notifications/src/integrations/sendgrid-provisioning.service.spec.ts` — mocked subuser + API key + domain auth
- [ ] `apps/service-notifications/src/integrations/vapi-provisioning.service.spec.ts` — mocked import call
- [ ] `apps/service-payments/src/gateways/*.gateway.spec.ts` — one per new provider (Stripe, Wompi, PayU, ePayco, external_link; Mercado Pago extends existing)
- [ ] `apps/web/components/settings/integrations/*.test.tsx` — RTL for the four panels, following the Phase 4 precedent
- [ ] Boot-guard test for D-17 — no existing harness covers bootstrap assertions; test the guard function in isolation rather than booting Nest

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Twilio ISV enrollment + Embedded Signup end-to-end | D-02, D-25 | Requires live ISV program access and a real Meta Business Manager account; no sandbox reproduces the popup flow | Enrol in the Tech Provider program, run Embedded Signup against a test Meta Business, confirm the WABA lands on the tenant's subaccount |
| Real SendGrid subuser creation + domain authentication | D-03 | Requires the live parent account at Pro tier or above; CNAME validation depends on real DNS propagation | Create a subuser against the real account, publish the CNAMEs on a test domain, poll validation until it passes |
| Real Vapi number import | D-05 | Requires a real Twilio number and the live Vapi account | Import a test number, place one outbound call, confirm the caller ID is the tenant's number |
| One real sandbox transaction per gateway | D-06 | Each provider's sandbox needs real merchant credentials that cannot live in CI | Stripe, Wompi, PayU, ePayco and Mercado Pago each: create a link, pay it in sandbox, confirm the webhook lands and reconciles |
| Inbound email on a tenant-owned domain | D-22 | Depends on the tenant's real MX records pointing at SendGrid Inbound Parse | Point a test domain's MX at Inbound Parse, reply to an outbound message, confirm the agent responds from that domain |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest run`, never `vitest --watch`)
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
