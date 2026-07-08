import { describe, expect, it } from "vitest";
import { describeAuditLog } from "./audit-formatter";

describe("describeAuditLog", () => {
  it("traduce bloqueo de compliance con motivo y canal", () => {
    const result = describeAuditLog({
      action: "compliance.contact.blocked",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Juan Pérez",
      changes: { reason: "awaiting_response", channel: "whatsapp" }
    });

    expect(result.action).toBe("Contacto bloqueado");
    expect(result.resourceLabel).toBe("Deudor: Juan Pérez");
    expect(result.detail).toContain("esperando respuesta");
    expect(result.detail).toContain("WhatsApp");
  });

  it("traduce mensaje enviado con número de intento", () => {
    const result = describeAuditLog({
      action: "compliance.contact.sent",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Juan Pérez",
      changes: { channel: "whatsapp", attemptNumber: 1, maxAttempts: 3, windowHours: 24 }
    });

    expect(result.action).toBe("Mensaje enviado");
    expect(result.detail).toContain("intento 1 de 3");
    expect(result.detail).toContain("WhatsApp");
  });

  it("traduce contacto efectivo con canal de respuesta", () => {
    const result = describeAuditLog({
      action: "compliance.contact.effective",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Juan Pérez",
      changes: { channel: "whatsapp", attemptNumber: 1, maxAttempts: 3, respondedVia: "whatsapp" }
    });

    expect(result.action).toBe("Contacto efectivo");
    expect(result.detail).toContain("respondió por WhatsApp");
  });

  it("traduce sin contacto tras vencer la ventana de espera", () => {
    const result = describeAuditLog({
      action: "compliance.contact.no_response",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Juan Pérez",
      changes: { channel: "whatsapp", attemptNumber: 2, maxAttempts: 3 }
    });

    expect(result.action).toBe("Sin contacto");
    expect(result.detail).toContain("intento 2 de 3");
    expect(result.detail).toContain("no hubo respuesta");
  });

  it("traduce escalamiento a riesgo legal tras agotar intentos", () => {
    const result = describeAuditLog({
      action: "compliance.contact.escalated",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Juan Pérez",
      changes: { channel: "voice", attemptNumber: 3, maxAttempts: 3, escalationTarget: "legal_risk" }
    });

    expect(result.action).toBe("Contacto escalado");
    expect(result.detail).toContain("riesgo legal");
  });

  it("traduce escalamiento a agente humano tras agotar intentos", () => {
    const result = describeAuditLog({
      action: "compliance.contact.escalated",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Juan Pérez",
      changes: { channel: "whatsapp", attemptNumber: 3, maxAttempts: 3, escalationTarget: "human" }
    });

    expect(result.action).toBe("Contacto escalado");
    expect(result.detail).toContain("agente humano");
  });

  it("traduce POST de deudas", () => {
    const result = describeAuditLog({
      action: "POST /api/v1/debts",
      resourceType: "debts",
      resourceId: "id",
      resourceName: "FAC-001"
    });

    expect(result.action).toBe("Creó deuda");
    expect(result.resourceLabel).toBe("Deuda: FAC-001");
  });

  it("traduce lectura sensible de deudor", () => {
    const result = describeAuditLog({
      action: "debtor.sensitive_read",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Ana Rodríguez"
    });

    expect(result.action).toBe("Consultó datos del deudor");
    expect(result.resourceLabel).toBe("Deudor: Ana Rodríguez");
  });
});
