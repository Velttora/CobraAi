import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IntegrationMode } from "@cobrai/db";
import { PROVIDER_CHANNEL, TenantIntegrationService } from "@cobrai/integrations";
import type { IntegrationView } from "@cobrai/integrations";
import { SendgridProvisioningService } from "./sendgrid-provisioning.service";
import type { DnsRecord } from "./sendgrid-provisioning.service";

/**
 * Orchestrates the managed (subuser + domain authentication) and BYO
 * (pasted API key) email connection flows into a single persisted
 * `sendgrid` `TenantIntegration` row (D-01).
 *
 * D-22: `replyDomain` is the single source of truth both the outbound
 * `Reply-To` header (plan 08-10's `EmailAdapter`) and the inbound
 * acceptance check (plan 08-13's inbound handler) read — it must never be
 * derived independently in either of those places.
 */
@Injectable()
export class EmailConnectService {
  private readonly baseWebhookUrl: string;

  constructor(
    private readonly sendgridProvisioning: SendgridProvisioningService,
    private readonly tenantIntegrations: TenantIntegrationService,
    config: ConfigService
  ) {
    this.baseWebhookUrl = config.get<string>("PUBLIC_WEBHOOK_BASE_URL") ?? "";
  }

  /**
   * Reuses an existing subuser (found via the non-status-gated `resolveAny`,
   * since a `pending_dns`/`failed` row is not `verified`) instead of
   * provisioning a second one (T-08-11f), then authenticates the domain and
   * persists a verdict derived from `AuthenticatedDomain.valid` — the
   * single `upsert` call below only runs once the provisioning outcome
   * (success or failure) is known, so a half-written `verified` row is
   * never produced.
   */
  async connectManaged(input: {
    tenantId: string;
    domain: string;
    fromEmail: string;
    fromName: string;
    adminEmail: string;
    replyDomain?: string;
  }): Promise<IntegrationView> {
    const existing = await this.tenantIntegrations.resolveAny(input.tenantId, "sendgrid");
    const replyDomain = input.replyDomain ?? `reply.${input.domain}`;
    let subuserUsername = existing?.publicConfig["subuserUsername"];
    let secrets: Record<string, string> = {};

    try {
      if (!subuserUsername) {
        const subuser = await this.sendgridProvisioning.createSubuser(input.tenantId, input.adminEmail);
        subuserUsername = subuser.username;
        secrets = { apiKey: subuser.apiKey };
      }

      const authenticated = await this.sendgridProvisioning.authenticateDomain(subuserUsername, input.domain);

      return this.tenantIntegrations.upsert({
        tenantId: input.tenantId,
        provider: "sendgrid",
        mode: "managed",
        publicConfig: this.withDnsRecords(
          {
            domain: input.domain,
            fromEmail: input.fromEmail,
            fromName: input.fromName,
            replyDomain,
            subuserUsername,
            domainId: String(authenticated.domainId)
          },
          authenticated.records
        ),
        secrets,
        overrideStatus: authenticated.valid
          ? { status: "verified", failureMessage: null, verifiedAt: new Date() }
          : { status: "pending_dns", failureMessage: null },
        baseWebhookUrl: this.baseWebhookUrl
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido de SendGrid";
      return this.tenantIntegrations.upsert({
        tenantId: input.tenantId,
        provider: "sendgrid",
        mode: "managed",
        publicConfig: {
          domain: input.domain,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          replyDomain,
          ...(subuserUsername ? { subuserUsername } : {})
        },
        secrets,
        overrideStatus: { status: "failed", failureMessage: message },
        baseWebhookUrl: this.baseWebhookUrl
      });
    }
  }

  /** D-01 BYO path: no subuser is ever created. The shared `sendgrid` verifier (packages/integrations/src/verifiers) decides the verdict. */
  async connectByo(input: {
    tenantId: string;
    apiKey: string;
    fromEmail: string;
    fromName: string;
    domain: string;
    replyDomain?: string;
  }): Promise<IntegrationView> {
    return this.tenantIntegrations.upsert({
      tenantId: input.tenantId,
      provider: "sendgrid",
      mode: "byo",
      publicConfig: {
        domain: input.domain,
        fromEmail: input.fromEmail,
        fromName: input.fromName,
        replyDomain: input.replyDomain ?? `reply.${input.domain}`
      },
      secrets: { apiKey: input.apiKey },
      baseWebhookUrl: this.baseWebhookUrl
    });
  }

  /**
   * Backs the UI's `Ya los publiqué, verificar` button and its 15s poll.
   * Reads through `resolveAny` (a `pending_dns` row is not `verified`, so
   * the plain `resolve` would miss it). A row with a known
   * subuser/domain pair is re-checked directly against SendGrid; anything
   * else (BYO, or a managed row that never reached domain authentication)
   * falls back to the shared verifier via a plain re-`upsert`, mirroring
   * `connectByo`.
   */
  async recheckDns(tenantId: string): Promise<IntegrationView> {
    const stored = await this.tenantIntegrations.resolveAny(tenantId, "sendgrid");
    if (!stored) {
      return {
        provider: "sendgrid",
        channel: PROVIDER_CHANNEL.sendgrid,
        mode: "managed" as IntegrationMode,
        status: "not_configured",
        verifiedAt: null,
        failureMessage: null,
        publicConfig: {},
        secrets: [],
        webhookUrl: null
      };
    }

    const subuserUsername = stored.publicConfig["subuserUsername"];
    const domainId = stored.publicConfig["domainId"];

    if (!subuserUsername || !domainId) {
      return this.tenantIntegrations.upsert({
        tenantId,
        provider: "sendgrid",
        mode: stored.mode,
        publicConfig: stored.publicConfig,
        secrets: {},
        baseWebhookUrl: this.baseWebhookUrl
      });
    }

    const authenticated = await this.sendgridProvisioning.validateDomain(subuserUsername, Number(domainId));

    return this.tenantIntegrations.upsert({
      tenantId,
      provider: "sendgrid",
      mode: stored.mode,
      publicConfig: this.withDnsRecords(stored.publicConfig, authenticated.records),
      secrets: {},
      overrideStatus: authenticated.valid
        ? { status: "verified", failureMessage: null, verifiedAt: new Date() }
        : { status: "pending_dns", failureMessage: null },
      baseWebhookUrl: this.baseWebhookUrl
    });
  }

  /**
   * `publicConfig` is a JSON blob at rest; `dnsRecords` is deliberately a
   * structured array here even though the type signature is loosely
   * `Record<string, string>` for the common scalar-config case (mirrors
   * `verifySendGrid` in `packages/integrations/src/verifiers/index.ts`).
   */
  private withDnsRecords(config: Record<string, string>, records: DnsRecord[]): Record<string, string> {
    return { ...config, dnsRecords: records } as unknown as Record<string, string>;
  }
}
