/**
 * Reglas puras del estado de un compromiso de pago (promesa o plan en cuotas).
 *
 * Vive aparte del servicio porque es donde está la decisión que le importa al
 * cliente — "¿esto se cumplió, sigue vivo o se cayó?" — y eso debe poder
 * probarse sin base de datos.
 */

export type CommitmentSource = "direct_promise" | "direct_plan";

/**
 * Estado real del compromiso, ya cruzado contra la fecha pactada.
 *
 * `pending` y `overdue` son ambos "sin resolver" en la base: la diferencia la
 * pone el calendario. Sin esa distinción una promesa vencida hace tres semanas
 * se ve igual que una que vence mañana, que es justo lo que hoy no se ve.
 */
export type CommitmentState =
  | "pending"
  | "overdue"
  | "kept"
  | "broken"
  | "cancelled";

/** Vocabulario del motor de negociación, para que el shape no cambie al fusionarlo. */
export type EngineStatus = "agreed" | "defaulted" | "rejected";

const DAY_MS = 86_400_000;

/** Las fechas pactadas son `@db.Date` (medianoche UTC): se comparan por día, no por hora. */
export function startOfUtcDay(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

/** Días completos que lleva vencida una fecha. Negativo si aún no vence. */
export function daysOverdue(date: Date, now: Date): number {
  return Math.floor((startOfUtcDay(now) - startOfUtcDay(date)) / DAY_MS);
}

export function isPastDue(date: Date | null | undefined, now: Date): boolean {
  if (!date) return false;
  return startOfUtcDay(date) < startOfUtcDay(now);
}

/**
 * `partial` cuenta como vivo, no como cumplido: se abonó algo pero el
 * compromiso sigue abierto y puede vencerse igual que uno sin abonos.
 */
export function derivePromiseState(
  status: string,
  promisedDate: Date | null,
  now: Date
): CommitmentState {
  if (status === "kept") return "kept";
  if (status === "broken") return "broken";
  return isPastDue(promisedDate, now) ? "overdue" : "pending";
}

export interface InstallmentLike {
  status: string;
  promisedDate: Date | null;
  amount: number;
  /** Abonado acumulado contra la cuota, que puede ser menor a `amount`. */
  amountPaid: number;
}

/**
 * Un plan activo con una cuota vencida está en mora aunque el plan siga
 * marcado `active`: el barrido que lo declara `defaulted` corre después, y
 * hasta entonces el cliente no vería el problema.
 */
export function derivePlanState(
  status: string,
  installments: InstallmentLike[],
  now: Date
): CommitmentState {
  if (status === "completed") return "kept";
  if (status === "defaulted") return "broken";
  if (status === "cancelled") return "cancelled";

  const hasLateInstallment = installments.some(
    (i) => i.status !== "kept" && isPastDue(i.promisedDate, now)
  );
  return hasLateInstallment ? "overdue" : "pending";
}

export interface PlanProgress {
  installmentsPaid: number;
  amountPaid: number;
  /** Próxima cuota sin pagar; `null` si ya no queda ninguna pendiente. */
  nextDueDate: Date | null;
  /** La cuota vencida más antigua, que es la que define la mora del plan. */
  oldestOverdueDate: Date | null;
}

export function summarizePlanProgress(
  installments: InstallmentLike[],
  now: Date
): PlanProgress {
  const paid = installments.filter((i) => i.status === "kept");
  const unpaid = installments
    .filter((i) => i.status !== "kept" && i.promisedDate)
    .sort(
      (a, b) =>
        (a.promisedDate as Date).getTime() - (b.promisedDate as Date).getTime()
    );
  const overdue = unpaid.filter((i) => isPastDue(i.promisedDate, now));

  return {
    installmentsPaid: paid.length,
    // Suma los abonos, no las cuotas cerradas: un plan con dos cuotas pagadas y
    // una tercera abonada a medias mostraba ese abono como cero.
    amountPaid: installments.reduce((sum, i) => sum + i.amountPaid, 0),
    nextDueDate: unpaid[0]?.promisedDate ?? null,
    oldestOverdueDate: overdue[0]?.promisedDate ?? null
  };
}

/** El estado real, traducido al vocabulario que expone el motor de negociación. */
export function toEngineStatus(state: CommitmentState): EngineStatus {
  if (state === "broken") return "defaulted";
  if (state === "cancelled") return "rejected";
  return "agreed";
}

/**
 * Filtro de la bandeja → estados que lo satisfacen. `null` significa "todos".
 *
 * Acepta también el vocabulario del motor (`agreed`, `defaulted`, …) para que
 * un cliente escrito contra esa API siga funcionando aquí. Los estados que solo
 * existen con motor (`escalated`, `open`) devuelven lista vacía: en main no hay
 * negociaciones esperando decisión, y contestar con datos sería mentir.
 */
export function statesForFilter(filter?: string): CommitmentState[] | null {
  switch (filter) {
    case undefined:
    case "":
    case "all":
      return null;
    case "pending":
      return ["pending"];
    case "overdue":
      return ["overdue"];
    case "kept":
      return ["kept"];
    case "broken":
      return ["broken"];
    case "cancelled":
      return ["cancelled"];
    // ── Alias del motor de negociación ────────────────────────────────────
    case "agreed":
      return ["pending", "overdue", "kept"];
    case "defaulted":
      return ["broken"];
    case "rejected":
      return ["cancelled"];
    case "escalated":
    case "open":
    case "expired":
      return [];
    default:
      return null;
  }
}

export function sourceForFilter(filter?: string): CommitmentSource[] {
  if (filter === "direct_promise") return ["direct_promise"];
  if (filter === "direct_plan") return ["direct_plan"];
  return ["direct_promise", "direct_plan"];
}
