import type { DebtStatus } from "@cobrai/db";

export type WorkflowEvent =
  | "DEBT_CREATED"
  | "DEBT_SEGMENTED"
  | "CONTACT_EFFECTIVE"
  | "CONTACT_COMPLETED"
  | "PROMISE_MADE"
  | "DISPUTED"
  | "PROMISE_BROKEN"
  | "PAYMENT_CONFIRMED"
  | "NO_RESPONSE_THRESHOLD"
  | "ESCALATE_LEGAL";

// "contacted" solo se alcanza con una respuesta real del deudor (evento CONTACT_EFFECTIVE,
// disparado por WorkflowsService.handleContactEffective al recibir cobrai.contact.effective).
// Enviar un mensaje ya no mueve la deuda de estado por sí solo — ver debtor-contact-coordinator
// y ContactsService.markResponse/markContactExpired.
const TRANSITIONS: Partial<
  Record<DebtStatus, Partial<Record<WorkflowEvent, DebtStatus>>>
> = {
  new: { DEBT_CREATED: "analyzing" },
  analyzing: { DEBT_SEGMENTED: "active" },
  active: {
    CONTACT_EFFECTIVE: "contacted",
    PAYMENT_CONFIRMED: "paid_full",
    NO_RESPONSE_THRESHOLD: "legal_risk"
  },
  contacted: {
    PROMISE_MADE: "promised",
    DISPUTED: "disputed",
    NO_RESPONSE_THRESHOLD: "legal_risk",
    CONTACT_EFFECTIVE: "contacted"
  },
  promised: {
    PAYMENT_CONFIRMED: "paid_full",
    PROMISE_BROKEN: "active"
  },
  disputed: { CONTACT_EFFECTIVE: "contacted" },
  legal_risk: { ESCALATE_LEGAL: "legal" },
  plan: { PAYMENT_CONFIRMED: "paid_partial" }
};

export function canTransition(
  from: DebtStatus,
  event: WorkflowEvent
): boolean {
  return Boolean(TRANSITIONS[from]?.[event]);
}

export function resolveTransition(
  from: DebtStatus,
  event: WorkflowEvent
): DebtStatus | null {
  return TRANSITIONS[from]?.[event] ?? null;
}

export function listValidEvents(from: DebtStatus): WorkflowEvent[] {
  const map = TRANSITIONS[from];
  if (!map) return [];
  return Object.keys(map) as WorkflowEvent[];
}
