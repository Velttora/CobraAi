import type { CommitmentSummary } from "../hooks/use-negotiations";
import type { CommitmentStatusFilter } from "./commitment-filters";
import { formatCurrency } from "./formatters";

export interface CommitmentKpi {
  key: string;
  label: string;
  value: string;
  hint: string;
  /** Filtro con el que se abre la bandeja al tocar la tarjeta. */
  status: CommitmentStatusFilter;
  alert?: boolean;
  trend?: { value: string; positive: boolean };
}

/** Debajo de esto, la gente firma acuerdos que no piensa cumplir. */
const HEALTHY_KEEP_RATE = 60;

/**
 * Los KPI de compromisos que van al dashboard. Son de plata, no de conteo: el
 * dashboard ya dice cuántas promesas hay abiertas, y lo que ese número no
 * responde es cuánto dinero depende de que se cumplan.
 */
export function buildCommitmentKpis(
  summary: CommitmentSummary
): CommitmentKpi[] {
  const money = (amount: number): string =>
    formatCurrency(amount, summary.currency);
  const judged = summary.kept + summary.broken + summary.overdue;

  return [
    // Solo aparece cuando hay algo que decidir: es lo único de este bloque que
    // está frenado esperando a una persona.
    ...(summary.awaiting_approval > 0
      ? [
          {
            key: "awaiting",
            label: "Esperan aprobación",
            value: money(summary.awaiting_approval_amount),
            hint: `${summary.awaiting_approval} acuerdo${plural(summary.awaiting_approval)} sin decidir`,
            status: "awaiting_approval" as CommitmentStatusFilter,
            alert: true
          }
        ]
      : []),
    {
      key: "pending",
      label: "Vigente por cobrar",
      value: money(summary.pending_amount),
      hint: `${summary.pending} compromiso${plural(summary.pending)} al día`,
      status: "pending"
    },
    {
      key: "overdue",
      label: "Vencido sin pagar",
      value: money(summary.overdue_amount),
      hint: `${summary.overdue} compromiso${plural(summary.overdue)} en mora`,
      status: "overdue",
      // Un acuerdo vencido es plata que ya se dio por recuperada y no llegó:
      // merece el mismo rojo que una cuenta en riesgo crítico.
      alert: summary.overdue > 0
    },
    {
      key: "keep-rate",
      label: "Cumplimiento de acuerdos",
      value: summary.keep_rate === null ? "—" : `${summary.keep_rate}%`,
      hint:
        summary.keep_rate === null
          ? "Ningún compromiso ha vencido todavía"
          : `${summary.kept} cumplidos de ${judged} ya vencidos`,
      status: "kept",
      trend:
        summary.keep_rate === null
          ? undefined
          : {
              value:
                summary.keep_rate >= HEALTHY_KEEP_RATE ? "En meta" : "Bajo meta",
              positive: summary.keep_rate >= HEALTHY_KEEP_RATE
            }
    },
    {
      key: "paid",
      label: "Recaudado de lo pactado",
      value: money(summary.paid_amount),
      hint: `de ${money(summary.committed_amount)} comprometidos`,
      status: "kept"
    }
  ];
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}
