import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";

export interface SendgridSubuser {
  username: string;
  userId: number;
  apiKey: string;
}

export interface DnsRecord {
  type: "CNAME";
  host: string;
  value: string;
  verified: boolean;
}

export interface AuthenticatedDomain {
  domainId: number;
  records: DnsRecord[];
  valid: boolean;
}

const SENDGRID_BASE_URL = "https://api.sendgrid.com/v3";
// SendGrid does not document a subuser username length limit in
// 08-PROVIDER-CONTRACTS.md; 50 chars is a defensive bound (mirrors
// TwilioProvisioningService's 64-char friendlyName truncation) so a retry
// with the same tenant id always derives the same, valid username.
const SUBUSER_USERNAME_MAX_LENGTH = 50;

interface SendGridSubuserResponse {
  username: string;
  user_id: number;
}

interface SendGridApiKeyResponse {
  api_key: string;
}

interface SendGridDnsEntry {
  valid?: boolean;
  type?: string;
  host?: string;
  data?: string;
}

interface SendGridDomainResponse {
  id: number;
  domain?: string;
  valid?: boolean;
  dns?: Record<string, SendGridDnsEntry>;
}

/**
 * Provisions a tenant's own SendGrid subuser, a subuser-scoped API key, and
 * domain authentication (D-03). Call shapes are taken verbatim from
 * `08-PROVIDER-CONTRACTS.md` `## SendGrid` — RESEARCH.md Pitfall 5 documents
 * that guessing the domain-authentication call shape produces a domain that
 * looks authenticated in the parent dashboard while the subuser's sends
 * still fail domain checks, so nothing here is improvised.
 *
 * Structurally mirrors `TwilioProvisioningService`: an `@Injectable()`
 * caching only the process-global parent credential, raw `fetch` replicating
 * `email.adapter.ts`'s header/body/error shape, and provider failures
 * surfaced as a thrown error carrying the provider's own text, never a
 * credential.
 */
@Injectable()
export class SendgridProvisioningService {
  private readonly logger = new Logger(SendgridProvisioningService.name);
  // The parent SendGrid account is genuinely process-global — safe to cache,
  // unlike a tenant's own credentials, which are always per-call arguments.
  private readonly parentApiKey: string;

  constructor(config: ConfigService) {
    this.parentApiKey = config.get<string>("SENDGRID_PARENT_API_KEY") ?? "";
  }

  /**
   * Deterministic subuser username for `tenantId` — a retry finds the same
   * subuser instead of creating a second one (T-08-11f).
   */
  subuserUsername(tenantId: string): string {
    return `tenant-${tenantId}`.slice(0, SUBUSER_USERNAME_MAX_LENGTH);
  }

