import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";

const mockAccountsCreate = vi.fn();
const mockChannelsSendersCreate = vi.fn();
const mockChannelsSenderFetch = vi.fn();

/**
 * `channelsSenders` on the real SDK is both callable (`channelsSenders(sid)` → context
 * with `.fetch()`) and carries a `.create()` method — mirrored here with Object.assign
 * so both call shapes used by the service are exercised.
 */
function makeChannelsSenders() {
  const callable = Object.assign((_sid: string) => ({ fetch: mockChannelsSenderFetch }), {
    create: mockChannelsSendersCreate
  });
  return callable;
}

const mockClientFactory = vi.fn(() => ({
  api: { v2010: { accounts: { create: mockAccountsCreate } } },
  messaging: { v2: { channelsSenders: makeChannelsSenders() } }
}));

vi.mock("twilio", () => ({
  default: mockClientFactory
}));

import { TwilioProvisioningService } from "./twilio-provisioning.service";

const PLATFORM_SID = "ACplatformisv0000000000000000000";
const PLATFORM_TOKEN = "platform-isv-token";
const SUBACCOUNT_SID = "ACsubaccount00000000000000000000";
const SUBACCOUNT_TOKEN = "subaccount-token-secret";

function makeConfig(): ConfigService {
  const map: Record<string, string> = {
    TWILIO_ISV_ACCOUNT_SID: PLATFORM_SID,
    TWILIO_ISV_AUTH_TOKEN: PLATFORM_TOKEN
  };
  return {
    get: (key: string) => map[key],
    getOrThrow: (key: string) => {
      const val = map[key];
      if (!val) throw new Error(`Missing config: ${key}`);
      return val;
    }
  } as unknown as ConfigService;
}

