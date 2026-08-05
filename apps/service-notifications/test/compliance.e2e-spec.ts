import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuditService,
  ComplianceService,
  ConsentService,
  OptOutService
} from "@cobrai/compliance";
import { TenantIntegrationService } from "@cobrai/integrations";
import {
  hasDocker,
  seedMinimalTenant,
  startPostgres,
  stopPostgres,
  type TestDatabase
} from "@cobrai/test-utils";

const describeE2e = hasDocker() ? describe : describe.skip;

describeE2e("compliance e2e", () => {
  let db: TestDatabase;
  let compliance: ComplianceService;

  beforeAll(async () => {
    db = await startPostgres();
    const consent = new ConsentService(db.prisma);
    const optOut = new OptOutService(db.prisma);
    const audit = new AuditService(db.prisma);
    const integrations = new TenantIntegrationService(db.prisma);
    compliance = new ComplianceService(db.prisma, consent, optOut, audit, integrations);
  }, 120_000);

  afterAll(async () => {
    await stopPostgres(db);
  });

  it("bloquea envío sin consentimiento", async () => {
    const { tenantId, debtor } = await seedMinimalTenant(db.prisma);
    await db.prisma.contactConsent.deleteMany({
      where: { tenantId, debtorId: debtor.id }
    });

    const result = await compliance.checkContact({
      tenantId,
      debtorId: debtor.id,
      channel: "sms",
      at: new Date("2026-05-26T10:00:00")
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_consent");
  });

  it("registra decisión en audit_logs", async () => {
    const logs = await db.prisma.auditLog.findMany({
      where: { action: { startsWith: "compliance.contact" } }
    });
    expect(logs.length).toBeGreaterThan(0);
  });
});
