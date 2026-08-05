import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway } from "./mercadopago.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

describe("MercadoPagoGateway", () => {
  let gateway: MercadoPagoGateway;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  const baseInput: CreateCheckoutInput = {
    amount: 450000,
    currency: "COP",
    token: "tok-mp-456",
    debtorName: "Jane Doe",
    publicConfig: {},
    secrets: { accessToken: "APP_USR-valid-token" },
    returnUrl: "https://app.cobrai.dev/pay/return"
  };

  beforeEach(() => {
    gateway = new MercadoPagoGateway();
    originalFetch = globalThis.fetch;
    vi.spyOn(gateway["logger"], "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts the preference body with external_reference set to the payment link token", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "mp-pref-1", init_point: "https://mercadopago.com/checkout/prod" })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await gateway.createCheckout(baseInput);

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.external_reference).toBe("tok-mp-456");
    expect(body.items[0].unit_price).toBe(450000);
  });

  it("prefers init_point over sandbox_init_point when both are present", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "mp-pref-2",
        init_point: "https://mercadopago.com/checkout/prod",
        sandbox_init_point: "https://mercadopago.com/checkout/sandbox"
      })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await gateway.createCheckout(baseInput);

    expect(result.gateway_payment_url).toBe("https://mercadopago.com/checkout/prod");
  });

  it("throws with the provider message on a non-ok response", async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "invalid_token"
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout(baseInput)).rejects.toThrow("invalid_token");
  });

  it("throws when secrets.accessToken is absent instead of returning a fabricated session", async () => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(gateway.createCheckout({ ...baseInput, secrets: {} })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
