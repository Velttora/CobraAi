import { describe, expect, it } from "vitest";
import {
  computeAverageSentiment,
  computeDashboardMetrics,
  formatMetricSentiment
} from "./dashboard-metrics";
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

describe("computeAverageSentiment", () => {
  it("promedia solo las conversaciones con score calculado", () => {
    const avg = computeAverageSentiment([
      { last_sentiment_score: 0.6 },
      { last_sentiment_score: -0.2 },
      { last_sentiment_score: null }
    ]);
    expect(avg).toBeCloseTo(0.2);
  });

  it("sin ninguna conversación con score → null (no '0' engañoso)", () => {
    const avg = computeAverageSentiment([
      { last_sentiment_score: null },
      { last_sentiment_score: null }
    ]);
    expect(avg).toBeNull();
  });

  it("lista vacía → null", () => {
    expect(computeAverageSentiment([])).toBeNull();
  });
});

describe("formatMetricSentiment", () => {
  it("null → guion (sin datos)", () => {
    expect(formatMetricSentiment(null)).toBe("—");
  });

  it("score > 0.2 → Positivo", () => {
    expect(formatMetricSentiment(0.5)).toBe("Positivo");
  });

  it("score < -0.2 → Negativo", () => {
    expect(formatMetricSentiment(-0.5)).toBe("Negativo");
  });

  it("score entre -0.2 y 0.2 → Neutro", () => {
    expect(formatMetricSentiment(0)).toBe("Neutro");
  });
});
