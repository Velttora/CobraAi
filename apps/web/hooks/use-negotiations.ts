"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi, useApiClient } from "./use-api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Cómo se pactó el compromiso. */
export type CommitmentSource = "direct_promise" | "direct_plan";

/**
 * Estado real, ya cruzado contra la fecha pactada: `pending` y `overdue` son
 * la misma fila en base y los separa el calendario.
 */
export type CommitmentState =
  | "pending"
  | "overdue"
  | "kept"
  | "broken"
  | "cancelled";

export interface CommitmentConversation {
  id: string;
  channel: string | null;
  last_message_at: string | null;
  /** `in` = lo dijo el deudor; `out` = se lo dijimos nosotros. */
  last_message_direction: "in" | "out" | null;
  last_message_preview: string | null;
}

export interface CommitmentItem {
  /** `promise:<uuid>` o `plan:<uuid>`. */
  id: string;
  source: CommitmentSource;
  /** Vocabulario del motor de negociación; la UI usa `commitment_state`. */
  status: "agreed" | "defaulted" | "rejected";
  commitment_state: CommitmentState;

  debt_id: string;
  debtor_id: string;
  debtor_name: string | null;
  debt_external_ref: string | null;
  debt_amount_outstanding: number | null;
  debt_due_date: string | null;
  aging_bucket: string | null;
  currency: string;
  ai_segment: string | null;
  portfolio_id: string | null;
  portfolio_name: string | null;

  /** Lo pactado. En un plan es el total, no la cuota. */
  offer_settlement_amount: number;
  offer_installments: number;
  amount_paid: number;
  installments_paid: number;
  due_date: string | null;
  /** Días vencidos sobre `due_date`. Negativo = aún no vence. */
  days_overdue: number | null;
  channel: string | null;
  notes: string | null;

  conversation: CommitmentConversation | null;
  conversation_id: string | null;

  agreed_at: string;
  updated_at: string;
  plan_id: string | null;
  has_detail: boolean;
}

export interface CommitmentSummary {
  total: number;
  pending: number;
  overdue: number;
  kept: number;
  broken: number;
  cancelled: number;
  committed_amount: number;
  paid_amount: number;
  pending_amount: number;
  overdue_amount: number;
  /** Cumplidas sobre las que ya se pueden juzgar. `null` si nada ha vencido. */
  keep_rate: number | null;
  currency: string;
}

export interface CommitmentQuery {
  status?: string;
  type?: string;
  portfolio_id?: string;
  debtor_id?: string;
  debt_id?: string;
  search?: string;
  limit?: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: { request_id: string; timestamp: string };
}

// ── Queries ───────────────────────────────────────────────────────────────────

function params(query: CommitmentQuery): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== "")
  ) as Record<string, string | number>;
}

/** Bandeja de promesas y acuerdos. Sin filtros devuelve todo lo pactado. */
export function useNegotiations(query: CommitmentQuery = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["negotiations", query],
    queryFn: () =>
      fetchApi<ApiResponse<CommitmentItem[]>>(
        client,
        "/api/v1/negotiations",
        params(query)
      ),
    // Los estados los mueven el barrido de vencimientos y los pagos entrantes,
    // no el usuario: sin refresco la bandeja envejece sin avisar.
    refetchInterval: 60_000
  });
}

/**
 * Totales del encabezado. Van aparte de la lista porque el resumen ignora el
 * filtro de estado — si se recortara con él, el porcentaje de cumplimiento
 * cambiaría cada vez que se toca un chip.
 */
export function useCommitmentSummary(
  query: Omit<CommitmentQuery, "status" | "limit"> = {}
) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["negotiations-summary", query],
    queryFn: () =>
      fetchApi<ApiResponse<CommitmentSummary>>(
        client,
        "/api/v1/negotiations/summary",
        params(query)
      ),
    refetchInterval: 60_000
  });
}

/** Conteo de compromisos vencidos, para el badge de la navegación. */
export function useOverdueCommitmentsCount(): number {
  const { data } = useCommitmentSummary();
  return data?.data.overdue ?? 0;
}
