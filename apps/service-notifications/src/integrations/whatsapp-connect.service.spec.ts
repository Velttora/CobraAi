import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { TenantIntegrationService, IntegrationView, DecryptedIntegration } from "@cobrai/integrations";
import type { TwilioProvisioningService } from "./twilio-provisioning.service";
import type { VapiProvisioningService } from "./vapi-provisioning.service";
import { WhatsAppConnectService } from "./whatsapp-connect.service";

const BASE_WEBHOOK_URL = "https://api.cobrai.dev/v1/webhooks";
const SUBACCOUNT = { accountSid: "ACsubaccount0000000000000000000", authToken: "subaccount-secret-token" };
const BYO_ACCOUNT_SID = "ACbyoaccount00000000000000000000";
const BYO_AUTH_TOKEN = "byo-secret-token";

function makeConfig(): ConfigService {
  return {
    get: vi.fn((key: string) => (key === "PUBLIC_WEBHOOK_BASE_URL" ? BASE_WEBHOOK_URL : undefined))
  } as unknown as ConfigService;
}

function baseView(overrides: Partial<IntegrationView> = {}): IntegrationView {
  return {
    provider: "twilio_whatsapp",
    channel: "whatsapp",
    mode: "managed",
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: `${BASE_WEBHOOK_URL}/twilio_whatsapp/tok-abc`,
    ...overrides
  };
}

