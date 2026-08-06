import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuditService } from "@cobrai/compliance";
import type { PaymentProvider } from "@cobrai/db";
import type { DecryptedIntegration } from "@cobrai/integrations";

/**
 * D-19: unknown token, unknown provider and bad signature must be
 * byte-identical to the caller, so no response can act as an oracle for
 * which tenants/tokens exist (T-08-07b). Every rejection here and in
 * `WebhooksController` throws this exact same message — never customize it
 * per failure reason, provider, or exception.
 */
export const WEBHOOK_UNAUTHORIZED_MESSAGE = "Webhook no autorizado";

/** The five payment providers that confirm via webhook (D-19/D-14). */
export type WebhookPaymentProvider = "stripe" | "mercadopago" | "wompi" | "payu" | "epayco";

/** Signing-secret field per provider, matching what plan 08-08 stored (this plan's `<interfaces>` block). */
const SIGNING_SECRET_FIELD: Record<WebhookPaymentProvider, string> = {
  stripe: "webhookSecret",
  mercadopago: "webhookSecret",
  wompi: "eventsSecret",
  payu: "apiKey",
  epayco: "privateKey"
};

interface WompiEvent {
  data?: Record<string, unknown>;
  timestamp?: number;
  signature?: { checksum?: string; properties?: string[] };
}

export interface WebhookVerifyInput {
  provider: PaymentProvider;
  integration: DecryptedIntegration;
  rawBody: string;
  headers: Record<string, string | undefined>;
}

/**
 * Fail-closed (D-20), per-tenant payment webhook signature verification.
 *
 * This inverts the previous fail-open early-return-on-missing-secret bug
 * (see RESEARCH.md Pitfall 2): a missing signing secret is now a rejection,
 * not a free pass. Every rejection — missing secret, missing signature, or a
 * signature that does not match — writes an audit entry before throwing
 * (T-08-07c), and never includes the secret itself (T-08-07d).
 */
@Injectable()
export class WebhookValidatorService {
  constructor(private readonly audit: AuditService) {}

  async verify(input: WebhookVerifyInput): Promise<void> {
    const provider = input.provider as WebhookPaymentProvider;
    const secretField = SIGNING_SECRET_FIELD[provider];
    const secret = secretField ? input.integration.secrets[secretField] : undefined;

    // D-20: fail CLOSED. A missing signing secret must never let a webhook
    // through — this is the deliberate inversion of the fail-open bug this
    // plan fixes (RESEARCH.md Pitfall 2). Do not silently allow the request
    // through when `secret` is falsy; always audit and throw below instead.
    if (!secret) {
      await this.auditRejection(provider, input.integration, "webhook_rejected_no_secret", "no_secret");
      throw new UnauthorizedException(WEBHOOK_UNAUTHORIZED_MESSAGE);
    }

    switch (provider) {
      case "stripe":
        return this.verifyStripe(secret, input);
      case "mercadopago":
        return this.verifyMercadoPago(secret, input);
      case "wompi":
        return this.verifyWompi(secret, input);
      case "payu":
        return this.verifyPayu(secret, input);
      case "epayco":
        return this.verifyEpayco(secret, input);
      default:
        // Defensive only — the controller already filters `:provider` to
        // this exact union before calling verify().
        await this.auditRejection(provider, input.integration, "webhook_rejected_no_secret", "unsupported_provider");
        throw new UnauthorizedException(WEBHOOK_UNAUTHORIZED_MESSAGE);
    }
  }

  /** Confirmed against docs.stripe.com/webhooks/signatures — digest over `{t}.{rawBody}`. */
  private async verifyStripe(secret: string, { integration, rawBody, headers }: WebhookVerifyInput): Promise<void> {
    const header = headers["stripe-signature"];
    const parts = this.parseKvHeader(header);
    if (!parts.t || !parts.v1) return this.rejectBadSignature("stripe", integration);

    const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
    if (!this.safeCompare(expected, parts.v1)) return this.rejectBadSignature("stripe", integration);
  }

  /**
   * Manifest confirmed against Mercado Pago's `x-signature`/`x-request-id`
   * scheme (RESEARCH.md Sources). `data.id` is read from the echoed webhook
   * body rather than a query param, since this service's interface carries
   * only rawBody/headers — Mercado Pago's own example payload carries the
   * identical id in the body.
   */
  private async verifyMercadoPago(secret: string, { integration, rawBody, headers }: WebhookVerifyInput): Promise<void> {
    const parts = this.parseKvHeader(headers["x-signature"]);
    if (!parts.ts || !parts.v1) return this.rejectBadSignature("mercadopago", integration);

    const requestId = headers["x-request-id"] ?? "";
    const dataId = this.extractJson<{ data?: { id?: string }; id?: string }>(rawBody);
    const id = String(dataId?.data?.id ?? dataId?.id ?? "").toLowerCase();

    const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
    const expected = createHmac("sha256", secret).update(manifest).digest("hex");
    if (!this.safeCompare(expected, parts.v1)) return this.rejectBadSignature("mercadopago", integration);
  }

