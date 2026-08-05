import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertEncryptionKeyConfigured,
  fetchActiveTenants,
  loadProviderEnv,
  seedTenantIntegrations,
  type SeedEnv
} from "./seed-tenant-integrations";
import { buildTenant, makePrismaMock, withEnv, withTestEncryptionKey } from "./seed-tenant-integrations.fixtures";

describe("loadProviderEnv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("groups Twilio, SendGrid and Mercado Pago env vars when fully set", () => {
    const restore = withEnv({
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "secret-token",
      TWILIO_WA_FROM: "+14155550100",
      SENDGRID_API_KEY: "SG.key",
      SENDGRID_FROM_EMAIL: "cobros@empresa.com",
      MP_ACCESS_TOKEN: "mp-token",
      MP_WEBHOOK_SECRET: "mp-secret",
      VAPI_PHONE_NUMBER_ID: "phone-id-1"
    });

    const env = loadProviderEnv();

    expect(env.twilio).toEqual({ accountSid: "AC123", authToken: "secret-token", waFrom: "+14155550100" });
    expect(env.sendgrid).toEqual({ apiKey: "SG.key", fromEmail: "cobros@empresa.com" });
    expect(env.mercadopago).toEqual({ accessToken: "mp-token", webhookSecret: "mp-secret" });
    expect(env.vapiPhoneNumberId).toBe("phone-id-1");
    restore();
  });

  it("returns a null group (and logs a notice) when its env vars are absent, without affecting the others", () => {
    const restore = withEnv({
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      SENDGRID_API_KEY: "SG.key",
      MP_ACCESS_TOKEN: undefined
    });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const env = loadProviderEnv();

    expect(env.twilio).toBeNull();
    expect(env.sendgrid).not.toBeNull();
    expect(env.mercadopago).toBeNull();
    expect(infoSpy).toHaveBeenCalled();
    restore();
  });
});

describe("assertEncryptionKeyConfigured", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits non-zero without writing anything when ENCRYPTION_KEY_V1 is missing", () => {
    const restore = withEnv({ ENCRYPTION_KEY_V1: undefined });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    assertEncryptionKeyConfigured();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
    restore();
  });

  it("does not exit when the key is configured and valid", () => {
    const restore = withTestEncryptionKey();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    assertEncryptionKeyConfigured();

    expect(exitSpy).not.toHaveBeenCalled();
    restore();
  });
});

describe("fetchActiveTenants", () => {
  it("queries only non-deleted tenants", async () => {
    const prisma = makePrismaMock();
    prisma.tenant.findMany.mockResolvedValue([]);

    await fetchActiveTenants(prisma as never);

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true, settings: true }
    });
  });
});

