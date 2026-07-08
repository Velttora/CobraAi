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
    contact: { findFirst: vi.fn(), count: vi.fn() },
    tenant: { findUnique: vi.fn() },
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
    prisma.contact.count.mockResolvedValue(0);
    prisma.tenant.findUnique.mockResolvedValue({ settings: {} });
  });

  it("bloquea México domingo", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "MX" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue(null);

    // Domingo 10:00 hora Ciudad de México (UTC-6 en mayo)
    const at = new Date("2026-05-24T16:00:00.000Z");
    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("outside_hours");
  });

  it("bloquea mientras el intento previo espera respuesta dentro de la ventana", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "MX" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "pending",
      startedAt: new Date("2026-05-26T10:00:00.000Z"),
      createdAt: new Date("2026-05-26T10:00:00.000Z"),
      nextRetryAt: null,
      attemptNumber: 1
    });

    // Martes 10:05 hora Ciudad de México — solo 6 min después del envío, ventana 24h sin vencer
    const at = new Date("2026-05-26T16:05:00.000Z");
    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("awaiting_response");
  });

  it("permite un nuevo intento una vez vencida la ventana de espera (a la espera del sweep)", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "MX" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "pending",
      startedAt: new Date("2026-05-24T10:00:00.000Z"),
      createdAt: new Date("2026-05-24T10:00:00.000Z"),
      nextRetryAt: null,
      attemptNumber: 1
    });

    // Martes 10:00 — más de 24h después del envío del domingo
    const at = new Date("2026-05-26T16:00:00.000Z");
    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at
    });

    expect(result.allowed).toBe(true);
  });

  it("bloquea Brasil frecuencia diaria por canal", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "BR" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.count.mockResolvedValue(1);

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "sms",
      at: new Date("2026-05-26T18:00:00.000Z") // 15:00 São Paulo
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("frequency_limit");
  });

  it("bloquea en cooldown de reintento tras un ciclo sin respuesta", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "no_response",
      startedAt: new Date("2026-05-26T10:00:00.000Z"),
      createdAt: new Date("2026-05-26T10:00:00.000Z"),
      nextRetryAt: new Date("2026-05-27T10:00:00.000Z"),
      attemptNumber: 1
    });

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "sms",
      at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("retry_cooldown");
  });

  it("bloquea permanentemente al agotar el máximo de intentos sin respuesta", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "no_response",
      startedAt: new Date("2026-05-20T10:00:00.000Z"),
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
      nextRetryAt: null,
      attemptNumber: 3
    });

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "sms",
      at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("max_attempts_reached");
  });

  it("permite un ciclo nuevo tras un contacto efectivo previo", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "effective",
      startedAt: new Date("2026-05-20T10:00:00.000Z"),
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
      nextRetryAt: null,
      attemptNumber: 1
    });

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "sms",
      at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá
    });

    expect(result.allowed).toBe(true);
  });

  it("respeta la política de reintento configurada por tenant", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.tenant.findUnique.mockResolvedValue({
      settings: { contactRetryPolicy: { windowHours: 48, maxAttempts: 5 } }
    });
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "pending",
      startedAt: new Date("2026-05-25T15:00:00.000Z"), // 25h antes — vencería con default 24h
      createdAt: new Date("2026-05-25T15:00:00.000Z"),
      nextRetryAt: null,
      attemptNumber: 1
    });

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "sms",
      at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá, +24h desde el envío
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("awaiting_response"); // con ventana de 48h del tenant, sigue esperando
  });

  it("permite contacto válido en horario Colombia", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue(null);

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá
    });

    expect(result.allowed).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
