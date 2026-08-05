import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCredentials } from "./index";

describe("verifyCredentials — payment providers", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("stripe", () => {
    it("returns ok:true on a 200 from the balance endpoint", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ available: [] }) });

      const result = await verifyCredentials("stripe", {
        publicConfig: {},
        secrets: { secretKey: "sk_test_123" }
      });

      expect(result.ok).toBe(true);
    });

    it("returns ok:false with Stripe's message on a 401", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: "Invalid API Key provided" } })
      });

      const result = await verifyCredentials("stripe", {
        publicConfig: {},
        secrets: { secretKey: "sk_bad" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Invalid API Key provided");
    });
  });

  describe("mercadopago", () => {
    it("returns ok:true on a 200 from users/me", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 123 }) });

      const result = await verifyCredentials("mercadopago", {
        publicConfig: {},
        secrets: { accessToken: "APP_USR-123" }
      });

      expect(result.ok).toBe(true);
    });

    it("returns ok:false on a 403", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: "invalid access token" })
      });

      const result = await verifyCredentials("mercadopago", {
        publicConfig: {},
        secrets: { accessToken: "bad" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("invalid access token");
    });
  });

  describe("wompi", () => {
    it("returns ok:true on a 200 from the payment_links list", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

      const result = await verifyCredentials("wompi", {
        publicConfig: {},
        secrets: { privateKey: "prv_test_123" }
      });

      expect(result.ok).toBe(true);
    });

    it("returns ok:false with Wompi's message on an invalid token", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { reason: "El token proporcionado no tiene el formato correcto" } })
      });

      const result = await verifyCredentials("wompi", {
        publicConfig: {},
        secrets: { privateKey: "bad" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("El token proporcionado no tiene el formato correcto");
    });
  });

  describe("payu", () => {
    it("returns ok:true when the PING command responds SUCCESS", async () => {
      fetchMock.mockResolvedValue({ json: async () => ({ code: "SUCCESS" }) });

      const result = await verifyCredentials("payu", {
        publicConfig: { merchantId: "500123", accountId: "500456" },
        secrets: { apiKey: "key", apiLogin: "login" }
      });

      expect(result.ok).toBe(true);
    });

    it("returns ok:false with PayU's error on invalid credentials", async () => {
      fetchMock.mockResolvedValue({
        json: async () => ({ code: "ERROR", error: "Credenciales inválidas" })
      });

      const result = await verifyCredentials("payu", {
        publicConfig: { merchantId: "500123", accountId: "500456" },
        secrets: { apiKey: "bad", apiLogin: "bad" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Credenciales inválidas");
    });
  });

  describe("epayco", () => {
    it("returns ok:true when the login endpoint returns a token", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token: "jwt-token" }) });

      const result = await verifyCredentials("epayco", {
        publicConfig: { publicKey: "pk_test" },
        secrets: { pKey: "priv_test" }
      });

      expect(result.ok).toBe(true);
    });

    it("returns ok:false when the login endpoint reports an error", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Credenciales inválidas" })
      });

      const result = await verifyCredentials("epayco", {
        publicConfig: { publicKey: "bad" },
        secrets: { pKey: "bad" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Credenciales inválidas");
    });
  });

  describe("external_link and transfer", () => {
    it("returns ok:true for external_link without making any fetch call", async () => {
      const result = await verifyCredentials("external_link", {
        publicConfig: { template: "https://checkout.x.com/pagar?ref={ref}" },
        secrets: {}
      });

      expect(result.ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns ok:true for transfer without making any fetch call", async () => {
      const result = await verifyCredentials("transfer", { publicConfig: {}, secrets: {} });

      expect(result.ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("secret redaction", () => {
    it("never includes a payment provider's submitted secret in any returned message", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Invalid API Key provided"
      });

      const secret = "sk_live_super_secret_value";
      const result = await verifyCredentials("stripe", {
        publicConfig: {},
        secrets: { secretKey: secret }
      });

      expect(result.message).not.toContain(secret);
    });
  });
});
