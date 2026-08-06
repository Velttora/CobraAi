"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  useApproveCommitment,
  useRejectCommitment,
  type CommitmentItem
} from "../../hooks/use-negotiations";
import {
  formatCommitmentTitle,
  formatDueLabel,
  formatProgressLabel,
  isDueSoon,
  progressPct,
  SOURCE_META,
  STATE_META
} from "../../lib/commitment-filters";
import { channelLabel } from "../../lib/contact-channels";
import {
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  formatSegment
} from "../../lib/formatters";
import { cn } from "../../lib/utils";

const LINK_CLASS =
  "rounded px-1.5 py-0.5 font-medium text-[#D85A30] transition hover:bg-[#D85A30]/10 hover:underline";
const SEP_CLASS = "select-none text-slate-300 dark:text-slate-700";

function money(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  return formatCurrency(amount, currency);
}

export function NegotiationCard({
  commitment
}: {
  commitment: CommitmentItem;
}): React.ReactElement {
  const approve = useApproveCommitment();
  const reject = useRejectCommitment();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const c = commitment;
  const state = STATE_META[c.commitment_state];
  const source = SOURCE_META[c.source];
  const isOverdue = c.commitment_state === "overdue";
  const awaitingApproval = c.commitment_state === "awaiting_approval";
  const isSettlement = c.approval_kind === "settlement_remainder";

  async function handleApprove(): Promise<void> {
    try {
      await approve.mutateAsync(c.id);
      toast.success(
        isSettlement ? "Saldo condonado y cuenta cerrada" : "Acuerdo aprobado"
      );
    } catch {
      toast.error("No se pudo aprobar el acuerdo");
    }
  }

  async function handleReject(): Promise<void> {
    try {
      await reject.mutateAsync({ id: c.id, reason: reason.trim() || undefined });
      setRejecting(false);
      setReason("");
      toast.success("Acuerdo rechazado");
    } catch {
      toast.error("No se pudo rechazar el acuerdo");
    }
  }
  const isPlan = c.source === "direct_plan";
  const dueSoon = isDueSoon(c);
  const progress = formatProgressLabel(c);
  const conv = c.conversation;

  return (
    <article
      className={cn(
        "rounded-xl border bg-white p-5 transition dark:bg-slate-900",
        awaitingApproval
          ? "border-amber-300 ring-1 ring-amber-200 dark:border-amber-700 dark:ring-amber-900/60"
          : isOverdue
          ? "border-red-300 ring-1 ring-red-200 dark:border-red-800 dark:ring-red-900/50"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {formatCommitmentTitle(c)}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {c.debtor_name ?? "Deudor sin nombre"} · cuenta{" "}
            {c.debt_external_ref ?? c.debt_id.slice(0, 8)} · saldo{" "}
            {money(c.debt_amount_outstanding, c.currency)}
            {c.portfolio_name ? ` · ${c.portfolio_name}` : ""}
            {c.ai_segment ? ` · riesgo ${formatSegment(c.ai_segment)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              source.className
            )}
          >
            {source.label}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              state.className
            )}
          >
            {state.label}
          </span>
        </div>
      </header>

      {/* La frase de vencimiento va arriba y sola: es la única línea que le
          dice al cliente si tiene que hacer algo hoy con este deudor. */}
      <p
        className={cn(
          "mt-3 text-sm font-medium",
          awaitingApproval
            ? "text-amber-700 dark:text-amber-400"
            : isOverdue
            ? "text-[#A32D2D] dark:text-red-400"
            : dueSoon
              ? "text-amber-700 dark:text-amber-400"
              : "text-slate-600 dark:text-slate-400"
        )}
      >
        {formatDueLabel(c)}
        {!awaitingApproval && c.due_date
          ? ` · pactado para el ${formatDateOnly(c.due_date)}`
          : ""}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Monto acordado</dt>
          <dd className="font-medium">
            {money(c.offer_settlement_amount, c.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">
            {awaitingApproval ? "Saldo actual" : "Pagado"}
          </dt>
          <dd className="font-medium">
            {awaitingApproval
              ? money(c.debt_amount_outstanding, c.currency)
              : money(c.amount_paid, c.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Estructura</dt>
          <dd className="font-medium">
            {isPlan
              ? `${c.offer_installments} cuotas`
              : "Pago único"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Pactado por</dt>
          <dd className="font-medium">
            {c.channel ? channelLabel(c.channel) : "—"}
          </dd>
        </div>
      </dl>

      {/* Un plan sin avance visible obliga a abrir la cuenta para saber si el
          deudor está pagando o solo firmó. */}
      {isPlan && !awaitingApproval && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isOverdue ? "bg-[#A32D2D]" : "bg-[#0F6E56]"
              )}
              style={{ width: `${progressPct(c)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {progress} · {money(c.amount_paid, c.currency)} de{" "}
            {money(c.offer_settlement_amount, c.currency)}
          </p>
        </div>
      )}

      {c.notes && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
          {c.notes}
        </p>
      )}

      {/* Lo último que se dijo, en la misma tarjeta: sin esto, juzgar si el
          acuerdo sigue en pie exige abrir el hilo uno por uno. */}
      {conv?.last_message_preview && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {conv.last_message_direction === "in"
              ? "Último mensaje del deudor"
              : "Último mensaje enviado"}
            {conv.channel ? ` · ${channelLabel(conv.channel)}` : ""}
            {conv.last_message_at
              ? ` · ${formatDateTime(conv.last_message_at)}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            “{conv.last_message_preview}”
          </p>
        </div>
      )}

      {/* Nada de esto existe todavía: aprobar es lo que crea el plan o condona
          el saldo. Por eso la card muestra exactamente lo que se va a ejecutar. */}
      {awaitingApproval && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {isSettlement ? (
              <>
                Aprobar <strong>condona {money(c.offer_settlement_amount, c.currency)}</strong>{" "}
                y cierra la cuenta. Rechazar devuelve ese saldo a cobranza.
              </>
            ) : (
              <>
                Aprobar crea el plan de {c.offer_installments} cuotas por{" "}
                <strong>{money(c.offer_settlement_amount, c.currency)}</strong>
                {c.discount_pct ? ` (${c.discount_pct}% menos que el saldo)` : ""}.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c04f29] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={approve.isPending || reject.isPending}
              onClick={() => void handleApprove()}
              type="button"
            >
              {approve.isPending ? "Aprobando…" : "Aprobar"}
            </button>
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
              disabled={approve.isPending || reject.isPending}
              onClick={() => setRejecting((v) => !v)}
              type="button"
            >
              Rechazar
            </button>
          </div>
          {rejecting && (
            <div className="mt-3 space-y-2">
              <label className="block text-sm font-medium">
                Motivo (opcional)
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Descuento por encima de lo razonable para esta cartera"
                  type="text"
                  value={reason}
                />
              </label>
              <button
                className="rounded-md bg-[#A32D2D] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8f2727] disabled:opacity-60"
                disabled={reject.isPending}
                onClick={() => void handleReject()}
                type="button"
              >
                {reject.isPending ? "Rechazando…" : "Confirmar rechazo"}
              </button>
            </div>
          )}
        </div>
      )}

      <nav
        aria-label="Contexto del compromiso"
        className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-800"
      >
        {c.conversation_id && (
          <>
            <Link
              className={LINK_CLASS}
              href={`/conversations/${c.conversation_id}` as Route}
            >
              Abrir conversación
            </Link>
            <span className={SEP_CLASS}>·</span>
          </>
        )}
        <Link className={LINK_CLASS} href={`/debts/${c.debt_id}` as Route}>
          Ver cuenta
        </Link>
        <span className={SEP_CLASS}>·</span>
        <Link className={LINK_CLASS} href={`/debtors/${c.debtor_id}` as Route}>
          Ver deudor
        </Link>
        <span className="ml-auto text-xs text-slate-400">
          Acordado el {formatDateOnly(c.agreed_at)}
        </span>
      </nav>
    </article>
  );
}
