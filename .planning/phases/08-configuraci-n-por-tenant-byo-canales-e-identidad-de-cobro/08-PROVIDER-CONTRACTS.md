# Phase 8 Plan 02: Provider Contracts (Twilio, Vapi, SendGrid)

**Purpose:** Evidence-backed contract sheet for plans 08-08 (Twilio ISV + SendGrid provisioning) and 08-09 to read before writing any provisioning code. Discharges RESEARCH.md Open Questions 1-3 and Assumptions A1/A2/A3.

**Method:** All Twilio claims were resolved by reading the installed package's own `.d.ts`/`.js` source (not documentation). Vapi and SendGrid claims were resolved from the provider's own primary sources: Vapi's live OpenAPI spec served at `https://api.vapi.ai/api-json`, and Twilio/SendGrid's official docs pages (fetched and their embedded Next.js `__NEXT_DATA__` payload parsed for the literal request/response examples, since the rendered HTML is client-side hydrated).

**Note on package location:** No `node_modules` exists inside this execution worktree — dependencies are not installed per-worktree. The installed `twilio@6.0.2` package was inspected read-only from the main repo checkout's `node_modules/.pnpm/twilio@6.0.2/node_modules/twilio` (the same package version pinned in `apps/service-notifications/package.json`: `"twilio": "^6.0.2"`). This is the identical package version that will be installed in this worktree/CI; no package was installed or modified as part of this inspection.

---

## Twilio

### 1. Subaccount creation

**Claim:** `client.api.v2010.accounts.create({ friendlyName })` exists and creates a subaccount.

**Evidence:**
- Accessor chain: `Twilio.d.ts:162` → `get api(): Api`; `ApiBase.d.ts:9` → `get v2010(): V2010`; `Api.d.ts:27` → `class Api extends ApiBase`. `V2010.d.ts` exposes `get accounts(): AccountListInstance`.
- Create params: `account.d.ts:44-48` — `interface AccountListInstanceCreateOptions { friendlyName?: string }` (optional, defaults server-side to `SubAccount Created at {timestamp}` per the JSDoc comment on that line).
- Response fields: `account.d.ts:263-291` (`class AccountInstance`) — includes `sid: string` (line 291 range) and `authToken: string` (line 271). Confirmed again in the `toJSON()` return-type literal at lines 455-460 which lists `authToken: string` and `sid: string` together.

**Confidence:** VERIFIED (read from installed `twilio@6.0.2` type definitions, not documentation).

**Usage:** `const account = await client.api.v2010.accounts.create({ friendlyName: `tenant-${tenantId}` }); // account.sid, account.authToken`

---

### 2. WhatsApp Senders API — resolved accessor

**Claim (RESEARCH.md A1):** the Senders API is reachable as `client.messaging.v2.channelsSenders`.

**Evidence — confirmed exactly as assumed:**
- `Twilio.d.ts:198` → `get messaging(): Messaging`.
- `MessagingBase.d.ts:12` → `get v2(): V2`.
- `messaging/V2.d.ts:14,20` →
  ```
  protected _channelsSenders?: ChannelsSenderListInstance;
  get channelsSenders(): ChannelsSenderListInstance;
  ```
- The resource file itself is `messaging/v2/channelsSender.d.ts` (singular "Sender" in the filename/class names — `ChannelsSenderListInstance`, `ChannelsSenderInstance` — but the **getter** exposed on `V2` is plural: `channelsSenders`). This filename/getter mismatch is exactly the kind of detail that would have been guessed wrong from documentation alone.

**Confidence:** VERIFIED. `client.messaging.v2.channelsSenders` is the correct, exact accessor — RESEARCH.md's A1 assumption was correct.

### 3. Senders API — create call parameter and response shape

