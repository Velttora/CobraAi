const DEFAULT_LOCALE = "es-CO";

export function formatCurrency(
  amount: number,
  currency = "COP"
): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatAgingBucket(bucket: string): string {
  const labels: Record<string, string> = {
    d0_30: "0-30 días",
    d31_60: "31-60 días",
    d61_90: "61-90 días",
    d91_180: "91-180 días",
    d180_plus: "180+ días"
  };
  return labels[bucket] ?? bucket;
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function formatSegment(segment: string): string {
  const labels: Record<string, string> = {
    critical: "Crítico",
    high: "Alto",
    medium: "Medio",
    low: "Bajo",
    minimal: "Mínimo"
  };
  return labels[segment] ?? segment;
}

export function segmentColor(segment: string | null | undefined): string {
  switch (segment) {
    case "critical":
      return "#A32D2D";
    case "high":
      return "#D85A30";
    case "medium":
      return "#C49A00";
    case "low":
      return "#0F6E56";
    case "minimal":
      return "#64748B";
    default:
      return "#94A3B8";
  }
}
