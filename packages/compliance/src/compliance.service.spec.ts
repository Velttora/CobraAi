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
    contactConsent: { findFirst: vi.fn() },
    holiday: { findFirst: vi.fn() }
  };
  const integrations = {
    hasVerifiedChannel: vi.fn()
  };

  let service: ComplianceService;

  beforeEach(() => {
    vi.clearAllMocks();
    const consent = new ConsentService(prisma as never);
    const optOut = new OptOutService(prisma as never);
    const audit = new AuditService(prisma as never);
    service = new ComplianceService(
      prisma as never,
      consent,
      optOut,
      audit,
      integrations as never
    );
    prisma.auditLog.create.mockResolvedValue({});
    prisma.contact.count.mockResolvedValue(0);
    prisma.tenant.findUnique.mockResolvedValue({ settings: {} });
    prisma.holiday.findFirst.mockResolvedValue(null); // default: not a holiday
    // Every existing test in this file exercises paths that assume the channel is
    // configured (D-16) — keep them exercising the paths they were written for.
    integrations.hasVerifiedChannel.mockResolvedValue(true);
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

  it("bloquea contacto proactivo en festivo colombiano", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.holiday.findFirst.mockResolvedValue({
      id: "h1",
      date: new Date("2026-05-26T00:00:00.000Z"),
      name: "Festivo de prueba"
    });

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá, dentro de horario
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("holiday");
    expect(result.next_allowed_at).toBeInstanceOf(Date);
  });

  it("fuera de horario reporta outside_hours aunque sea festivo", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.holiday.findFirst.mockResolvedValue({
      id: "h1",
      date: new Date("2026-05-26T00:00:00.000Z"),
      name: "Festivo de prueba"
    });

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at: new Date("2026-05-26T10:00:00.000Z") // 05:00 Bogotá, antes de las 08:00
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("outside_hours");
  });

  it("isChannelEligible bloquea mensajes transaccionales en festivo colombiano", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "CO" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.holiday.findFirst.mockResolvedValue({
      id: "h1",
      date: new Date("2026-05-26T00:00:00.000Z"),
      name: "Festivo de prueba"
    });

    const result = await service.isChannelEligible({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("holiday");
  });

  it("no aplica festivos colombianos a deudores de otro país", async () => {
    prisma.debtor.findFirst.mockResolvedValue(
      debtor({ address: { country: "MX" } })
    );
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.holiday.findFirst.mockResolvedValue({
      id: "h1",
      date: new Date("2026-05-26T00:00:00.000Z"),
      name: "Festivo de prueba"
    });

    const result = await service.checkContact({
      tenantId: "t1",
      debtorId: "d1",
      channel: "email",
      at: new Date("2026-05-26T16:00:00.000Z") // 10:00 CDMX, martes dentro de horario
    });

    expect(result.reason).not.toBe("holiday");
    expect(result.allowed).toBe(true);
  });

  describe("channel_not_configured gate (D-16)", () => {
    it("checkContact bloquea whatsapp cuando no hay integración verificada", async () => {
      prisma.debtor.findFirst.mockResolvedValue(debtor());
      prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
      integrations.hasVerifiedChannel.mockResolvedValue(false);

      const result = await service.checkContact({
        tenantId: "t1",
        debtorId: "d1",
        channel: "whatsapp",
        at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("channel_not_configured");
      expect(result.next_allowed_at).toBeUndefined();
      expect(integrations.hasVerifiedChannel).toHaveBeenCalledWith("t1", "whatsapp");
    });

    it("checkContact cae al flujo normal de horario/frecuencia una vez verificada la integración", async () => {
      prisma.debtor.findFirst.mockResolvedValue(debtor());
      prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
      prisma.contact.findFirst.mockResolvedValue(null);
      integrations.hasVerifiedChannel.mockResolvedValue(true);

      const result = await service.checkContact({
        tenantId: "t1",
        debtorId: "d1",
        channel: "whatsapp",
        at: new Date("2026-05-26T15:00:00.000Z") // 10:00 Bogotá
      });

      expect(result.allowed).toBe(true);
    });

    it("isChannelEligible bloquea email cuando no hay integración sendgrid verificada", async () => {
      prisma.debtor.findFirst.mockResolvedValue(debtor());
      prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
      integrations.hasVerifiedChannel.mockResolvedValue(false);

      const result = await service.isChannelEligible({
        tenantId: "t1",
        debtorId: "d1",
        channel: "email",
        at: new Date("2026-05-26T15:00:00.000Z")
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("channel_not_configured");
      expect(integrations.hasVerifiedChannel).toHaveBeenCalledWith("t1", "email");
    });

    it("opt_out gana sobre channel_not_configured (orden del gate)", async () => {
      prisma.debtor.findFirst.mockResolvedValue(
        debtor({ address: { country: "CO", opt_out_global: true } })
      );
      integrations.hasVerifiedChannel.mockResolvedValue(false);

      const result = await service.checkContact({
        tenantId: "t1",
        debtorId: "d1",
        channel: "whatsapp",
        at: new Date("2026-05-26T15:00:00.000Z")
      });

      expect(result.reason).toBe("opt_out_global");
      expect(result.reason).not.toBe("channel_not_configured");
      // No debe siquiera consultarse la integración una vez que opt-out ya decidió.
      expect(integrations.hasVerifiedChannel).not.toHaveBeenCalled();
    });

    it("registra channel_not_configured en el audit log igual que cualquier otra razón", async () => {
      prisma.debtor.findFirst.mockResolvedValue(debtor());
      prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
      integrations.hasVerifiedChannel.mockResolvedValue(false);

      await service.checkContact({
        tenantId: "t1",
        debtorId: "d1",
        channel: "whatsapp",
        at: new Date("2026-05-26T15:00:00.000Z")
      });

      expect(prisma.auditLog.create).toHaveBeenCalled();
      const [[call]] = prisma.auditLog.create.mock.calls;
      expect(call.data.changes.reason).toBe("channel_not_configured");
    });

    it("channel sms se evalúa contra la integración de whatsapp", async () => {
      prisma.debtor.findFirst.mockResolvedValue(debtor());
      prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
      integrations.hasVerifiedChannel.mockResolvedValue(false);

      const result = await service.checkContact({
        tenantId: "t1",
        debtorId: "d1",
        channel: "sms",
        at: new Date("2026-05-26T15:00:00.000Z")
      });

      expect(result.reason).toBe("channel_not_configured");
      expect(integrations.hasVerifiedChannel).toHaveBeenCalledWith("t1", "whatsapp");
    });

    it("channel internal nunca se gatea", async () => {
      prisma.debtor.findFirst.mockResolvedValue(debtor());
      prisma.contactConsent.findFirst.mockResolvedValue({ id: "c1" });
      prisma.contact.findFirst.mockResolvedValue(null);

      const result = await service.checkContact({
        tenantId: "t1",
        debtorId: "d1",
        channel: "internal",
        at: new Date("2026-05-26T15:00:00.000Z")
      });

      expect(result.allowed).toBe(true);
      expect(integrations.hasVerifiedChannel).not.toHaveBeenCalled();
    });
  });
});
