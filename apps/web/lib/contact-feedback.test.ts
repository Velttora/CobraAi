import { describe, expect, it } from "vitest";
import { describeManualContactResult } from "./contact-feedback";

describe("describeManualContactResult", () => {
  it("marca envío exitoso", () => {
    const result = describeManualContactResult({ blocked: false });
    expect(result.variant).toBe("success");
    expect(result.title).toBe("Contacto enviado");
  });

  it("programa contacto fuera de horario", () => {
    const result = describeManualContactResult({
      blocked: true,
      reason: "outside_hours",
      next_valid_at: "2026-05-27T13:00:00.000Z"
    });

    expect(result.variant).toBe("warning");
    expect(result.title).toBe("Contacto programado");
    expect(result.description).toContain("horario");
  });

  it("bloquea por límite semanal", () => {
    const result = describeManualContactResult({
      blocked: true,
      reason: "weekly_limit"
    });

    expect(result.variant).toBe("error");
    expect(result.description).toContain("límite de contactos");
  });

  it("bloquea por falta de consentimiento", () => {
    const result = describeManualContactResult({
      blocked: true,
      reason: "no_consent"
    });

    expect(result.variant).toBe("error");
    expect(result.description).toContain("consentimiento");
  });
});
