import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

interface VapiPhoneNumberResponse {
  id: string;
  status?: string;
  provider?: string;
}

interface VapiErrorBody {
  /** Present when the conflict response echoes back the already-imported resource. */
  id?: string;
  message?: string;
}

type AxiosLikeError = { response?: { status?: number; data?: unknown } };

/**
 * Imports the tenant's own Twilio number into the platform's Vapi account
 * (D-05) so outbound calls leave from the tenant's number, without Vapi ever
 * knowing about a per-tenant credential (D-04): Vapi stays platform-owned,
 * this service holds no tenant Vapi credential, and the only per-tenant
 * artifact is the returned `vapiPhoneNumberId`, persisted by
 * `WhatsAppConnectService` in `twilio_voice.publicConfig`.
 *
 * Structurally mirrors `vapi-voice.adapter.ts`: cached `baseUrl`/`apiKey`,
 * axios with a Bearer header, a typed response interface, and try/catch
 * converting failures into a typed result instead of a throw.
 */
@Injectable()
export class VapiProvisioningService {
  private readonly logger = new Logger(VapiProvisioningService.name);
  private readonly baseUrl = "https://api.vapi.ai";
  private readonly apiKey: string | null;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>("VAPI_API_KEY") ?? null;
  }

  /**
   * Imports a Twilio-owned number using the tenant's Twilio account
   * SID/auth token (sent to Vapi once, over TLS, never logged or persisted
   * a second time — it already lives encrypted in the tenant's integration
   * row). `smsEnabled: false` is explicit per `08-PROVIDER-CONTRACTS.md`
   * ("Correction to RESEARCH.md A2"): the field defaults to `true`, which
   * would silently repoint the number's Twilio SMS webhook to Vapi.
   */
  async importTwilioNumber(input: {
    numberE164: string;
    twilioAccountSid: string;
    twilioAuthToken: string;
  }): Promise<{ vapiPhoneNumberId: string } | { error: string }> {
    try {
      const response = await axios.post<VapiPhoneNumberResponse>(
        `${this.baseUrl}/phone-number`,
        {
          provider: "twilio",
          number: input.numberE164,
          twilioAccountSid: input.twilioAccountSid,
          twilioAuthToken: input.twilioAuthToken,
          smsEnabled: false
        },
        { headers: { Authorization: `Bearer ${this.apiKey}` } }
      );
      return { vapiPhoneNumberId: response.data.id };
    } catch (err: unknown) {
      return this.toImportResult(err);
    }
  }

  /** Deletes a previously imported number. A 404 (already gone) is logged and swallowed, never thrown. */
  async releaseNumber(vapiPhoneNumberId: string): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/phone-number/${vapiPhoneNumberId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
    } catch (err: unknown) {
      if (this.statusOf(err) === 404) {
        this.logger.warn(`Vapi phone number ${vapiPhoneNumberId} ya no existía (404); se ignora`);
        return;
      }
      this.logger.error(`Vapi releaseNumber falló para ${vapiPhoneNumberId}: ${this.extractMessage(err)}`);
    }
  }

  private toImportResult(err: unknown): { vapiPhoneNumberId: string } | { error: string } {
    const status = this.statusOf(err);
    if (status !== undefined) {
      const data = (err as AxiosLikeError).response?.data as VapiErrorBody | undefined;
      // A duplicate-import conflict echoes back the already-imported resource
      // (including its id) rather than a bare error — reuse that id instead of failing,
      // per the behavior block's "importing a number Vapi already holds" requirement.
      if (data?.id) {
        return { vapiPhoneNumberId: data.id };
      }
      const message = data?.message ?? "Error desconocido de Vapi";
      // Deliberately does not log `message`: it is Vapi's own response body, which
      // could echo back part of the request (including the tenant's Twilio auth
      // token) in an error description. The verbatim message still reaches the
      // caller via the return value — only the log line is redacted.
      this.logger.error(`Vapi importTwilioNumber rechazado (status=${status})`);
      return { error: message };
    }
    // No `response` on the error means the request never reached Vapi (network failure) —
    // the message must name Vapi and never echo any part of the request body/credentials.
    this.logger.error(`Vapi importTwilioNumber no pudo contactar al proveedor: ${this.extractMessage(err)}`);
    return { error: "No se pudo contactar a Vapi" };
  }

  private statusOf(err: unknown): number | undefined {
    if (err && typeof err === "object" && "response" in err) {
      return (err as AxiosLikeError).response?.status;
    }
    return undefined;
  }

  private extractMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message);
    }
    return "Error desconocido";
  }
}