  /** Confirmed against docs.wompi.co "Events" — SHA256 of concatenated `signature.properties` values + timestamp + secret. */
  private async verifyWompi(secret: string, { integration, rawBody }: WebhookVerifyInput): Promise<void> {
    const event = this.extractJson<WompiEvent>(rawBody);
    const checksum = event?.signature?.checksum;
    const properties = event?.signature?.properties;
    const timestamp = event?.timestamp;
    if (!checksum || !properties || timestamp === undefined) {
      return this.rejectBadSignature("wompi", integration);
    }

    const concatenated =
      properties.map((path) => String(this.resolvePath(event?.data, path) ?? "")).join("") + timestamp + secret;
    const expected = createHash("sha256").update(concatenated).digest("hex").toUpperCase();
    if (!this.safeCompare(expected, checksum.toUpperCase())) return this.rejectBadSignature("wompi", integration);
  }

  /** Confirmed live against developers.payulatam.com's Confirmation URL guide — MD5 of `apiKey~merchant_id~reference_sale~new_value~currency~state_pol`. */
  private async verifyPayu(secret: string, { integration, rawBody }: WebhookVerifyInput): Promise<void> {
    const body = this.parseFormBody(rawBody);
    const { sign, merchant_id: merchantId, reference_sale: referenceSale, value, currency, state_pol: statePol } = body;
    if (!sign || !merchantId || !referenceSale || value === undefined || !currency || !statePol) {
      return this.rejectBadSignature("payu", integration);
    }

    const formattedValue = this.formatPayuValue(value);
    const signatureString = `${secret}~${merchantId}~${referenceSale}~${formattedValue}~${currency}~${statePol}`;
    const expected = createHash("md5").update(signatureString).digest("hex");
    if (!this.safeCompare(expected.toLowerCase(), sign.toLowerCase())) return this.rejectBadSignature("payu", integration);
  }

  /** Confirmed live against docs.epayco.com's "URL de confirmación" — sha256 of `p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code`. */
  private async verifyEpayco(secret: string, { integration, rawBody }: WebhookVerifyInput): Promise<void> {
    const body = this.parseFormBody(rawBody);
    const signature = body.x_signature;
    const { x_ref_payco: refPayco, x_transaction_id: transactionId, x_amount: amount, x_currency_code: currencyCode } = body;
    if (!signature || !refPayco || !transactionId || amount === undefined || currencyCode === undefined) {
      return this.rejectBadSignature("epayco", integration);
    }

    const custIdCliente = integration.publicConfig.custIdCliente ?? "";
    const concatenated = `${custIdCliente}^${secret}^${refPayco}^${transactionId}^${amount}^${currencyCode}`;
    const expected = createHash("sha256").update(concatenated).digest("hex");
    if (!this.safeCompare(expected, signature)) return this.rejectBadSignature("epayco", integration);
  }

  /** PayU's documented rounding: one decimal when the second digit is zero, otherwise two. */
  private formatPayuValue(value: string): string {
    const [intPart, decimalPart] = value.split(".");
    if (!decimalPart) return `${intPart}.0`;
    if (decimalPart.length > 1 && decimalPart[1] !== "0") return `${intPart}.${decimalPart.slice(0, 2)}`;
    return `${intPart}.${decimalPart[0]}`;
  }

  private resolvePath(obj: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  private parseKvHeader(header: string | undefined): Record<string, string> {
    if (!header) return {};
    return Object.fromEntries(
      header.split(",").map((pair) => {
        const [key, ...rest] = pair.split("=");
        return [(key ?? "").trim(), rest.join("=").trim()];
      })
    );
  }

  private parseFormBody(rawBody: string): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  private extractJson<T>(rawBody: string): T | undefined {
    try {
      return JSON.parse(rawBody) as T;
    } catch {
      return undefined;
    }
  }

  /** Equal-length guard before `timingSafeEqual`, which throws on unequal buffer lengths. */
  private safeCompare(expected: string, actual: string): boolean {
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }

  private async rejectBadSignature(provider: string, integration: DecryptedIntegration): Promise<never> {
    await this.auditRejection(provider, integration, "webhook_rejected_bad_signature", "invalid_or_missing_signature");
    throw new UnauthorizedException(WEBHOOK_UNAUTHORIZED_MESSAGE);
  }

  /** `changes` names only the provider and reason — never the secret or raw body (T-08-07d). */
  private async auditRejection(
    provider: string,
    integration: DecryptedIntegration,
    action: string,
    reason: string
  ): Promise<void> {
    await this.audit.logAction({
      tenantId: integration.tenantId,
      resourceType: "tenant_integration",
      resourceId: integration.id,
      action: `${provider}.${action}`,
      changes: { provider, reason }
    });
  }
}
