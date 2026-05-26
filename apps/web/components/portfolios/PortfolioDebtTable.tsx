"use client";

import type { Route } from "next";
import Link from "next/link";
import { ExternalLink, LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";
import { formatAgingBucket, formatCurrency } from "../../lib/formatters";
import { getDaysUntilCollection, getQuarterLabel } from "../../lib/quarters";
import type { Debt, PortfolioQuarterStat } from "../../lib/types";
import { toNumber } from "../../lib/types";
import { cn } from "../../lib/utils";
import { DebtScoresCell } from "../shared/DebtScoresCell";
import { StatusBadge } from "../shared/StatusBadge";
import { TableSkeleton } from "../shared/Skeleton";

type SortKey =
  | "ai_score"
  | "priority_score"
  | "amount_outstanding"
  | "due_date"
  | "status";
type SortOption = `${SortKey}:${"asc" | "desc"}`;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "priority_score:desc", label: "Prioridad de hoy ↓" },
  { value: "ai_score:desc", label: "Prob. recuperación ↓" },
  { value: "ai_score:asc", label: "Prob. recuperación ↑" },
  { value: "amount_outstanding:desc", label: "Monto ↓" },
  { value: "amount_outstanding:asc", label: "Monto ↑" },
  { value: "due_date:asc", label: "Vencimiento ↑" },
  { value: "due_date:desc", label: "Vencimiento ↓" },
  { value: "status:asc", label: "Estado" }
];

const COLUMN_SORT: { key: SortKey; label: string }[] = [
  { key: "amount_outstanding", label: "Monto" },
  { key: "due_date", label: "Vencimiento" },
  { key: "priority_score", label: "Prioridad" },
  { key: "status", label: "Estado" }
];

function isDeferredDebt(debt: Debt): boolean {
  return debt.status === "future" || debt.status === "upcoming";
}

function overdueDays(dueDate: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setUTCHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.floor((today.getTime() - due.getTime()) / 86_400_000)
  );
}

function compareDebts(a: Debt, b: Debt, sort: SortOption): number {
  const [field, dir] = sort.split(":") as [SortKey, "asc" | "desc"];
  const sign = dir === "asc" ? 1 : -1;
  const deferredA = isDeferredDebt(a);
  const deferredB = isDeferredDebt(b);

  if (field === "ai_score" || field === "priority_score") {
    if (deferredA && !deferredB) return 1;
    if (!deferredA && deferredB) return -1;
    const scoreA =
      field === "priority_score"
        ? (a.priorityScore ?? a.aiScore ?? 0)
        : (a.aiScore ?? 0);
    const scoreB =
      field === "priority_score"
        ? (b.priorityScore ?? b.aiScore ?? 0)
        : (b.aiScore ?? 0);
    return sign * (scoreA - scoreB);
  }
  if (field === "amount_outstanding") {
    return (
      sign *
      (toNumber(a.amountOutstanding) - toNumber(b.amountOutstanding))
    );
  }
  if (field === "due_date") {
    return (
      sign *
      (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    );
  }
  return sign * a.status.localeCompare(b.status, "es");
}

function QuarterStatusPill({
  status
}: {
  status: PortfolioQuarterStat["status"];
}) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#D85A30]">
        <span className="h-2 w-2 rounded-full bg-[#D85A30]" />
        Activo
      </span>
    );
  }
  if (status === "upcoming") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#EF9F27]">
        <span className="h-2 w-2 rounded-full bg-[#EF9F27]" />
        Próximo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
      Futuro
    </span>
  );
}

function DueDateCell({ debt }: { debt: Debt }) {
  if (isDeferredDebt(debt)) {
    const daysUntil = getDaysUntilCollection(
      new Date(debt.dueDate),
      debt.scheduledCollectionDate
        ? new Date(debt.scheduledCollectionDate)
        : undefined
    );
    return (
      <span className={cn(daysUntil <= 30 && "font-medium text-[#EF9F27]")}>
        En {daysUntil} días
      </span>
    );
  }

  const days = overdueDays(debt.dueDate);
  if (days > 0) {
    return (
      <span className="font-medium text-[#A32D2D]">Vencida {days}d</span>
    );
  }

  return (
    <span>{new Date(debt.dueDate).toLocaleDateString("es-CO")}</span>
  );
}

