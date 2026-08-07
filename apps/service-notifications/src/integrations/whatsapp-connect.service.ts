import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IntegrationMode, IntegrationStatus } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import type { IntegrationView } from "@cobrai/integrations";
import { TwilioProvisioningService } from "./twilio-provisioning.service";
import { VapiProvisioningService } from "./vapi-provisioning.service";

/**
 * Orchestrates the managed (Embedded Signup) and BYO WhatsApp connection
 * flows end to end, producing the same persisted, verifiable
 * `twilio_whatsapp` + `twilio_voice` `TenantIntegration` state either way
 * (D-01).
 *
 * D-07 accepted risk: under the ISV model the account holder before Twilio
 * is the platform, and Twilio documents that a tenant's non-conforming
 * traffic can get the whole platform account suspended. Twilio's AUP
 * prohibits *third-party* debt collection; a tenant collecting its own
 * debt is first-party and does not fall there, but scrutiny still points
 * at the platform. The BYO path exists as the escape valve for
 * high-volume or high-risk tenants — this is a conscious, accepted risk,
 * not something to rediscover as a surprise later.
 */
@Injectable()
export class WhatsAppConnectService {
  private readonly baseWebhookUrl: string;

  constructor(
    private readonly twilioProvisioning: TwilioProvisioningService,
    private readonly vapiProvisioning: VapiProvisioningService,
    private readonly tenantIntegrations: TenantIntegrationService,
    config: ConfigService
  ) {
    this.baseWebhookUrl = config.get<string>("PUBLIC_WEBHOOK_BASE_URL") ?? "";
  }

  /**
   * D-25 managed path: the browser hands off Embedded Signup's output
   * (`wabaId`/`phoneNumberId`/`phoneNumberE164`). `phoneNumberId` is Meta's
   * own transient handle — it is accepted here only because the interface
   * contract declares it, never read or forwarded to any persisted field
   * or provider call (T-08-05): the Twilio Senders API call is built from
   * `wabaId` and `phoneNumberE164` alone.
   */
  async connectManaged(input: {
    tenantId: string;
    wabaId: string;
    phoneNumberId: string;
    phoneNumberE164: string;
    businessName: string;
  }): Promise<IntegrationView> {
    const subaccount = await this.twilioProvisioning.createSubaccount(input.tenantId, input.businessName);
    const fromNumber = toWhatsAppFrom(input.phoneNumberE164);

    // Persist first (skipVerification: no live check needed yet — the row's
    // real status is written below once the sender has actually been
    // registered) so upsert() mints the webhookToken this integration needs,
    // which toView() turns into the callback URL the Senders API requires.
    const placeholder = await this.tenantIntegrations.upsert({
      tenantId: input.tenantId,
      provider: "twilio_whatsapp",
      mode: "managed",
      publicConfig: { subaccountSid: subaccount.accountSid, wabaId: input.wabaId, businessName: input.businessName, fromNumber },
      secrets: { accountSid: subaccount.accountSid, authToken: subaccount.authToken },
      skipVerification: true,
      baseWebhookUrl: this.baseWebhookUrl
    });

    const senderResult = await this.twilioProvisioning.registerWhatsAppSender({
      subaccountSid: subaccount.accountSid,
      subaccountAuthToken: subaccount.authToken,
      wabaId: input.wabaId,
      phoneNumberE164: input.phoneNumberE164,
      businessName: input.businessName,
      webhookUrl: placeholder.webhookUrl ?? ""
    });

    const publicConfig: Record<string, string> = {
      subaccountSid: subaccount.accountSid,
      wabaId: input.wabaId,
      businessName: input.businessName,
      fromNumber
    };
    const overrideStatus =
      "error" in senderResult
        ? { status: "failed" as IntegrationStatus, failureMessage: senderResult.error }
        : mapSenderStatus(senderResult.status);
    if (!("error" in senderResult)) {
      publicConfig["senderSid"] = senderResult.senderSid;
    }

    const whatsappView = await this.tenantIntegrations.upsert({
      tenantId: input.tenantId,
      provider: "twilio_whatsapp",
      mode: "managed",
      publicConfig,
      secrets: { accountSid: subaccount.accountSid, authToken: subaccount.authToken },
      overrideStatus,
      baseWebhookUrl: this.baseWebhookUrl
    });

    // The subaccount and its number exist regardless of the sender registration
    // outcome, so voice provisioning proceeds independently — a WhatsApp failure
    // must not block a working voice channel, and vice versa (T-08-05e).
    await this.provisionVoice(input.tenantId, "managed", subaccount, input.phoneNumberE164);

    return whatsappView;
  }

