import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { TenantIntegrationService, DecryptedIntegration, IntegrationView } from "@cobrai/integrations";
import type { SendgridProvisioningService } from "./sendgrid-provisioning.service";
import { EmailConnectService } from "./email-connect.service";

const BASE_WEBHOOK_URL = "https://api.cobrai.dev/v1/webhooks";
const NEW_SUBUSER = { username: "tenant-t1", userId: 555, apiKey: "SG.subuser-key" };

function makeConfig(): ConfigService {
  return {
    get: vi.fn((key: string) => (key === "PUBLIC_WEBHOOK_BASE_URL" ? BASE_WEBHOOK_URL : undefined))
  } as unknown as ConfigService;
}

function makeMocks() {
  return {
    sendgridProvisioning: {
      createSubuser: vi.fn(),
      authenticateDomain: vi.fn(),
      validateDomain: vi.fn(),
      deleteSubuser: vi.fn()
    },
    tenantIntegrations: { upsert: vi.fn(), resolveAny: vi.fn() }
  };
}

function baseView(overrides: Partial<IntegrationView> = {}): IntegrationView {
  return {
    provider: "sendgrid",
    channel: "email",
    mode: "managed",
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: `${BASE_WEBHOOK_URL}/sendgrid/tok-abc`,
    ...overrides
  };
}

function storedIntegration(overrides: Partial<DecryptedIntegration> = {}): DecryptedIntegration {
  return {
    id: "row-1",
    tenantId: "tenant-1",
    provider: "sendgrid",
    mode: "managed",
    status: "pending_dns",
    publicConfig: {},
    secrets: {},
    webhookToken: "tok-abc",
    verifiedAt: null,
    ...overrides
  };
}