function DebtRow({
  debt,
  showQuarter
}: {
  debt: Debt;
  showQuarter: boolean;
}) {
  const deferred = isDeferredDebt(debt);

  return (
    <tr
      className={cn(
        "border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950",
        deferred && "future-row opacity-[0.65]"
      )}
    >
      {showQuarter ? (
        <td className="px-4 py-3 text-slate-500">
          {debt.collectionQuarter?.replace("-", " · ") ?? "—"}
        </td>
      ) : null}
      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
        {debt.debtor?.name ?? "—"}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {formatCurrency(toNumber(debt.amountOutstanding), debt.currency)}
      </td>
      <td className="px-4 py-3">
        <DueDateCell debt={debt} />
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
      <td className="px-4 py-3">
        {deferred ? (
          <span
            className="inline-flex cursor-not-allowed items-center gap-1 text-slate-400"
            title="Esta cuenta aún no está disponible para gestión"
          >
            Ver
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        ) : (
          <Link
            className="inline-flex items-center gap-1 text-[#D85A30] hover:underline"
            href={`/debts/${debt.id}` as Route}
          >
            Ver
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </td>
    </tr>
  );
}

function DebtTableHead({
  sort,
  showQuarter,
  sortable,
  onSortChange
}: {
  sort: SortOption;
  showQuarter: boolean;
  sortable: boolean;
  onSortChange: (sort: SortOption) => void;
}) {
  const currentField = sort.split(":")[0] as SortKey;

  function toggleSort(field: SortKey): void {
    if (currentField === field) {
      onSortChange(
        `${field}:${sort.endsWith(":desc") ? "asc" : "desc"}` as SortOption
      );
      return;
    }
    onSortChange(`${field}:desc` as SortOption);
  }

  return (
    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
      <tr>
        {showQuarter ? <th className="px-4 py-3">Trimestre</th> : null}
        <th className="px-4 py-3">Deudor</th>
        {COLUMN_SORT.map((col) => (
          <th className="px-4 py-3" key={col.key}>
            {sortable ? (
              <button
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                onClick={() => toggleSort(col.key)}
                type="button"
              >
                {col.label}
                {currentField === col.key ? (
                  <span>{sort.endsWith(":desc") ? "↓" : "↑"}</span>
                ) : null}
              </button>
            ) : (
              col.label
            )}
          </th>
        ))}
        <th className="px-4 py-3">Aging</th>
        <th className="px-4 py-3">Acciones</th>
      </tr>
    </thead>
  );
}

export function PortfolioDebtTable({
  debts,
  quarters,
  loading,
  activeQuarter,
  onQuarterChange,
  currency = "COP",
  totalDebts,
  totalPages,
  page = 1,
  onPageChange
}: {
  debts: Debt[];
  quarters: PortfolioQuarterStat[];
  loading?: boolean;
  activeQuarter: string | null;
  onQuarterChange: (quarter: string | null) => void;
  currency?: string;
  totalDebts?: number;
  totalPages?: number;
  page?: number;
  onPageChange?: (page: number) => void;
}) {
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [sort, setSort] = useState<SortOption>("priority_score:desc");

  const sortedDebts = useMemo(
    () => [...debts].sort((a, b) => compareDebts(a, b, sort)),
    [debts, sort]
  );

  const hasDeferredRows = sortedDebts.some(isDeferredDebt);

  const totalAmount = useMemo(
    () =>
      sortedDebts.reduce(
        (sum, d) => sum + toNumber(d.amountOutstanding),
        0
      ),
    [sortedDebts]
  );

  const quarterMeta = useMemo(() => {
    const map = new Map<string, PortfolioQuarterStat>();
    for (const q of quarters) {
      map.set(q.quarter, q);
    }
    return map;
  }, [quarters]);

  const groupedDebts = useMemo(() => {
    const order = quarters.map((q) => q.quarter);
    const map = new Map<string, Debt[]>();

    for (const debt of sortedDebts) {
      const key = debt.collectionQuarter ?? "Sin trimestre";
      const list = map.get(key) ?? [];
      list.push(debt);
      map.set(key, list);
    }

    return [...map.entries()].sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [sortedDebts, quarters]);

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <TableSkeleton rows={8} />
      </section>
    );
  }

  const emptyColSpan = viewMode === "flat" ? 8 : 7;

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <QuarterTabs
          activeQuarter={activeQuarter}
          onQuarterChange={onQuarterChange}
          quarters={quarters}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Ordenar
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              onChange={(e) => setSort(e.target.value as SortOption)}
              value={sort}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700">
            <button
              aria-label="Vista agrupada"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-l-md",
                viewMode === "grouped"
                  ? "bg-[#D85A30] text-white"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              onClick={() => setViewMode("grouped")}
              title="Vista agrupada"
              type="button"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              aria-label="Vista plana"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-r-md border-l border-slate-200 dark:border-slate-700",
                viewMode === "flat"
                  ? "bg-[#D85A30] text-white"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              onClick={() => setViewMode("flat")}
              title="Vista plana"
              type="button"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {hasDeferredRows ? (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Las cuentas en gris aún no están disponibles para gestión. Se
          activarán automáticamente en su fecha programada.
        </div>
      ) : null}

      <DebtTableBody
        currency={currency}
        emptyColSpan={emptyColSpan}
        groupedDebts={groupedDebts}
        onSortChange={setSort}
        quarterMeta={quarterMeta}
        sort={sort}
        sortedDebts={sortedDebts}
        viewMode={viewMode}
      />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <span>
          {totalDebts !== undefined
            ? `Mostrando ${sortedDebts.length} de ${totalDebts} cuentas`
            : `${sortedDebts.length} cuentas`}
        </span>
        {totalPages !== undefined && totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              type="button"
            >
              ← Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {page} de {totalPages}
            </span>
            <button
              className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              type="button"
            >
              Siguiente →
            </button>
          </div>
        ) : null}
      </footer>
    </section>
  );
}

