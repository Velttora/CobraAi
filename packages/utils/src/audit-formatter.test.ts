import { describe, expect, it } from "vitest";
import { describeAuditLog } from "./audit-formatter";

describe("describeAuditLog", () => {
  it("traduce bloqueo de compliance con motivo y canal", () => {
    const result = describeAuditLog({
      action: "compliance.contact.blocked",
      resourceType: "debtor",
      resourceId: "id",
      resourceName: "Juan Pérez",
      changes: { reason: "weekly_limit", channel: "whatsapp" }
    });

    expect(result.action).toBe("Contacto bloqueado");
    expect(result.resourceLabel).toBe("Deudor: Juan Pérez");
    expect(result.detail).toContain("límite semanal");
    expect(result.detail).toContain("WhatsApp");
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
