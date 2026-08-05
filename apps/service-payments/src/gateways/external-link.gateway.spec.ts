import { describe, expect, it } from "vitest";
import { ExternalLinkGateway } from "./external-link.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

function buildInput(overrides: Partial<CreateCheckoutInput> = {}): CreateCheckoutInput {
  return {
    amount: 450000,
    currency: "COP",
    token: "tok-abc123",
    debtorName: "María Rodríguez",
    publicConfig: { template: "https://checkout.tuempresa.com/pagar?ref={ref}&valor={monto}" },
    secrets: {},
    returnUrl: "https://app.cobrai.dev/pay/tok-abc123/done",
    ...overrides
  };
}

describe("ExternalLinkGateway", () => {
  const gateway = new ExternalLinkGateway();

  it("resolves the tenant's template for this debt", async () => {
    const result = await gateway.createCheckout(buildInput());
    expect(result.gateway_payment_url).toBe(
      "https://checkout.tuempresa.com/pagar?ref=tok-abc123&valor=450000"
    );
  });

  it("returns the payment link token as gateway_ref", async () => {
    const result = await gateway.createCheckout(buildInput());
    expect(result.gateway_ref).toBe("tok-abc123");
  });

  it("throws when publicConfig.template is absent", async () => {
    await expect(gateway.createCheckout(buildInput({ publicConfig: {} }))).rejects.toThrow();
  });

  it("uses the debt's external reference as {ref} when present", async () => {
    const result = await gateway.createCheckout(
      buildInput({
        publicConfig: {
          template: "https://checkout.tuempresa.com/pagar?ref={ref}",
          externalRef: "FAC-00123"
        }
      })
    );
    expect(result.gateway_payment_url).toBe("https://checkout.tuempresa.com/pagar?ref=FAC-00123");
  });

  it("falls back to the payment link token as {ref} when no external reference exists", async () => {
    const result = await gateway.createCheckout(
      buildInput({ publicConfig: { template: "https://checkout.tuempresa.com/pagar?ref={ref}" } })
    );
    expect(result.gateway_payment_url).toBe("https://checkout.tuempresa.com/pagar?ref=tok-abc123");
  });

  it("URL-encodes the debtor name substituted for {nombre}", async () => {
    const result = await gateway.createCheckout(
      buildInput({ publicConfig: { template: "https://checkout.tuempresa.com/pagar?nombre={nombre}" } })
    );
    expect(result.gateway_payment_url).toBe(
      `https://checkout.tuempresa.com/pagar?nombre=${encodeURIComponent("María Rodríguez")}`
    );
  });
});