function QuarterTabs({
  quarters,
  activeQuarter,
  onQuarterChange
}: {
  quarters: PortfolioQuarterStat[];
  activeQuarter: string | null;
  onQuarterChange: (quarter: string | null) => void;
}) {
  return motionPortfolioQuarterTabsInner({
    activeQuarter,
    onQuarterChange,
    quarters
  });
}

function motionPortfolioQuarterTabsInner({
  quarters,
  activeQuarter,
  onQuarterChange
}: {
  quarters: PortfolioQuarterStat[];
  activeQuarter: string | null;
  onQuarterChange: (quarter: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className={cn(
          "rounded-full px-3 py-1.5 text-sm font-medium transition",
          activeQuarter === null
            ? "bg-[#D85A30] text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        )}
        onClick={() => onQuarterChange(null)}
        type="button"
      >
        Todos
      </button>
      {quarters.map((q) => (
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition",
            activeQuarter === q.quarter
              ? "bg-[#D85A30] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          )}
          key={q.quarter}
          onClick={() => onQuarterChange(q.quarter)}
          type="button"
        >
          <span>{q.quarter.replace("-", " · ")}</span>
          <QuarterStatusPill status={q.status} />
        </button>
      ))}
    </div>
  );
}

function DebtTableBody({
  viewMode,
  sortedDebts,
  groupedDebts,
  quarterMeta,
  currency,
  sort,
  onSortChange,
  emptyColSpan
}: {
  viewMode: "grouped" | "flat";
  sortedDebts: Debt[];
  groupedDebts: [string, Debt[]][];
  quarterMeta: Map<string, PortfolioQuarterStat>;
  currency: string;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  emptyColSpan: number;
}) {
  return (
    <div className="overflow-x-auto">
      {viewMode === "flat" ? (
        <table className="w-full min-w-[860px] text-left text-sm">
          <DebtTableHead
            onSortChange={onSortChange}
            showQuarter
            sort={sort}
            sortable
          />
          <tbody>
            {sortedDebts.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-slate-500"
                  colSpan={emptyColSpan}
                >
                  No se encontraron deudas
                </td>
              </tr>
            ) : (
              sortedDebts.map((debt) => (
                <DebtRow debt={debt} key={debt.id} showQuarter />
              ))
            )}
          </tbody>
        </table>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {groupedDebts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No se encontraron deudas
            </p>
          ) : (
            groupedDebts.map(([quarter, groupDebts]) => {
              const meta = quarterMeta.get(quarter);
              const groupTotal = groupDebts.reduce(
                (sum, d) => sum + toNumber(d.amountOutstanding),
                0
              );

              return (
                <QuarterGroupSection
                  currency={currency}
                  groupDebts={groupDebts}
                  key={quarter}
                  meta={meta}
                  onSortChange={onSortChange}
                  quarter={quarter}
                  sort={sort}
                  total={groupTotal}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function QuarterGroupSection({
  quarter,
  meta,
  groupDebts,
  total,
  currency,
  sort,
  onSortChange
}: {
  quarter: string;
  meta?: PortfolioQuarterStat;
  groupDebts: Debt[];
  total: number;
  currency: string;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 dark:bg-slate-950">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {quarter.replace("-", " · ")} · {getQuarterLabel(quarter)}
          </span>
          {meta ? <QuarterStatusPill status={meta.status} /> : null}
        </div>
        <span className="text-sm text-slate-500">
          {groupDebts.length} ctas · {formatCurrency(total, currency)}
        </span>
      </div>
      <table className="w-full min-w-[820px] text-left text-sm">
        <DebtTableHead
          onSortChange={onSortChange}
          showQuarter={false}
          sort={sort}
          sortable={false}
        />
        <tbody>
          {groupDebts.map((debt) => (
            <DebtRow debt={debt} key={debt.id} showQuarter={false} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
