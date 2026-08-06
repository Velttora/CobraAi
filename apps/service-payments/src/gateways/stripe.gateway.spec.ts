import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StripeGateway } from "./stripe.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

describe("StripeGateway", () => {
  let gateway: StripeGateway;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  const baseInput: CreateCheckoutInput = {
    amount: 450000,
    currency: "cop",
    token: "tok-abc-123",
    debtorName: "Jane Doe",
    publicConfig: {},
    secrets: { secretKey: "sk_test_valid" },
    returnUrl: "https://app.cobrai.dev/pay/return"
  };

  beforeEach(() => {
    gateway = new StripeGateway();
    originalFetch = globalThis.fetch;
    loggerErrorSpy = vi.spyOn(gateway["logger"], "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the Stripe-hosted URL and object id on success", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "plink_123", url: "https://buy.stripe.com/test_abc" })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await gateway.createCheckout(baseInput);

    expect(result.gateway_payment_url).toBe("https://buy.stripe.com/test_abc");
    expect(result.gateway_ref).toBe("plink_123");
  });

  it("sends the PaymentLink.token as metadata so the webhook can reconcile it", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "plink_123", url: "https://buy.stripe.com/test_abc" })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await gateway.createCheckout(baseInput);

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(callArgs[1].body as string);
    expect(params.get("metadata[token]")).toBe("tok-abc-123");
  });

  it("throws with Stripe's own error message on a rejected key", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () =>
        JSON.stringify({ error: { message: "Invalid API Key provided: sk_test_***", type: "invalid_request_error" } })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout(baseInput)).rejects.toThrow("Invalid API Key provided: sk_test_***");
  });

  it("throws when secrets.secretKey is absent instead of returning a fabricated session", async () => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout({ ...baseInput, secrets: {} })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never logs or throws the secret key", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ error: { message: "declined" } })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout(baseInput)).rejects.toThrow("declined");

    for (const call of loggerErrorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(baseInput.secrets.secretKey);
    }
  });
});
