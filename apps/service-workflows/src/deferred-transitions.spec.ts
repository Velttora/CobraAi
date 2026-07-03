import { describe, expect, it } from "vitest";
import { RuleEngineService } from "./rule-engine/rule-engine.service";

describe("deferred transitions / rule engine", () => {
  const engine = new RuleEngineService();
  const baseDebt = {
    id: "d1",
    status: "future",
    dueDate: new Date("2026-08-01"),
    agingBucket: "future",
    amountOutstanding: 1000,
    aiScore: null,
    aiSegment: null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it("ignora deudas future", () => {
    const result = engine.evaluateRules(baseDebt, null, { status: "active" });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("debt_not_yet_collectable");
  });

  it("ignora deudas upcoming", () => {
    const result = engine.evaluateRules(
      { ...baseDebt, status: "upcoming" },
      null,
      {}
    );
    expect(result.applied).toBe(false);
  });

  it("evalúa deudas activas", () => {
    const result = engine.evaluateRules(
      { ...baseDebt, status: "active" },
      null,
      {}
    );
    expect(result.applied).toBe(true);
  });
});
