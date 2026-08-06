const DEFAULT_LOCALE = "es-CO";
/** Zona horaria de referencia para la UI (Colombia / LATAM). */
export const APP_TIMEZONE = "America/Bogota";

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

/** Fecha y hora en formato 24h, zona Colombia (no UTC del navegador). */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(DEFAULT_LOCALE, {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/** Fecha relativa en español ("hace 3 días", "hace 2 horas"), zona Colombia. */
export function formatRelativeDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";

  const diffSeconds = Math.round((Date.now() - d.getTime()) / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" });
  if (Math.abs(diffDays) >= 1) return rtf.format(-diffDays, "day");
  if (Math.abs(diffHours) >= 1) return rtf.format(-diffHours, "hour");
  if (Math.abs(diffMinutes) >= 1) return rtf.format(-diffMinutes, "minute");
  return rtf.format(-diffSeconds, "second");
}

/**
 * Fecha sin hora. Se formatea en UTC a propósito: los campos `@db.Date`
 * (fecha pactada, vencimiento) se guardan a medianoche UTC y convertirlos a
 * hora Colombia los correría un día hacia atrás.
 */
export function formatDateOnly(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DEFAULT_LOCALE, {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function formatAgingBucket(bucket: string): string {
  const labels: Record<string, string> = {
    future: "Futuro",
    upcoming: "Próximo",
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
