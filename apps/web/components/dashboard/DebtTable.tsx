"use client";

import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { memo, useMemo, useState } from "react";
import {
  formatAgingBucket,
  formatCurrency
} from "../../lib/formatters";
import { getDaysUntilCollection } from "../../lib/quarters";
import type { Debt } from "../../lib/types";
import { toNumber } from "../../lib/types";
import { useDebounce } from "../../hooks/use-debounce";
import { DebtScoresCell } from "../shared/DebtScoresCell";
import { StatusBadge } from "../shared/StatusBadge";
import { TableSkeleton } from "../shared/Skeleton";

type SortField =
  | "amount_outstanding"
  | "due_date"
  | "ai_score"
  | "priority_score"
  | "created_at";

const columns: { key: SortField; label: string }[] = [
  { key: "amount_outstanding", label: "Monto" },
  { key: "due_date", label: "Vencimiento" }
];

const DebtRow = memo(function DebtRow({
  debt,
  pipelineMode
}: {
  debt: Debt;
  pipelineMode: boolean;
}) {
  const deferred = debt.status === "future" || debt.status === "upcoming";
  const daysUntil = deferred
    ? getDaysUntilCollection(
        new Date(debt.dueDate),
        debt.scheduledCollectionDate
          ? new Date(debt.scheduledCollectionDate)
          : undefined
      )
    : null;

  return (
    <tr
      className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950"
      key={debt.id}
    >
      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
        {debt.debtor?.name ?? "—"}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {formatCurrency(toNumber(debt.amountOutstanding), debt.currency)}
      </td>
      <td className="px-4 py-3">
        {new Date(debt.dueDate).toLocaleDateString("es-CO")}
      </td>
      <td className="min-w-[160px] px-4 py-3">
        {deferred ? (
          <span className="text-slate-400">—</span>
        ) : (
          <DebtScoresCell
            priorityScore={debt.priorityScore}
            recoveryScore={debt.aiScore}
          />
        )}
      </td>
      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
        {formatAgingBucket(debt.agingBucket)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={debt.status} />
      </td>
      {pipelineMode ? (
        <td className="px-4 py-3 text-slate-500">
          {daysUntil !== null && daysUntil > 0 ? `En ${daysUntil} días` : "—"}
        </td>
      ) : null}
      <td className="px-4 py-3">
        <Link
          className="inline-flex items-center gap-1 text-[#D85A30] hover:underline"
          href={`/debts/${debt.id}` as Route}
          title={
            deferred ? "Esta cuenta aún no está disponible para gestión" : undefined
          }
        >
          Ver
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
});

const SORT_PRESETS: { value: string; label: string }[] = [
  { value: "priority_score:desc", label: "Prioridad de hoy ↓" },
  { value: "ai_score:desc", label: "Mayor probabilidad ↓" },
  { value: "amount_outstanding:desc", label: "Mayor monto ↓" }
];

export function DebtTable({
  debts,
  pagination,
  loading,
  onPageChange,
  onSortChange,
  sort,
  pipelineMode = false
}: {
  debts: Debt[];
  pagination?: {
    page: number;
    total_pages: number;
    total: number;
  };
  loading?: boolean;
  onPageChange?: (page: number) => void;
  onSortChange?: (sort: string) => void;
  sort?: string;
  pipelineMode?: boolean;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return debts;
    const q = debouncedSearch.toLowerCase();
    return debts.filter((d) =>
      (d.debtor?.name ?? "").toLowerCase().includes(q)
    );
  }, [debts, debouncedSearch]);

  const currentSortField = sort?.split(":")[0] as SortField | undefined;

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <TableSkeleton rows={8} />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Cuentas prioritarias
          </h2>
          <input
          className="h-9 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar deudor..."
          type="search"
          value={search}
        />
        </div>
        <div className="flex flex-wrap gap-2">
          {SORT_PRESETS.map((preset) => {
            const active = sort === preset.value;
            return (
              <button
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-[#D85A30] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                }`}
                key={preset.value}
                onClick={() => onSortChange?.(preset.value)}
                type="button"
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Deudor</th>
              {columns.map((col) => (
                <th className="px-4 py-3" key={col.key}>
                  <button
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                    onClick={() => {
                      const dir =
                        currentSortField === col.key &&
                        sort?.endsWith(":desc")
                          ? "asc"
                          : "desc";
                      onSortChange?.(`${col.key}:${dir}`);
                    }}
                    type="button"
                  >
                    {col.label}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3">Scores</th>
              <th className="px-4 py-3">Aging</th>
              <th className="px-4 py-3">Estado</th>
              {pipelineMode ? <th className="px-4 py-3">Activa en</th> : null}
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                  No se encontraron deudas
                </td>
              </tr>
            ) : (
              filtered.map((debt) => (
                <DebtRow debt={debt} key={debt.id} pipelineMode={pipelineMode} />
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && onPageChange && (
        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">
            Página {pagination.page} de {pagination.total_pages} ({pagination.total}{" "}
            total)
          </span>
          <div className="flex gap-2">
            <button
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 disabled:opacity-40 dark:border-slate-700"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 disabled:opacity-40 dark:border-slate-700"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => onPageChange(pagination.page + 1)}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
