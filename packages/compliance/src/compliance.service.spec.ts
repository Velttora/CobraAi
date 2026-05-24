import { describe, expect, it, vi, beforeEach } from "vitest";
import { ComplianceService } from "./compliance.service";
import { ConsentService } from "./consent.service";
import { OptOutService } from "./opt-out.service";
import { AuditService } from "./audit.service";

function debtor(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    tenantId: "t1",
    name: "Juan",
    address: { country: "CO" },
    whatsappOptIn: true,
    ...overrides
  };
}

describe("ComplianceService", () => {
  const prisma = {
    debtor: { findFirst: vi.fn() },
    contact: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    contactConsent: { findFirst: vi.fn() }
  };

  let service: ComplianceService;

  beforeEach(() => {
    vi.clearAllMocks();
    const consent = new ConsentService(prisma as never);
    const optOut = new OptOutService(prisma as never);
    const audit = new AuditService(prisma as never);
    service = new ComplianceService(prisma as never, consent, optOut, audit);
    prisma.auditLog.create.mockResolvedValue({});
  });

  it("bloquea México domingo", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "MX" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findMany.mockResolvedValue([]);

    const at = new Date("2026-05-24T10:00:00"); // Sunday
    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("outside_hours");
  });

  it("bloquea México tras 3 contactos semanales", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "MX" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findMany.mockResolvedValue([
      { channel: "email", createdAt: new Date() },
      { channel: "sms", createdAt: new Date() },
      { channel: "whatsapp", createdAt: new Date() }
    ]);

    const at = new Date("2026-05-26T10:00:00"); // Tuesday
    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("weekly_limit");
  });

  it("bloquea Brasil frecuencia diaria por canal", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "BR" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findMany.mockResolvedValue([
      { channel: "sms", createdAt: new Date("2026-05-26T09:00:00") }
    ]);

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "sms",
      at: new Date("2026-05-26T15:00:00")
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("frequency_limit");
  });

  it("bloquea Colombia más de 1 contacto semanal", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findMany.mockResolvedValue([
      { channel: "email", createdAt: new Date("2026-05-20T10:00:00") }
    ]);

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "sms",
      at: new Date("2026-05-26T10:00:00")
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("weekly_limit");
  });

  it("permite contacto válido en horario Colombia", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findMany.mockResolvedValue([]);

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at: new Date("2026-05-26T10:00:00")
    });

    expect(result.allowed).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
