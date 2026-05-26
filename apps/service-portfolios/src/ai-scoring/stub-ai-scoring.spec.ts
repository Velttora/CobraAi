import { describe, expect, it } from "vitest";
import { StubAIScoringAdapter } from "./stub-ai-scoring.adapter";

describe("StubAIScoringAdapter", () => {
  const adapter = new StubAIScoringAdapter();

  const baseFeatures = {
    amount: 500_000,
    amount_outstanding: 500_000,
    has_whatsapp: true,
    has_phone: true,
    has_email: true,
    promises_broken_count: 0,
    previous_contacts_count: 0,
    max_amount_in_portfolio: 500_000
  };

  it("returns deterministic scores for same inputs", async () => {
    const input = {
      debt_id: "d1",
      tenant_id: "t1",
      features: {
        ...baseFeatures,
        aging_days: 30
      }
    };
    const a = await adapter.scoreDebt(input);
    const b = await adapter.scoreDebt(input);
    expect(a.score).toBe(b.score);
    expect(a.priority_score).toBe(b.priority_score);
    expect(a.score).toBeGreaterThan(50);
    expect(a.priority_score).toBeGreaterThan(0);
  });

  it("recovery score baja con mora; priority sube con monto y sin contacto", async () => {
    const recent = await adapter.scoreDebt({
      debt_id: "d2",
      tenant_id: "t1",
      features: {
        ...baseFeatures,
        aging_days: 15,
        amount_outstanding: 1_000,
        max_amount_in_portfolio: 500_000,
        days_since_last_contact: 20
      }
    });
    const oldBig = await adapter.scoreDebt({
      debt_id: "d3",
      tenant_id: "t1",
      features: {
        ...baseFeatures,
        aging_days: 120,
        amount_outstanding: 500_000,
        max_amount_in_portfolio: 500_000,
        days_since_last_contact: 20
      }
    });
    expect(recent.score).toBeGreaterThan(oldBig.score);
    expect(oldBig.priority_score).toBeGreaterThan(recent.priority_score);
  });

  it("uses voice or email when whatsapp is unavailable", async () => {
    const result = await adapter.scoreDebt({
      debt_id: "d4",
      tenant_id: "t1",
      features: {
        ...baseFeatures,
        aging_days: 200,
        has_whatsapp: false,
        has_phone: true,
        promises_broken_count: 3,
        previous_contacts_count: 8,
        amount_outstanding: 500_000,
        days_since_last_contact: 25
      }
    });
    expect(["voice", "email"]).toContain(result.best_channel);
  });
});
