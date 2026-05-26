import { describe, expect, it } from "vitest";
import {
  calculatePriorityScore,
  calculateRecoveryScore,
  deriveManagementSegment
} from "./scoring-engine";

describe("calculateRecoveryScore", () => {
  it("baja con aging alto", () => {
    const young = calculateRecoveryScore({
      aging_days: 10,
      amount_outstanding: 500_000,
      has_whatsapp: true,
      has_phone: true,
      has_email: true,
      promises_broken_count: 0,
      previous_contacts_count: 0
    });
    const old = calculateRecoveryScore({
      aging_days: 200,
      amount_outstanding: 500_000,
      has_whatsapp: true,
      has_phone: true,
      has_email: true,
      promises_broken_count: 0,
      previous_contacts_count: 0
    });
    expect(young).toBeGreaterThan(old);
  });
});

describe("calculatePriorityScore", () => {
  it("prioriza monto alto con probabilidad moderada sobre monto bajo con alta probabilidad", () => {
    const big = calculatePriorityScore(30, 500_000, 15, 500_000);
    const small = calculatePriorityScore(90, 1_000, 15, 500_000);
    expect(big).toBeGreaterThan(small);
  });

  it("aumenta cuando lleva más días sin contacto", () => {
    const recent = calculatePriorityScore(50, 200_000, 2, 500_000);
    const stale = calculatePriorityScore(50, 200_000, 25, 500_000);
    expect(stale).toBeGreaterThan(recent);
  });
});

describe("deriveManagementSegment", () => {
  it("marca crítico por mora extrema", () => {
    expect(
      deriveManagementSegment({
        ai_score: 80,
        priority_score: 90,
        aging_days: 200,
        amount_outstanding: 100_000
      })
    ).toBe("critical");
  });

  it("marca alta prioridad por priority_score", () => {
    expect(
      deriveManagementSegment({
        ai_score: 40,
        priority_score: 75,
        aging_days: 60,
        amount_outstanding: 1_000_000
      })
    ).toBe("high");
  });
});