describe("seedTenantIntegrations", () => {
  let restoreKey: () => void;
  let prisma: ReturnType<typeof makePrismaMock>;

  const fullEnv: SeedEnv = {
    twilio: { accountSid: "AC123", authToken: "secret-token", waFrom: "+14155550100" },
    sendgrid: { apiKey: "SG.key", fromEmail: "cobros@empresa.com" },
    mercadopago: { accessToken: "mp-token", webhookSecret: "mp-secret" },
    vapiPhoneNumberId: "phone-id-1"
  };

  beforeEach(() => {
    restoreKey = withTestEncryptionKey();
    prisma = makePrismaMock();
    prisma.tenantIntegration.findUnique.mockResolvedValue(null);
    prisma.tenantIntegration.create.mockResolvedValue({});
  });

  afterEach(() => {
    restoreKey();
  });

  it("creates one twilio_whatsapp and one twilio_voice row per tenant, managed + verified", async () => {
    const results = await seedTenantIntegrations(prisma as never, buildTenant(), fullEnv);

    expect(results.filter((r) => r.result === "created").map((r) => r.provider).sort()).toEqual(
      ["mercadopago", "sendgrid", "twilio_voice", "twilio_whatsapp"].sort()
    );
    expect(prisma.tenantIntegration.create).toHaveBeenCalledTimes(4);
    for (const call of prisma.tenantIntegration.create.mock.calls) {
      expect(call[0].data.mode).toBe("managed");
      expect(call[0].data.status).toBe("verified");
      expect(call[0].data.verifiedAt).toBeInstanceOf(Date);
    }
  });

  it("carries the SendGrid fromEmail from env into publicConfig", async () => {
    await seedTenantIntegrations(prisma as never, buildTenant(), fullEnv);

    const sendgridCall = prisma.tenantIntegration.create.mock.calls.find(
      (c: never[]) => (c[0] as { data: { provider: string } }).data.provider === "sendgrid"
    );
    expect((sendgridCall?.[0] as { data: { publicConfig: { fromEmail: string } } }).data.publicConfig.fromEmail).toBe(
      "cobros@empresa.com"
    );
  });

  it("skips a provider group entirely when its env vars are absent, without affecting the others", async () => {
    const partialEnv: SeedEnv = { ...fullEnv, twilio: null };

    const results = await seedTenantIntegrations(prisma as never, buildTenant(), partialEnv);

    const providers = results.map((r) => r.provider);
    expect(providers).not.toContain("twilio_whatsapp");
    expect(providers).not.toContain("twilio_voice");
    expect(providers).toContain("sendgrid");
    expect(providers).toContain("mercadopago");
  });

  it("keeps a tenant's own manually configured row untouched (skip-if-exists, never overwrite)", async () => {
    prisma.tenantIntegration.findUnique.mockImplementation(
      async ({ where }: { where: { tenantId_provider: { provider: string } } }) =>
        where.tenantId_provider.provider === "sendgrid" ? { id: "existing-row" } : null
    );

    const results = await seedTenantIntegrations(prisma as never, buildTenant(), fullEnv);

    expect(results.find((r) => r.provider === "sendgrid")?.result).toBe("skipped");
    expect(
      prisma.tenantIntegration.create.mock.calls.some(
        (c: never[]) => (c[0] as { data: { provider: string } }).data.provider === "sendgrid"
      )
    ).toBe(false);
  });

  it("a second run against already-seeded rows creates nothing", async () => {
    prisma.tenantIntegration.findUnique.mockResolvedValue({ id: "already-there" });

    const results = await seedTenantIntegrations(prisma as never, buildTenant(), fullEnv);

    expect(results.every((r) => r.result === "skipped")).toBe(true);
    expect(prisma.tenantIntegration.create).not.toHaveBeenCalled();
  });

  it("never writes the plaintext secret: secretsCipher is a Buffer, secretsMeta only has lastFour/savedAt", async () => {
    await seedTenantIntegrations(prisma as never, buildTenant(), fullEnv);

    for (const call of prisma.tenantIntegration.create.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      const cipher = data["secretsCipher"] as Buffer;
      expect(Buffer.isBuffer(cipher)).toBe(true);
      const cipherText = cipher.toString("utf8");
      expect(cipherText).not.toContain("secret-token");
      expect(cipherText).not.toContain("SG.key");
      expect(cipherText).not.toContain("mp-token");

      const meta = data["secretsMeta"] as Record<string, Record<string, unknown>>;
      expect(JSON.stringify(meta)).not.toContain("secret-token");
      for (const fieldMeta of Object.values(meta)) {
        expect(Object.keys(fieldMeta).sort()).toEqual(["lastFour", "savedAt"]);
      }
    }
  });

  it("assigns a webhookToken to webhook-capable providers and leaves twilio_voice without one", async () => {
    await seedTenantIntegrations(prisma as never, buildTenant(), fullEnv);

    const byProvider: Record<string, unknown> = {};
    for (const call of prisma.tenantIntegration.create.mock.calls) {
      const data = (call[0] as { data: { provider: string; webhookToken: unknown } }).data;
      byProvider[data.provider] = data.webhookToken;
    }
    expect(typeof byProvider["twilio_whatsapp"]).toBe("string");
    expect(typeof byProvider["sendgrid"]).toBe("string");
    expect(typeof byProvider["mercadopago"]).toBe("string");
    expect(byProvider["twilio_voice"]).toBeNull();
  });

  it("prefers the tenant's own settings.whatsappFromNumber over the global env number", async () => {
    const tenant = buildTenant({ settings: { whatsappFromNumber: "whatsapp:+573000000000" } });

    await seedTenantIntegrations(prisma as never, tenant, fullEnv);

    const waCall = prisma.tenantIntegration.create.mock.calls.find(
      (c: never[]) => (c[0] as { data: { provider: string } }).data.provider === "twilio_whatsapp"
    );
    expect((waCall?.[0] as { data: { publicConfig: { fromNumber: string } } }).data.publicConfig.fromNumber).toBe(
      "whatsapp:+573000000000"
    );
  });

  it("skips twilio entirely when neither the tenant nor the env resolves a from-number", async () => {
    const env: SeedEnv = { ...fullEnv, twilio: { accountSid: "AC123", authToken: "tok", waFrom: null } };

    const results = await seedTenantIntegrations(prisma as never, buildTenant(), env);

    const providers = results.map((r) => r.provider);
    expect(providers).not.toContain("twilio_whatsapp");
    expect(providers).not.toContain("twilio_voice");
  });
});
