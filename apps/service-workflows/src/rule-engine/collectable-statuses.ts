/**
 * Estados de deuda elegibles para contacto automatizado por `schedule` (mora y
 * pre-vencimiento). Fuente única de verdad: el motor (`ruleAppliesToDebt`) y las
 * queries del planificador deben usar este mismo conjunto.
 *
 * - `upcoming`: solo con reglas que filtran `days_to_due` (gate en el motor).
 * - `active` / `contacted`: mora y reglas de schedule normales.
 *
 * Explicitamente fuera: disputed, paid_*, written_off, legal*, promised, plan,
 * future, new, analyzing — no deben calificar para reglas de mora aunque alguien
 * pase la deuda al motor a mano.
 */
export const SCHEDULE_CONTACT_STATUSES = [
  "upcoming",
  "active",
  "contacted"
] as const;

export type ScheduleContactStatus = (typeof SCHEDULE_CONTACT_STATUSES)[number];

const SCHEDULE_CONTACT_SET = new Set<string>(SCHEDULE_CONTACT_STATUSES);

export function isScheduleContactStatus(status: string): boolean {
  return SCHEDULE_CONTACT_SET.has(status);
}

/**
 * Estados en los que un trigger de evento NO debe encolar contacto proactivo
 * (mora / reintento / score). Excepciones en el caller: `payment_confirmed`,
 * `promise_kept` y `debt_created` (agradecimiento, promesa cumplida, bienvenida).
 */
export const NON_COLLECTABLE_FOR_PROACTIVE_TRIGGERS = [
  "disputed",
  "paid_partial",
  "paid_full",
  "written_off",
  "legal",
  "legal_risk"
] as const;

const NON_COLLECTABLE_SET = new Set<string>(
  NON_COLLECTABLE_FOR_PROACTIVE_TRIGGERS
);

export function isNonCollectableForProactiveTrigger(status: string): boolean {
  return NON_COLLECTABLE_SET.has(status);
}
