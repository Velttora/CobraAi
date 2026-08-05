import { createHash, createHmac } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DecryptedIntegration } from "@cobrai/integrations";
import {
  WebhookValidatorService,
  WEBHOOK_UNAUTHORIZED_MESSAGE,
  type WebhookPaymentProvider
} from "./webhook-validator.service";

const SECRET_FIELD: Record<WebhookPaymentProvider, string> = {
  stripe: "webhookSecret",
  mercadopago: "webhookSecret",
  wompi: "eventsSecret",
  payu: "apiKey",
  epayco: "privateKey"
};

const PROVIDERS = Object.keys(SECRET_FIELD) as WebhookPaymentProvider[];

function buildIntegration(
  provider: WebhookPaymentProvider,
  secret?: string,
  publicConfig: Record<string, string> = {}
): DecryptedIntegration {
  return {
    id: `integration-${provider}`,
    tenantId: `tenant-${provider}`,
    provider,
    mode: "byo",
    status: "verified",
    publicConfig,
    secrets: secret ? { [SECRET_FIELD[provider]]: secret } : {},
    webhookToken: "tok",
    verifiedAt: new Date()
  } as unknown as DecryptedIntegration;
}

function payuFormattedValue(value: string): string {
  const [intPart, decimalPart] = value.split(".");
  if (!decimalPart) return `${intPart}.0`;
  if (decimalPart.length > 1 && decimalPart[1] !== "0") return `${intPart}.${decimalPart.slice(0, 2)}`;
  return `${intPart}.${decimalPart[0]}`;
}

/** Builds a genuinely valid rawBody/headers pair per provider, computed independently of the service under test. */
function buildValidRequest(provider: WebhookPaymentProvider, secret: string): { rawBody: string; headers: Record<string, string> } {
  if (provider === "stripe") {
    const rawBody = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1", metadata: { token: "tok-1" } } } });
    const t = "1700000000";
    const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
    return { rawBody, headers: { "stripe-signature": `t=${t},v1=${v1}` } };
  }
  if (provider === "mercadopago") {
    const rawBody = JSON.stringify({ data: { id: "PAY123" } });
    const ts = "1700000000";
    const requestId = "req-1";
    const manifest = `id:pay123;request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    return { rawBody, headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId } };
  }
  if (provider === "wompi") {
    const timestamp = 1700000000;
    const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
    const values = ["txn-1", "APPROVED", "100000"];
    const checksum = createHash("sha256")
      .update(values.join("") + timestamp + secret)
      .digest("hex")
      .toUpperCase();
    const rawBody = JSON.stringify({
      event: "transaction.updated",
      data: { transaction: { id: "txn-1", status: "APPROVED", amount_in_cents: 100000 } },
      timestamp,
      signature: { checksum, properties }
    });
    return { rawBody, headers: {} };
  }
  if (provider === "payu") {
    const fields = { merchant_id: "508029", reference_sale: "tok-1", value: "100.00", currency: "COP", state_pol: "4" };
    const formatted = payuFormattedValue(fields.value);
    const sign = createHash("md5")
      .update(`${secret}~${fields.merchant_id}~${fields.reference_sale}~${formatted}~${fields.currency}~${fields.state_pol}`)
      .digest("hex");
    return { rawBody: new URLSearchParams({ ...fields, sign }).toString(), headers: {} };
  }
  // epayco
  const fields = { x_ref_payco: "ref-1", x_transaction_id: "txn-1", x_amount: "100.00", x_currency_code: "COP" };
  const x_signature = createHash("sha256")
    .update(`cust-1^${secret}^${fields.x_ref_payco}^${fields.x_transaction_id}^${fields.x_amount}^${fields.x_currency_code}`)
    .digest("hex");
  return { rawBody: new URLSearchParams({ ...fields, x_signature }).toString(), headers: {} };
}

function publicConfigFor(provider: WebhookPaymentProvider): Record<string, string> {
  return provider === "epayco" ? { custIdCliente: "cust-1" } : {};
}

/** Mutates a field the signature formula actually covers — appending an unrelated param is a no-op for form-encoded providers. */
function tamper(provider: WebhookPaymentProvider, rawBody: string): string {
  if (provider === "payu") return `${rawBody}&value=999.00`;
  if (provider === "epayco") return `${rawBody}&x_amount=999.00`;
  return rawBody.replace("1", "9");
}

function buildService() {
  const audit = { logAction: vi.fn().mockResolvedValue(undefined) };
  return { service: new WebhookValidatorService(audit as never), audit };
}

describe("WebhookValidatorService", () => {
  it.each(PROVIDERS)("rejects %s when no secret is configured, and audits webhook_rejected_no_secret", async (provider) => {
    const { service, audit } = buildService();
    const integration = buildIntegration(provider, undefined, publicConfigFor(provider));

    await expect(service.verify({ provider, integration, rawBody: "{}", headers: {} })).rejects.toThrow(UnauthorizedException);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: `${provider}.webhook_rejected_no_secret`, changes: { provider, reason: "no_secret" } })
    );
  });

  it.each(PROVIDERS)("resolves %s on a correct signature", async (provider) => {
    const { service } = buildService();
    const secret = `secret-${provider}`;
    const integration = buildIntegration(provider, secret, publicConfigFor(provider));
    const { rawBody, headers } = buildValidRequest(provider, secret);

    await expect(service.verify({ provider, integration, rawBody, headers })).resolves.toBeUndefined();
  });

  it.each(PROVIDERS)("rejects %s on an invalid signature, and audits webhook_rejected_bad_signature", async (provider) => {
    const { service, audit } = buildService();
    const secret = `secret-${provider}`;
    const integration = buildIntegration(provider, secret, publicConfigFor(provider));
    const { rawBody, headers } = buildValidRequest(provider, secret);

    await expect(
      service.verify({ provider, integration, rawBody: tamper(provider, rawBody), headers })
    ).rejects.toThrow(WEBHOOK_UNAUTHORIZED_MESSAGE);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: `${provider}.webhook_rejected_bad_signature` }));
  });

  it("rejects Stripe when the signature header is absent", async () => {
    const { service } = buildService();
    const integration = buildIntegration("stripe", "s");
    await expect(service.verify({ provider: "stripe", integration, rawBody: "{}", headers: {} })).rejects.toThrow(
      WEBHOOK_UNAUTHORIZED_MESSAGE
    );
  });

  it("rejects Mercado Pago when the signature header is absent", async () => {
    const { service } = buildService();
    const integration = buildIntegration("mercadopago", "s");
    await expect(service.verify({ provider: "mercadopago", integration, rawBody: "{}", headers: {} })).rejects.toThrow(
      WEBHOOK_UNAUTHORIZED_MESSAGE
    );
  });

  it("rejects without crashing on an unequal-length signature (length guard before timingSafeEqual)", async () => {
    const { service } = buildService();
    const integration = buildIntegration("stripe", "s");
    const headers = { "stripe-signature": "t=1700000000,v1=short" };
    await expect(service.verify({ provider: "stripe", integration, rawBody: "{}", headers })).rejects.toThrow(
      WEBHOOK_UNAUTHORIZED_MESSAGE
    );
  });

  it("never includes the signing secret in a thrown message or in the audit changes payload", async () => {
    const { service, audit } = buildService();
    const secret = "super-secret-value";
    const integration = buildIntegration("stripe", secret);

    try {
      await service.verify({
        provider: "stripe",
        integration,
        rawBody: "{}",
        headers: { "stripe-signature": "t=1700000000,v1=bad" }
      });
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }

    for (const call of audit.logAction.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain(secret);
    }
  });
});
