import { describe, expect, it, beforeEach, vi } from "vitest";
import type { PrismaService } from "@cobrai/db";
import type { EmailConnectService } from "./email-connect.service";
import type { WhatsAppConnectService } from "./whatsapp-connect.service";
import type { TenantIntegrationService } from "@cobrai/integrations";
import { IntegrationsService } from "./integrations.service";
import { ALL_PROVIDERS } from "./integrations.provider-utils";
import { baseView, makeCollaboratorMocks, makeConfig } from "./integrations.fixtures";

vi.mock("./integrations.uncontacted-debts.query", () => ({
  queryUncontactedDebts: vi.fn()
}));

import { queryUncontactedDebts } from "./integrations.uncontacted-debts.query";

describe("IntegrationsService — health + uncontactedDebts", () => {
  let mocks: ReturnType<typeof makeCollaboratorMocks>;
  let service: IntegrationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = makeCollaboratorMocks();
    service = new IntegrationsService(
      mocks.tenantIntegrations as unknown as TenantIntegrationService,
      mocks.whatsappConnect as unknown as WhatsAppConnectService,
      mocks.emailConnect as unknown as EmailConnectService,
      mocks.prisma as unknown as PrismaService,
      makeConfig()
    );
  });

  it("health(tenantId) returns every integration view plus a summary counting verified out of the total", async () => {
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([
      baseView({ provider: "stripe", status: "verified" }),
      baseView({ provider: "sendgrid", channel: "email", status: "verified" })
    ]);

    const result = await service.health("tenant-1");

    expect(result.items).toHaveLength(ALL_PROVIDERS.length);
    expect(result.summary).toEqual({ operational: 2, total: ALL_PROVIDERS.length });
  });

  it("pending_dns and pending_meta count as not-operational — nothing can send in either state", async () => {
    mocks.tenantIntegrations.listViews.mockResolvedValueOnce([
      baseView({ provider: "sendgrid", channel: "email", status: "pending_dns" }),
      baseView({ provider: "twilio_whatsapp", channel: "whatsapp", status: "pending_meta" })
    ]);

    const result = await service.health("tenant-1");

    expect(result.summary.operational).toBe(0);
  });

  it("uncontactedDebts forwards tenantId/page/pageSize to the query helper", async () => {
    vi.mocked(queryUncontactedDebts).mockResolvedValueOnce({ items: [], total: 0, page: 2 });

    const result = await service.uncontactedDebts("tenant-1", 2, 10);

    expect(queryUncontactedDebts).toHaveBeenCalledWith(mocks.prisma, "tenant-1", 2, 10);
    expect(result).toEqual({ items: [], total: 0, page: 2 });
  });
});
