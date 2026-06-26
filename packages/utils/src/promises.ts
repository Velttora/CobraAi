/**
 * Lógica pura para resolver el estado de una promesa de pago.
 *
 * El estado vive en la BD como PromiseStatus ("pending" | "kept" | "broken" |
 * "partial"); aquí lo tratamos como string para no acoplar @cobrai/utils a Prisma.
 */
export type ResolvedPromiseStatus = "kept" | "partial";

/**
 * Estado de una promesa cuando entra un pago a su deuda.
 *
 * - Deuda saldada por completo → la promesa se considera cumplida ("kept").
 * - Pago que cubre el monto prometido → "kept".
 * - Pago menor al prometido → "partial" (cumplió en parte, no se rompe).
 */
export function resolvePromiseStatusForPayment(input: {
  promiseAmount: number;
  amountPaid: number;
  debtPaidFull: boolean;
}): ResolvedPromiseStatus {
  if (input.debtPaidFull) return "kept";
  if (input.promiseAmount > 0 && input.amountPaid >= input.promiseAmount) {
    return "kept";
  }
  return "partial";
}

/**
 * Estados de deuda en los que una promesa NUNCA debe marcarse como rota,
 * aunque su fecha haya vencido (la deuda ya está saldada o castigada).
 *
 * Evita el bug de marcar como "rota" una promesa de una deuda que el deudor
 * ya pagó puntualmente.
 */
export const PROMISE_SAFE_DEBT_STATUSES = [
  "paid_full",
  "written_off"
] as const;

export function canBreakPromiseForDebtStatus(debtStatus: string): boolean {
  return !(PROMISE_SAFE_DEBT_STATUSES as readonly string[]).includes(debtStatus);
}

export type InstallmentPlanItem = {
  installmentNumber: number;
  amount: number;
  /** Fecha de vencimiento de la cuota en formato YYYY-MM-DD. */
  dueDate: string;
};

/**
 * Reparte un monto total en N cuotas iguales con vencimientos periódicos.
 *
 * El redondeo a 2 decimales se acumula en la última cuota, de modo que la suma
 * de las cuotas siempre es exactamente el total (sin centavos perdidos).
 */
export function buildInstallmentSchedule(input: {
  totalAmount: number;
  installmentsCount: number;
  firstDueDate: string | Date;
  /** Días entre cuotas. Por defecto 30 (mensual). */
  intervalDays?: number;
}): InstallmentPlanItem[] {
  const count = Math.max(1, Math.floor(input.installmentsCount));
  const interval = input.intervalDays ?? 30;
  const first = new Date(input.firstDueDate);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const base = round2(input.totalAmount / count);

  const items: InstallmentPlanItem[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const amount = isLast ? round2(input.totalAmount - allocated) : base;
    allocated = round2(allocated + amount);
    const due = new Date(first);
    due.setUTCDate(due.getUTCDate() + interval * i);
    items.push({
      installmentNumber: i + 1,
      amount,
      dueDate: due.toISOString().split("T")[0] as string
    });
  }
  return items;
}