describe("TwilioProvisioningService", () => {
  let service: TwilioProvisioningService;
  let logSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TwilioProvisioningService(makeConfig());
    // Spy on the logger instance's methods to assert no credential ever reaches them.
    logSpy = vi.fn();
    errorSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).logger.log = logSpy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).logger.error = errorSpy;
  });

  describe("createSubaccount", () => {
    it("creates a subaccount with a friendly name derived from the tenant and returns sid/authToken", async () => {
      mockAccountsCreate.mockResolvedValueOnce({
        sid: SUBACCOUNT_SID,
        authToken: SUBACCOUNT_TOKEN,
        friendlyName: "tenant-t1-Acme"
      });

      const result = await service.createSubaccount("t1", "Acme");

      expect(mockAccountsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ friendlyName: expect.stringContaining("t1") })
      );
      expect(result).toEqual({
        accountSid: SUBACCOUNT_SID,
        authToken: SUBACCOUNT_TOKEN,
        friendlyName: "tenant-t1-Acme"
      });
    });

    it("throws ServiceUnavailableException carrying Twilio's own error message when the API rejects the request", async () => {
      mockAccountsCreate.mockRejectedValueOnce(new Error("Accounts limit exceeded"));

      await expect(service.createSubaccount("t1", "Acme")).rejects.toMatchObject({
        message: "Accounts limit exceeded",
        status: 503
      });
    });
  });

  describe("registerWhatsAppSender", () => {
    const baseInput = {
      subaccountSid: SUBACCOUNT_SID,
      subaccountAuthToken: SUBACCOUNT_TOKEN,
      wabaId: "waba-12345",
      phoneNumberE164: "+573001234567",
      businessName: "Acme Cobranzas",
      webhookUrl: "https://api.cobrai.dev/v1/webhooks/twilio_whatsapp/tok-abc"
    };

    it("constructs a Twilio client from the subaccount SID and auth token, never the platform client", async () => {
      mockChannelsSendersCreate.mockResolvedValueOnce({
        sid: "XE1234",
        status: "CREATING",
        senderId: "whatsapp:+573001234567"
      });

      await service.registerWhatsAppSender(baseInput);

      const subaccountCalls = mockClientFactory.mock.calls.filter(
        (call) => call[0] === SUBACCOUNT_SID && call[1] === SUBACCOUNT_TOKEN
      );
      expect(subaccountCalls.length).toBeGreaterThan(0);
      const platformSidCalls = mockClientFactory.mock.calls.filter((call) => call[0] === PLATFORM_SID);
      expect(platformSidCalls.length).toBe(0);
    });

    it("sends the WABA id in the sender configuration and the webhook URL in the sender webhook configuration", async () => {
      mockChannelsSendersCreate.mockResolvedValueOnce({
        sid: "XE1234",
        status: "CREATING",
        senderId: "whatsapp:+573001234567"
      });

      await service.registerWhatsAppSender(baseInput);

      expect(mockChannelsSendersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          senderId: "whatsapp:+573001234567",
          configuration: expect.objectContaining({ wabaId: "waba-12345" }),
          webhook: expect.objectContaining({ callbackUrl: baseInput.webhookUrl })
        })
      );
    });

    it("returns the sender SID and status on success", async () => {
      mockChannelsSendersCreate.mockResolvedValueOnce({
        sid: "XE1234",
        status: "CREATING",
        senderId: "whatsapp:+573001234567"
      });

      const result = await service.registerWhatsAppSender(baseInput);

      expect(result).toEqual({
        senderSid: "XE1234",
        status: "CREATING",
        phoneNumber: "+573001234567"
      });
    });

    it("surfaces a Twilio 'WABA already associated' error as a failure result carrying the provider message verbatim", async () => {
      mockChannelsSendersCreate.mockRejectedValueOnce(new Error("WABA already associated with another sender"));

      const result = await service.registerWhatsAppSender(baseInput);

      expect(result).toEqual({ error: "WABA already associated with another sender" });
    });

    it("does not log the subaccount auth token anywhere", async () => {
      mockChannelsSendersCreate.mockRejectedValueOnce(new Error("boom"));

      await service.registerWhatsAppSender(baseInput);

      const allLoggedStrings = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call) => String(call[0]));
      expect(allLoggedStrings.some((s) => s.includes(SUBACCOUNT_TOKEN))).toBe(false);
    });
  });

  describe("getSenderStatus", () => {
    it("returns the raw provider status string without remapping it", async () => {
      mockChannelsSenderFetch.mockResolvedValueOnce({ status: "VERIFYING" });

      const status = await service.getSenderStatus(SUBACCOUNT_SID, SUBACCOUNT_TOKEN, "XE1234");

      expect(status).toBe("VERIFYING");
    });

    it.each(["CREATING", "OFFLINE", "VERIFYING", "ONLINE"])("passes through status=%s verbatim", async (raw) => {
      mockChannelsSenderFetch.mockResolvedValueOnce({ status: raw });

      const status = await service.getSenderStatus(SUBACCOUNT_SID, SUBACCOUNT_TOKEN, "XE1234");

      expect(status).toBe(raw);
    });

    it("builds the client from subaccount credentials, not the platform client", async () => {
      mockChannelsSenderFetch.mockResolvedValueOnce({ status: "ONLINE" });

      await service.getSenderStatus(SUBACCOUNT_SID, SUBACCOUNT_TOKEN, "XE1234");

      const subaccountCalls = mockClientFactory.mock.calls.filter(
        (call) => call[0] === SUBACCOUNT_SID && call[1] === SUBACCOUNT_TOKEN
      );
      expect(subaccountCalls.length).toBeGreaterThan(0);
    });

    it("does not log the subaccount auth token anywhere", async () => {
      mockChannelsSenderFetch.mockResolvedValueOnce({ status: "ONLINE" });

      await service.getSenderStatus(SUBACCOUNT_SID, SUBACCOUNT_TOKEN, "XE1234");

      const allLoggedStrings = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call) => String(call[0]));
      expect(allLoggedStrings.some((s) => s.includes(SUBACCOUNT_TOKEN))).toBe(false);
    });
  });
});
