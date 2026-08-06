import { vi } from "vitest";
import type { DecryptedIntegration } from "@cobrai/integrations";
import { WebhooksService } from "./webhooks.service";

export function buildIntegration(overrides: Partial<DecryptedIntegration> = {}): DecryptedIntegration {
  return {
    id: "integration-1",
    tenantId: "tenant-1",
    provider: "stripe",
    mode: "byo",
    status: "verified",
    publicConfig: {},
    secrets: {},
    webhookToken: "tok",
    verifiedAt: new Date(),
    ...overrides
  } as DecryptedIntegration;
}

export function buildService() {
  const link = {
    id: "link-1",
    tenantId: "tenant-1",
    debtId: "debt-1",
    amount: "1000.00",
    currency: "COP",
    gateway: "transfer",
    provider: "stripe"
  };
  const prisma = {
    paymentLink: { findFirst: vi.fn().mockResolvedValue(link) }
  };
  const confirmation = { confirmPayment: vi.fn().mockResolvedValue({ duplicate: false }) };
  const service = new WebhooksService(prisma as never, confirmation as never);
  return { service, prisma, confirmation, link };
}
