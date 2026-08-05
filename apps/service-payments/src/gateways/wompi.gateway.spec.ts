import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WompiGateway } from "./wompi.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

describe("WompiGateway", () => {
  let gateway: WompiGateway;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  const baseInput: CreateCheckoutInput = {
    amount: 450000,
    currency: "COP",
    token: "tok-wompi-789",
    debtorName: "Jane Doe",
    publicConfig: { publicKey: "pub_test_abc" },
    secrets: { privateKey: "prv_test_secret" },
    returnUrl: "https://app.cobrai.dev/pay/return"
  };

  beforeEach(() => {
    gateway = new WompiGateway();
    originalFetch = globalThis.fetch;
    vi.spyOn(gateway["logger"], "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("creates a payment link using privateKey as the bearer token and returns the hosted URL plus link id", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "3Z0Cfi" } })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await gateway.createCheckout(baseInput);

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((callArgs[1].headers as Record<string, string>).Authorization).toBe("Bearer prv_test_secret");
    expect(result.gateway_payment_url).toBe("https://checkout.wompi.co/l/3Z0Cfi");
    expect(result.gateway_ref).toBe("3Z0Cfi");
  });

  it("sends the amount in cents (integer) for a 450000 COP input", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "3Z0Cfi" } })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await gateway.createCheckout(baseInput);

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.amount_in_cents).toBe(45000000);
  });

  it("carries the PaymentLink.token as the sku reconciliation field", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "3Z0Cfi" } })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await gateway.createCheckout(baseInput);

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.sku).toBe("tok-wompi-789");
  });

  it("throws with Wompi's own message on a non-ok response", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ error: { reason: "INVALID_PRIVATE_KEY" } })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout(baseInput)).rejects.toThrow("INVALID_PRIVATE_KEY");
  });

  it("throws when secrets.privateKey is absent instead of returning a fabricated session", async () => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout({ ...baseInput, secrets: {} })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the private key in a logged or thrown message", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ error: { reason: "declined" } })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout(baseInput)).rejects.not.toThrow(baseInput.secrets.privateKey);
  });
});