describe("EmailConnectService", () => {
  let mocks: ReturnType<typeof makeMocks>;
  let service: EmailConnectService;

  beforeEach(() => {
    mocks = makeMocks();
    service = new EmailConnectService(
      mocks.sendgridProvisioning as unknown as SendgridProvisioningService,
      mocks.tenantIntegrations as unknown as TenantIntegrationService,
      makeConfig()
    );
  });

  describe("connectManaged", () => {
    function managedInput() {
      return {
        tenantId: "tenant-1",
        domain: "tenant.com",
        fromEmail: "cobranza@tenant.com",
        fromName: "Cobranzas Tenant",
        adminEmail: "admin@tenant.com"
      };
    }

    it("creates the subuser, authenticates the domain, and persists domain/fromEmail/fromName/replyDomain/subuserUsername/domainId/dnsRecords", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(null);
      mocks.sendgridProvisioning.createSubuser.mockResolvedValueOnce(NEW_SUBUSER);
      mocks.sendgridProvisioning.authenticateDomain.mockResolvedValueOnce({
        domainId: 42,
        valid: false,
        records: [{ type: "CNAME", host: "mail.tenant.com", value: "u7.wl.sendgrid.net", verified: false }]
      });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ status: "pending_dns" }));

      const result = await service.connectManaged(managedInput());

      expect(mocks.sendgridProvisioning.createSubuser).toHaveBeenCalledWith("tenant-1", "admin@tenant.com");
      expect(mocks.sendgridProvisioning.authenticateDomain).toHaveBeenCalledWith("tenant-t1", "tenant.com");

      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as { publicConfig: Record<string, unknown> };
      expect(upsertArg.publicConfig).toMatchObject({
        domain: "tenant.com",
        fromEmail: "cobranza@tenant.com",
        fromName: "Cobranzas Tenant",
        replyDomain: "reply.tenant.com",
        subuserUsername: "tenant-t1",
        domainId: "42"
      });
      expect(upsertArg.publicConfig["dnsRecords"]).toEqual([
        { type: "CNAME", host: "mail.tenant.com", value: "u7.wl.sendgrid.net", verified: false }
      ]);
      expect(result.status).toBe("pending_dns");
    });

    it("persists status: pending_dns when the authenticated domain is not yet valid, and verified when it already is", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(null);
      mocks.sendgridProvisioning.createSubuser.mockResolvedValueOnce(NEW_SUBUSER);
      mocks.sendgridProvisioning.authenticateDomain.mockResolvedValueOnce({ domainId: 42, valid: true, records: [] });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ status: "verified" }));

      await service.connectManaged(managedInput());

      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as {
        overrideStatus: { status: string; verifiedAt?: Date | null };
      };
      expect(upsertArg.overrideStatus.status).toBe("verified");
      expect(upsertArg.overrideStatus.verifiedAt).toBeInstanceOf(Date);
    });

    it("derives replyDomain as reply.{domain} when not supplied explicitly", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(null);
      mocks.sendgridProvisioning.createSubuser.mockResolvedValueOnce(NEW_SUBUSER);
      mocks.sendgridProvisioning.authenticateDomain.mockResolvedValueOnce({ domainId: 42, valid: false, records: [] });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView());

      await service.connectManaged(managedInput());

      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as { publicConfig: Record<string, unknown> };
      expect(upsertArg.publicConfig["replyDomain"]).toBe("reply.tenant.com");
    });

    it("reuses an existing subuser instead of creating a second one", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(
        storedIntegration({ publicConfig: { subuserUsername: "tenant-t1" } })
      );
      mocks.sendgridProvisioning.authenticateDomain.mockResolvedValueOnce({ domainId: 42, valid: false, records: [] });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ status: "pending_dns" }));

      await service.connectManaged(managedInput());

      expect(mocks.sendgridProvisioning.createSubuser).not.toHaveBeenCalled();
      expect(mocks.sendgridProvisioning.authenticateDomain).toHaveBeenCalledWith("tenant-t1", "tenant.com");
    });

    it("persists status: failed with SendGrid's message when subuser creation fails, without a prior verified write", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(null);
      mocks.sendgridProvisioning.createSubuser.mockRejectedValueOnce(new Error("Plan does not support subusers"));
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(
        baseView({ status: "failed", failureMessage: "Plan does not support subusers" })
      );

      const result = await service.connectManaged(managedInput());

      expect(mocks.tenantIntegrations.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as {
        overrideStatus: { status: string; failureMessage: string };
      };
      expect(upsertArg.overrideStatus).toEqual({ status: "failed", failureMessage: "Plan does not support subusers" });
      expect(result.status).toBe("failed");
    });

    it("never writes the subuser API key into any publicConfig argument", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(null);
      mocks.sendgridProvisioning.createSubuser.mockResolvedValueOnce(NEW_SUBUSER);
      mocks.sendgridProvisioning.authenticateDomain.mockResolvedValueOnce({ domainId: 42, valid: false, records: [] });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ status: "pending_dns" }));

      await service.connectManaged(managedInput());

      for (const call of mocks.tenantIntegrations.upsert.mock.calls) {
        expect(JSON.stringify((call[0] as { publicConfig: unknown }).publicConfig)).not.toContain(NEW_SUBUSER.apiKey);
      }
      const secretsArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as { secrets: Record<string, string> };
      expect(secretsArg.secrets).toEqual({ apiKey: NEW_SUBUSER.apiKey });
    });
  });

  describe("connectByo", () => {
    it("skips provisioning entirely, persists mode: byo with the pasted key, and relies on the shared verifier", async () => {
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo", status: "pending_dns" }));

      const result = await service.connectByo({
        tenantId: "tenant-1",
        apiKey: "SG.byo-key",
        fromEmail: "cobranza@tenant.com",
        fromName: "Cobranzas Tenant",
        domain: "tenant.com"
      });

      expect(mocks.sendgridProvisioning.createSubuser).not.toHaveBeenCalled();
      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as {
        mode: string;
        secrets: Record<string, string>;
        overrideStatus?: unknown;
        skipVerification?: boolean;
      };
      expect(upsertArg.mode).toBe("byo");
      expect(upsertArg.secrets).toEqual({ apiKey: "SG.byo-key" });
      expect(upsertArg.overrideStatus).toBeUndefined();
      expect(upsertArg.skipVerification).toBeUndefined();
      expect(result.status).toBe("pending_dns");
    });

    it("never writes the pasted API key into publicConfig", async () => {
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo" }));

      await service.connectByo({
        tenantId: "tenant-1",
        apiKey: "SG.byo-key",
        fromEmail: "cobranza@tenant.com",
        fromName: "Cobranzas Tenant",
        domain: "tenant.com"
      });

      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as { publicConfig: Record<string, unknown> };
      expect(JSON.stringify(upsertArg.publicConfig)).not.toContain("SG.byo-key");
    });
  });

  describe("recheckDns", () => {
    it("re-validates against SendGrid, updates dnsRecords, and flips pending_dns to verified", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(
        storedIntegration({
          status: "pending_dns",
          publicConfig: { subuserUsername: "tenant-t1", domainId: "42", domain: "tenant.com" }
        })
      );
      mocks.sendgridProvisioning.validateDomain.mockResolvedValueOnce({
        domainId: 42,
        valid: true,
        records: [{ type: "CNAME", host: "mail.tenant.com", value: "u7.wl.sendgrid.net", verified: true }]
      });
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ status: "verified" }));

      const result = await service.recheckDns("tenant-1");

      expect(mocks.sendgridProvisioning.validateDomain).toHaveBeenCalledWith("tenant-t1", 42);
      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as {
        publicConfig: Record<string, unknown>;
        overrideStatus: { status: string };
      };
      expect(upsertArg.publicConfig["dnsRecords"]).toEqual([
        { type: "CNAME", host: "mail.tenant.com", value: "u7.wl.sendgrid.net", verified: true }
      ]);
      expect(upsertArg.overrideStatus.status).toBe("verified");
      expect(result.status).toBe("verified");
    });

    it("returns a not_configured view rather than throwing when there is no sendgrid integration", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(null);

      const result = await service.recheckDns("tenant-without-email");

      expect(result.status).toBe("not_configured");
      expect(mocks.tenantIntegrations.upsert).not.toHaveBeenCalled();
      expect(mocks.sendgridProvisioning.validateDomain).not.toHaveBeenCalled();
    });

    it("falls back to the shared verifier via a plain re-upsert for a BYO row with no subuser/domainId pair", async () => {
      mocks.tenantIntegrations.resolveAny.mockResolvedValueOnce(
        storedIntegration({ mode: "byo", status: "pending_dns", publicConfig: { domain: "tenant.com" } })
      );
      mocks.tenantIntegrations.upsert.mockResolvedValueOnce(baseView({ mode: "byo", status: "verified" }));

      const result = await service.recheckDns("tenant-1");

      expect(mocks.sendgridProvisioning.validateDomain).not.toHaveBeenCalled();
      const upsertArg = mocks.tenantIntegrations.upsert.mock.calls[0]![0] as { overrideStatus?: unknown };
      expect(upsertArg.overrideStatus).toBeUndefined();
      expect(result.status).toBe("verified");
    });
  });
});
