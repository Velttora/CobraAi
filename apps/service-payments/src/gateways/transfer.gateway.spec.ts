import { describe, expect, it } from "vitest";
import { TransferGateway } from "./transfer.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

function buildInput(overrides: Partial<CreateCheckoutInput> = {}): CreateCheckoutInput {
  return {
    amount: 250000,
    currency: "COP",
    token: "tok-xyz789",
    debtorName: "Juan Pérez",
    publicConfig: {
      bankName: "Bancolombia",
      accountType: "Ahorros",
      accountNumber: "123-456789-00",
      accountHolder: "Acme Cobranzas SAS",
      taxId: "900123456-7"
    },
    secrets: {},
    returnUrl: "https://app.cobrai.dev/pay/tok-xyz789/done",
    ...overrides
  };
}

describe("TransferGateway", () => {
  const gateway = new TransferGateway();

  it("returns an empty gateway_payment_url", async () => {
    const result = await gateway.createCheckout(buildInput());
    expect(result.gateway_payment_url).toBe("");
  });

  it("names the bank, account type, account number, holder and NIT in the instructions", async () => {
    const result = await gateway.createCheckout(buildInput());
    expect(result.instructions).toContain("Bancolombia");
    expect(result.instructions).toContain("Ahorros");
    expect(result.instructions).toContain("123-456789-00");
    expect(result.instructions).toContain("Acme Cobranzas SAS");
    expect(result.instructions).toContain("900123456-7");
  });

  it("includes the reference in the instructions", async () => {
    const result = await gateway.createCheckout(buildInput());
    expect(result.instructions).toContain("tok-xyz789");
  });

  it("skips absent fields rather than printing the literal undefined", async () => {
    const result = await gateway.createCheckout(
      buildInput({ publicConfig: { bankName: "Bancolombia", accountNumber: "123-456789-00" } })
    );
    expect(result.instructions).not.toContain("undefined");
    expect(result.instructions).toContain("Bancolombia");
    expect(result.instructions).toContain("123-456789-00");
  });
});
