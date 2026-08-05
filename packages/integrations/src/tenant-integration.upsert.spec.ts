import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantIntegrationService } from "./tenant-integration.service";
import { verifyCredentials } from "./verifiers";
import {
  BASE_WEBHOOK_URL,
  buildRow,
  makePrismaMock,
  withTestEncryptionKey
} from "./tenant-integration.fixtures";

vi.mock("./verifiers", () => ({
  verifyCredentials: vi.fn()
}));

const SENDGRID_INPUT = {
  tenantId: "tenantA",
  provider: "sendgrid" as const,
  mode: "byo" as const,
  publicConfig: {},
  secrets: { apiKey: "sk_live_abcd1234" },
  baseWebhookUrl: BASE_WEBHOOK_URL
};

describe("TenantIntegrationService — write paths", () => {
  const prisma = makePrismaMock();

  let service: TenantIntegrationService;
  let restoreKey: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreKey = withTestEncryptionKey();
    service = new TenantIntegrationService(prisma as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreKey();
  });

  describe("upsert — verification outcome", () => {
    it("persists status=verified with a non-null verifiedAt and clears failureMessage on success", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(null);
      prisma.tenantIntegration.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...buildRow(), ...create })
      );
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: true });

      await service.upsert(SENDGRID_INPUT);

      const persisted = prisma.tenantIntegration.upsert.mock.calls[0][0].create;
      expect(persisted.status).toBe("verified");
      expect(persisted.verifiedAt).toBeInstanceOf(Date);
      expect(persisted.failureMessage).toBeNull();
    });

    it("persists status=failed with the provider message and leaves verifiedAt unchanged on failure", async () => {
      const existing = buildRow({ status: "verified", verifiedAt: new Date("2026-01-01T00:00:00.000Z") });
      prisma.tenantIntegration.findUnique.mockResolvedValue(existing);
      prisma.tenantIntegration.upsert.mockImplementation(({ update }: { update: Record<string, unknown> }) =>
        Promise.resolve({ ...existing, ...update })
      );
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: false, message: "Credenciales inválidas" });

      await service.upsert({ ...SENDGRID_INPUT, secrets: { apiKey: "sk_live_wrong0000" } });

      const persisted = prisma.tenantIntegration.upsert.mock.calls[0][0].update;
      expect(persisted.status).toBe("failed");
      expect(persisted.failureMessage).toBe("Credenciales inválidas");
      expect(persisted.verifiedAt).toEqual(existing.verifiedAt);
    });

    it("does not call verifyCredentials and marks the row verified when skipVerification is true", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(null);
      prisma.tenantIntegration.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...buildRow(), ...create })
      );

      await service.upsert({
        tenantId: "tenantA",
        provider: "external_link",
        mode: "byo",
        publicConfig: { template: "https://pay.example.com/{ref}" },
        secrets: {},
        skipVerification: true,
        baseWebhookUrl: BASE_WEBHOOK_URL
      });

      expect(verifyCredentials).not.toHaveBeenCalled();
      const persisted = prisma.tenantIntegration.upsert.mock.calls[0][0].create;
      expect(persisted.status).toBe("verified");
    });
  });

  describe("upsert — secret handling", () => {
    it("writes secretsMeta with only lastFour/savedAt and secretsCipher as a Buffer, never the plaintext value", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(null);
      prisma.tenantIntegration.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...buildRow(), ...create })
      );
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: true });

      await service.upsert(SENDGRID_INPUT);

      const persisted = prisma.tenantIntegration.upsert.mock.calls[0][0].create;
      expect(Buffer.isBuffer(persisted.secretsCipher)).toBe(true);
      expect(JSON.stringify(persisted.secretsMeta)).not.toContain("sk_live_abcd1234");
      expect(JSON.stringify(persisted.secretsCipher)).not.toContain("sk_live_abcd1234");
      expect(persisted.secretsMeta).toEqual({
        apiKey: { lastFour: "1234", savedAt: expect.any(String) }
      });
    });

    it("generates a webhookToken exactly once for a webhook-capable provider and does not regenerate it", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValueOnce(null);
      prisma.tenantIntegration.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...buildRow(), ...create })
      );
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: true });

      await service.upsert(SENDGRID_INPUT);
      const firstToken = prisma.tenantIntegration.upsert.mock.calls[0][0].create.webhookToken as string;
      expect(firstToken).toBeTruthy();

      const existingWithToken = buildRow({ webhookToken: firstToken });
      prisma.tenantIntegration.findUnique.mockResolvedValueOnce(existingWithToken);
      prisma.tenantIntegration.upsert.mockImplementation(({ update }: { update: Record<string, unknown> }) =>
        Promise.resolve({ ...existingWithToken, ...update })
      );

      await service.upsert(SENDGRID_INPUT);
      const secondToken = prisma.tenantIntegration.upsert.mock.calls[1][0].update.webhookToken as string;

      expect(secondToken).toBe(firstToken);
    });

    it("invalidates the cache entry for that (tenantId, provider)", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValueOnce(buildRow());
      await service.resolve("tenantA", "sendgrid");

      prisma.tenantIntegration.upsert.mockResolvedValue(buildRow());
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: true });
      await service.upsert(SENDGRID_INPUT);

      prisma.tenantIntegration.findUnique.mockResolvedValueOnce(buildRow());
      await service.resolve("tenantA", "sendgrid");

      // 1 (initial resolve) + 1 (upsert's internal read) + 1 (resolve after invalidation)
      expect(prisma.tenantIntegration.findUnique).toHaveBeenCalledTimes(3);
    });
  });

  describe("toView", () => {
    it("never includes the plaintext secret, only the last four characters", () => {
      const row = buildRow();
      const view = service.toView(row as never, BASE_WEBHOOK_URL);
      const serialized = JSON.stringify(view);

      expect(serialized).toContain("1234");
      expect(serialized).not.toContain("sk_live_abcd1234");
    });
  });
});
