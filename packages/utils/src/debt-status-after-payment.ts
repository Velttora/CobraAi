/**
 * Estado de la deuda tras confirmar un pago.
 *
 * - Saldo 0 → paid_full.
 * - Plan de cuotas activo (o status plan) con saldo > 0 → se queda en `plan`
 *   para no sacar la deuda del ciclo de cuotas / compromisos.
 * - Promesa suelta pendiente → se queda en `promised`.
 * - Cualquier otro abono parcial → paid_partial.
 */
export function resolveDebtStatusAfterPayment(input: {
  currentStatus: string;
  amountOutstanding: number;
  hasActivePaymentPlan: boolean;
  hasPendingStandalonePromise: boolean;
}): "paid_full" | "plan" | "promised" | "paid_partial" {
  if (input.amountOutstanding <= 0) {
    return "paid_full";
  }
  if (input.hasActivePaymentPlan || input.currentStatus === "plan") {
    return "plan";
  }
  if (
    input.hasPendingStandalonePromise ||
    input.currentStatus === "promised"
  ) {
    // Si el pago no cerró todas las promesas sueltas, la deuda sigue prometida.
    // Si no quedan pendientes pero el status era promised, paid_partial refleja
    // el abono (el caller puede haber cerrado la última promesa en el mismo paso).
    return input.hasPendingStandalonePromise ? "promised" : "paid_partial";
  }
  return "paid_partial";
}
