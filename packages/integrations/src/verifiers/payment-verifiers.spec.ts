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
    // El verificador anterior llamaba GET /v1/payment_links?page[size]=1, que
    // Wompi no documenta: su API de links es POST para crear y GET por id. Esa
    // ruta respondía 401 para CUALQUIER llave privada, buena o mala, así que la
    // verificación solo podía fallar. Se había comprobado contra una llave mala
    // y nunca contra una buena.
    it("verifica contra el endpoint documentado de merchants, con la llave pública", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });

      const result = await verifyCredentials("wompi", {
        publicConfig: { publicKey: "pub_prod_abc123" },
        secrets: { privateKey: "prv_prod_abc123" }
      });

      expect(result.ok).toBe(true);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/merchants/pub_prod_abc123");
    });

    it("pide la llave pública, que es la que se puede comprobar", async () => {
      const result = await verifyCredentials("wompi", {
        publicConfig: {},
        secrets: { privateKey: "prv_prod_abc123" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("llave pública");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rechaza una llave privada que no parece de Wompi antes de llamar a nadie", async () => {
      const result = await verifyCredentials("wompi", {
        publicConfig: { publicKey: "pub_prod_abc123" },
        secrets: { privateKey: "sk_live_algo_de_stripe" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("prv_");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // Mezclar ambientes es el error más común y el más caro: parece que todo
    // quedó bien configurado y los cobros nunca llegan a la cuenta real.
    it("detecta llaves de ambientes distintos", async () => {
      const result = await verifyCredentials("wompi", {
        publicConfig: { publicKey: "pub_test_abc123" },
        secrets: { privateKey: "prv_prod_abc123" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("ambientes distintos");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("devuelve el motivo de Wompi cuando rechaza la llave pública", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({ error: { reason: "Formato inválido" } })
      });

      const result = await verifyCredentials("wompi", {
        publicConfig: { publicKey: "pub_prod_malo" },
        secrets: { privateKey: "prv_prod_abc123" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Formato inválido");
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
