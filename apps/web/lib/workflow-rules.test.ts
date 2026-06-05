import { describe, expect, it } from "vitest";
import {
  compareRuleFiringOrder,
  describeWorkflowRule,
  sortRulesByDebtorLifecycle
} from "./workflow-rules";

describe("compareRuleFiringOrder", () => {
  it("ordena el paquete cartera personas como el ciclo de vida del deudor", () => {
    const rules = [
      {
        name: "Pago confirmado — cerrar",
        trigger: "payment_confirmed",
        condition: { amount_outstanding: 0 }
      },
      {
        name: "Aging 180+ — escalamiento legal",
        trigger: "schedule",
        condition: { aging_bucket: "d180_plus" }
      },
      {
        name: "Bienvenida — SMS",
        trigger: "debt_created",
        condition: { status: "new" }
      },
      {
        name: "Score medio-bajo — WhatsApp",
        trigger: "score_updated",
        condition: { ai_score: { lt: 60 } },
        delay_hours: 1
      },
      {
        name: "Aging 0-30 — WhatsApp",
        trigger: "schedule",
        condition: { aging_bucket: "d0_30" }
      },
      {
        name: "Promesa rota — SMS + tarea",
        trigger: "promise_broken",
        condition: {}
      },
      {
        name: "Aging 61-90 — llamada IA",
        trigger: "schedule",
        condition: { aging_bucket: "d61_90" }
      },
      {
        name: "Score bajo sin WhatsApp — SMS",
        trigger: "score_updated",
        condition: { ai_score: { lt: 40 } },
        delay_hours: 2
      }
    ];

    const ordered = sortRulesByDebtorLifecycle(rules).map((r) => r.name);

    expect(ordered).toEqual([
      "Bienvenida — SMS",
      "Score medio-bajo — WhatsApp",
      "Score bajo sin WhatsApp — SMS",
      "Aging 0-30 — WhatsApp",
      "Aging 61-90 — llamada IA",
      "Aging 180+ — escalamiento legal",
      "Promesa rota — SMS + tarea",
      "Pago confirmado — cerrar"
    ]);
  });

  it("ordena buckets de aging de menor a mayor", () => {
    expect(
      compareRuleFiringOrder(
        { name: "b", trigger: "schedule", condition: { aging_bucket: "d61_90" } },
        { name: "a", trigger: "schedule", condition: { aging_bucket: "d0_30" } }
      )
    ).toBeGreaterThan(0);
  });
});

describe("describeWorkflowRule", () => {
  it("traduce score bajo + WhatsApp con delay a lenguaje natural", () => {
    const desc = describeWorkflowRule({
      trigger: "score_updated",
      condition: { ai_score: { lt: 60 }, whatsapp_opt_in: true },
      action: "send_notification",
      channel: "whatsapp",
      delay_hours: 1
    });

    expect(desc.when).toBe(
      "Cuando el score de cobro queda bajo (menos de 60) (con WhatsApp habilitado)"
    );
    expect(desc.does).toBe("Envía un WhatsApp");
    expect(desc.timing).toBe("1 hora después");
  });

  it("traduce score muy bajo (< 40)", () => {
    const desc = describeWorkflowRule({
      trigger: "score_updated",
      condition: { ai_score: { lt: 40 } },
      action: "send_notification",
      channel: "sms"
    });
    expect(desc.when).toBe("Cuando el score de cobro queda muy bajo (menos de 40)");
    expect(desc.does).toBe("Envía un SMS");
  });

  it("traduce aging schedule y voz", () => {
    const desc = describeWorkflowRule({
      trigger: "schedule",
      condition: { aging_bucket: "d61_90" },
      action: "send_notification",
      channel: "voice"
    });
    expect(desc.when).toBe("Cuando la deuda lleva 61 a 90 días de mora");
    expect(desc.does).toBe("Hace una llamada con IA");
    expect(desc.timing).toBe("");
  });

  it("traduce escalamiento por promesa rota", () => {
    const desc = describeWorkflowRule({
      trigger: "promise_broken",
      condition: {},
      action: "escalate_human",
      channel: "voice",
      delay_hours: 4
    });
    expect(desc.when).toBe("Cuando el deudor incumple una promesa de pago");
    expect(desc.does).toBe("Escala a un agente humano");
    expect(desc.timing).toBe("4 horas después");
  });

  it("traduce pago confirmado a cierre de deuda", () => {
    const desc = describeWorkflowRule({
      trigger: "payment_confirmed",
      condition: { amount_outstanding: 0 },
      action: "update_status"
    });
    expect(desc.when).toBe("Cuando se confirma el pago");
    expect(desc.does).toBe("Marca la deuda como pagada");
    expect(desc.summary).toBe(
      "Cuando se confirma el pago, marca la deuda como pagada."
    );
  });
});
