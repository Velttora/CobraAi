import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecretBundle } from "@cobrai/utils";
import type { IntegrationProvider, IntegrationStatus } from "@cobrai/db";
import { TenantIntegrationService } from "./tenant-integration.service";
import { verifyCredentials } from "./verifiers";

vi.mock("./verifiers", () => ({
  verifyCredentials: vi.fn()
}));

const TEST_KEY_V1 = Buffer.alloc(32, 7).toString("base64");

function buildRow(overrides: Record<string, unknown> = {}) {
  const secrets = (overrides["secretsPlain"] as Record<string, string> | undefined) ?? {
    apiKey: "sk_live_abcd1234"
  };
  const { ciphertext, keyVersion } = encryptSecretBundle(secrets, 1);
  const { secretsPlain: _drop, ...rest } = overrides;
  return {
    id: "row-1",
    tenantId: "tenantA",
    provider: "sendgrid" as IntegrationProvider,
    mode: "byo",
    status: "verified" as IntegrationStatus,
    publicConfig: { domain: "example.com" },
    secretsCipher: ciphertext,
    secretsMeta: { apiKey: { lastFour: "1234", savedAt: "2026-01-01T00:00:00.000Z" } },
    keyVersion,
    webhookToken: null,
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    failureMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...rest
  };
}

describe("TenantIntegrationService", () => {
  const prisma = {
    tenantIntegration: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    }
  };

  let service: TenantIntegrationService;
  let originalKeyV1: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalKeyV1 = process.env["ENCRYPTION_KEY_V1"];
    process.env["ENCRYPTION_KEY_V1"] = TEST_KEY_V1;
    service = new TenantIntegrationService(prisma as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalKeyV1 === undefined) delete process.env["ENCRYPTION_KEY_V1"];
    else process.env["ENCRYPTION_KEY_V1"] = originalKeyV1;
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

  describe("resolveByWebhookToken", () => {
    it("returns a row whose status is failed, regardless of verification state", async () => {
      prisma.tenantIntegration.findFirst.mockResolvedValue(buildRow({ status: "failed", webhookToken: "tok-1" }));

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

  describe("upsert", () => {
    it("persists status=verified with a non-null verifiedAt and clears failureMessage on success", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(null);
      prisma.tenantIntegration.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...buildRow(), ...create })
      );
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: true });

      await service.upsert({
        tenantId: "tenantA",
        provider: "sendgrid",
        mode: "byo",
        publicConfig: {},
        secrets: { apiKey: "sk_live_abcd1234" },
        baseWebhookUrl: "https://api.cobrai.dev/webhooks"
      });

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

      await service.upsert({
        tenantId: "tenantA",
        provider: "sendgrid",
        mode: "byo",
        publicConfig: {},
        secrets: { apiKey: "sk_live_wrong0000" },
        baseWebhookUrl: "https://api.cobrai.dev/webhooks"
      });

      const persisted = prisma.tenantIntegration.upsert.mock.calls[0][0].update;
      expect(persisted.status).toBe("failed");
      expect(persisted.failureMessage).toBe("Credenciales inválidas");
      expect(persisted.verifiedAt).toEqual(existing.verifiedAt);
    });

    it("writes secretsMeta with only lastFour/savedAt and secretsCipher as a Buffer, never the plaintext value", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValue(null);
      prisma.tenantIntegration.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...buildRow(), ...create })
      );
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: true });

      await service.upsert({
        tenantId: "tenantA",
        provider: "sendgrid",
        mode: "byo",
        publicConfig: {},
        secrets: { apiKey: "sk_live_abcd1234" },
        baseWebhookUrl: "https://api.cobrai.dev/webhooks"
      });

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

      await service.upsert({
        tenantId: "tenantA",
        provider: "sendgrid",
        mode: "byo",
        publicConfig: {},
        secrets: { apiKey: "sk_live_abcd1234" },
        baseWebhookUrl: "https://api.cobrai.dev/webhooks"
      });
      const firstToken = prisma.tenantIntegration.upsert.mock.calls[0][0].create.webhookToken as string;
      expect(firstToken).toBeTruthy();

      const existingWithToken = buildRow({ webhookToken: firstToken });
      prisma.tenantIntegration.findUnique.mockResolvedValueOnce(existingWithToken);
      prisma.tenantIntegration.upsert.mockImplementation(({ update }: { update: Record<string, unknown> }) =>
        Promise.resolve({ ...existingWithToken, ...update })
      );

      await service.upsert({
        tenantId: "tenantA",
        provider: "sendgrid",
        mode: "byo",
        publicConfig: {},
        secrets: { apiKey: "sk_live_abcd1234" },
        baseWebhookUrl: "https://api.cobrai.dev/webhooks"
      });
      const secondToken = prisma.tenantIntegration.upsert.mock.calls[1][0].update.webhookToken as string;

      expect(secondToken).toBe(firstToken);
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
        baseWebhookUrl: "https://api.cobrai.dev/webhooks"
      });

      expect(verifyCredentials).not.toHaveBeenCalled();
      const persisted = prisma.tenantIntegration.upsert.mock.calls[0][0].create;
      expect(persisted.status).toBe("verified");
    });

    it("invalidates the cache entry for that (tenantId, provider)", async () => {
      prisma.tenantIntegration.findUnique.mockResolvedValueOnce(buildRow());
      await service.resolve("tenantA", "sendgrid");

      prisma.tenantIntegration.upsert.mockResolvedValue(buildRow());
      vi.mocked(verifyCredentials).mockResolvedValue({ ok: true });
      await service.upsert({
        tenantId: "tenantA",
        provider: "sendgrid",
        mode: "byo",
        publicConfig: {},
        secrets: { apiKey: "sk_live_abcd1234" },
        baseWebhookUrl: "https://api.cobrai.dev/webhooks"
      });

      prisma.tenantIntegration.findUnique.mockResolvedValueOnce(buildRow());
      await service.resolve("tenantA", "sendgrid");

      // 1 (initial resolve) + 1 (upsert's internal read) + 1 (resolve after invalidation)
      expect(prisma.tenantIntegration.findUnique).toHaveBeenCalledTimes(3);
    });
  });

  describe("toView", () => {
    it("never includes the plaintext secret, only the last four characters", () => {
      const row = buildRow();
      const view = service.toView(row as never, "https://api.cobrai.dev/webhooks");
      const serialized = JSON.stringify(view);

      expect(serialized).toContain("1234");
      expect(serialized).not.toContain("sk_live_abcd1234");
    });
  });
});
