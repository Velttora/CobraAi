import { describe, expect, it, beforeEach } from "vitest";
import type { TenantIntegrationService } from "@cobrai/integrations";
import type { TwilioProvisioningService } from "./twilio-provisioning.service";
import type { VapiProvisioningService } from "./vapi-provisioning.service";
import { WhatsAppConnectService } from "./whatsapp-connect.service";
import { SUBACCOUNT, baseView, makeCollaboratorMocks, makeConfig } from "./whatsapp-connect.fixtures";

describe("WhatsAppConnectService — connectManaged", () => {
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

  function managedInput() {
    return {
      tenantId: "tenant-1",
      wabaId: "waba-999",
      phoneNumberId: "meta-phone-handle-xyz",
      phoneNumberE164: "+573001234567",
      businessName: "Acme Cobranzas"
    };
  }

  it("creates a subaccount, registers the sender with the WABA id, and returns pending_meta for CREATING/OFFLINE/VERIFYING", async () => {
    mocks.twilioProvisioning.createSubaccount.mockResolvedValueOnce({ ...SUBACCOUNT, friendlyName: "tenant-1-Acme" });
    mocks.tenantIntegrations.upsert
      .mockResolvedValueOnce(baseView({ status: "verified" })) // placeholder persist (skipVerification)
      .mockResolvedValueOnce(baseView({ status: "pending_meta" })) // final whatsapp status
      .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" })); // voice
    mocks.twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
      senderSid: "XE1234",
      status: "CREATING",
      phoneNumber: "+573001234567"
    });
    mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

    const result = await service.connectManaged(managedInput());

    expect(mocks.twilioProvisioning.createSubaccount).toHaveBeenCalledWith("tenant-1", "Acme Cobranzas");
    expect(mocks.twilioProvisioning.registerWhatsAppSender).toHaveBeenCalledWith(
      expect.objectContaining({
        subaccountSid: SUBACCOUNT.accountSid,
        subaccountAuthToken: SUBACCOUNT.authToken,
        wabaId: "waba-999"
      })
    );
    expect(result.status).toBe("pending_meta");
  });

  it("returns status verified when the sender status is already ONLINE", async () => {
    mocks.twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
    mocks.tenantIntegrations.upsert
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
    mocks.twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
      senderSid: "XE1234",
      status: "ONLINE",
      phoneNumber: "+573001234567"
    });
    mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

    const result = await service.connectManaged(managedInput());

    expect(result.status).toBe("verified");
  });

  it("imports the number into Vapi and persists twilio_voice with vapiPhoneNumberId and outboundNumber", async () => {
    mocks.twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
    mocks.tenantIntegrations.upsert
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
    mocks.twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
      senderSid: "XE1234",
      status: "ONLINE",
      phoneNumber: "+573001234567"
    });
    mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

    await service.connectManaged(managedInput());

    expect(mocks.vapiProvisioning.importTwilioNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        numberE164: "+573001234567",
        twilioAccountSid: SUBACCOUNT.accountSid,
        twilioAuthToken: SUBACCOUNT.authToken
      })
    );
    const voiceUpsertCall = mocks.tenantIntegrations.upsert.mock.calls.find(
      (call: unknown[]) => (call[0] as { provider: string }).provider === "twilio_voice"
    );
    expect((voiceUpsertCall![0] as { publicConfig: Record<string, unknown> }).publicConfig).toMatchObject({
      vapiPhoneNumberId: "vapi-num-1",
      outboundNumber: "+573001234567"
    });
  });

  it("when the Vapi import fails, twilio_whatsapp stays persisted and twilio_voice is persisted as failed with the Vapi message", async () => {
    mocks.twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
    mocks.tenantIntegrations.upsert
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "failed" }));
    mocks.twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
      senderSid: "XE1234",
      status: "ONLINE",
      phoneNumber: "+573001234567"
    });
    mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ error: "Vapi rechazó el número" });

    const result = await service.connectManaged(managedInput());

    // The WhatsApp connection result is unaffected by the voice-side failure.
    expect(result.status).toBe("verified");
    const voiceUpsertCall = mocks.tenantIntegrations.upsert.mock.calls.find(
      (call: unknown[]) => (call[0] as { provider: string }).provider === "twilio_voice"
    );
    expect((voiceUpsertCall![0] as { overrideStatus: unknown }).overrideStatus).toEqual({
      status: "failed",
      failureMessage: "Vapi rechazó el número"
    });
  });

  it("when sender registration fails, twilio_whatsapp is persisted as failed, never left verified", async () => {
    mocks.twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
    mocks.tenantIntegrations.upsert
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ status: "failed", failureMessage: "WABA already associated" }))
      .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
    mocks.twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({ error: "WABA already associated" });
    mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

    const result = await service.connectManaged(managedInput());

    expect(result.status).toBe("failed");
    const whatsappCalls = mocks.tenantIntegrations.upsert.mock.calls.filter(
      (call: unknown[]) => (call[0] as { provider: string }).provider === "twilio_whatsapp"
    );
    const finalWhatsappCall = whatsappCalls[whatsappCalls.length - 1]!;
    expect((finalWhatsappCall[0] as { overrideStatus: unknown }).overrideStatus).toEqual({
      status: "failed",
      failureMessage: "WABA already associated"
    });
  });

  it("never writes the Meta phoneNumberId to any upsert call argument", async () => {
    mocks.twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
    mocks.tenantIntegrations.upsert
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
    mocks.twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
      senderSid: "XE1234",
      status: "ONLINE",
      phoneNumber: "+573001234567"
    });
    mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

    await service.connectManaged(managedInput());

    const serializedCalls = JSON.stringify(mocks.tenantIntegrations.upsert.mock.calls);
    expect(serializedCalls).not.toContain("meta-phone-handle-xyz");
  });

  it("never writes the subaccount auth token into any publicConfig argument", async () => {
    mocks.twilioProvisioning.createSubaccount.mockResolvedValueOnce(SUBACCOUNT);
    mocks.tenantIntegrations.upsert
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ status: "verified" }))
      .mockResolvedValueOnce(baseView({ provider: "twilio_voice", channel: "voice", status: "verified" }));
    mocks.twilioProvisioning.registerWhatsAppSender.mockResolvedValueOnce({
      senderSid: "XE1234",
      status: "ONLINE",
      phoneNumber: "+573001234567"
    });
    mocks.vapiProvisioning.importTwilioNumber.mockResolvedValueOnce({ vapiPhoneNumberId: "vapi-num-1" });

    await service.connectManaged(managedInput());

    for (const call of mocks.tenantIntegrations.upsert.mock.calls) {
      expect(JSON.stringify((call[0] as { publicConfig: unknown }).publicConfig)).not.toContain(SUBACCOUNT.authToken);
    }
  });
});
