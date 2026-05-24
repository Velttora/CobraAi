import { describe, expect, it } from "vitest";
import { computeDashboardMetrics } from "./dashboard-metrics";
import type { Debt } from "./types";

const sampleDebts: Debt[] = [
  {
    id: "1",
    portfolioId: "p1",
    debtorId: "d1",
    amountOriginal: 1000,
    amountOutstanding: 500,
    currency: "COP",
    dueDate: "2025-01-01",
    agingBucket: "d31_60",
    status: "paid",
    aiScore: 20,
    aiSegment: "low",
    createdAt: "2025-01-15T00:00:00Z"
  },
  {
    id: "2",
    portfolioId: "p1",
    debtorId: "d2",
    amountOriginal: 2000,
    amountOutstanding: 2000,
    currency: "COP",
    dueDate: "2024-06-01",
    agingBucket: "d180_plus",
    status: "active",
    aiScore: 85,
    aiSegment: "critical",
    createdAt: "2025-02-01T00:00:00Z"
  }
];

describe("computeDashboardMetrics", () => {
  it("calcula KPIs básicos desde deudas", () => {
    const metrics = computeDashboardMetrics(sampleDebts);
    expect(metrics.recoveryRate).toBe(50);
    expect(metrics.recoveredAmount).toBe(1000);
    expect(metrics.activeAccounts).toBe(1);
    expect(metrics.highRiskCount).toBe(1);
    expect(metrics.currency).toBe("COP");
  });
});
