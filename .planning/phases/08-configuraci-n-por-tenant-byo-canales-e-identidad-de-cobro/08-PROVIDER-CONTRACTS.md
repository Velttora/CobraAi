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

## Vapi

**Source:** the live Vapi OpenAPI/Swagger document served directly by the Vapi API at `https://api.vapi.ai/api-json` (fetched in this session, HTTP 200). This is the API's own machine-generated contract, not a doc-page summary — treated as primary source, one level more authoritative than `docs.vapi.ai` (which renders from the same spec).

### Endpoint

**Claim:** `POST https://api.vapi.ai/phone-number` imports/creates a phone number; server base URL is `https://api.vapi.ai` (`servers[0].url` in the spec) and the operation's `security` requirement is `[{ bearer: [] }]`.

**Confidence:** CITED (`https://api.vapi.ai/api-json`, `paths./phone-number.post`).

### Request body (Twilio import variant)

The request body is a discriminated union on the `provider` field (`oneOf` with `discriminator.propertyName: "provider"`). For importing a Twilio-owned number, the schema is `CreateTwilioPhoneNumberDTO`, selected via `provider: "twilio"`.

**Full field list** (from `components.schemas.CreateTwilioPhoneNumberDTO`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `provider` | `"twilio"` (enum, single value) | yes | discriminator |
| `number` | string | yes | the E.164-ish digits of the Twilio-owned number |
| `twilioAccountSid` | string | yes | |
| `twilioAuthToken` | string | **no** | alternative to API-key auth below — RESEARCH.md A2 assumed this was required; the spec marks only `provider`, `number`, `twilioAccountSid` as required |
| `twilioApiKey` / `twilioApiSecret` | string / string | no | alternative auth pair to `twilioAuthToken` (API Key SID + Secret instead of Account SID + Auth Token) — not mentioned in RESEARCH.md's assumption, discovered from the live spec |
| `name` | string (max 40 chars) | no | Vapi-side display label only |
| `assistantId` | string | no | attaches an assistant to inbound calls on this number |
| `workflowId` / `squadId` | string / string | no | alternative routing targets to `assistantId` |
| `server` | object (`$ref: Server`) | no | webhook/server URL for inbound calls; overridden by `assistant.server` if set (documented precedence: assistant.server > phoneNumber.server > org.server) |
| `fallbackDestination` | object | no | where to route an inbound call if no assistant/squad/workflow is set and the `assistant-request` webhook fails |
| `hooks` | array | no | call-ringing / call-ending hooks |
| `smsEnabled` | boolean (default `true`) | no | whether Vapi also takes over the Twilio number's **messaging** webhook URL during import — importing a number can silently repoint SMS webhooks too unless this is explicitly set to `false` |

**Correction to RESEARCH.md A2:** the assumed field set (`provider`, `number`, `twilioAccountSid`, `twilioAuthToken`) is correct in **naming** but wrong in **required-ness** — `twilioAuthToken` is optional (an API-key pair can be used instead), and `smsEnabled` (defaulting to `true`) is an undocumented-in-research side effect plan 08-08 must account for: importing a number without `smsEnabled: false` will also move that number's Twilio messaging webhook to Vapi, which could silently break the existing WhatsApp/SMS Twilio webhook wiring for that same number if it's shared. Since D-05 imports the tenant's **voice** number and the tenant's WhatsApp sender is a separate resource (see `## Twilio` above — WhatsApp goes through `channelsSenders`, not a plain Twilio phone number's SMS webhook), this is likely a non-issue for D-05's flow, but plan 08-08 should set `smsEnabled: false` explicitly and record why, rather than relying on the default.

**Confidence:** CITED (same spec location, `components.schemas.CreateTwilioPhoneNumberDTO`).

### Response

**Claim:** the response is the created `TwilioPhoneNumber` resource; the field that becomes the per-tenant `vapiPhoneNumberId` (D-05) is `id`.

**Evidence:** `paths./phone-number.post.responses.201` references a `oneOf` discriminated by `provider`, mapping `"twilio" → #/components/schemas/TwilioPhoneNumber`. `components.schemas.TwilioPhoneNumber.required` = `["provider", "id", "orgId", "createdAt", "updatedAt", "number", "twilioAccountSid"]`. `id` (type `string`) is documented as "the unique identifier for the phone number" — this is the value to persist as `vapiPhoneNumberId`. Additional response fields of note: `status`, `name`, `orgId`.

**Confidence:** CITED (same spec, `components.schemas.TwilioPhoneNumber`).

### Authentication (D-04 confirmation)

The `/phone-number` POST operation's `security` requirement in the spec is `[{ bearer: [] }]` — a single platform-level Bearer token. There is no per-tenant credential field in the request body for *authenticating to Vapi itself* (the `twilioAccountSid`/`twilioAuthToken`/`twilioApiKey`/`twilioApiSecret` fields authenticate the **imported number** to Twilio, not the caller to Vapi). This confirms D-04: the caller authenticates with the platform's `VAPI_API_KEY` as a Bearer token, and no per-tenant Vapi credential is ever stored — the only "per-tenant" data flowing to Vapi is the tenant's own Twilio subaccount credentials, passed once at import time, and the resulting `id` persisted back.

---

## SendGrid

**Sources:** Twilio/SendGrid's own official docs pages, fetched directly in this session and their embedded Next.js payload (`__NEXT_DATA__` → `props.pageProps.source.compiledSource`, which contains the literal request/response examples the rendered page displays — the raw server-rendered HTML alone is a hydration shell and does not contain this text). Four pages were fetched:
- `https://www.twilio.com/docs/sendgrid/api-reference/subusers-api/create-subuser` (200)
- `https://www.twilio.com/docs/sendgrid/for-developers/sending-email/automating-subusers/` (301 → 200, redirects to the same path without trailing slash)
- `https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/authenticate-a-domain` (200)
- `https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/associate-an-authenticated-domain-with-a-subuser` (200)

### Provisioning calls

| # | Call | Method + Path | Authenticating key | `On-Behalf-Of` used? |
|---|------|----------------|---------------------|------------------------|
| 1 | Create subuser | `POST /v3/subusers` | Parent API key (`Authorization: Bearer <parent key>`) | No — the subuser doesn't exist yet, so there's nothing to act "on behalf of" |
| 2 | Create subuser-scoped API key | `POST /v3/api_keys` | Parent API key | **Yes** — `Authorization: Bearer PARENT_APIKEY_HERE` + `On-Behalf-Of: <subuser_username>` header; body `{"name": "API KEY NAME"}` |
| 3 | Authenticate a domain | `POST /v3/whitelabel/domains` | Parent API key | **No** — every fetched example (the dedicated API reference page and the step-by-step "Automate Adding Subusers" guide) authenticates this call with the parent's own `Authorization: Bearer $SENDGRID_API_KEY` and never includes an `On-Behalf-Of` header |
| 4 | Associate an authenticated domain with a subuser | `POST /v3/whitelabel/domains/{domain_id}/subuser` | Parent API key | No — body is `{"username": "<subuser_username>"}`, authenticated with the parent's own Bearer key, same as call 3 |

**Field-level evidence for each row:**
- Call 1 body (required): `username`, `email`, `password`, `ips` (array) — from `create-subuser` page's request-body example. Response includes `username`, `user_id`, `email`, `credit_allocation`, `region`.
- Call 2: curl example literally reads `curl -X POST -H "Authorization: Bearer PARENT_APIKEY_HERE" -H "On-Behalf-Of: examplecurltesting" ... 'https://api.sendgrid.com/v3/api_keys'` — from the "Automate Adding Subusers" guide.
- Call 3 body: `domain`, `subdomain`, `username` (target subuser — see resolution below), `ips`, `custom_spf`, `default`, `automatic_security`, `custom_dkim_selector` — from `authenticate-a-domain` reference page.
- Call 4 body/response: request `{"username": "jdoe"}`; response includes the full domain resource (`id`, `domain`, `subdomain`, `username`, `user_id`, `ips`, `valid`, `dns{...}`) — from `associate-an-authenticated-domain-with-a-subuser` reference page.

### Open Question 2 — resolution

**Question:** does the domain-authentication step itself (the one producing the CNAME records) happen (a) directly under the subuser via a parent key + `On-Behalf-Of` header, or (b) at the parent level followed by a separate association call?

**Resolution: (b).** Every fetched primary source — the dedicated `authenticate-a-domain` API reference page (no `On-Behalf-Of` mentioned in its Authentication/Headers sections or any of its 7 language code samples) and the "Automate Adding Subusers" step-by-step guide's own "Domain Authentication for the Subuser" section — performs domain authentication (`POST /v3/whitelabel/domains`) at the **parent** level with the parent's own key, with an optional `username` field in the body that appears to already tag the resulting domain record with a subuser's username at creation time. This is then followed, in the guide's own recommended flow, by a **separate** `POST /v3/whitelabel/domains/{domain_id}/subuser` call to explicitly associate the domain with the subuser. Neither call uses `On-Behalf-Of` at any point. **Plan 08-09 must implement call 3 (create) followed by call 4 (associate) at the parent-authenticated level — not an `On-Behalf-Of`-scoped variant, which is not documented to exist for domain authentication.**

This also resolves RESEARCH.md Pitfall 5's ambiguity: for the domain-authentication flow specifically, both calls (3 and 4) are parent-authenticated; `On-Behalf-Of` is used only for call 2 (the subuser-scoped API key), not for domain authentication.

### CNAME records produced

**Claim:** domain authentication produces CNAME records the tenant must publish, exposed under the response's `dns` object.

**Evidence** (identical shape shown in both the `authenticate-a-domain` and `automating-subusers` fetched examples):
```json
"dns": {
  "mail_cname": { "valid": true, "type": "cname", "host": "mail.example.com", "data": "u7.wl.sendgrid.net" },
  "dkim1":      { "valid": true, "type": "cname", "host": "s1._domainkey.example.com", "data": "s1._domainkey.u7.wl.sendgrid.net" },
  "dkim2":      { "valid": true, "type": "cname", "host": "s2._domainkey.example.com", "data": "s2._domainkey.u7.wl.sendgrid.net" }
}
```
**Record count: 3** (`mail_cname`, `dkim1`, `dkim2`), each an object with `type` (always `"cname"` in every example seen), `host` (what the tenant publishes as the CNAME record name), `data` (what the tenant publishes as the CNAME record value/target), and `valid` (boolean — flips to `true` once the tenant's DNS provider propagates the record and SendGrid re-checks it, e.g. via `POST /v3/whitelabel/domains/{id}/validate`, seen in the same fetched guide but not itself part of this plan's required contract).

**Confidence:** CITED for all SendGrid claims above (source URLs listed at the top of this section); none are UNRESOLVED.

**Credential check:** no real SendGrid API key, subuser password, or account identifier appears anywhere in this section — all examples above are the provider's own placeholder/documentation values (`example.com`, `johns_password`, `PARENT_APIKEY_HERE`, etc.), reproduced verbatim from the fetched docs.

---

