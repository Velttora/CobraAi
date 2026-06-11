import { startOfZonedDayUtc } from "./dates";

export type DebtStatus =
  | "future"
  | "upcoming"
  | "new"
  | "analyzing"
  | "active"
  | "contacted"
  | "promised"
  | "plan"
  | "disputed"
  | "legal_risk"
  | "legal"
  | "paid_partial"
  | "paid_full"
  | "written_off";

export type AgingBucket =
  | "future"
  | "upcoming"
  | "d0_30"
  | "d31_60"
  | "d61_90"
  | "d91_180"
  | "d180_plus";

function startOfDayUtc(date: Date): Date {
  return startOfZonedDayUtc(date);
}

function differenceInDays(later: Date, earlier: Date): number {
  const ms = startOfDayUtc(later).getTime() - startOfDayUtc(earlier).getTime();
  return Math.round(ms / 86_400_000);
}

/** Quarter de cobro en formato Q1-2026 */
export function getCollectionQuarter(date: Date): string {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter}-${year}`;
}

/** Etiqueta legible: "Jul – Sep 2026" */
export function getQuarterLabel(quarter: string): string {
  const match = /^Q(\d)-(\d{4})$/.exec(quarter);
  if (!match?.[1] || !match[2]) return quarter;
  const labels = ["Ene – Mar", "Abr – Jun", "Jul – Sep", "Oct – Dic"];
  const idx = Number(match[1]) - 1;
  return `${labels[idx] ?? quarter} ${match[2]}`;
}

export function getQuarterDateRange(quarter: string): { start: Date; end: Date } {
  const match = /^Q(\d)-(\d{4})$/.exec(quarter);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Quarter inválido: ${quarter}`);
  }
  const q = Number(match[1]);
  const year = Number(match[2]);
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { start, end };
}

/** Aging bucket para deudas vencidas (daysUntil <= 0). */
export function getAgingBucket(dueDate: Date, today: Date = new Date()): AgingBucket {
  const overdueDays = differenceInDays(startOfDayUtc(today), startOfDayUtc(dueDate));
  if (overdueDays <= 0) return "d0_30";
  if (overdueDays <= 30) return "d0_30";
  if (overdueDays <= 60) return "d31_60";
  if (overdueDays <= 90) return "d61_90";
  if (overdueDays <= 180) return "d91_180";
  return "d180_plus";
}

export function getInitialDebtStatus(
  dueDate: Date,
  scheduledDate?: Date,
  today: Date = new Date()
): { status: DebtStatus; agingBucket: AgingBucket } {
  const collectionDate = startOfDayUtc(scheduledDate ?? dueDate);
  const daysUntil = differenceInDays(collectionDate, startOfDayUtc(today));

  if (daysUntil > 30) {
    return { status: "future", agingBucket: "future" };
  }
  if (daysUntil > 0) {
    return { status: "upcoming", agingBucket: "upcoming" };
  }
  if (daysUntil === 0) {
    return { status: "new", agingBucket: "d0_30" };
  }

  const agingBucket = getAgingBucket(dueDate, today);
  const overdueFromDue = differenceInDays(startOfDayUtc(today), startOfDayUtc(dueDate));
  const status: DebtStatus = overdueFromDue <= 30 ? "new" : "active";
  return { status, agingBucket };
}

export function isActiveDebt(status: DebtStatus): boolean {
  return !(
    status === "future" ||
    status === "upcoming" ||
    status === "paid_full" ||
    status === "paid_partial" ||
    status === "written_off"
  );
}

export function getDaysUntilCollection(
  dueDate: Date,
  scheduledDate?: Date,
  today: Date = new Date()
): number {
  const collectionDate = startOfDayUtc(scheduledDate ?? dueDate);
  return differenceInDays(collectionDate, startOfDayUtc(today));
}

export function getQuarterPipelineStatus(
  statuses: DebtStatus[]
): "active" | "upcoming" | "future" {
  const hasCollectable = statuses.some(
    (s) =>
      s !== "future" &&
      s !== "upcoming" &&
      s !== "paid_full" &&
      s !== "paid_partial" &&
      s !== "written_off"
  );
  if (hasCollectable) return "active";
  if (statuses.some((s) => s === "upcoming")) return "upcoming";
  return "future";
}
