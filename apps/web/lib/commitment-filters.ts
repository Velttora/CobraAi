import type { CommitmentItem, CommitmentState } from "../hooks/use-negotiations";

/** Filtro principal: qué pasó con el compromiso. */
export type CommitmentStatusFilter =
  | "all"
  | "awaiting_approval"
  | "pending"
  | "overdue"
  | "kept"
  | "broken";

/** Filtro secundario: cómo se pactó, no en qué estado está. */
export type CommitmentTypeFilter = "all" | "direct_promise" | "direct_plan";

export type CommitmentSort = "urgency" | "amount" | "recent";

export const STATUS_FILTERS: { value: CommitmentStatusFilter; label: string }[] = [
  { value: "awaiting_approval", label: "Esperan aprobación" },
  { value: "overdue", label: "Vencidas" },
  { value: "pending", label: "Vigentes" },
  { value: "kept", label: "Cumplidas" },
  { value: "broken", label: "Incumplidas" },
  { value: "all", label: "Todas" }
];

/**
 * Filtro que llega por URL (los KPI del dashboard enlazan con `?status=`).
 * Un valor desconocido cae en "Todas" en vez de dejar la bandeja vacía sin
 * explicación.
 */
export function parseStatusParam(raw: string | null): CommitmentStatusFilter {
  const match = STATUS_FILTERS.find((f) => f.value === raw);
  return match?.value ?? "all";
}

export const TYPE_FILTERS: { value: CommitmentTypeFilter; label: string }[] = [
  { value: "all", label: "Todos los tipos" },
  { value: "direct_promise", label: "Promesas" },
  { value: "direct_plan", label: "Planes en cuotas" }
];

export const SORT_OPTIONS: { value: CommitmentSort; label: string }[] = [
  { value: "urgency", label: "Más urgentes primero" },
  { value: "amount", label: "Mayor monto" },
  { value: "recent", label: "Más recientes" }
];

interface StateMeta {
  label: string;
  className: string;
}

/**
 * `overdue` es el único estado que se pinta en rojo: es el que exige llamar
 * hoy. Pintar también `broken` de rojo diluiría la señal — un incumplimiento
 * ya cerrado no se arregla con urgencia.
 */
export const STATE_META: Record<CommitmentState, StateMeta> = {
  awaiting_approval: {
    label: "Espera aprobación",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
  },
  pending: {
    label: "Vigente",
    className:
      "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
  },
  overdue: {
    label: "Vencida",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
  },
  kept: {
    label: "Cumplida",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
  },
  broken: {
    label: "Incumplida",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
  },
  cancelled: {
    label: "Anulada",
    className:
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
  }
};

export const SOURCE_META: Record<CommitmentItem["source"], StateMeta> = {
  direct_promise: {
    label: "Promesa de pago",
    className:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
  },
  direct_plan: {
    label: "Plan en cuotas",
    className:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
  }
};

export function matchesCommitmentType(
  item: CommitmentItem,
  type: CommitmentTypeFilter
): boolean {
  return type === "all" || item.source === type;
}

function money(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  return `${currency} ${Math.round(amount).toLocaleString("es-CO")}`;
}

/**
 * Título de la card: primero el compromiso, después el deudor. Quien abre esta
 * página ya sabe a quién le presta — lo que no sabe es qué se pactó.
 */
export function formatCommitmentTitle(item: CommitmentItem): string {
  const amount = money(item.offer_settlement_amount, item.currency);
  if (item.source === "direct_plan") {
    const n = item.offer_installments;
    return `Plan · ${n} cuota${n === 1 ? "" : "s"} · ${amount}`;
  }
  return `Promesa · ${amount}`;
}

/**
 * La frase que responde "¿y esto cuándo era?". Es texto y no una fecha suelta
 * porque "venció hace 12 días" se lee sin hacer la resta mental.
 */
export function formatDueLabel(item: CommitmentItem): string {
  if (item.commitment_state === "awaiting_approval") {
    return item.approval_kind === "settlement_remainder"
      ? "El deudor cumplió el acuerdo — falta decidir el saldo"
      : "Propuesto por el agente — nadie lo ha aprobado";
  }
  if (!item.due_date) return "Sin fecha pactada";

  const days = item.days_overdue ?? 0;
  if (item.commitment_state === "kept") return "Pagada";
  if (item.commitment_state === "cancelled") return "Anulada";
  if (item.commitment_state === "broken") {
    return days > 0 ? `Incumplida hace ${days} día${plural(days)}` : "Incumplida";
  }
  if (days > 0) return `Venció hace ${days} día${plural(days)}`;
  if (days === 0) return "Vence hoy";
  const left = Math.abs(days);
  return `Vence en ${left} día${plural(left)}`;
}

/** Vence dentro de tres días o menos: todavía se puede recordar a tiempo. */
export function isDueSoon(item: CommitmentItem): boolean {
  if (item.commitment_state !== "pending") return false;
  const days = item.days_overdue;
  return days !== null && days >= -3 && days <= 0;
}

export function formatProgressLabel(item: CommitmentItem): string | null {
  if (item.source !== "direct_plan") return null;
  return `${item.installments_paid} de ${item.offer_installments} cuotas pagadas`;
}

export function progressPct(item: CommitmentItem): number {
  if (item.offer_settlement_amount <= 0) return 0;
  const pct = (item.amount_paid / item.offer_settlement_amount) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function sortCommitments(
  items: CommitmentItem[],
  sort: CommitmentSort
): CommitmentItem[] {
  if (sort === "urgency") {
    // El backend ya entrega en orden de urgencia; reordenar aquí solo
    // introduciría una segunda definición de "urgente".
    return items;
  }
  const copy = [...items];
  if (sort === "amount") {
    return copy.sort(
      (a, b) => b.offer_settlement_amount - a.offer_settlement_amount
    );
  }
  return copy.sort(
    (a, b) => new Date(b.agreed_at).getTime() - new Date(a.agreed_at).getTime()
  );
}

export function emptyMessage(
  status: CommitmentStatusFilter,
  type: CommitmentTypeFilter,
  hasSearch: boolean
): string {
  if (hasSearch) return "Ningún compromiso coincide con la búsqueda.";
  const noun =
    type === "direct_promise"
      ? "promesas de pago"
      : type === "direct_plan"
        ? "planes en cuotas"
        : "promesas ni acuerdos";
  switch (status) {
    case "awaiting_approval":
      return "No hay acuerdos esperando aprobación.";
    case "overdue":
      return `No hay ${noun} vencidas. Todo lo pactado va al día.`;
    case "pending":
      return `No hay ${noun} vigentes en este momento.`;
    case "kept":
      return `Todavía no hay ${noun} cumplidas.`;
    case "broken":
      return `No hay ${noun} incumplidas.`;
    default:
      return `Aún no se ha registrado ninguna promesa ni acuerdo de pago.`;
  }
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}
