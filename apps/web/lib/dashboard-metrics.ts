import type { Debt } from "./types";
import { toNumber } from "./types";
import { formatCurrency, formatPercent } from "./formatters";

export type DashboardMetrics = {
  recoveryRate: number;
  recoveredAmount: number;
  dsoAverage: number;
  activeAccounts: number;
  highRiskCount: number;
  currency: string;
};

export function computeDashboardMetrics(debts: Debt[]): DashboardMetrics {
  const currency = debts[0]?.currency ?? "COP";
  const total = debts.length;
  const paid = debts.filter((d) => d.status === "paid");
  const active = debts.filter(
    (d) => !["paid", "written_off"].includes(d.status)
  );
  const highRisk = active.filter(
    (d) => d.aiSegment === "critical" || d.aiSegment === "high"
  );

  const recoveredAmount = paid.reduce(
    (sum, d) => sum + toNumber(d.amountOriginal),
    0
  );
  const recoveryRate = total > 0 ? (paid.length / total) * 100 : 0;

  const today = Date.now();
  const dsoAverage =
    active.length > 0
      ? active.reduce((sum, d) => {
          const due = new Date(d.dueDate).getTime();
          const days = Math.max(0, Math.floor((today - due) / 86400000));
          return sum + days;
        }, 0) / active.length
      : 0;

  return {
    recoveryRate,
    recoveredAmount,
    dsoAverage,
    activeAccounts: active.length,
    highRiskCount: highRisk.length,
    currency
  };
}

export function formatMetricRecoveryRate(rate: number): string {
  return formatPercent(rate);
}

export function formatMetricAmount(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}

export function formatMetricDso(days: number): string {
  return `${Math.round(days)} días`;
}

/**
 * Promedio de sentimiento (-1.0 hostil a 1.0 positivo) sobre las conversaciones que
 * ya tienen un score calculado. null cuando ninguna conversación de la muestra tiene
 * score todavía (agente conversacional recién empezando a operar en el tenant).
 */
export function computeAverageSentiment(
  items: Array<{ last_sentiment_score: number | null }>
): number | null {
  const scored = items
    .map((i) => i.last_sentiment_score)
    .filter((s): s is number => s !== null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, s) => sum + s, 0) / scored.length;
}

export function formatMetricSentiment(score: number | null): string {
  if (score === null) return "—";
  if (score > 0.2) return "Positivo";
  if (score < -0.2) return "Negativo";
  return "Neutro";
}
