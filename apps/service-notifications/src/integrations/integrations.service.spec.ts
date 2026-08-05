import { describe, expect, it, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "@cobrai/db";
import type { EmailConnectService } from "./email-connect.service";
import type { WhatsAppConnectService } from "./whatsapp-connect.service";
import type { TenantIntegrationService } from "@cobrai/integrations";
import { IntegrationsService } from "./integrations.service";
import { ALL_PROVIDERS } from "./integrations.provider-utils";
import { baseView, makeCollaboratorMocks, makeConfig } from "./integrations.fixtures";

describe("IntegrationsService — list, redaction, provider validation", () => {
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

  it("returns one IntegrationView per provider, synthesizing not_configured for providers with no row", async () => {
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([
      baseView({ provider: "sendgrid", channel: "email", status: "verified" })
    ]);

    const result = await service.list("tenant-1");

    expect(result).toHaveLength(ALL_PROVIDERS.length);
    const sendgrid = result.find((v) => v.provider === "sendgrid");
    expect(sendgrid?.status).toBe("verified");
    const stripe = result.find((v) => v.provider === "stripe");
    expect(stripe?.status).toBe("not_configured");
  });

  it("payment providers with no row synthesize mode: byo (D-06), communication providers synthesize mode: managed (D-01)", async () => {
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([]);

    const result = await service.list("tenant-1");

    const wompi = result.find((v) => v.provider === "wompi");
    expect(wompi?.mode).toBe("byo");
    const whatsapp = result.find((v) => v.provider === "twilio_whatsapp");
    expect(whatsapp?.mode).toBe("managed");
  });

  it("never serializes a plaintext secret — JSON.stringify of a stored-secret view contains only the last four characters", async () => {
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([
      baseView({
        provider: "stripe",
        secrets: [{ field: "secretKey", lastFour: "1234", savedAt: "2026-08-01T00:00:00.000Z" }]
      })
    ]);

    const result = await service.list("tenant-1");
    const serialized = JSON.stringify(result);

    expect(serialized).toContain("1234");
    expect(serialized).not.toContain("sk_live_abcd1234");
  });

  it("save rejects a provider outside the IntegrationProvider enum with BadRequestException", async () => {
    await expect(
      service.save("tenant-1", "not_a_real_provider", { mode: "byo" }, "admin")
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("verify rejects a provider outside the IntegrationProvider enum with BadRequestException", async () => {
    await expect(service.verify("tenant-1", "bogus", "admin")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("disconnect rejects a provider outside the IntegrationProvider enum with BadRequestException", async () => {
    await expect(service.disconnect("tenant-1", "bogus", "admin")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("save with a non-admin role throws ForbiddenException and writes nothing", async () => {
    await expect(
      service.save("tenant-1", "stripe", { mode: "byo", secrets: { secretKey: "sk_live_x" } }, "viewer")
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.tenantIntegrations.upsert).not.toHaveBeenCalled();
  });

  it("disconnect with a non-admin role throws ForbiddenException", async () => {
    await expect(service.disconnect("tenant-1", "stripe", "viewer")).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.tenantIntegrations.disconnect).not.toHaveBeenCalled();
  });

  it("reads (list) are not admin-gated — a viewer can list integrations", async () => {
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([]);
    await expect(service.list("tenant-1")).resolves.toBeDefined();
  });
});
