import { describe, expect, it } from "vitest";
import { EpaycoGateway } from "./epayco.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

describe("EpaycoGateway", () => {
  const gateway = new EpaycoGateway();

  const baseInput: CreateCheckoutInput = {
    amount: 450000,
    currency: "COP",
    token: "tok-epayco-654",
    debtorName: "Jane Doe",
    publicConfig: { custIdCliente: "12345", publicKey: "pub_test_epayco" },
    secrets: { privateKey: "priv_test_epayco" },
    returnUrl: "https://app.cobrai.dev/pay/return"
  };

  it("returns a checkout URL carrying publicKey, the token as invoice, amount, currency and the response URL", async () => {
    const result = await gateway.createCheckout(baseInput);
    const url = new URL(result.gateway_payment_url);

    expect(url.searchParams.get("public_key")).toBe("pub_test_epayco");
    expect(url.searchParams.get("invoice")).toBe("tok-epayco-654");
    expect(url.searchParams.get("currency")).toBe("cop");
    expect(url.searchParams.get("response")).toBe("https://app.cobrai.dev/pay/return");
  });

  it("sends the exact decimal amount ('450000.00') for a 450000 COP input", async () => {
    const result = await gateway.createCheckout(baseInput);
    const url = new URL(result.gateway_payment_url);
    expect(url.searchParams.get("amount")).toBe("450000.00");
  });

  it("carries the PaymentLink.token as the invoice reconciliation field, echoed back as x_id_factura", async () => {
    const result = await gateway.createCheckout(baseInput);
    expect(result.gateway_ref).toBe("tok-epayco-654");
  });

  it("throws when publicConfig.custIdCliente is absent", async () => {
    await expect(
      gateway.createCheckout({ ...baseInput, publicConfig: { publicKey: "pub_test_epayco" } })
    ).rejects.toThrow();
  });

  it("throws when publicConfig.publicKey is absent", async () => {
    await expect(
      gateway.createCheckout({ ...baseInput, publicConfig: { custIdCliente: "12345" } })
    ).rejects.toThrow();
  });

  it("never includes the private key in the returned checkout URL", async () => {
    const result = await gateway.createCheckout(baseInput);
    expect(result.gateway_payment_url).not.toContain(baseInput.secrets.privateKey);
  });
});
