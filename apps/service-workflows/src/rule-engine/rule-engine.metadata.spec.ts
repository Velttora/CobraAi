import { beforeEach, describe, expect, it } from "vitest";
import { RuleEngineService } from "./rule-engine.service";

describe("RuleEngineService metadata keys", () => {
  let engine: RuleEngineService;

  beforeEach(() => {
    engine = new RuleEngineService();
  });

  it("ignora claves internas __ en condition", () => {
    const debt = {
      status: "new",
      aiScore: 80,
      aiSegment: "low",
      agingBucket: "d0_30",
      amountOutstanding: 1000,
      dueDate: new Date("2026-01-01")
    } as never;

    expect(
      engine.matchesCondition(debt, null, {
        __source_package: "empresa_grande",
        status: "new"
      })
    ).toBe(true);

    expect(
      engine.matchesCondition(debt, null, {
        __source_package: "empresa_grande",
        status: "active"
      })
    ).toBe(false);
  });
});
