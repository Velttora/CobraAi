import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PayuGateway } from "./payu.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

describe("PayuGateway", () => {
  const gateway = new PayuGateway();

  const baseInput: CreateCheckoutInput = {
    amount: 450000,
    currency: "COP",
    token: "tok-payu-321",
    debtorName: "Jane Doe",
    publicConfig: { merchantId: "508029", accountId: "512321" },
    secrets: { apiKey: "test-api-key" },
    returnUrl: "https://app.cobrai.dev/pay/return"
  };

  it("returns a WebCheckout URL built from merchantId, accountId, referenceCode, amount, currency and signature", async () => {
    const result = await gateway.createCheckout(baseInput);
    const url = new URL(result.gateway_payment_url);

    expect(url.origin + url.pathname).toBe("https://checkout.payulatam.com/ppp-web-gateway-payu/");
    expect(url.searchParams.get("merchantId")).toBe("508029");
    expect(url.searchParams.get("accountId")).toBe("512321");
    expect(url.searchParams.get("referenceCode")).toBe("tok-payu-321");
    expect(url.searchParams.get("currency")).toBe("COP");
    expect(url.searchParams.get("signature")).toBeTruthy();
  });

  it("sends the exact amount value ('450000.00') for a 450000 COP input, matching the amount hashed into the signature", async () => {
    const result = await gateway.createCheckout(baseInput);
    const url = new URL(result.gateway_payment_url);

    expect(url.searchParams.get("amount")).toBe("450000.00");

    const expectedSignature = createHash("md5")
      .update(`test-api-key~508029~tok-payu-321~450000.00~COP`)
      .digest("hex");
    expect(url.searchParams.get("signature")).toBe(expectedSignature);
  });

  it("carries the PaymentLink.token as referenceCode, the reconciliation field for plan 08-12's webhook", async () => {
    const result = await gateway.createCheckout(baseInput);
    expect(result.gateway_ref).toBe("tok-payu-321");
    const url = new URL(result.gateway_payment_url);
    expect(url.searchParams.get("referenceCode")).toBe("tok-payu-321");
  });

  it("throws when secrets.apiKey is absent", async () => {
    await expect(gateway.createCheckout({ ...baseInput, secrets: {} })).rejects.toThrow();
  });

  it("throws when publicConfig.merchantId is absent", async () => {
    await expect(
      gateway.createCheckout({ ...baseInput, publicConfig: { accountId: "512321" } })
    ).rejects.toThrow();
  });

  it("throws when publicConfig.accountId is absent", async () => {
    await expect(
      gateway.createCheckout({ ...baseInput, publicConfig: { merchantId: "508029" } })
    ).rejects.toThrow();
  });

  it("never includes the raw apiKey in the returned URL", async () => {
    const result = await gateway.createCheckout(baseInput);
    expect(result.gateway_payment_url).not.toContain(baseInput.secrets.apiKey);
  });
});