  /** D-01 BYO path: the tenant pastes its own already-provisioned Twilio credentials. No subaccount is ever created. */
  async connectByo(input: {
    tenantId: string;
    accountSid: string;
    authToken: string;
    phoneNumberE164: string;
  }): Promise<IntegrationView> {
    const whatsappView = await this.tenantIntegrations.upsert({
      tenantId: input.tenantId,
      provider: "twilio_whatsapp",
      mode: "byo",
      // `phoneNumberE164` is stored alongside `fromNumber` purely so the
      // settings form can read back what the tenant typed: adapters send with
      // `fromNumber`, but a form that posts `phoneNumberE164` and never gets
      // it back looks like the number was lost. Both are written in this one
      // upsert, so they cannot drift.
      publicConfig: {
        accountSid: input.accountSid,
        phoneNumberE164: input.phoneNumberE164,
        fromNumber: toWhatsAppFrom(input.phoneNumberE164)
      },
      secrets: { accountSid: input.accountSid, authToken: input.authToken },
      baseWebhookUrl: this.baseWebhookUrl
    });

    if (whatsappView.status !== "verified") {
      return whatsappView;
    }

    await this.provisionVoice(
      input.tenantId,
      "byo",
      { accountSid: input.accountSid, authToken: input.authToken },
      input.phoneNumberE164
    );

    return whatsappView;
  }

  /**
   * Backs the UI's 15-second poll and its `Actualizar estado` button
   * (UI-SPEC assumption A-10). Reads the row through `resolveAny` (unlike
   * `resolve`, which gates on `verified` and would return `null` for a
   * `pending_meta` row), re-checks the sender status with the tenant's own
   * subaccount credentials, and re-persists the mapped status.
   */
  async refreshSenderStatus(tenantId: string): Promise<IntegrationView> {
    const stored = await this.tenantIntegrations.resolveAny(tenantId, "twilio_whatsapp");
    if (!stored) {
      throw new NotFoundException("twilio_whatsapp no configurado para este tenant");
    }

    const senderSid = stored.publicConfig["senderSid"];
    const subaccountSid = stored.secrets["accountSid"];
    const authToken = stored.secrets["authToken"];

    const overrideStatus =
      senderSid && subaccountSid && authToken
        ? mapSenderStatus(await this.twilioProvisioning.getSenderStatus(subaccountSid, authToken, senderSid))
        : { status: stored.status, failureMessage: null, verifiedAt: stored.verifiedAt };

    return this.tenantIntegrations.upsert({
      tenantId,
      provider: "twilio_whatsapp",
      mode: stored.mode,
      publicConfig: stored.publicConfig,
      secrets: {},
      overrideStatus,
      baseWebhookUrl: this.baseWebhookUrl
    });
  }

  /** Imports the number into the platform Vapi account and persists twilio_voice, isolating a Vapi failure to this channel only. */
  private async provisionVoice(
    tenantId: string,
    mode: IntegrationMode,
    twilioCredentials: { accountSid: string; authToken: string },
    numberE164: string
  ): Promise<void> {
    const importResult = await this.vapiProvisioning.importTwilioNumber({
      numberE164,
      twilioAccountSid: twilioCredentials.accountSid,
      twilioAuthToken: twilioCredentials.authToken
    });

    // `accountSid` and `phoneNumberE164` are public here so the BYO voice form
    // can repopulate after a reload — the SID otherwise lives only in
    // `secrets`, which never reaches the browser.
    const publicConfig: Record<string, string> = {
      outboundNumber: numberE164,
      phoneNumberE164: numberE164,
      ...(mode === "byo" ? { accountSid: twilioCredentials.accountSid } : {})
    };
    const overrideStatus =
      "error" in importResult
        ? { status: "failed" as IntegrationStatus, failureMessage: importResult.error }
        : { status: "verified" as IntegrationStatus, failureMessage: null };
    if (!("error" in importResult)) {
      publicConfig["vapiPhoneNumberId"] = importResult.vapiPhoneNumberId;
    }

    await this.tenantIntegrations.upsert({
      tenantId,
      provider: "twilio_voice",
      mode,
      publicConfig,
      secrets: { accountSid: twilioCredentials.accountSid, authToken: twilioCredentials.authToken },
      overrideStatus,
      baseWebhookUrl: this.baseWebhookUrl
    });
  }
}

/** `+E.164` → `whatsapp:+E.164`, matching `twilio-whatsapp.adapter.ts`'s normalization. */
function toWhatsAppFrom(e164: string): string {
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}

/**
 * Maps a raw Twilio Channels Sender status to the persisted
 * `IntegrationStatus`: `ONLINE → verified`; the async in-progress states
 * (`CREATING`, `OFFLINE`, `VERIFYING`) → `pending_meta`; anything else
 * (Twilio's status enum has nine values total, per
 * `08-PROVIDER-CONTRACTS.md` §3) → `failed`, carrying the raw status so the
 * UI's failure block has something concrete to show.
 */
function mapSenderStatus(rawStatus: string): { status: IntegrationStatus; failureMessage: string | null } {
  switch (rawStatus) {
    case "ONLINE":
      return { status: "verified", failureMessage: null };
    case "CREATING":
    case "OFFLINE":
    case "VERIFYING":
      return { status: "pending_meta", failureMessage: null };
    default:
      return { status: "failed", failureMessage: rawStatus };
  }
}
