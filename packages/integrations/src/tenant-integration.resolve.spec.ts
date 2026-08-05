import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationStatus } from "@cobrai/db";
import { TenantIntegrationService } from "./tenant-integration.service";
import { buildRow, makePrismaMock, withTestEncryptionKey } from "./tenant-integration.fixtures";

vi.mock("./verifiers", () => ({
  verifyCredentials: vi.fn()
}));

describe("TenantIntegrationService — read paths", () => {
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

  describe("resolve", () => {
    it("returns decrypted secrets and publicConfig for a verified row", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow());

      const result = await service.resolve("tenantA", "sendgrid");

      expect(result).not.toBeNull();
      expect(result?.secrets).toEqual({ apiKey: "sk_live_abcd1234" });
      expect(result?.publicConfig).toEqual({ domain: "example.com" });
    });

    it.each<IntegrationStatus>(["failed", "pending_dns", "pending_meta", "verifying", "not_configured"])(
      "returns null for status=%s instead of a stale credential",
      async (status) => {
        prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow({ status }));

        const result = await service.resolve("tenantA", "sendgrid");

        expect(result).toBeNull();
      }
    );

    it("returns null for a soft-deleted row", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(
        buildRow({ deletedAt: new Date("2026-02-01T00:00:00.000Z") })
      );

      const result = await service.resolve("tenantA", "sendgrid");

      expect(result).toBeNull();
    });

    it("returns null when there is no row at all", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(null);

      const result = await service.resolve("tenantA", "sendgrid");

      expect(result).toBeNull();
    });

    it("returns null and does not throw when the ciphertext is corrupted", async () => {
      const row = buildRow();
      const tampered = Buffer.from(row.secretsCipher);
      tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;
      prisma.tenantIntegration.findUnique.mockResolvedValue({ ...row, secretsCipher: tampered });

      const result = await service.resolve("tenantA", "sendgrid");

      expect(result).toBeNull();
    });
  });

  describe("resolve — caching", () => {
    it("does not hit Prisma again on a second call inside the TTL", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow());

      await service.resolve("tenantA", "sendgrid");
      await service.resolve("tenantA", "sendgrid");

      expect(prisma.tenantIntegration.findUnique).toHaveBeenCalledTimes(1);
    });

    it("hits Prisma again once the TTL has expired", async () => {
      vi.useFakeTimers();
      const shortTtlService = new TenantIntegrationService(prisma as never, 1_000);
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow());

      await shortTtlService.resolve("tenantA", "sendgrid");
      vi.advanceTimersByTime(1_001);
      await shortTtlService.resolve("tenantA", "sendgrid");

      expect(prisma.tenantIntegration.findUnique).toHaveBeenCalledTimes(2);
    });

    it("never serves tenant A's cached credential to tenant B", async () => {
      prisma.tenantIntegration.findUnique.mockImplementation(
        ({ where }: { where: { tenantId_provider: { tenantId: string } } }) =>
          Promise.resolve(
            buildRow({
              tenantId: where.tenantId_provider.tenantId,
              secretsPlain: { apiKey: `key-${where.tenantId_provider.tenantId}` }
            })
          )
      );

      const resultA = await service.resolve("tenantA", "sendgrid");
      const resultB = await service.resolve("tenantB", "sendgrid");

      expect(prisma.tenantIntegration.findUnique).toHaveBeenCalledTimes(2);
      expect(resultA?.secrets["apiKey"]).toBe("key-tenantA");
      expect(resultB?.secrets["apiKey"]).toBe("key-tenantB");
    });

    it("invalidate forces the next resolve to hit Prisma", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow());

      await service.resolve("tenantA", "sendgrid");
      service.invalidate("tenantA", "sendgrid");
      await service.resolve("tenantA", "sendgrid");

      expect(prisma.tenantIntegration.findUnique).toHaveBeenCalledTimes(2);
    });

    it("stops retaining a decrypted credential once its TTL has passed", async () => {
      vi.useFakeTimers();
      const shortTtlService = new TenantIntegrationService(prisma as never, 1_000);
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow());

      await shortTtlService.resolve("tenantA", "sendgrid");
      vi.advanceTimersByTime(1_001);
      // Re-resolving a DIFFERENT provider must not keep the expired secret
      // alive: an expired entry still holds plaintext, so it has to be dropped
      // rather than left until someone happens to ask for it again.
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow({ provider: "stripe" }));
      await shortTtlService.resolve("tenantA", "stripe");

      const cache = (shortTtlService as never as { cache: { size: number } }).cache;
      expect(cache.size).toBe(1);
    });

    it("does not grow the cache without bound as more tenants are resolved", async () => {
      vi.useFakeTimers();
      const shortTtlService = new TenantIntegrationService(prisma as never, 1_000);
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow());

      for (let i = 0; i < 200; i++) {
        await shortTtlService.resolve(`tenant-${i}`, "sendgrid");
        vi.advanceTimersByTime(1_001);
      }

      const cache = (shortTtlService as never as { cache: { size: number } }).cache;
      expect(cache.size).toBeLessThan(200);
    });
  });

  describe("hasVerifiedChannel", () => {
    it("is true when any payments-channel provider row is verified", async () => {
      prisma.tenantIntegration.count.mockResolvedValue(1);

      const result = await service.hasVerifiedChannel("tenantA", "payments");

      expect(result).toBe(true);
    });

    it("is false when no payments-channel provider row is verified", async () => {
      prisma.tenantIntegration.count.mockResolvedValue(0);

      const result = await service.hasVerifiedChannel("tenantA", "payments");

      expect(result).toBe(false);
    });
  });

  describe("resolveAny", () => {
    it("returns a row whose status is pending_meta, unlike resolve which would gate it to null", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(buildRow({ status: "pending_meta" }));

      const result = await service.resolveAny("tenantA", "twilio_whatsapp");

      expect(result).not.toBeNull();
      expect(result?.status).toBe("pending_meta");
    });

    it("returns null for a soft-deleted row", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(
        buildRow({ status: "pending_meta", deletedAt: new Date("2026-02-01T00:00:00.000Z") })
      );

      const result = await service.resolveAny("tenantA", "twilio_whatsapp");

      expect(result).toBeNull();
    });

    it("returns null when there is no row at all", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(null);

      const result = await service.resolveAny("tenantA", "twilio_whatsapp");

      expect(result).toBeNull();
    });
  });

  describe("resolveByWebhookToken", () => {
    it("returns a row whose status is failed, regardless of verification state", async () => {
      prisma.tenantIntegration.findFirst.mockResolvedValue(
        buildRow({ status: "failed", webhookToken: "tok-1" })
      );

      const result = await service.resolveByWebhookToken("tok-1");

      expect(result).not.toBeNull();
      expect(result?.status).toBe("failed");
    });

    it("returns null for an unknown token", async () => {
      prisma.tenantIntegration.findFirst.mockResolvedValue(null);

      const result = await service.resolveByWebhookToken("unknown-token");

      expect(result).toBeNull();
    });
  });
});