describe("WhatsAppConnectService", () => {
  let twilioProvisioning: { createSubaccount: ReturnType<typeof vi.fn>; registerWhatsAppSender: ReturnType<typeof vi.fn>; getSenderStatus: ReturnType<typeof vi.fn> };
  let vapiProvisioning: { importTwilioNumber: ReturnType<typeof vi.fn>; releaseNumber: ReturnType<typeof vi.fn> };
  let tenantIntegrations: { upsert: ReturnType<typeof vi.fn>; resolveAny: ReturnType<typeof vi.fn> };
  let service: WhatsAppConnectService;

  beforeEach(() => {
    twilioProvisioning = {
      createSubaccount: vi.fn(),
      registerWhatsAppSender: vi.fn(),
      getSenderStatus: vi.fn()
    };
    vapiProvisioning = { importTwilioNumber: vi.fn(), releaseNumber: vi.fn() };
    tenantIntegrations = { upsert: vi.fn(), resolveAny: vi.fn() };

    service = new WhatsAppConnectService(
      twilioProvisioning as unknown as TwilioProvisioningService,
      vapiProvisioning as unknown as VapiProvisioningService,
      tenantIntegrations as unknown as TenantIntegrationService,
      makeConfig()
    );
  });

  function managedInput() {
    return {
      tenantId: "tenant-1",
      wabaId: "waba-999",
      phoneNumberId: "meta-phone-handle-xyz",
      phoneNumberE164: "+573001234567",
      businessName: "Acme Cobranzas"
    };
  }

  describe("connectManaged", () => {
    it("creates a subaccount, registers the sender with the WABA id, and returns pending_meta for CREATING/OFFLINE/VERIFYING", async () => {
      twilioProvisioning.createSubaccount.mockResolvedValueOnce({ ...SUBACCOUNT, friendlyName: "tenant-1-Acme" });
      tenantIntegrations.upsert
        .mockResolvedValueOnce(baseView({ status: "verified" })) // placeholder persist (skipVerification)
        .mockResolvedValueOnce(baseView({ status: "pending_meta" })) // final whatsapp status
        .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" })); // voice
      twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
        senderSid: "XE1234",
        status: "CREATING",
        phoneNumber: "+573001234567"
      });
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

      const result = await service.connectManaged(managedInput());

      expect(twilioProvisioning.createSubaccount).toHaveBeenCalledWith("tenant-1", "Acme Cobranzas");
      expect(twilioProvisioning.registerWhatsAppSender).toHaveBeenCalledWith(
        expect.objectContaining({
          subaccountSid: SUBACCOUNT.accountSid,
          subaccountAuthToken: SUBACCOUNT.authToken,
          wabaId: "waba-999"
        })
      );
      expect(result.status).toBe("pending_meta");
    });

    it("returns status verified when the sender status is already ONLINE", async () => {
      twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
      tenantIntegrations.upsert
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
      twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
        senderSid: "XE1234",
        status: "ONLINE",
        phoneNumber: "+573001234567"
      });
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

      const result = await service.connectManaged(managedInput());

      expect(result.status).toBe("verified");
    });

    it("imports the number into Vapi and persists twilio_voice with vapiPhoneNumberId and outboundNumber", async () => {
      twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
      tenantIntegrations.upsert
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
      twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
        senderSid: "XE1234",
        status: "ONLINE",
        phoneNumber: "+573001234567"
      });
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

      await service.connectManaged(managedInput());

      expect(vapiProvisioning.importTwilioNumber).toHaveBeenCalledWith(
        expect.objectContaining({
          numberE164: "+573001234567",
          twilioAccountSid: SUBACCOUNT.accountSid,
          twilioAuthToken: SUBACCOUNT.authToken
        })
      );
      const voiceUpsertCall = tenantIntegrations.upsert.mock.calls.find(
        (call) => call[0].provider === "twilio_voice"
      );
      expect(voiceUpsertCall[0].publicConfig).toMatchObject({
        vapiPhoneNumberId: "vapi-num-1",
        outboundNumber: "+573001234567"
      });
    });

    it("when the Vapi import fails, twilio_whatsapp stays persisted and twilio_voice is persisted as failed with the Vapi message", async () => {
      twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
      tenantIntegrations.upsert
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "failed" }));
      twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
        senderSid: "XE1234",
        status: "ONLINE",
        phoneNumber: "+573001234567"
      });
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ error: "Vapi rechazó el número" });

      const result = await service.connectManaged(managedInput());

      // The WhatsApp connection result is unaffected by the voice-side failure.
      expect(result.status).toBe("verified");
      const voiceUpsertCall = tenantIntegrations.upsert.mock.calls.find(
        (call) => call[0].provider === "twilio_voice"
      );
      expect(voiceUpsertCall[0].overrideStatus).toEqual({ status: "failed", failureMessage: "Vapi rechazó el número" });
    });

    it("when sender registration fails, twilio_whatsapp is persisted as failed, never left verified", async () => {
      twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
      tenantIntegrations.upsert
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ status: "failed", failureMessage: "WABA already associated" }))
        .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
      twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({ error: "WABA already associated" });
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

      const result = await service.connectManaged(managedInput());

      expect(result.status).toBe("failed");
      const whatsappCalls = tenantIntegrations.upsert.mock.calls.filter((call) => call[0].provider === "twilio_whatsapp");
      const finalWhatsappCall = whatsappCalls[whatsappCalls.length - 1];
      expect(finalWhatsappCall[0].overrideStatus).toEqual({ status: "failed", failureMessage: "WABA already associated" });
    });

    it("never writes the Meta phoneNumberId to any upsert call argument", async () => {
      twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
      tenantIntegrations.upsert
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
      twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
        senderSid: "XE1234",
        status: "ONLINE",
        phoneNumber: "+573001234567"
      });
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

      await service.connectManaged(managedInput());

      const serializedCalls = JSON.stringify(tenantIntegrations.upsert.mock.calls);
      expect(serializedCalls).not.toContain("meta-phone-handle-xyz");
    });

    it("never writes the subaccount auth token into any publicConfig argument", async () => {
      twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
      tenantIntegrations.upsert
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ status: "verified" }))
        .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
      twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
        senderSid: "XE1234",
        status: "ONLINE",
        phoneNumber: "+573001234567"
      });
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

      await service.connectManaged(managedInput());

      for (const call of tenantIntegrations.upsert.mock.calls) {
        expect(JSON.stringify(call[0].publicConfig)).not.toContain(SUBACCOUNT.authToken);
      }
    });
  });

  describe("connectByo", () => {
    function byoInput() {
      return {
        tenantId: "tenant-2",
        accountSid: BYO_ACCOUNT_SID,
        authToken: BYO_AUTH_TOKEN,
        phoneNumberE164: "+573009998877"
      };
    }

    it("skips subaccount creation entirely and verifies the pasted credentials via upsert", async () => {
      tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo", status: "verified" }));
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-byo" });
      tenantIntegrations.upsert.mockResolvedValueOnce(
        baseView({ provider: "twilio_voice", channel: "voice", mode: "byo", status: "verified" })
      );

      await service.connectByo(byoInput());

      expect(twilioProvisioning.createSubaccount).not.toHaveBeenCalled();
      const whatsappCall = tenantIntegrations.upsert.mock.calls[0];
      expect(whatsappCall[0].mode).toBe("byo");
      expect(whatsappCall[0].overrideStatus).toBeUndefined();
      expect(whatsappCall[0].skipVerification).toBeUndefined();
    });

    it("on success, imports the number into Vapi and persists twilio_voice the same way as connectManaged", async () => {
      tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo", status: "verified" }));
      vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-byo" });
      tenantIntegrations.upsert.mockResolvedValueOnce(
        baseView({ provider: "twilio_voice", channel: "voice", mode: "byo", status: "verified" })
      );

      await service.connectByo(byoInput());

      expect(vapiProvisioning.importTwilioNumber).toHaveBeenCalledWith(
        expect.objectContaining({
          numberE164: "+573009998877",
          twilioAccountSid: BYO_ACCOUNT_SID,
          twilioAuthToken: BYO_AUTH_TOKEN
        })
      );
      const voiceCall = tenantIntegrations.upsert.mock.calls[1];
      expect(voiceCall[0].mode).toBe("byo");
    });

    it("does not attempt Vapi import when credential verification fails", async () => {
      tenantIntegrations.upsert.mockResolvedValueOnce(
        baseView({ mode: "byo", status: "failed", failureMessage: "Credenciales inválidas" })
      );

      const result = await service.connectByo(byoInput());

      expect(vapiProvisioning.importTwilioNumber).not.toHaveBeenCalled();
      expect(result.status).toBe("failed");
    });
  });

  describe("refreshSenderStatus", () => {
    function storedIntegration(overrides: Partial<DecryptedIntegration> = {}): DecryptedIntegration {
      return {
        id: "row-1",
        tenantId: "tenant-1",
        provider: "twilio_whatsapp",
        mode: "managed",
        status: "pending_meta",
        publicConfig: { senderSid: "XE1234", subaccountSid: SUBACCOUNT.accountSid },
        secrets: { accountSid: SUBACCOUNT.accountSid, authToken: SUBACCOUNT.authToken },
        webhookToken: "tok-abc",
        verifiedAt: null,
        ...overrides
      };
    }

    it("re-reads the sender status with the stored subaccount credentials and flips pending_meta to verified on ONLINE", async () => {
      tenantIntegrations.resolveAny.mockResolvedValueOnce(storedIntegration());
      twilioProvisioning.getSenderStatus.mockResolvedValueOnce("ONLINE");
      tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ status: "verified" }));

      const result = await service.refreshSenderStatus("tenant-1");

      expect(twilioProvisioning.getSenderStatus).toHaveBeenCalledWith(
        SUBACCOUNT.accountSid,
        SUBACCOUNT.authToken,
        "XE1234"
      );
      expect(result.status).toBe("verified");
    });
  });
});
