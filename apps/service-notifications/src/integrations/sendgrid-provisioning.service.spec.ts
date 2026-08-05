import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { SendgridProvisioningService } from "./sendgrid-provisioning.service";

const PARENT_API_KEY = "SG.parent-key-secret";

function makeConfig(): ConfigService {
  return {
    get: vi.fn((key: string) => (key === "SENDGRID_PARENT_API_KEY" ? PARENT_API_KEY : undefined))
  } as unknown as ConfigService;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function textErrorResponse(detail: string, status = 400) {
  return { ok: false, status, text: async () => detail, json: async () => ({ errors: [{ message: detail }] }) };
}

const DNS_PAYLOAD = {
  mail_cname: { valid: true, type: "cname", host: "mail.example.com", data: "u7.wl.sendgrid.net" },
  dkim1: { valid: false, type: "cname", host: "s1._domainkey.example.com", data: "s1._domainkey.u7.wl.sendgrid.net" },
  dkim2: { valid: false, type: "cname", host: "s2._domainkey.example.com", data: "s2._domainkey.u7.wl.sendgrid.net" }
};

describe("SendgridProvisioningService", () => {
  let service: SendgridProvisioningService;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    service = new SendgridProvisioningService(makeConfig());
    errorSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).logger.error = errorSpy;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createSubuser", () => {
    it("creates the subuser with the parent key, a tenant-derived username and admin email, then mints a scoped API key via On-Behalf-Of", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ username: "tenant-t1", user_id: 555 }))
        .mockResolvedValueOnce(jsonResponse({ api_key: "SG.subuser-key" }));

      const result = await service.createSubuser("t1", "admin@tenant.com");

      expect(result).toEqual({ username: "tenant-t1", userId: 555, apiKey: "SG.subuser-key" });

      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      const subuserCall = calls[0]!;
      const apiKeyCall = calls[1]!;
      expect(subuserCall[0]).toBe("https://api.sendgrid.com/v3/subusers");
      const subuserHeaders = subuserCall[1].headers as Record<string, string>;
      expect(subuserHeaders["Authorization"]).toBe(`Bearer ${PARENT_API_KEY}`);
      expect(subuserHeaders["On-Behalf-Of"]).toBeUndefined();
      const subuserBody = JSON.parse(subuserCall[1].body as string);
      expect(subuserBody.username).toBe("tenant-t1");
      expect(subuserBody.email).toBe("admin@tenant.com");

      expect(apiKeyCall[0]).toBe("https://api.sendgrid.com/v3/api_keys");
      const apiKeyHeaders = apiKeyCall[1].headers as Record<string, string>;
      expect(apiKeyHeaders["Authorization"]).toBe(`Bearer ${PARENT_API_KEY}`);
      expect(apiKeyHeaders["On-Behalf-Of"]).toBe("tenant-t1");
    });

    it("never returns, logs or persists the generated subuser password", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ username: "tenant-t1", user_id: 555 }))
        .mockResolvedValueOnce(jsonResponse({ api_key: "SG.subuser-key" }));

      const result = await service.createSubuser("t1", "admin@tenant.com");

      const subuserCall = fetchMock.mock.calls[0] as [string, RequestInit];
      const generatedPassword = (JSON.parse(subuserCall[1].body as string) as { password: string }).password;
      expect(generatedPassword).toBeTruthy();
      expect(JSON.stringify(result)).not.toContain(generatedPassword);
      const loggedStrings = errorSpy.mock.calls.map((call) => String(call[0]));
      expect(loggedStrings.some((s) => s.includes(generatedPassword))).toBe(false);
    });

    it("surfaces SendGrid's own error text on a non-ok response, including a below-Pro plan-restriction error", async () => {
      fetchMock.mockResolvedValueOnce(
        textErrorResponse("Subusers are not available on your current plan. Upgrade to Pro or above.")
      );

      await expect(service.createSubuser("t1", "admin@tenant.com")).rejects.toMatchObject({
        message: "Subusers are not available on your current plan. Upgrade to Pro or above."
      });
    });

    it("converts a network throw into an error naming SendGrid, containing no credential", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

      await expect(service.createSubuser("t1", "admin@tenant.com")).rejects.toMatchObject({
        message: expect.stringContaining("SendGrid")
      });
    });

    it("never logs the parent API key or the generated subuser key", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ username: "tenant-t1", user_id: 555 }))
        .mockResolvedValueOnce(jsonResponse({ api_key: "SG.subuser-key" }));

      const result = await service.createSubuser("t1", "admin@tenant.com");

      const loggedStrings = errorSpy.mock.calls.map((call) => String(call[0]));
      expect(loggedStrings.some((s) => s.includes(PARENT_API_KEY))).toBe(false);
      expect(loggedStrings.some((s) => s.includes(result.apiKey))).toBe(false);
    });
  });

  describe("authenticateDomain", () => {
    it("authenticates the domain and associates it with the subuser, both parent-authenticated with no On-Behalf-Of", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: false, dns: DNS_PAYLOAD }))
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: false, dns: DNS_PAYLOAD, username: "tenant-t1" }));

      await service.authenticateDomain("tenant-t1", "tenant.com");

      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      const createCall = calls[0]!;
      const associateCall = calls[1]!;
      expect(createCall[0]).toBe("https://api.sendgrid.com/v3/whitelabel/domains");
      expect((createCall[1].headers as Record<string, string>)["On-Behalf-Of"]).toBeUndefined();

      expect(associateCall[0]).toBe("https://api.sendgrid.com/v3/whitelabel/domains/42/subuser");
      expect((associateCall[1].headers as Record<string, string>)["On-Behalf-Of"]).toBeUndefined();
      expect(JSON.parse(associateCall[1].body as string)).toEqual({ username: "tenant-t1" });
    });

    it("returns the domain id plus the CNAME records with their per-record validity", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: false, dns: DNS_PAYLOAD }))
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: false, dns: DNS_PAYLOAD }));

      const result = await service.authenticateDomain("tenant-t1", "tenant.com");

      expect(result.domainId).toBe(42);
      expect(result.valid).toBe(false);
      expect(result.records).toHaveLength(3);
      expect(result.records).toContainEqual({
        type: "CNAME",
        host: "mail.example.com",
        value: "u7.wl.sendgrid.net",
        verified: true
      });
      expect(result.records).toContainEqual({
        type: "CNAME",
        host: "s1._domainkey.example.com",
        value: "s1._domainkey.u7.wl.sendgrid.net",
        verified: false
      });
    });

    it("reports valid: true once all records are validated", async () => {
      const validDns = Object.fromEntries(
        Object.entries(DNS_PAYLOAD).map(([key, entry]) => [key, { ...entry, valid: true }])
      );
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: true, dns: validDns }))
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: true, dns: validDns }));

      const result = await service.authenticateDomain("tenant-t1", "tenant.com");

      expect(result.valid).toBe(true);
      expect(result.records.every((record) => record.verified)).toBe(true);
    });

    it("throws carrying SendGrid's own text when the create call fails", async () => {
      fetchMock.mockResolvedValueOnce(textErrorResponse("Domain already exists"));

      await expect(service.authenticateDomain("tenant-t1", "tenant.com")).rejects.toMatchObject({
        message: "Domain already exists"
      });
    });

    it("throws carrying SendGrid's own text when the associate call fails", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: false, dns: DNS_PAYLOAD }))
        .mockResolvedValueOnce(textErrorResponse("Subuser not found"));

      await expect(service.authenticateDomain("tenant-t1", "tenant.com")).rejects.toMatchObject({
        message: "Subuser not found"
      });
    });

    it("never logs the parent API key", async () => {
      fetchMock.mockResolvedValueOnce(textErrorResponse("boom"));

      await expect(service.authenticateDomain("tenant-t1", "tenant.com")).rejects.toBeDefined();

      const loggedStrings = errorSpy.mock.calls.map((call) => String(call[0]));
      expect(loggedStrings.some((s) => s.includes(PARENT_API_KEY))).toBe(false);
    });
  });

  describe("validateDomain", () => {
    it("re-checks and returns updated per-record validity plus the overall valid flag", async () => {
      const validDns = Object.fromEntries(
        Object.entries(DNS_PAYLOAD).map(([key, entry]) => [key, { ...entry, valid: true }])
      );
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 42, valid: true, validation_results: {} }))
        .mockResolvedValueOnce(jsonResponse({ id: 42, domain: "tenant.com", valid: true, dns: validDns }));

      const result = await service.validateDomain("tenant-t1", 42);

      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.sendgrid.com/v3/whitelabel/domains/42/validate", expect.any(Object));
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.sendgrid.com/v3/whitelabel/domains/42", expect.any(Object));
      expect(result.valid).toBe(true);
      expect(result.records.every((record) => record.verified)).toBe(true);
    });

    it("throws carrying SendGrid's own text when the validate call fails", async () => {
      fetchMock.mockResolvedValueOnce(textErrorResponse("Domain not found"));

      await expect(service.validateDomain("tenant-t1", 42)).rejects.toMatchObject({
        message: "Domain not found"
      });
    });
  });

  describe("deleteSubuser", () => {
    it("issues the delete call with the parent key", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });

      await service.deleteSubuser("tenant-t1");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.sendgrid.com/v3/subusers/tenant-t1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("treats a 404 as already-deleted rather than throwing", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" });

      await expect(service.deleteSubuser("tenant-t1")).resolves.toBeUndefined();
    });
  });
});
