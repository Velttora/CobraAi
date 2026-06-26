import { describe, expect, it } from "vitest";
import { RuleEngineService } from "./rule-engine.service";

describe("RuleEngineService", () => {
  const engine = new RuleEngineService();

  const baseDebt = {
    id: "d1",
    status: "active" as const,
    aiScore: 25,
    aiSegment: "critical" as const,
    agingBucket: "d91_180" as const,
    amountOutstanding: 5000,
    dueDate: new Date("2024-01-01"),
    metadata: {}
  };

  const debtor = {
    whatsappOptIn: true
  };

  it("evalúa condición vacía como true", () => {
    expect(engine.matchesCondition(baseDebt as never, debtor as never, {})).toBe(
      true
    );
  });

  it("evalúa ai_score lt", () => {
    expect(
      engine.matchesCondition(baseDebt as never, debtor as never, {
        ai_score: { lt: 40 }
      })
    ).toBe(true);
    expect(
      engine.matchesCondition(baseDebt as never, debtor as never, {
        ai_score: { lt: 20 }
      })
    ).toBe(false);
  });

  it("evalúa aging_bucket en lista", () => {
    expect(
      engine.matchesCondition(baseDebt as never, debtor as never, {
        aging_bucket: ["d91_180", "d180_plus"]
      })
    ).toBe(true);
  });

  it("evalúa aging_days con rango personalizado", () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const due = new Date(today);
    due.setUTCDate(due.getUTCDate() - 45);
    const debt = { ...baseDebt, dueDate: due };

    expect(
      engine.matchesCondition(debt as never, debtor as never, {
        aging_days: { gte: 31, lte: 60 }
      })
    ).toBe(true);
    expect(
      engine.matchesCondition(debt as never, debtor as never, {
        aging_days: { gte: 0, lte: 30 }
      })
    ).toBe(false);
  });

  it("evalúa whatsapp_opt_in", () => {
    expect(
      engine.matchesCondition(baseDebt as never, debtor as never, {
        whatsapp_opt_in: true
      })
    ).toBe(true);
  });

  it("evalúa days_to_due con signo (pre-vencimiento)", () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const due = new Date(today);
    due.setUTCDate(due.getUTCDate() + 5); // vence en 5 días
    const debt = { ...baseDebt, status: "upcoming" as const, dueDate: due };

    expect(
      engine.matchesCondition(debt as never, debtor as never, {
        days_to_due: { gte: 1, lte: 7 }
      })
    ).toBe(true);
    expect(
      engine.matchesCondition(debt as never, debtor as never, {
        days_to_due: { gte: 1, lte: 3 }
      })
    ).toBe(false);
  });

  describe("ruleAppliesToDebt (gate por estado)", () => {
    const upcoming = (daysToDue: number) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const due = new Date(today);
      due.setUTCDate(due.getUTCDate() + daysToDue);
      return { ...baseDebt, status: "upcoming" as const, dueDate: due };
    };

    it("deuda por vencer: solo reglas pre-vencimiento la tocan", () => {
      const debt = upcoming(5);
      // regla pre-vencimiento → aplica
      expect(
        engine.ruleAppliesToDebt(debt as never, debtor as never, {
          days_to_due: { gte: 1, lte: 7 }
        })
      ).toBe(true);
      // regla de mora (aging) → NO aplica a una deuda aún por vencer
      expect(
        engine.ruleAppliesToDebt(debt as never, debtor as never, {
          aging_days: { gte: 0, lte: 30 }
        })
      ).toBe(false);
      // regla sin condición (match-all) → tampoco contacta prematuramente
      expect(
        engine.ruleAppliesToDebt(debt as never, debtor as never, {})
      ).toBe(false);
    });

    it("deuda future: nunca aplica ninguna regla", () => {
      const debt = { ...upcoming(45), status: "future" as const };
      expect(
        engine.ruleAppliesToDebt(debt as never, debtor as never, {
          days_to_due: { gte: 1, lte: 7 }
        })
      ).toBe(false);
    });

    it("deuda en mora: aplica la condición normal", () => {
      expect(
        engine.ruleAppliesToDebt(baseDebt as never, debtor as never, {
          ai_score: { lt: 40 }
        })
      ).toBe(true);
    });
  });
});
