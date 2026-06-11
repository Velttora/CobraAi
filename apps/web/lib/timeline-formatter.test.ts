import { describe, expect, it } from "vitest";
import { formatTimelineEvent } from "./timeline-formatter";

describe("formatTimelineEvent", () => {
  it("formatea contacto completado con resultado", () => {
    const event = formatTimelineEvent("contact", {
      channel: "whatsapp",
      status: "completed",
      outcome: "promise_made",
      durationSeconds: 125,
      agentType: "ai"
    });

    expect(event.title).toBe("Contacto");
    expect(event.description).toContain("WhatsApp");
    expect(event.description).toContain("Promesa de pago");
    expect(event.meta).toContain("Duración: 2m 5s");
  });

  it("formatea promesa de pago", () => {
    const event = formatTimelineEvent("promise", {
      amount: "150000",
      currency: "COP",
      promisedDate: "2026-06-15T00:00:00.000Z",
      status: "pending"
    });

    expect(event.title).toBe("Promesa de pago");
    expect(event.description).toContain("$");
    expect(event.description).toContain("Pendiente");
  });

  it("formatea pago confirmado", () => {
    const event = formatTimelineEvent("payment", {
      amount: 50000,
      currency: "COP",
      gateway: "pse",
      status: "confirmed"
    });

    expect(event.description).toContain("PSE");
    expect(event.description).toContain("Confirmado");
  });

  it("formatea workflow bloqueado por compliance", () => {
    const event = formatTimelineEvent("workflow", {
      status: "skipped",
      result: {
        blocked: true,
        reason: "outside_hours",
        channel: "email"
      }
    });

    expect(event.description).toContain("Fuera de horario permitido");
    expect(event.meta).toContain("Canal: Email");
  });
});
