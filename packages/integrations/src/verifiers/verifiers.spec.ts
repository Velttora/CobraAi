import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCredentials } from "./index";

describe("verifyCredentials", () => {
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

  describe("twilio_whatsapp", () => {
    it("returns ok:true and merges the account friendly name into publicConfig on a 200", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ friendly_name: "Acme Cobranzas" })
      });

      const result = await verifyCredentials("twilio_whatsapp", {
        publicConfig: { accountSid: "AC123" },
        secrets: { authToken: "secret-token-xyz" }
      });

      expect(result.ok).toBe(true);
      expect(result.publicConfig).toEqual({ twilioFriendlyName: "Acme Cobranzas" });
    });

    it("returns ok:false with the provider body text on a 401", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Authentication Error - invalid username"
      });

      const result = await verifyCredentials("twilio_whatsapp", {
        publicConfig: { accountSid: "AC123" },
        secrets: { authToken: "wrong-token" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Authentication Error - invalid username");
    });
  });

  describe("twilio_voice", () => {
    it("reuses the Twilio account check and passes when the outbound number is present", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ friendly_name: "Acme Cobranzas" })
      });

      const result = await verifyCredentials("twilio_voice", {
        publicConfig: { accountSid: "AC123", outboundNumber: "+573001234567" },
        secrets: { authToken: "secret-token-xyz" }
      });

      expect(result.ok).toBe(true);
    });

    it("reports ok:false when the configured outbound number is absent", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ friendly_name: "Acme Cobranzas" })
      });

      const result = await verifyCredentials("twilio_voice", {
        publicConfig: { accountSid: "AC123" },
        secrets: { authToken: "secret-token-xyz" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Falta el número saliente");
    });
  });

  describe("sendgrid", () => {
    it("returns ok:true on a 200 from the scopes endpoint with no domain configured", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ scopes: ["mail.send"] })
      });

      const result = await verifyCredentials("sendgrid", {
        publicConfig: {},
        secrets: { apiKey: "SG.super-secret-key" }
      });

      expect(result.ok).toBe(true);
    });

    it("returns ok:false with the provider body on a 401", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized"
      });

      const result = await verifyCredentials("sendgrid", {
        publicConfig: {},
        secrets: { apiKey: "SG.wrong-key" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Unauthorized");
    });

    it("returns status:pending_dns when credentials are valid but the sending domain is not yet authenticated", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scopes: ["mail.send"] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              valid: false,
              dns: {
                mail_cname: {
                  valid: false,
                  type: "cname",
                  host: "em1234.example.com",
                  data: "u1234.wl.sendgrid.net"
                }
              }
            }
          ]
        });

      const result = await verifyCredentials("sendgrid", {
        publicConfig: { domain: "example.com" },
        secrets: { apiKey: "SG.super-secret-key" }
      });

      expect(result.status).toBe("pending_dns");
    });
  });

  describe("network failures", () => {
    it("returns ok:false naming the provider without leaking the credential when fetch rejects", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNRESET"));

      const result = await verifyCredentials("sendgrid", {
        publicConfig: {},
        secrets: { apiKey: "SG.super-secret-key" }
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("sendgrid");
      expect(result.message).not.toContain("SG.super-secret-key");
    });
  });

  describe("unimplemented providers", () => {
    it("returns ok:false with a Spanish not-implemented message instead of throwing", async () => {
      const result = await verifyCredentials("stripe", { publicConfig: {}, secrets: {} });

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Verificación no implementada para stripe");
    });
  });

  describe("secret redaction", () => {
    it("never includes the submitted secret value in any returned message", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Authentication Error"
      });

      const secret = "super-secret-value-12345";
      const result = await verifyCredentials("twilio_whatsapp", {
        publicConfig: { accountSid: "AC123" },
        secrets: { authToken: secret }
      });

      expect(result.message).not.toContain(secret);
    });
  });
});
