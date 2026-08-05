import { describe, expect, it, beforeEach } from "vitest";
import type { TenantIntegrationService, DecryptedIntegration } from "@cobrai/integrations";
import type { TwilioProvisioningService } from "./twilio-provisioning.service";
import type { VapiProvisioningService } from "./vapi-provisioning.service";
import { WhatsAppConnectService } from "./whatsapp-connect.service";
import { BYO_ACCOUNT_SID, BYO_AUTH_TOKEN, SUBACCOUNT, baseView, makeCollaboratorMocks, makeConfig } from "./whatsapp-connect.fixtures";

describe("WhatsAppConnectService — connectByo / refreshSenderStatus", () => {
  let mocks: ReturnType<typeof makeCollaboratorMocks>;
  let service: WhatsAppConnectService;

  beforeEach(() => {
    mocks = makeCollaboratorMocks();
    service = new WhatsAppConnectService(
      mocks.twilioProvisioning as unknown as TwilioProvisioningService,
      mocks.vapiProvisioning as unknown as VapiProvisioningService,
      mocks.tenantIntegrations as unknown as TenantIntegrationService,
      makeConfig()
    );
  });

  function byoInput() {
    return {
      tenantId: "tenant-2",
      accountSid: BYO_ACCOUNT_SID,
      authToken: BYO_AUTH_TOKEN,
      phoneNumberE164: "+573009998877"
    };
  }

  describe("connectByo", () => {
    it("skips subaccount creation entirely and verifies the pasted credentials via upsert", async () => {
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo", status: "verified" }));
      mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-byo" });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
        baseView({ provider: "twilio_voice", channel: "voice", mode: "byo", status: "verified" })
      );

      await service.connectByo(byoInput());

      expect(mocks.twilioProvisioning.createSubaccount).not.toHaveBeenCalled();
      const whatsappCall = mocks.tenantIntegrations.upsert.mock.calls[0];
      expect((whatsappCall[0] as { mode: string }).mode).toBe("byo");
      expect((whatsappCall[0] as { overrideStatus: unknown }).overrideStatus).toBeUndefined();
      expect((whatsappCall[0] as { skipVerification: unknown }).skipVerification).toBeUndefined();
    });

    it("on success, imports the number into Vapi and persists twilio_voice the same way as connectManaged", async () => {
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo", status: "verified" }));
      mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-byo" });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
        baseView({ provider: "twilio_voice", channel: "voice", mode: "byo", status: "verified" })
      );

      await service.connectByo(byoInput());

      expect(mocks.vapiProvisioning.importTwilioNumber).toHaveBeenCalledWith(
        expect.objectContaining({
          numberE164: "+573009998877",
          twilioAccountSid: BYO_ACCOUNT_SID,
          twilioAuthToken: BYO_AUTH_TOKEN
        })
      );
      const voiceCall = mocks.tenantIntegrations.upsert.mock.calls[1];
      expect((voiceCall[0] as { mode: string }).mode).toBe("byo");
    });

    it("does not attempt Vapi import when credential verification fails", async () => {
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
        baseView({ mode: "byo", status: "failed", failureMessage: "Credenciales inválidas" })
      );

      const result = await service.connectByo(byoInput());

      expect(mocks.vapiProvisioning.importTwilioNumber).not.toHaveBeenCalled();
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
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(storedIntegration());
      mocks.twilioProvisioning.getSenderStatus.mockResolvedValueOnce("ONLINE");
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ status: "verified" }));

      const result = await service.refreshSenderStatus("tenant-1");

      expect(mocks.twilioProvisioning.getSenderStatus).toHaveBeenCalledWith(
        SUBACCOUNT.accountSid,
        SUBACCOUNT.authToken,
        "XE1234"
      );
      expect(result.status).toBe("verified");
    });

    it("returns the current state unchanged when there is no senderSid to poll yet (e.g. BYO mode)", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(
        storedIntegration({ mode: "byo", status: "verified", publicConfig: { accountSid: BYO_ACCOUNT_SID } })
      );
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo", status: "verified" }));

      const result = await service.refreshSenderStatus("tenant-1");

      expect(mocks.twilioProvisioning.getSenderStatus).not.toHaveBeenCalled();
      expect(result.status).toBe("verified");
    });
  });
});
