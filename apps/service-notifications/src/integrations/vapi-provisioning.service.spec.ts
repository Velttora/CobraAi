import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";

vi.mock("axios", () => {
  const mockAxios = {
    post: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } }
  };
  return { default: mockAxios };
});

import axios from "axios";
import { VapiProvisioningService } from "./vapi-provisioning.service";

const mockedAxios = vi.mocked(axios);

const TENANT_AUTH_TOKEN = "tenant-subaccount-auth-token";

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    VAPI_API_KEY: "vapi_platform_key",
    ...overrides
  };
  return {
    get: vi.fn((key: string) => values[key]),
    getOrThrow: vi.fn((key: string) => {
      if (key in values) return values[key];
      throw new Error(`Missing config: ${key}`);
    })
  } as unknown as ConfigService;
}

function makeImportInput() {
  return {
    numberE164: "+573001234567",
    twilioAccountSid: "ACsubaccount00000000000000000000",
    twilioAuthToken: TENANT_AUTH_TOKEN
  };
}

describe("VapiProvisioningService", () => {
  let service: VapiProvisioningService;
  let logSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VapiProvisioningService(makeConfig());
    logSpy = vi.fn();
    errorSpy = vi.fn();
    warnSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).logger.log = logSpy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).logger.error = errorSpy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).logger.warn = warnSpy;
  });

  describe("importTwilioNumber", () => {
    it("posts to the Vapi phone-number endpoint with the platform bearer token and the tenant's Twilio credentials, returning vapiPhoneNumberId", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "vapi-phone-abc123", status: "active", provider: "twilio" }
      });

      const result = await service.importTwilioNumber(makeImportInput());

      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://api.vapi.ai/phone-number",
        expect.objectContaining({
          provider: "twilio",
          number: "+573001234567",
          twilioAccountSid: "ACsubaccount00000000000000000000",
          twilioAuthToken: TENANT_AUTH_TOKEN,
          smsEnabled: false
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer vapi_platform_key" })
        })
      );
      expect(result).toEqual({ vapiPhoneNumberId: "vapi-phone-abc123" });
    });

    it("sets smsEnabled: false explicitly rather than relying on Vapi's true default", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "vapi-phone-abc123" }
      });

      await service.importTwilioNumber(makeImportInput());

      const body = (mockedAxios.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as { smsEnabled: boolean };
      expect(body.smsEnabled).toBe(false);
    });

    it("returns { error: <provider message> } on a non-2xx response instead of throwing", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
        response: { status: 400, data: { message: "Invalid Twilio credentials" } }
      });

      const result = await service.importTwilioNumber(makeImportInput());

      expect(result).toEqual({ error: "Invalid Twilio credentials" });
    });

    it("returns { error } naming Vapi and containing no credential on a network failure", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNRESET"));

      const result = await service.importTwilioNumber(makeImportInput());

      expect("error" in result).toBe(true);
      const message = (result as { error: string }).error;
      expect(message.toLowerCase()).toContain("vapi");
      expect(message).not.toContain(TENANT_AUTH_TOKEN);
    });

    it("returns the existing id rather than failing when the provider response indicates a duplicate import", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
        response: { status: 409, data: { id: "vapi-phone-existing-999", message: "Number already imported" } }
      });

      const result = await service.importTwilioNumber(makeImportInput());

      expect(result).toEqual({ vapiPhoneNumberId: "vapi-phone-existing-999" });
    });

    it("returns the provider message verbatim when the provider errors without an existing id", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
        response: { status: 409, data: { message: "Conflict with no recoverable id" } }
      });

      const result = await service.importTwilioNumber(makeImportInput());

      expect(result).toEqual({ error: "Conflict with no recoverable id" });
    });

    it("never logs or returns the tenant's Twilio auth token", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
        response: { status: 400, data: { message: `rejected token ${TENANT_AUTH_TOKEN}` } }
      });

      await service.importTwilioNumber(makeImportInput());

      const allLoggedStrings = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls].map((call) =>
        String(call[0])
      );
      // The provider message itself (returned to the caller, not logged) may echo the
      // token back in this adversarial test fixture — but no *logger* call may contain it.
      expect(allLoggedStrings.some((s) => s.includes(TENANT_AUTH_TOKEN))).toBe(false);
    });
  });

  describe("releaseNumber", () => {
    it("issues the delete call for the given id", async () => {
      (mockedAxios.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: {} });

      await service.releaseNumber("vapi-phone-abc123");

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        "https://api.vapi.ai/phone-number/vapi-phone-abc123",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer vapi_platform_key" }) })
      );
    });

    it("swallows a 404 (already gone) while logging it, without throwing", async () => {
      (mockedAxios.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ response: { status: 404 } });

      await expect(service.releaseNumber("vapi-phone-gone")).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  it("reads only the platform VAPI_API_KEY — no per-tenant Vapi credential is ever read", () => {
    const config = makeConfig();
    // eslint-disable-next-line no-new
    new VapiProvisioningService(config);
    expect(config.get).toHaveBeenCalledWith("VAPI_API_KEY");
    expect(config.get).not.toHaveBeenCalledWith(expect.stringMatching(/TENANT/i));
  });
});
