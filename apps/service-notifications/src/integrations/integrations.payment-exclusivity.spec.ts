import { describe, expect, it, beforeEach } from "vitest";
import type { PrismaService } from "@cobrai/db";
import type { EmailConnectService } from "./email-connect.service";
import type { WhatsAppConnectService } from "./whatsapp-connect.service";
import type { TenantIntegrationService } from "@cobrai/integrations";
import { IntegrationsService } from "./integrations.service";
import { baseView, makeCollaboratorMocks, makeConfig } from "./integrations.fixtures";

/**
 * Regression cover for a money-routing defect found during phase verification.
 *
 * `resolveByChannel` returns the first VERIFIED provider in a fixed order
 * (stripe → wompi → payu → epayco → mercadopago → external_link → transfer).
 * Saving a new gateway used to leave the previous one verified, so a tenant who
 * moved from Stripe to Wompi kept charging through Stripe — the money went to a
 * processor they had already abandoned.
 */
describe("IntegrationsService — payment provider exclusivity", () => {
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

  it("retires a previously configured gateway when a new one verifies, so the tenant's choice is the one that charges", async () => {
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
      baseView({ provider: "wompi", channel: "payments", status: "verified", mode: "byo" })
    );
    // Stripe was configured earlier and would otherwise keep winning the
    // fixed provider order.
    mocks.tenantIntegrations.resolveAny.mockImplementation(
      async (_tenantId: string, provider: string) =>
        provider === "stripe" ? { provider, status: "verified" } : null
    );

    await service.save(
      "tenant-1",
      "wompi",
      { mode: "byo", secrets: { privateKey: "prv_test_abcd" } },
      "admin"
    );

    expect(mocks.tenantIntegrations.disconnect).toHaveBeenCalledWith("tenant-1", "stripe");
  });

  it("never retires the gateway that was just saved", async () => {
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
      baseView({ provider: "wompi", channel: "payments", status: "verified", mode: "byo" })
    );
    mocks.tenantIntegrations.resolveAny.mockImplementation(
      async (_tenantId: string, provider: string) => ({ provider, status: "verified" })
    );

    await service.save(
      "tenant-1",
      "wompi",
      { mode: "byo", secrets: { privateKey: "prv_test_abcd" } },
      "admin"
    );

    const retired = mocks.tenantIntegrations.disconnect.mock.calls.map(
      (call: unknown[]) => call[1]
    );
    expect(retired).not.toContain("wompi");
  });

  it("leaves the existing gateway alone when the new one fails verification, so the tenant is never left unable to charge", async () => {
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
      baseView({
        provider: "wompi",
        channel: "payments",
        status: "failed",
        mode: "byo",
        failureMessage: "Llave inválida"
      })
    );
    mocks.tenantIntegrations.resolveAny.mockImplementation(
      async (_tenantId: string, provider: string) =>
        provider === "stripe" ? { provider, status: "verified" } : null
    );

    await service.save(
      "tenant-1",
      "wompi",
      { mode: "byo", secrets: { privateKey: "prv_wrong" } },
      "admin"
    );

    expect(mocks.tenantIntegrations.disconnect).not.toHaveBeenCalled();
  });

  it("does not touch communication channels when a gateway is saved", async () => {
    mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
      baseView({ provider: "wompi", channel: "payments", status: "verified", mode: "byo" })
    );
    mocks.tenantIntegrations.resolveAny.mockImplementation(
      async (_tenantId: string, provider: string) => ({ provider, status: "verified" })
    );

    await service.save(
      "tenant-1",
      "wompi",
      { mode: "byo", secrets: { privateKey: "prv_test_abcd" } },
      "admin"
    );

    const retired = mocks.tenantIntegrations.disconnect.mock.calls.map(
      (call: unknown[]) => call[1]
    );
    expect(retired).not.toContain("sendgrid");
    expect(retired).not.toContain("twilio_whatsapp");
    expect(retired).not.toContain("twilio_voice");
  });
});
