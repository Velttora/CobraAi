"use client";

import type { CommitmentSummary } from "../../hooks/use-negotiations";
import type { CommitmentStatusFilter } from "../../lib/commitment-filters";
import { formatCurrency } from "../../lib/formatters";
import { cn } from "../../lib/utils";

interface Tile {
  key: string;
  label: string;
  value: string;
  hint: string;
  /** Filtro que aplica al hacer clic; sin él la baldosa es solo informativa. */
  filter?: CommitmentStatusFilter;
  tone?: "danger" | "positive";
}

function buildTiles(s: CommitmentSummary): Tile[] {
  const money = (amount: number): string => formatCurrency(amount, s.currency);

  return [
    {
      key: "committed",
      label: "Comprometido",
      value: money(s.committed_amount),
      hint: `${s.total} compromiso${s.total === 1 ? "" : "s"} registrado${s.total === 1 ? "" : "s"}`,
      filter: "all"
    },
    {
      key: "overdue",
      label: "Vencido sin pagar",
      value: money(s.overdue_amount),
      hint: `${s.overdue} compromiso${s.overdue === 1 ? "" : "s"} en mora`,
      filter: "overdue",
      tone: "danger"
    },
    {
      key: "pending",
      label: "Vigente",
      value: money(s.pending_amount),
      hint: `${s.pending} por vencer`,
      filter: "pending"
    },
    {
      key: "paid",
      label: "Recaudado de lo pactado",
      value: money(s.paid_amount),
      hint: `${s.kept} compromiso${s.kept === 1 ? "" : "s"} cumplido${s.kept === 1 ? "" : "s"}`,
      filter: "kept",
      tone: "positive"
    },
    {
      key: "rate",
      label: "Cumplimiento",
      // Un compromiso que aún no vence no dice nada del deudor: hasta que algo
      // venza, un porcentaje sería inventado.
      value: s.keep_rate === null ? "—" : `${s.keep_rate}%`,
      hint:
        s.keep_rate === null
          ? "Nada ha vencido todavía"
          : `${s.kept} cumplidos de ${s.kept + s.broken + s.overdue} ya vencidos`
    }
  ];
}

export function CommitmentSummaryBar({
  summary,
  onSelect
}: {
  summary: CommitmentSummary;
  onSelect: (status: CommitmentStatusFilter) => void;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {buildTiles(summary).map((tile) => {
        const body = (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {tile.label}
            </p>
            <p
              className={cn(
                "mt-1 text-lg font-semibold",
                tile.tone === "danger"
                  ? "text-[#A32D2D] dark:text-red-400"
                  : tile.tone === "positive"
                    ? "text-[#0F6E56] dark:text-emerald-400"
                    : "text-slate-900 dark:text-slate-100"
              )}
            >
              {tile.value}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{tile.hint}</p>
          </>
        );

        const className =
          "rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900";

        if (!tile.filter) {
          return (
            <div className={className} key={tile.key}>
              {body}
            </div>
          );
        }

        const filter = tile.filter;
        return (
          <button
            className={cn(
              className,
              "transition hover:border-[#D85A30]/60 hover:shadow-sm"
            )}
            key={tile.key}
            onClick={() => onSelect(filter)}
            type="button"
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