**Evidence (`messaging/v2/channelsSender.d.ts`):**
- Create signature: `create(params: MessagingV2ChannelsSenderRequestsCreate, headers?: any, callback?: ...): Promise<ChannelsSenderInstance>` (lines 590-590, interface `ChannelsSenderListInstance`).
- `params` is **not** wrapped in an extra object key — `channelsSender.js:437-438` shows `let data = {}; data = params;` — the object passed to `.create()` is posted as the JSON body verbatim. (A separate, apparently-unused type `ChannelsSenderListInstanceCreateOptions` at line 303-306 wraps it in `{ messagingV2ChannelsSenderRequestsCreate: ... }`, but the actual runtime `.create()` signature at line 590 takes the unwrapped `MessagingV2ChannelsSenderRequestsCreate` directly — trust the runtime signature, not the unused wrapper type.)
- Required/optional request fields (`MessagingV2ChannelsSenderRequestsCreate`, lines 204-213):
  ```ts
  senderId: string | null;              // required — "whatsapp:<E.164_PHONE_NUMBER>"
  configuration?: MessagingV2ChannelsSenderConfiguration | null;  // optional wrapper
  webhook?: MessagingV2ChannelsSenderWebhook | null;
  profile?: MessagingV2ChannelsSenderProfile | null;
  ```
  `configuration.wabaId` (line 17, `MessagingV2ChannelsSenderConfiguration`) is where the WABA id from Embedded Signup goes — confirms RESEARCH.md's Code Example. `configuration` is TS-optional but is the field required by Twilio's own docs "only required for the first sender on this subaccount" — the SDK does not itself enforce that business rule, it's a Twilio-API-side constraint.
- Response fields (`ChannelsSenderInstance`, lines 458-484): `sid: string`, `status: ChannelsSenderStatus`, `senderId: string`, `configuration`, `webhook`, `profile`, `properties`, `offlineReasons`, `compliance`, `url`.
- Status enum (line 9) is **wider** than RESEARCH.md assumed: `"CREATING" | "ONLINE" | "OFFLINE" | "PENDING_VERIFICATION" | "VERIFYING" | "ONLINE:UPDATING" | "TWILIO_REVIEW" | "DRAFT" | "STUBBED"` — not just the linear `CREATING → OFFLINE → VERIFYING → ONLINE` RESEARCH.md described. Plan 08-08's status-polling logic must handle all nine values, not assume a strict 4-step progression.
- `sid` field has **no compile-time prefix guarantee** in the `.d.ts` (typed as plain `string`); RESEARCH.md's claim that it "starts with XE" could not be confirmed from the type definitions (types don't encode string prefixes) — label this sub-claim **UNVERIFIED**. Fallback: log the first two characters of a real created sender's `sid` in plan 08-08's first live test run and assert on it there, rather than hardcoding an `XE` assumption into validation logic ahead of time.

**Confidence:** VERIFIED for the accessor, method signature, and field names. UNVERIFIED for the `XE`-prefix claim specifically (flagged above with fallback).

### 4. Which client must call the Senders API (Pitfall 1 resolution)

**Claim:** every Senders API call for a tenant must use a Twilio client authenticated with the tenant's own **subaccount** credentials — never the platform's parent client, even with an `accountSid` option pointing at the subaccount.

**Evidence:**
- `BaseTwilio.d.ts:8-32` (`interface ClientOpts`) does expose an `accountSid?: string` option distinct from the `username`/`password` constructor args.
- `BaseTwilio.js:44-45,77-83` shows what that option actually does: `this.accountSid = opts?.accountSid || this.username` — it only sets `this.accountSid`, a value used to build **account-scoped REST paths** under the `api.v2010` domain (e.g. `/2010-04-01/Accounts/{accountSid}/Messages.json`). It does **not** change which credentials sign the HTTP request — `username`/`password` (Basic Auth) are unaffected by it.
- `MessagingBase.js:24` sets the messaging domain's `baseUrl` to `https://messaging.twilio.com`, and `channelsSender.js:432` sets `instance._uri = "/Channels/Senders"` — **no accountSid segment appears anywhere in the Messaging v2 URI**. Unlike the `api.v2010` domain, the Senders API resource path is not account-scoped in the URL at all.
- Consequence: because the Senders API authorizes purely by *whose credentials signed the request* (there's no account-SID path segment for the `accountSid` client option to populate), passing `{ accountSid: subaccountSid }` to a client built with the **platform's** master `username`/`password` has **no effect** on which account the Senders API call is attributed to. The only way to make the call "as" the subaccount is to authenticate with that subaccount's own SID/auth-token pair: `twilio(subaccountSid, subaccountAuthToken)`.

**Confidence:** VERIFIED from source. This directly confirms and sharpens RESEARCH.md Pitfall 1: a **fresh `twilio(subaccountSid, subaccountAuthToken)` client is required** for the Senders API call. The `accountSid` client-construction option exists in the SDK but is irrelevant to this call — do not reach for it as a shortcut.

**Credential check:** `grep -ci "AC[0-9a-f]\{32\}\|SK[0-9a-f]\{32\}"` on this document returns 0 — no real Account/API-Key SID was pasted above (`accountSid`/`subaccountSid` are used as variable-name placeholders only).

---