  /**
   * `POST /v3/subusers` (parent key, no `On-Behalf-Of` — the subuser doesn't
   * exist yet) followed by `POST /v3/api_keys` (parent key + `On-Behalf-Of`,
   * the only call in this service that uses it) to mint a subuser-scoped key.
   *
   * The generated password is used once, in the create-subuser request body,
   * and discarded immediately after — it is never returned, logged, or
   * assigned to any field this class retains (T-08-11e).
   *
   * `ips` is required by the create-subuser call per `08-PROVIDER-CONTRACTS.md`,
   * but the document does not resolve which IP(s) a Pro-tier account without
   * dedicated IPs should send — resolved here as `[]` (shared-IP pool),
   * flagged in the plan's SUMMARY as an operational detail to confirm once
   * this path is exercised against the live account.
   */
  async createSubuser(tenantId: string, adminEmail: string): Promise<SendgridSubuser> {
    const username = this.subuserUsername(tenantId);
    const password = randomBytes(24).toString("base64url");

    try {
      const response = await fetch(`${SENDGRID_BASE_URL}/subusers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.parentApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: adminEmail, password, ips: [] })
      });
      if (!response.ok) {
        const detail = await response.text();
        this.logger.error(`SendGrid subuser creation failed for tenant=${tenantId}: ${detail}`);
        // 401/403 mean the platform's own key cannot manage subusers at all
        // (wrong scopes, or an account below the tier that offers them). That
        // is a platform-wide fact, not something this tenant did, and the
        // caller can still authenticate their domain on the parent account —
        // so it is signalled distinctly rather than as a generic outage.
        if (response.status === 401 || response.status === 403) {
          throw new SubusersUnavailableError(detail);
        }
        throw new ServiceUnavailableException(detail);
      }

      const created = (await response.json()) as SendGridSubuserResponse;
      const apiKey = await this.createSubuserApiKey(created.username);
      return { username: created.username, userId: created.user_id, apiKey };
    } catch (err) {
      if (err instanceof SubusersUnavailableError) throw err;
      if (err instanceof ServiceUnavailableException) throw err;
      const message = this.extractMessage(err);
      this.logger.error(`SendGrid subuser creation could not reach the provider for tenant=${tenantId}: ${message}`);
      throw new ServiceUnavailableException(`SendGrid: ${message}`);
    }
  }

  private async createSubuserApiKey(subuserUsername: string): Promise<string> {
    const response = await fetch(`${SENDGRID_BASE_URL}/api_keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.parentApiKey}`,
        "On-Behalf-Of": subuserUsername,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: `cobrai-${subuserUsername}` })
    });
    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`SendGrid subuser API key creation failed for subuser=${subuserUsername}: ${detail}`);
      throw new ServiceUnavailableException(detail);
    }
    const data = (await response.json()) as SendGridApiKeyResponse;
    return data.api_key;
  }

  /**
   * `POST /v3/whitelabel/domains` (create) then `POST
   * /v3/whitelabel/domains/{domain_id}/subuser` (associate) — both
   * parent-authenticated, neither uses `On-Behalf-Of`
   * (`08-PROVIDER-CONTRACTS.md` Open Question 2 resolution: this is
   * documented as a parent-then-associate flow, not an `On-Behalf-Of`-scoped
   * variant, which does not exist for domain authentication).
   */
  /**
   * Authenticates the tenant's domain and returns the CNAMEs they must publish.
   *
   * `subuserUsername` is optional: the domain creation call is what signs their
   * mail, and it runs on the parent account regardless. The association step
   * only moves that authenticated domain under a subuser, so when there is no
   * subuser it is skipped rather than failing the whole connection.
   */
  async authenticateDomain(
    subuserUsername: string | undefined,
    domain: string
  ): Promise<AuthenticatedDomain> {
    try {
      const createResponse = await fetch(`${SENDGRID_BASE_URL}/whitelabel/domains`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.parentApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ domain, automatic_security: true })
      });
      if (!createResponse.ok) {
        const detail = await createResponse.text();
        this.logger.error(`SendGrid domain authentication failed for domain=${domain}: ${detail}`);
        throw new ServiceUnavailableException(detail);
      }
      const created = (await createResponse.json()) as SendGridDomainResponse;

      if (subuserUsername) {
        const associateResponse = await fetch(
          `${SENDGRID_BASE_URL}/whitelabel/domains/${created.id}/subuser`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.parentApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ username: subuserUsername })
          }
        );
        if (!associateResponse.ok) {
          const detail = await associateResponse.text();
          this.logger.error(`SendGrid domain-subuser association failed for domain=${domain}: ${detail}`);
          throw new ServiceUnavailableException(detail);
        }
      }

      return this.toAuthenticatedDomain(created);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const message = this.extractMessage(err);
      this.logger.error(`SendGrid domain authentication could not reach the provider for domain=${domain}: ${message}`);
      throw new ServiceUnavailableException(`SendGrid: ${message}`);
    }
  }

  /**
   * Re-checks a previously authenticated domain. `POST
   * /v3/whitelabel/domains/{domain_id}/validate` triggers the re-check, but
   * `08-PROVIDER-CONTRACTS.md` records its response shape as out of scope —
   * so this method does not trust that response body for the returned
   * records. Instead it re-fetches the domain resource via `GET
   * /v3/whitelabel/domains/{domain_id}`, which reuses the exact shape the
   * contract sheet does verify (the same `dns`/`valid` shape as call 3/4's
   * response).
   */
  async validateDomain(subuserUsername: string, domainId: number): Promise<AuthenticatedDomain> {
    try {
      const validateResponse = await fetch(`${SENDGRID_BASE_URL}/whitelabel/domains/${domainId}/validate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.parentApiKey}` }
      });
      if (!validateResponse.ok) {
        const detail = await validateResponse.text();
        this.logger.error(
          `SendGrid domain validation failed for subuser=${subuserUsername} domainId=${domainId}: ${detail}`
        );
        throw new ServiceUnavailableException(detail);
      }

      const domainResponse = await fetch(`${SENDGRID_BASE_URL}/whitelabel/domains/${domainId}`, {
        headers: { Authorization: `Bearer ${this.parentApiKey}` }
      });
      if (!domainResponse.ok) {
        const detail = await domainResponse.text();
        this.logger.error(`SendGrid domain re-fetch failed for domainId=${domainId}: ${detail}`);
        throw new ServiceUnavailableException(detail);
      }

      const data = (await domainResponse.json()) as SendGridDomainResponse;
      return this.toAuthenticatedDomain(data);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const message = this.extractMessage(err);
      this.logger.error(`SendGrid domain validation could not reach the provider for domainId=${domainId}: ${message}`);
      throw new ServiceUnavailableException(`SendGrid: ${message}`);
    }
  }

  /** Deletes a tenant's subuser. Used on tenant offboarding; not part of any connect flow. */
  async deleteSubuser(subuserUsername: string): Promise<void> {
    try {
      const response = await fetch(`${SENDGRID_BASE_URL}/subusers/${subuserUsername}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.parentApiKey}` }
      });
      if (!response.ok && response.status !== 404) {
        const detail = await response.text();
        this.logger.error(`SendGrid subuser deletion failed for subuser=${subuserUsername}: ${detail}`);
        throw new ServiceUnavailableException(detail);
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const message = this.extractMessage(err);
      this.logger.error(`SendGrid subuser deletion could not reach the provider for subuser=${subuserUsername}: ${message}`);
      throw new ServiceUnavailableException(`SendGrid: ${message}`);
    }
  }

  /**
   * Maps a `dns` object (`mail_cname`/`dkim1`/`dkim2`) into the `DnsRecord[]`
   * shape the frontend's `DnsRecordsTable` renders — `type`, `host`,
   * `value`, and a per-record `verified` flag are all required (a record
   * missing its validity flag breaks that UI).
   */
  private toAuthenticatedDomain(data: SendGridDomainResponse): AuthenticatedDomain {
    const dnsEntries = Object.values(data.dns ?? {});
    const records: DnsRecord[] = dnsEntries.map((entry) => ({
      type: "CNAME",
      host: entry.host ?? "",
      value: entry.data ?? "",
      verified: Boolean(entry.valid)
    }));
    return { domainId: data.id, records, valid: Boolean(data.valid) };
  }

  /** Extracts a fetch/network error's message, never the request body or credentials. */
  private extractMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message);
    }
    return "Error desconocido de SendGrid";
  }
}

/**
 * The platform's SendGrid account cannot create subusers — its key lacks the
 * scope, or the plan does not include them.
 *
 * Distinct from a generic provisioning failure because it is recoverable: the
 * tenant's domain can still be authenticated on the parent account, which is
 * what actually signs their mail. Only the per-tenant isolation is lost.
 */
export class SubusersUnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "SubusersUnavailableError";
  }
}
