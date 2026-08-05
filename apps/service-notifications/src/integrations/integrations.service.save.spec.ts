import { describe, expect, it, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { PrismaService } from "@cobrai/db";
import type { EmailConnectService } from "./email-connect.service";
import type { WhatsAppConnectService } from "./whatsapp-connect.service";
import type { TenantIntegrationService } from "@cobrai/integrations";
import { IntegrationsService } from "./integrations.service";
import { baseView, makeCollaboratorMocks, makeConfig } from "./integrations.fixtures";

describe("IntegrationsService — save/verify/disconnect dispatch", () => {
  let mocks: ReturnType<typeof makeCollaboratorMocks>;
  let service: IntegrationsService;

  beforeEach(() => {
    mocks = makeCollaboratorMocks();
    service = new IntegrationsService(
      mocks.tenantIntegrations as unknown as TenantIntegrationService,
      mocks.whatsappConnect as unknown as WhatsAppConnectService,
      mocks.emailConnect as unknown as EmailConnectService,
      mocks.prisma as unknown as PrismaService,
      makeConfig()
    );
  });

  it("save for twilio_whatsapp byo dispatches to WhatsAppConnectService.connectByo", async () => {
    mocks.whatsappConnect.connectByo.mockResolvedValueOnce(baseView({ provider: "twilio_whatsapp", channel: "whatsapp" }));
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([
      baseView({ provider: "twilio_whatsapp", channel: "whatsapp" })
    ]);

    await service.save(
      "tenant-1",
      "twilio_whatsapp",
      {
        mode: "byo",
        publicConfig: { accountSid: "AC123", phoneNumberE164: "+573001234567" },
        secrets: { authToken: "secret-token" }
      },
      "admin"
    );

    expect(mocks.whatsappConnect.connectByo).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        accountSid: "AC123",
        authToken: "secret-token",
        phoneNumberE164: "+573001234567"
      })
    );
  });

  it("save for twilio_voice byo also dispatches to WhatsAppConnectService.connectByo (D-05: shared Twilio subaccount/number) and returns the twilio_voice view specifically", async () => {
    mocks.whatsappConnect.connectByo.mockResolvedValueOnce(baseView({ provider: "twilio_whatsapp", channel: "whatsapp" }));
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([
      baseView({ provider: "twilio_whatsapp", channel: "whatsapp" }),
      baseView({ provider: "twilio_voice", channel: "voice", status: "verified" })
    ]);

    const result = await service.save(
      "tenant-1",
      "twilio_voice",
      {
        mode: "byo",
        publicConfig: { accountSid: "AC123", phoneNumberE164: "+573001234567" },
        secrets: { authToken: "secret-token" }
      },
      "admin"
    );

    expect(mocks.whatsappConnect.connectByo).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", accountSid: "AC123" })
    );
    expect(result.provider).toBe("twilio_voice");
  });

  it("save for twilio_whatsapp with mode managed is rejected — managed connection happens via Embedded Signup, not PUT", async () => {
    await expect(
      service.save("tenant-1", "twilio_whatsapp", { mode: "managed" }, "admin")
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.whatsappConnect.connectByo).not.toHaveBeenCalled();
  });

  it("save for sendgrid managed dispatches to EmailConnectService.connectManaged", async () => {
    mocks.emailConnect.connectManaged.mockResolvedValueOnce(baseView({ provider: "sendgrid", channel: "email" }));

    await service.save(
      "tenant-1",
      "sendgrid",
      { mode: "managed", publicConfig: { domain: "tuempresa.com", fromEmail: "cobranza@tuempresa.com", fromName: "Cobranza" } },
      "admin"
    );

    expect(mocks.emailConnect.connectManaged).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", domain: "tuempresa.com" })
    );
  });

  it("save for sendgrid byo dispatches to EmailConnectService.connectByo", async () => {
    mocks.emailConnect.connectByo.mockResolvedValueOnce(baseView({ provider: "sendgrid", channel: "email" }));

    await service.save(
      "tenant-1",
      "sendgrid",
      {
        mode: "byo",
        publicConfig: { domain: "tuempresa.com", fromEmail: "a@b.com", fromName: "A" },
        secrets: { apiKey: "SG.xxx" }
      },
      "admin"
    );

    expect(mocks.emailConnect.connectByo).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", apiKey: "SG.xxx" })
    );
  });

  it("save for a payment provider calls TenantIntegrationService.upsert directly", async () => {
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ provider: "stripe" }));

    await service.save("tenant-1", "stripe", { mode: "byo", secrets: { secretKey: "sk_live_x" } }, "admin");

    expect(mocks.tenantIntegrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", provider: "stripe", mode: "byo" })
    );
  });

  it("save rejects a payment provider requested with mode managed — payments are BYO-only (D-06)", async () => {
    await expect(service.save("tenant-1", "wompi", { mode: "managed" }, "admin")).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(mocks.tenantIntegrations.upsert).not.toHaveBeenCalled();
  });

  it("save for external_link rejects a template failing validateExternalLinkTemplate with the validator's message", async () => {
    await expect(
      service.save("tenant-1", "external_link", { mode: "byo", publicConfig: { template: "http://no-https.com" } }, "admin")
    ).rejects.toMatchObject({
      response: { message: "El enlace debe empezar con https://" }
    });
    expect(mocks.tenantIntegrations.upsert).not.toHaveBeenCalled();
  });

  it("save for external_link and transfer passes skipVerification: true", async () => {
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
      baseView({ provider: "external_link", status: "verified", verifiedAt: "2026-08-01T00:00:00.000Z" })
    );

    await service.save(
      "tenant-1",
      "external_link",
      { mode: "byo", publicConfig: { template: "https://pagos.tuempresa.com?ref={ref}" } },
      "admin"
    );

    expect(mocks.tenantIntegrations.upsert).toHaveBeenCalledWith(expect.objectContaining({ skipVerification: true }));
  });

  it("save never force-fills an omitted secret field — an empty secrets object is forwarded as-is so upsert's own per-field rotation applies", async () => {
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ provider: "stripe" }));

    await service.save("tenant-1", "stripe", { mode: "byo", secrets: {} }, "admin");

    expect(mocks.tenantIntegrations.upsert).toHaveBeenCalledWith(expect.objectContaining({ secrets: {} }));
  });

  it("verify for twilio_whatsapp re-runs via WhatsAppConnectService.refreshSenderStatus, without a secrets argument", async () => {
    mocks.whatsappConnect.refreshSenderStatus.mockResolvedValueOnce(baseView({ provider: "twilio_whatsapp" }));

    await service.verify("tenant-1", "twilio_whatsapp", "admin");

    expect(mocks.whatsappConnect.refreshSenderStatus).toHaveBeenCalledWith("tenant-1");
  });

  it("verify for sendgrid re-runs via EmailConnectService.recheckDns", async () => {
    mocks.emailConnect.recheckDns.mockResolvedValueOnce(baseView({ provider: "sendgrid" }));

    await service.verify("tenant-1", "sendgrid", "admin");

    expect(mocks.emailConnect.recheckDns).toHaveBeenCalledWith("tenant-1");
  });

  it("verify for a payment provider re-reads stored secrets via resolveAny and re-runs upsert with an empty secrets argument", async () => {
    mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce({
      id: "row-1",
      tenantId: "tenant-1",
      provider: "stripe",
      mode: "byo",
      status: "failed",
      publicConfig: {},
      secrets: { secretKey: "sk_live_stored" },
      webhookToken: null,
      verifiedAt: null
    });
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ provider: "stripe", status: "verified" }));

    await service.verify("tenant-1", "stripe", "admin");

    expect(mocks.tenantIntegrations.upsert).toHaveBeenCalledWith(expect.objectContaining({ secrets: {} }));
  });

  it("disconnect soft-deletes via TenantIntegrationService.disconnect and returns a not_configured view", async () => {
    const result = await service.disconnect("tenant-1", "stripe", "admin");

    expect(mocks.tenantIntegrations.disconnect).toHaveBeenCalledWith("tenant-1", "stripe");
    expect(result.status).toBe("not_configured");
  });

  it("embeddedSignup dispatches to WhatsAppConnectService.connectManaged with the Meta handoff fields", async () => {
    mocks.whatsappConnect.connectManaged.mockResolvedValueOnce(baseView({ provider: "twilio_whatsapp" }));

    await service.embeddedSignup(
      "tenant-1",
      { wabaId: "waba-1", phoneNumberId: "meta-handle", phoneNumberE164: "+573001234567", businessName: "Acme" },
      "admin"
    );

    expect(mocks.whatsappConnect.connectManaged).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      wabaId: "waba-1",
      phoneNumberId: "meta-handle",
      phoneNumberE164: "+573001234567",
      businessName: "Acme"
    });
  });

  it("recheckEmailDns dispatches to EmailConnectService.recheckDns", async () => {
    mocks.emailConnect.recheckDns.mockResolvedValueOnce(baseView({ provider: "sendgrid" }));

    await service.recheckEmailDns("tenant-1", "admin");

    expect(mocks.emailConnect.recheckDns).toHaveBeenCalledWith("tenant-1");
  });
});
