import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import twilio from "twilio";

export interface TwilioSubaccount {
  accountSid: string;
  authToken: string;
  friendlyName: string;
}

export interface RegisteredSender {
  senderSid: string;
  status: string;
  phoneNumber: string;
}

/**
 * A sender registration can fail for reasons that are the tenant's to fix
 * (e.g. "WABA already associated with another sender") — those are surfaced
 * as a data result, never an unhandled throw, so the caller can persist a
 * `failed` integration row with the provider's own message.
 */
export type RegisterSenderResult = RegisteredSender | { error: string };

/**
 * Creates a tenant's Twilio subaccount and registers its WhatsApp Business
 * Account (WABA) as a Channels Sender on that subaccount (D-02).
 *
 * Twilio permits one WABA per account, so every tenant needs its own
 * subaccount, and the Senders API call must always run against that
 * subaccount's own credentials — never the platform's parent client, even
 * with an `accountSid` client option (RESEARCH.md Pitfall 1, sharpened by
 * `08-PROVIDER-CONTRACTS.md` §4: the Senders API resource path carries no
 * account-SID segment, so it authorizes purely by whose credentials signed
 * the request).
 */
@Injectable()
export class TwilioProvisioningService {
  private readonly logger = new Logger(TwilioProvisioningService.name);
  // The platform/ISV parent credentials are genuinely process-global — safe to cache here,
  // unlike a tenant's credentials, which are always read from arguments passed per call.
  private readonly platformClient: ReturnType<typeof twilio>;

  constructor(private readonly config: ConfigService) {
    const platformAccountSid = this.config.get<string>("TWILIO_ISV_ACCOUNT_SID") ?? "";
    const platformAuthToken = this.config.get<string>("TWILIO_ISV_AUTH_TOKEN") ?? "";
    this.platformClient = twilio(platformAccountSid, platformAuthToken);
  }

  /**
   * Creates a Twilio subaccount for `tenantId` under the platform's ISV
   * account, using the platform client (the only call in this service that
   * legitimately uses it).
   */
  async createSubaccount(tenantId: string, tenantName: string): Promise<TwilioSubaccount> {
    const friendlyName = `tenant-${tenantId}-${tenantName}`.slice(0, 64);
    try {
      const account = await this.platformClient.api.v2010.accounts.create({ friendlyName });
      return { accountSid: account.sid, authToken: account.authToken, friendlyName: account.friendlyName };
    } catch (err) {
      const message = this.extractMessage(err);
      this.logger.error(`Twilio subaccount creation failed for tenant=${tenantId}: ${message}`);
      throw new ServiceUnavailableException(message);
    }
  }

  /**
   * Registers the tenant's WABA as a Channels Sender on their own
   * subaccount. Builds a *fresh* client from the subaccount SID/auth token
   * passed as arguments — reusing the platform client here would associate
   * the WABA with the wrong Twilio account (see class-level doc comment).
   */
  async registerWhatsAppSender(input: {
    subaccountSid: string;
    subaccountAuthToken: string;
    wabaId: string;
    phoneNumberE164: string;
    businessName: string;
    webhookUrl: string;
  }): Promise<RegisterSenderResult> {
    const subaccountClient = twilio(input.subaccountSid, input.subaccountAuthToken);
    const senderId = input.phoneNumberE164.startsWith("whatsapp:")
      ? input.phoneNumberE164
      : `whatsapp:${input.phoneNumberE164}`;

    try {
      const sender = await subaccountClient.messaging.v2.channelsSenders.create({
        senderId,
        configuration: { wabaId: input.wabaId },
        webhook: { callbackUrl: input.webhookUrl },
        profile: { name: input.businessName }
      });
      return {
        senderSid: sender.sid,
        status: sender.status,
        phoneNumber: input.phoneNumberE164
      };
    } catch (err) {
      const message = this.extractMessage(err);
      this.logger.error(`Twilio sender registration failed for subaccount=${input.subaccountSid}: ${message}`);
      return { error: message };
    }
  }

  /**
   * Reads the raw sender status (`CREATING`, `ONLINE`, `OFFLINE`,
   * `VERIFYING`, and others per `08-PROVIDER-CONTRACTS.md` §3) without
   * remapping it — the caller owns the status → `IntegrationStatus` mapping.
   * Also builds a fresh subaccount-scoped client, same reasoning as above.
   */
  async getSenderStatus(subaccountSid: string, subaccountAuthToken: string, senderSid: string): Promise<string> {
    const subaccountClient = twilio(subaccountSid, subaccountAuthToken);
    const sender = await subaccountClient.messaging.v2.channelsSenders(senderSid).fetch();
    return sender.status;
  }

  /** Extracts a Twilio REST error's message, never the request body or credentials. */
  private extractMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message);
    }
    return "Error desconocido de Twilio";
  }
}
